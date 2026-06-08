import { NextRequest, NextResponse } from "next/server";
import { getAccountByPhone, buildMemoryDigest } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

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
    const body: { message?: { type?: string; call?: { customer?: { number?: string } } } } =
      await req.json();
    const callerPhone = normalizePhone(body.message?.call?.customer?.number);
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
