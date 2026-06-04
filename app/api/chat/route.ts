import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { openai, buildSystemPrompt, hasAiKey, MODEL, openaiTools } from "@/lib/ai";
import { runTool } from "@/lib/tools";
import { getProfile } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

interface TextTurn {
  role: "user" | "assistant";
  content: string;
}
interface ChatBody {
  messages: TextTurn[];
}

const MAX_TOOL_ROUNDS = 8;

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

  const transcript: TextTurn[] = Array.isArray(body.messages) ? body.messages : [];

  const profile = await getProfile();
  const system = buildSystemPrompt(profile, new Date().toISOString().slice(0, 10));

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...transcript.map((m) => ({ role: m.role, content: m.content })),
  ];

  const client = openai();
  const toolEvents: { tool: string; input: unknown; result: unknown }[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages,
        tools: openaiTools,
        tool_choice: "auto",
      });

      const msg = completion.choices[0]?.message;
      if (!msg) {
        return NextResponse.json({ error: "Empty response from model" }, { status: 500 });
      }

      const toolCalls = msg.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const reply = (msg.content ?? "").trim();
        return NextResponse.json({
          reply,
          messages: [...transcript, { role: "assistant", content: reply }],
          toolEvents,
        });
      }

      // Record the assistant turn (with its tool calls), then run each tool.
      messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: toolCalls,
      });

      for (const tc of toolCalls) {
        if (tc.type !== "function") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = {};
        }
        let result: unknown;
        try {
          result = await runTool(tc.function.name, args);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
        toolEvents.push({ tool: tc.function.name, input: args, result });
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
    }

    return NextResponse.json(
      { error: "The assistant took too many steps. Please try rephrasing." },
      { status: 500 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
