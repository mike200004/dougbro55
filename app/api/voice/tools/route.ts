import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { getAccountByPhone } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import type { ResolvedActor } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Wraps a tool failure so the dispatcher can avoid caching it. */
class ToolError extends Error {}

/**
 * Vapi server webhook. Vapi runs the conversation LLM itself (the assistant is
 * configured with our system prompt + tools); this endpoint only EXECUTES the
 * tool calls against Supabase and returns results for Vapi to speak.
 *
 * Latency rules (every ms here is dead air on a live call):
 * - caller→account resolution is cached per warm lambda (it can't change mid-call)
 * - multiple tool calls in one webhook run in parallel
 * - results are cached by toolCallId so a Vapi timeout-retry can't double-run a
 *   side effect (duplicate document, double text)
 */
interface VapiToolCall {
  id?: string;
  toolCallId?: string;
  name?: string;
  arguments?: unknown;
  function?: { name?: string; arguments?: unknown };
}

function normalize(tc: VapiToolCall): {
  id: string;
  name: string;
  args: Record<string, unknown>;
} {
  const id = tc.id ?? tc.toolCallId ?? "";
  const name = tc.name ?? tc.function?.name ?? "";
  let raw = tc.arguments ?? tc.function?.arguments ?? {};
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw || "{}");
    } catch {
      raw = {};
    }
  }
  return { id, name, args: (raw as Record<string, unknown>) ?? {} };
}

// Per-warm-lambda caches. Both are best-effort latency aids, not sources of
// truth — a cold start simply misses and falls through to the real lookup.
const actorCache = new Map<string, { actor: ResolvedActor; at: number }>();
const ACTOR_TTL_MS = 90_000;
// toolCallId → in-flight or settled result. Storing the PROMISE at call start
// means a Vapi timeout-retry that lands on this instance awaits the original
// run instead of double-executing the side effect.
const resultCache = new Map<string, { promise: Promise<string>; at: number }>();
const RESULT_TTL_MS = 5 * 60_000;

function cachePrune(map: Map<string, { at: number }>, ttl: number) {
  const now = Date.now();
  for (const [k, v] of map) if (now - v.at > ttl) map.delete(k);
}

async function resolveActor(phone: string): Promise<ResolvedActor | null> {
  const hit = actorCache.get(phone);
  if (hit && Date.now() - hit.at < ACTOR_TTL_MS) return hit.actor;
  const actor = await getAccountByPhone(phone);
  // Never cache a miss: a transient DB blip would otherwise lock the caller
  // out as "unregistered" for the rest of the call.
  if (actor) {
    actorCache.set(phone, { actor, at: Date.now() });
    cachePrune(actorCache, ACTOR_TTL_MS);
  }
  return actor;
}

// Tools that only read — safe to run in parallel. Anything that writes runs
// sequentially in array order, so two set_document_fields in one batch can't
// race each other into a lost update, and a set + finalize batch lands in order.
const READ_ONLY = new Set([
  "get_agent_profile",
  "list_clients",
  "recall_client",
  "get_document",
  "list_documents",
  "list_form_templates",
]);

export async function POST(req: NextRequest) {
  const secret = process.env.VAPI_SERVER_SECRET;
  if (secret && req.headers.get("x-vapi-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body.message ?? {};
  const type = message.type as string | undefined;

  if (type !== "tool-calls" && type !== "function-call") {
    // Status updates, transcripts, end-of-call reports, etc. — just ack.
    return NextResponse.json({});
  }

  // Gate: identify the caller by phone and resolve their account + actor.
  const call = (message.call ?? {}) as { customer?: { number?: string } };
  const callerPhone = normalizePhone(call.customer?.number);
  const actor = callerPhone ? await resolveActor(callerPhone) : null;

  const rawCalls: VapiToolCall[] =
    (message.toolCallList as VapiToolCall[]) ||
    (message.toolCalls as VapiToolCall[]) ||
    (message.functionCall ? [message.functionCall as VapiToolCall] : []);

  async function execute(name: string, args: Record<string, unknown>): Promise<string> {
    let result: unknown;
    let failed = false;
    if (!actor) {
      result = {
        error: "caller_not_registered",
        message:
          "This caller's number isn't registered. Tell them to sign up at pheme.deals, then end the call politely.",
      };
    } else {
      const started = Date.now();
      try {
        result = await runTool(name, args, {
          accountId: actor.accountId,
          actorId: actor.memberId,
          actorPhone: callerPhone ?? undefined,
          channel: "voice",
        });
      } catch (err) {
        failed = true;
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      console.log(`[voice] ${name} ${Date.now() - started}ms${failed ? " (error)" : ""}`);
    }
    const text = typeof result === "string" ? result : JSON.stringify(result);
    // A thrown error must not become sticky for this toolCallId — let a
    // genuine retry re-run it.
    if (failed) throw new ToolError(text);
    return text;
  }

  async function dispatch(raw: VapiToolCall): Promise<{ toolCallId: string; name: string; result: string }> {
    const { id, name, args } = normalize(raw);
    // Idempotency: a Vapi timeout-retry re-sends the same toolCallId. Caching
    // the in-flight promise means the retry awaits the original run (on this
    // instance) instead of double-running the side effect.
    const cached = id ? resultCache.get(id) : undefined;
    if (cached && Date.now() - cached.at < RESULT_TTL_MS) {
      const result = await cached.promise.catch((e: unknown) => String(e instanceof ToolError ? e.message : e));
      return { toolCallId: id, name, result };
    }
    const promise = execute(name, args);
    if (id) {
      resultCache.set(id, { promise, at: Date.now() });
      cachePrune(resultCache, RESULT_TTL_MS);
    }
    try {
      return { toolCallId: id, name, result: await promise };
    } catch (e) {
      if (id) resultCache.delete(id); // don't make transient failures sticky
      return { toolCallId: id, name, result: e instanceof ToolError ? e.message : String(e) };
    }
  }

  // Reads run in parallel; anything that mutates runs sequentially in array
  // order so batched writes can't race each other into a lost update.
  let results: { toolCallId: string; name: string; result: string }[];
  if (rawCalls.every((raw) => READ_ONLY.has(normalize(raw).name))) {
    results = await Promise.all(rawCalls.map(dispatch));
  } else {
    results = [];
    for (const raw of rawCalls) results.push(await dispatch(raw));
  }

  return NextResponse.json({ results });
}
