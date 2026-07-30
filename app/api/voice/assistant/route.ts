import { NextRequest, NextResponse } from "next/server";
import { getAccountByPhone, buildMemoryDigest, latestDraft, getProfile, listDocuments, listFormTemplates } from "@/lib/db";
import { missingRequired, userFields, getTemplate, isDocType } from "@/lib/templates";
import type { DocType } from "@/lib/types";
import { normalizePhone } from "@/lib/phone";
import { verifyVapiSecret } from "@/lib/webhook-auth";
import { sendEmail, emailConfigured, escapeHtml } from "@/lib/email";
import { makeShareToken } from "@/lib/share";
import { logActivity } from "@/lib/activity";
import { defer } from "@/lib/defer";
import { getPlanState, getVoiceUsage, recordCallUsage, planDef } from "@/lib/billing";
import { sendUsageWarningEmail } from "@/lib/emails";

export const runtime = "nodejs";
export const maxDuration = 15;

const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || "8e46aebd-e589-4d6f-a614-7e2dfdfc621a";

/**
 * Vapi assistant-request webhook. On each inbound call Vapi asks us which
 * assistant to use; we return the base assistant id plus per-call overrides:
 * a personalized greeting and a caller-context block injected into the system
 * prompt via the {{memoryDigest}} placeholder (today's date, who's calling,
 * any in-progress draft to continue, and the client-memory digest).
 *
 * This endpoint blocks call pickup, so it must be FAST and must NEVER fail:
 * all context queries run in parallel and race a hard timeout; on any
 * failure we return the base assistant with minimal context.
 */
export async function POST(req: NextRequest) {
  if (!verifyVapiSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let message: {
    type?: string;
    call?: { id?: string; customer?: { number?: string }; startedAt?: string; endedAt?: string };
    analysis?: { summary?: string };
    summary?: string;
    durationSeconds?: number;
    durationMs?: number;
    startedAt?: string;
    endedAt?: string;
  } = {};
  try {
    const body = await req.json();
    message = body?.message ?? {};
  } catch {
    // fall through — treated as a bare assistant-request
  }
  const callerPhone = normalizePhone(message.call?.customer?.number);

  // ---- After a call ends: text the agent a quick recap. Ack immediately;
  // the SMS + activity log run after the response (a slow Twilio call here
  // would make Vapi re-deliver the report).
  if (message.type === "end-of-call-report") {
    const summary = message.analysis?.summary || message.summary;
    const callId = message.call?.id || "";
    // Call duration for metering — Vapi sends it a few different ways.
    const durationSeconds =
      message.durationSeconds ??
      (message.durationMs ? Math.round(message.durationMs / 1000) : undefined) ??
      (() => {
        const s = message.startedAt || message.call?.startedAt;
        const e = message.endedAt || message.call?.endedAt;
        return s && e ? Math.max(0, Math.round((new Date(e).getTime() - new Date(s).getTime()) / 1000)) : 0;
      })();

    if (callerPhone && !recapSent.has(callId)) {
      if (callId) recapSent.add(callId);
      defer(async () => {
        const actor = await getAccountByPhone(callerPhone);
        if (!actor) return;

        // Meter the call and bill any overage (idempotent on the Vapi call id).
        if (durationSeconds > 0) {
          const res = await recordCallUsage({
            accountId: actor.accountId,
            vapiCallId: callId || null,
            callerPhone,
            seconds: durationSeconds,
            startedAt: message.startedAt || message.call?.startedAt || null,
            endedAt: message.endedAt || message.call?.endedAt || null,
            summary: summary || null,
          });
          // Warn the owner when this call crossed 80% / 100% of the allowance.
          if (res.recorded && res.crossed.length && res.usage && res.state) {
            const profile = await getProfile(actor.accountId).catch(() => null);
            if (profile?.email && emailConfigured()) {
              for (const threshold of res.crossed) {
                await sendUsageWarningEmail(profile.email, {
                  threshold,
                  usedMinutes: res.usage.usedMinutes,
                  includedMinutes: res.usage.includedMinutes,
                  plan: planDef(res.state.plan === "trial" || res.state.plan === "beta" || res.state.plan === "expired" ? null : res.state.plan)?.name ?? "trial",
                  overageAllowed: res.state.overageAllowed,
                  overageCentsPerMin: res.state.overageCentsPerMin,
                }).catch(() => {});
              }
            }
          }
        }

        if (!summary) return;
        const recap = summary.length > 300 ? `${summary.slice(0, 297)}…` : summary;

        // The quick save: link the document this call touched, so one tap
        // after hanging up opens the PDF.
        const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";
        const docs = await listDocuments(actor.accountId).catch(() => []);
        const recent =
          docs[0] && Date.now() - new Date(docs[0].updated_at).getTime() < 45 * 60_000 ? docs[0] : null;
        const link = recent ? `${SITE}/api/share/${makeShareToken(recent.id)}` : "";

        // Recaps are email-only: Pheme sends no outbound SMS (tap-to-send
        // decision, 2026-07) — the agent's inbox is the reliable channel.
        const profile = await getProfile(actor.accountId).catch(() => null);
        if (profile?.email && emailConfigured()) {
          await sendEmail({
            to: profile.email,
            subject: "Your Pheme call recap",
            html: `<p>${escapeHtml(recap)}</p>${
              recent && link
                ? `<p>Document from this call: <a href="${escapeHtml(link)}">${escapeHtml(recent.title || "view & download")}</a></p>`
                : ""
            }<p>— Pheme</p>`,
          });
        }

        await logActivity(actor.accountId, "call_recap", "Phone call completed — recap sent to the agent.", {
          actorId: actor.memberId,
          meta: { summary },
        });
      });
    }
    return NextResponse.json({});
  }

  // Anything that isn't picking up a call gets a fast ack.
  if (message.type && message.type !== "assistant-request") {
    return NextResponse.json({});
  }

  // ---- Call pickup: build per-call context, racing a hard timeout so a slow
  // query can never keep the phone ringing.
  try {
    const overrides = await Promise.race([
      buildOverrides(callerPhone),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
    ]);
    if (overrides) {
      return NextResponse.json({ assistantId: ASSISTANT_ID, assistantOverrides: overrides });
    }
  } catch {
    // fail open below
  }
  return NextResponse.json({
    assistantId: ASSISTANT_ID,
    assistantOverrides: { variableValues: { memoryDigest: baseContext() } },
  });
}

/** Call ids we've already texted a recap for (per warm lambda — catches Vapi redelivery). */
const recapSent = new Set<string>();

function baseContext(): string {
  const now = new Date();
  const day = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
  return `Today is ${day} (US Eastern).`;
}

function timeOfDay(): "morning" | "afternoon" | "evening" {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(new Date()),
  );
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

async function buildOverrides(
  callerPhone: string | null,
): Promise<{ variableValues: { memoryDigest: string }; firstMessage?: string; maxDurationSeconds?: number }> {
  const lines: string[] = [baseContext()];

  const actor = callerPhone ? await getAccountByPhone(callerPhone) : null;
  if (!actor) {
    lines.push(
      "CALLER STATUS: UNREGISTERED. This phone number is not on any Pheme account. Follow the unregistered-caller rule: no personal or deal information, no other tools — point them to signing up, then end the call.",
    );
    return {
      variableValues: { memoryDigest: lines.join("\n") },
      firstMessage:
        "Hi, you've reached Pheme. I don't recognize this number — are you calling from a new phone, or are you new here?",
    };
  }

  const [digest, draft, profile, forms, plan] = await Promise.all([
    buildMemoryDigest(actor.accountId).catch(() => ""),
    latestDraft(actor.accountId, { createdBy: actor.memberId }).catch(() => null),
    getProfile(actor.accountId).catch(() => null),
    listFormTemplates(actor.accountId).catch(() => []),
    getPlanState(actor.accountId).catch(() => null),
  ]);

  const firstName = (actor.name || profile?.agent_name || "").trim().split(/\s+/)[0] || "";

  // Cost gate: AI voice calls are the expensive feature, so this is where we
  // stop them. A fully-inactive plan (trial elapsed with no subscription, or a
  // canceled/unpaid one) — or a trial that has burned its included minutes with
  // no overage allowance — gets a short "you need a plan" message and an
  // instruction to end the call immediately, instead of a 40-minute session.
  let planLine: string | null = null;
  let maxDurationSeconds: number | undefined;
  if (plan) {
    const usage = Number.isFinite(plan.minutesIncluded)
      ? await getVoiceUsage(actor.accountId, plan).catch(() => null)
      : null;
    const blocked = !plan.active || (!plan.overageAllowed && usage !== null && usage.remainingMinutes <= 0);
    if (blocked) {
      const line =
        plan.plan === "expired"
          ? `Hi ${firstName || "there"} — your Pheme trial has wrapped up, so the phone assistant is paused. Pick a plan at pheme.deals and I'll be right back. Talk soon!`
          : plan.plan === "trial"
            ? `Hi ${firstName || "there"} — you've used up your trial's voice minutes, so I have to pause here. Choose a plan at pheme.deals to keep going. Talk soon!`
            : `Hi ${firstName || "there"} — this account's Pheme plan isn't active right now, so the phone assistant is paused. Sort it out at pheme.deals and I'll be right here. Talk soon!`;
      return {
        variableValues: {
          memoryDigest: `${baseContext()}\n\nACCOUNT PLAN: INACTIVE. Deliver your first message, then call the end_call tool immediately. Do not use any other tool, take any request, or continue the conversation — the account must add or renew a plan at pheme.deals first.`,
        },
        firstMessage: line,
        maxDurationSeconds: 120,
      };
    }
    if (usage) {
      if (!plan.overageAllowed) {
        // Trial: physically cap the call at the remaining allowance (plus a
        // minute of grace to wrap up) so one long call can't blow past it.
        maxDurationSeconds = Math.min(3600, Math.max(120, usage.remainingMinutes * 60 + 60));
        planLine = `PLAN: free trial — ${usage.remainingMinutes} voice minute${usage.remainingMinutes === 1 ? "" : "s"} left${
          typeof plan.trialDaysLeft === "number" ? ` and ${plan.trialDaysLeft} day${plan.trialDaysLeft === 1 ? "" : "s"} of trial` : ""
        }. If the caller asks about their plan or minutes, use these numbers. If minutes are nearly out, wrap up efficiently; upgrading happens at pheme.deals → Settings.`;
      } else if (usage.remainingMinutes <= Math.max(15, usage.includedMinutes * 0.2)) {
        const rate = (plan.overageCentsPerMin / 100).toFixed(2);
        planLine =
          usage.remainingMinutes > 0
            ? `PLAN NOTE: ${usage.remainingMinutes} included voice minutes left this cycle; after that, minutes bill at $${rate}/min. Only mention this if the caller asks about their plan, minutes, or billing.`
            : `PLAN NOTE: this cycle's included minutes are used up — additional talk time bills at $${rate}/min on the next invoice. Only mention this if the caller asks about their plan, minutes, or billing.`;
      }
    }
  }
  const who = [
    `You're speaking with ${actor.name || "the agent"}`,
    actor.role === "assistant" ? "(an assistant acting on the agent's account)" : "",
    profile?.broker_agency_name ? `of ${profile.broker_agency_name}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  lines.push(`${who}. Their number is registered — they're verified by caller id.`);

  if (draft) {
    const title = draft.title || "an untitled document";
    let detail = "";
    if (!draft.template_id && isDocType(draft.type)) {
      const missing = missingRequired(draft.type, draft.fields);
      const labels = missing
        .map((k) => userFields(draft.type as DocType).find((f) => f.key === k)?.label ?? k)
        .slice(0, 6);
      detail =
        missing.length === 0
          ? " All required fields are filled — it just hasn't been filed."
          : ` Still missing: ${labels.join(", ")}.`;
      detail = ` It's a ${getTemplate(draft.type)?.name ?? draft.type}.` + detail;
    }
    lines.push(
      `DOCUMENT IN PROGRESS: "${title}" (document_id: ${draft.id}).${detail} If the caller wants to keep going on it, continue THIS document — set fields and finalize on this id; do not create a new one unless they clearly want a different document.`,
    );
  }

  if (planLine) lines.push(planLine);

  lines.push(
    digest
      ? `People you already know on this account:\n${digest}`
      : "No saved clients yet — this is a fresh book of business.",
  );

  // Forms the caller has uploaded — so when they name one ("let's do my
  // listing agreement"), you already know it exists and can start it with
  // create_document(template_name) without a lookup first.
  if (forms.length) {
    lines.push(
      `Forms this agent has uploaded and can fill by name (use create_document with template_name): ${forms
        .map((f) => `"${f.name}"`)
        .join(", ")}.`,
    );
  }

  const greetings = firstName
    ? [
        `Hey ${firstName} — what are we working on?`,
        `${timeOfDay() === "morning" ? "Morning" : timeOfDay() === "afternoon" ? "Afternoon" : "Evening"}, ${firstName} — what can I get done for you?`,
        `Hey ${firstName}, good to hear from you — what do you need?`,
      ]
    : ["Hey, it's Pheme — what are we working on?"];
  const firstMessage = greetings[new Date().getMinutes() % greetings.length];

  return {
    variableValues: { memoryDigest: lines.join("\n\n") },
    firstMessage,
    ...(maxDurationSeconds ? { maxDurationSeconds } : {}),
  };
}
