import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, buildSystemPrompt, hasAnthropicKey, MODEL } from "@/lib/anthropic";
import { toolDefs, runTool } from "@/lib/tools";
import { getProfile } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatBody {
  messages: Anthropic.MessageParam[];
}

const MAX_TOOL_ROUNDS = 8;

export async function POST(req: NextRequest) {
  if (!hasAnthropicKey()) {
    return NextResponse.json(
      {
        error:
          "The AI assistant isn't connected yet. Add ANTHROPIC_API_KEY to .env.local to enable it.",
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

  const messages: Anthropic.MessageParam[] = Array.isArray(body.messages)
    ? [...body.messages]
    : [];

  const profile = await getProfile();
  const system = buildSystemPrompt(profile, new Date().toISOString().slice(0, 10));

  const client = anthropic();
  const toolEvents: { tool: string; input: unknown; result: unknown }[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
        tools: toolDefs.map((t, i) =>
          i === toolDefs.length - 1
            ? { ...t, cache_control: { type: "ephemeral" } }
            : t,
        ) as Anthropic.Tool[],
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return NextResponse.json({
          reply: text,
          messages,
          toolEvents,
        });
      }

      // Execute every requested tool, then feed results back.
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        let result: unknown;
        try {
          result = await runTool(tu.name, tu.input as Record<string, unknown>);
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
        toolEvents.push({ tool: tu.name, input: tu.input, result });
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: toolResults });
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
