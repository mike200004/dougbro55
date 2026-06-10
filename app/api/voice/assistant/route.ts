import { NextRequest, NextResponse } from "next/server";
import { getAccountByPhone, buildMemoryDigest } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { sendSms } from "@/lib/twilio";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const maxDuration = 15;

const ASSISTANT_ID = process.env.VAPI_ASSISTANT_ID || "8e46aebd-e589-4d6f-a614-7e2dfdfc621a";

/**
 * Vapi assistant-request webhook. On each inbound call Vapi asks us which
 * assistant to use; we return the base assistant id plus per-call
 * `variableValues` that inject this caller's memory digest into the system
 * prompt (the prompt contains a {{memoryDigest}} placeholder). This gives
 * voice the same "people you already know" priming that web/SMS get.
 *
 * Robustness: this endpoint gates inbound calls, so it ALWAYS returns a valid
 * assistant (falling back to an empty digest) — a failure here must never drop
 * the call.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.VAPI_SERVER_SECRET;
  if (secret && req.headers.get("x-vapi-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let memoryDigest = "";
  try {
    const body: {
      message?: {
        type?: string;
        call?: { customer?: { number?: string } };
        analysis?: { summary?: string };
        summary?: string;
      };
    } = await req.json();
    const message = body.message ?? {};
    const callerPhone = normalizePhone(message.call?.customer?.number);

    // After a call ends, text the agent a quick recap of what got done.
    if (message.type === "end-of-call-report") {
      const summary = message.analysis?.summary || message.summary;
      if (callerPhone && summary) {
        const actor = await getAccountByPhone(callerPhone);
        if (actor) {
          const recap = summary.length > 280 ? `${summary.slice(0, 277)}…` : summary;
          await sendSms(callerPhone, `Pheme recap: ${recap}`);
          await logActivity(actor.accountId, "call_recap", "Phone call completed — recap texted to the agent.", {
            actorId: actor.memberId,
            meta: { summary },
          });
        }
      }
      return NextResponse.json({});
    }

    if (callerPhone) {
      const actor = await getAccountByPhone(callerPhone);
      if (actor) {
        const digest = await buildMemoryDigest(actor.accountId);
        memoryDigest = digest || "(No saved clients yet — this is a fresh book of business.)";
      }
    }
  } catch {
    // fall through with an empty digest
  }

  if (!memoryDigest) memoryDigest = "(No saved clients on record.)";

  return NextResponse.json({
    assistantId: ASSISTANT_ID,
    assistantOverrides: {
      variableValues: { memoryDigest },
    },
  });
}
