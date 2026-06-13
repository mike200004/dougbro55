import { NextRequest, NextResponse } from "next/server";
import { getAccountByPhone, buildMemoryDigest, latestDraft, getProfile, listDocuments } from "@/lib/db";
import { missingRequired, userFields, getTemplate, isDocType } from "@/lib/templates";
import type { DocType } from "@/lib/types";
import { normalizePhone } from "@/lib/phone";
import { verifyVapiSecret } from "@/lib/webhook-auth";
import { sendSms } from "@/lib/twilio";
import { sendEmail, emailConfigured, escapeHtml } from "@/lib/email";
import { makeShareToken } from "@/lib/share";
import { logActivity } from "@/lib/activity";
import { defer } from "@/lib/defer";

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
    call?: { id?: string; customer?: { number?: string } };
    analysis?: { summary?: string };
    summary?: string;
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
    if (callerPhone && summary && !recapSent.has(callId)) {
      if (callId) recapSent.add(callId);
      defer(async () => {
        const actor = await getAccountByPhone(callerPhone);
        if (!actor) return;
        const recap = summary.length > 300 ? `${summary.slice(0, 297)}…` : summary;

        // The quick save: link the document this call touched, so one tap
        // after hanging up opens the PDF.
        const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";
        const docs = await listDocuments(actor.accountId).catch(() => []);
        const recent =
          docs[0] && Date.now() - new Date(docs[0].updated_at).getTime() < 45 * 60_000 ? docs[0] : null;
        const link = recent ? `${SITE}/api/share/${makeShareToken(recent.id)}` : "";

        await sendSms(callerPhone, `Pheme recap: ${recap}${link ? `\nYour document: ${link}` : ""}`);

        // Texts from a number still pending A2P registration can be silently
        // dropped by carriers — email the recap too so it always lands.
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
): Promise<{ variableValues: { memoryDigest: string }; firstMessage?: string }> {
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

  const [digest, draft, profile] = await Promise.all([
    buildMemoryDigest(actor.accountId).catch(() => ""),
    latestDraft(actor.accountId).catch(() => null),
    getProfile(actor.accountId).catch(() => null),
  ]);

  const firstName = (actor.name || profile?.agent_name || "").trim().split(/\s+/)[0] || "";
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
      detail = ` It's a ${getTemplate(draft.type).name}.` + detail;
    }
    lines.push(
      `DOCUMENT IN PROGRESS: "${title}" (document_id: ${draft.id}).${detail} If the caller wants to keep going on it, continue THIS document — set fields and finalize on this id; do not create a new one unless they clearly want a different document.`,
    );
  }

  lines.push(
    digest
      ? `People you already know on this account:\n${digest}`
      : "No saved clients yet — this is a fresh book of business.",
  );

  const greetings = firstName
    ? [
        `Hey ${firstName} — what are we working on?`,
        `${timeOfDay() === "morning" ? "Morning" : timeOfDay() === "afternoon" ? "Afternoon" : "Evening"}, ${firstName} — what can I get done for you?`,
        `Hey ${firstName}, good to hear from you — what do you need?`,
      ]
    : ["Hey, it's Pheme — what are we working on?"];
  const firstMessage = greetings[new Date().getMinutes() % greetings.length];

  return { variableValues: { memoryDigest: lines.join("\n\n") }, firstMessage };
}
