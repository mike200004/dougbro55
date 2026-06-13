import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { hasAiKey } from "@/lib/ai";
import { runConversation } from "@/lib/conversation";
import { getAccountByPhone, getSmsSession, saveSmsSession, SmsTurn } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TURNS = 20; // bound history per phone
const SMS_SUFFIX =
  "You are replying over SMS/text. Keep replies short and to the point (1-3 sentences). Ask for one or two missing fields at a time.";

function twiml(message: string): NextResponse {
  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

/** Twilio request-signature validation (skipped if no auth token configured). */
function validSignature(
  authToken: string,
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  const expected = crypto
    .createHmac("sha1", authToken)
    .update(Buffer.from(data, "utf-8"))
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!hasAiKey()) {
    return twiml("The assistant is temporarily unavailable. Please try again shortly.");
  }

  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  // The skip escape hatch is for local testing only — never honor it in prod,
  // so a stray env var can't silently disable signature validation.
  const skipValidation =
    process.env.NODE_ENV !== "production" && process.env.TWILIO_SKIP_VALIDATION === "1";
  if (authToken && !skipValidation) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const url = `${proto}://${host}/api/sms`;
    const sig = req.headers.get("x-twilio-signature");
    if (!validSignature(authToken, sig, url, params)) {
      return new NextResponse("Invalid signature", { status: 403 });
    }
  }

  const phone = normalizePhone(params.From) || params.From || "unknown";
  const text = (params.Body || "").trim();

  // Gate: only registered numbers (owner or assistant) may use the assistant.
  const actor = await getAccountByPhone(phone);
  if (!actor) {
    return twiml(
      "This number isn't registered. Sign up at pheme.deals to use the assistant, then text from this phone.",
    );
  }

  if (!text) return twiml("Tell me what document you'd like to work on.");

  const history = await getSmsSession(phone);
  const transcript: SmsTurn[] = [...history, { role: "user", content: text }];

  try {
    const { reply } = await runConversation(transcript, {
      accountId: actor.accountId,
      actorId: actor.memberId,
      actorName: actor.name,
      actorPhone: phone,
      role: actor.role,
      systemSuffix: SMS_SUFFIX,
    });
    const finalReply = reply || "Sorry, I didn't catch that — could you rephrase?";
    const updated: SmsTurn[] = [
      ...transcript,
      { role: "assistant" as const, content: finalReply },
    ].slice(-MAX_TURNS);
    await saveSmsSession(phone, actor.accountId, updated);
    return twiml(finalReply);
  } catch (err) {
    console.error("SMS error:", err);
    return twiml("Sorry, something went wrong on my end. Please try again.");
  }
}
