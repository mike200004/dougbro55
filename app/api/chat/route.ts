import { NextRequest, NextResponse } from "next/server";
import { hasAiKey } from "@/lib/ai";
import { runConversation, Turn } from "@/lib/conversation";
import { getAccount } from "@/lib/auth";
import { getProfile } from "@/lib/db";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatBody {
  messages: Turn[];
}

export async function POST(req: NextRequest) {
  const account = await getAccount();
  if (!account) {
    return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  }

  // Cost guard: each turn calls the LLM. Cap per-account turns/min so a runaway
  // client (or a compromised session) can't burn the OpenAI key.
  if (!rateLimit(`chat:${account.accountId}`, 30, 60_000)) {
    return NextResponse.json(
      { error: "You're going a little fast — give me a second and try again." },
      { status: 429 },
    );
  }

  if (!hasAiKey()) {
    return NextResponse.json(
      { error: "The assistant is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const transcript: Turn[] = Array.isArray(body.messages) ? body.messages : [];
  const profile = await getProfile(account.accountId);

  try {
    const { reply, toolEvents } = await runConversation(transcript, {
      accountId: account.accountId,
      actorId: account.userId,
      actorName: account.name,
      actorPhone: profile?.phone || undefined,
      role: account.role,
    });
    return NextResponse.json({
      reply,
      messages: [...transcript, { role: "assistant", content: reply }],
      toolEvents,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
