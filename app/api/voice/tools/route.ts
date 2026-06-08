import { NextRequest, NextResponse } from "next/server";
import { runTool } from "@/lib/tools";
import { getAccountByPhone } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Vapi server webhook. Vapi runs the conversation LLM itself (the assistant is
 * configured with our system prompt + tools); this endpoint only EXECUTES the
 * tool calls against Supabase and returns results for Vapi to speak.
 *
 * Tool-call payloads vary slightly across Vapi versions, so we read both the
 * `toolCallList` (id/name/arguments) and `toolCalls` (function.*) shapes.
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
  const actor = callerPhone ? await getAccountByPhone(callerPhone) : null;

  const rawCalls: VapiToolCall[] =
    (message.toolCallList as VapiToolCall[]) ||
    (message.toolCalls as VapiToolCall[]) ||
    (message.functionCall ? [message.functionCall as VapiToolCall] : []);

  const results = [];
  for (const raw of rawCalls) {
    const { id, name, args } = normalize(raw);
    let result: unknown;
    if (!actor) {
      result = {
        error: "caller_not_registered",
        message:
          "This caller's number isn't registered. Tell them to sign up at pheme.deals, then end the call politely.",
      };
    } else {
      try {
        result = await runTool(name, args, {
          accountId: actor.accountId,
          actorId: actor.memberId,
        });
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
    }
    results.push({
      toolCallId: id,
      name,
      result: typeof result === "string" ? result : JSON.stringify(result),
    });
  }

  return NextResponse.json({ results });
}
