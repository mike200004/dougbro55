import type OpenAI from "openai";
import { openai, buildSystemPrompt, MODEL, openaiTools } from "@/lib/ai";
import { runTool } from "@/lib/tools";
import { getProfile, buildMemoryDigest } from "@/lib/db";

export interface Turn {
  role: "user" | "assistant";
  content: string;
}

export interface ToolEvent {
  tool: string;
  input: unknown;
  result: unknown;
}

export interface ConversationResult {
  reply: string;
  toolEvents: ToolEvent[];
}

/**
 * Run the OpenAI tool-use loop over a plain-text transcript and return the
 * assistant's final reply. Shared by the web chat (/api/chat) and SMS (/api/sms);
 * voice (Vapi) runs its own LLM and only calls our tools directly.
 */
export async function runConversation(
  transcript: Turn[],
  opts: {
    accountId: string;
    actorId?: string;
    actorName?: string;
    role?: "owner" | "assistant";
    maxRounds?: number;
    systemSuffix?: string;
  },
): Promise<ConversationResult> {
  const profile = await getProfile(opts.accountId);
  let system = buildSystemPrompt(profile, new Date().toISOString().slice(0, 10));
  if (opts.actorName) {
    system += `\n\nYou are currently helping ${opts.actorName}${
      opts.role === "assistant" ? " (an assistant acting on the agent's account)" : ""
    }. You may address them by name.`;
  }
  const digest = await buildMemoryDigest(opts.accountId);
  if (digest) {
    system +=
      `\n\nPeople you already know on this account (recall and reuse — the moment one is mentioned, ` +
      `say what you remember and offer to reuse it; confirm before filling):\n${digest}`;
  }
  if (opts.systemSuffix) system += `\n\n${opts.systemSuffix}`;

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...transcript.map((m) => ({ role: m.role, content: m.content })),
  ];

  const client = openai();
  const toolEvents: ToolEvent[] = [];
  const maxRounds = opts.maxRounds ?? 8;

  for (let round = 0; round < maxRounds; round++) {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: openaiTools,
      tool_choice: "auto",
      // Force one tool call at a time so the model can't, e.g., create the same
      // document twice in a single parallel batch.
      parallel_tool_calls: false,
    });

    const msg = completion.choices[0]?.message;
    if (!msg) return { reply: "", toolEvents };

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { reply: (msg.content ?? "").trim(), toolEvents };
    }

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
        result = await runTool(tc.function.name, args, {
          accountId: opts.accountId,
          actorId: opts.actorId,
        });
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

  return {
    reply: "Sorry, that took too many steps — could you rephrase?",
    toolEvents,
  };
}
