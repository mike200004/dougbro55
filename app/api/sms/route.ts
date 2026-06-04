import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { hasAiKey } from "@/lib/ai";
import { runConversation } from "@/lib/conversation";
import { getSmsSession, saveSmsSession, SmsTurn } from "@/lib/db";

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
    return twiml("The assistant isn't connected yet. Please try again later.");
  }

  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });

  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken && process.env.TWILIO_SKIP_VALIDATION !== "1") {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    const url = `${proto}://${host}/api/sms`;
    const sig = req.headers.get("x-twilio-signature");
    if (!validSignature(authToken, sig, url, params)) {
      return new NextResponse("Invalid signature", { status: 403 });
    }
  }

  const phone = params.From || "unknown";
  const text = (params.Body || "").trim();
  if (!text) return twiml("Hi! Tell me what document you'd like to work on.");

  const history = await getSmsSession(phone);
  const transcript: SmsTurn[] = [...history, { role: "user", content: text }];

  try {
    const { reply } = await runConversation(transcript, { systemSuffix: SMS_SUFFIX });
    const finalReply = reply || "Sorry, I didn't catch that — could you rephrase?";
    const updated: SmsTurn[] = [
      ...transcript,
      { role: "assistant" as const, content: finalReply },
    ].slice(-MAX_TURNS);
    await saveSmsSession(phone, updated);
    return twiml(finalReply);
  } catch (err) {
    console.error("SMS error:", err);
    return twiml("Sorry, something went wrong on my end. Please try again.");
  }
}
