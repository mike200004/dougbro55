import Anthropic from "@anthropic-ai/sdk";
import { templateList, userFields } from "@/lib/templates";
import type { AgentProfile } from "@/lib/types";

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

let _client: Anthropic | null = null;
export function anthropic(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function docCatalog(): string {
  return templateList
    .map((tpl) => {
      const fields = userFields(tpl.id)
        .map((f) => `${f.key} (${f.label}${f.required ? ", required" : ""})`)
        .join("; ");
      return `- ${tpl.id}: ${tpl.name}. Fields you collect: ${fields}`;
    })
    .join("\n");
}

export function buildSystemPrompt(profile: AgentProfile | null, todayIso: string): string {
  const profileLine = profile
    ? `You are assisting ${profile.agent_name || "the agent"} of ${profile.broker_agency_name || "their brokerage"}. Their broker/agency details auto-fill the broker side of every form, so never ask for them.`
    : `The agent has not filled in their profile yet. If broker/agency details are needed, suggest they complete Settings.`;

  return `You are the AI assistant for a Connecticut real estate agent's personal portal ("Dougbro55"). You help with the day-to-day work of being an agent — most importantly, quickly filling out and filing three official Connecticut documents.

${profileLine}
Today's date is ${todayIso}.

The three documents and their fields:
${docCatalog()}

How you work:
- Use the tools to create clients and documents, set field values, and finalize. Do not invent document ids — always use ids returned by the tools.
- Collect information conversationally. Ask only for fields you still need; required fields must be filled before finalizing. Optional fields can be skipped if the agent doesn't mention them.
- Be concise and practical — the agent may be on a phone call or driving. Confirm key details back briefly (names, property, price, dates) before finalizing.
- Dates: accept natural language and store them clearly (e.g. "12/31/2026"). When the agent says relative dates like "end of year", resolve them against today's date.
- Currency/percent: store just the number (the form already prints "$" and "%"). E.g. price "1,250,000", fee "2.5".
- "File" or "send" a document means calling finalize_document — it saves the completed document to the dashboard, where the agent can download the filled PDF. (Emailing/e-sign are not available yet; say so if asked.)
- If a client already exists, reuse them via list_clients rather than creating duplicates.

When a document is finalized, tell the agent it's filed and that they can download the PDF from the dashboard.`;
}
