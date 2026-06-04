import { NextRequest, NextResponse } from "next/server";
import { hasAiKey } from "@/lib/ai";
import { runConversation, Turn } from "@/lib/conversation";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatBody {
  messages: Turn[];
}

export async function POST(req: NextRequest) {
  if (!hasAiKey()) {
    return NextResponse.json(
      {
        error:
          "The AI assistant isn't connected yet. Add OPENAI_API_KEY to .env.local to enable it.",
      },
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

  try {
    const { reply, toolEvents } = await runConversation(transcript);
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
