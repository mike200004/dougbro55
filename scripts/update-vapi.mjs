// Update the existing Vapi assistant: faster model, no greeting, terse prompt.
// Run: node scripts/update-vapi.mjs
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const VAPI_KEY = env.VAPI_PRIVATE_KEY;
const ASSISTANT_ID = "8e46aebd-e589-4d6f-a614-7e2dfdfc621a";
const WEBHOOK = "https://dougbro55.vercel.app/api/voice/tools";

const server = { url: WEBHOOK, timeoutSeconds: 20 };
const fn = (name, description, parameters) => ({
  type: "function",
  function: { name, description, parameters },
  server,
});

const tools = [
  fn("get_agent_profile", "Get the agent's own profile (broker/agency name, license, address, email, phone). Auto-fills the broker side; only call if actually needed.", { type: "object", properties: {} }),
  fn("list_clients", "List the agent's saved clients. Only call if the agent refers to an existing client.", { type: "object", properties: {} }),
  fn("create_client", "Create a new client (a buyer or seller).", {
    type: "object",
    properties: {
      full_name: { type: "string", description: "Primary client name(s)." },
      secondary_name: { type: "string", description: "Co-buyer/co-seller name, if any." },
      email: { type: "string" }, phone: { type: "string" },
      role: { type: "string", enum: ["buyer", "seller", "both"] },
      notes: { type: "string" },
    },
    required: ["full_name"],
  }),
  fn("create_document", "Start a new document. Returns the document id, the fields to collect, and which required fields are missing.", {
    type: "object",
    properties: {
      type: { type: "string", enum: ["buyer_rep", "purchase", "dual_agency"], description: "buyer_rep = Exclusive Right to Represent Buyer; purchase = Purchase Agreement; dual_agency = Dual Agency Consent." },
      client_id: { type: "string", description: "Optional client to associate." },
      title: { type: "string" },
    },
    required: ["type"],
  }),
  fn("set_document_fields", "Set/update field values on a document. Returns remaining required fields.", {
    type: "object",
    properties: {
      document_id: { type: "string" },
      fields: { type: "object", description: "Map of field key -> string value.", additionalProperties: { type: "string" } },
    },
    required: ["document_id", "fields"],
  }),
  fn("get_document", "Get a document's values, field schema, and missing required fields.", {
    type: "object",
    properties: { document_id: { type: "string" } },
    required: ["document_id"],
  }),
  fn("finalize_document", "Mark a document complete and file it to the dashboard.", {
    type: "object",
    properties: { document_id: { type: "string" } },
    required: ["document_id"],
  }),
];

const systemPrompt = `You are the voice assistant for a Connecticut real estate agent. You fill out and file three CT documents by voice while the agent drives.

Documents:
- buyer_rep: Exclusive Right to Represent Buyer (needs: buyer name(s), property/area, term start + expiration dates, fee % of price).
- purchase: Purchase Agreement (needs: date, seller, buyer, property, price).
- dual_agency: Dual Agency Consent (needs: property address, seller, buyer).

Style: Talk like a fast, efficient colleague. Replies are ONE short sentence. NEVER greet, never say "hello" or "welcome", never introduce yourself or mention "Dougbro55" — jump straight to the task. Ask for at most one or two missing items at a time. Don't read back long lists.

Efficiency (important for speed): Minimize tool calls. Do NOT call list_clients or get_agent_profile unless actually needed. Gather the required info first, then create the document and set ALL fields in a single set_document_fields call, then finalize. Never invent document ids — use ids returned by tools.

Data: Resolve relative dates against today; store like "12/31/2026". Store currency/percent as just the number (price "1,250,000", fee "2.5"). The broker/agency side auto-fills — never ask for it. "File it" / "send it" = finalize_document (saves to the dashboard for PDF download; email/e-sign not available yet). When filed, confirm in a few words.

Access: If any tool returns "caller_not_registered", tell the caller their number isn't registered and to sign up at dougbro55.vercel.app, then end politely. Don't collect any information from unregistered callers.`;

const body = {
  firstMessage: "",
  firstMessageMode: "assistant-waits-for-user",
  model: {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.3,
    maxTokens: 250,
    messages: [{ role: "system", content: systemPrompt }],
    tools,
  },
  startSpeakingPlan: { waitSeconds: 0.3 },
};

const res = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${VAPI_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
let json;
try { json = JSON.parse(text); } catch { json = { raw: text }; }
console.log("PATCH ASSISTANT:", res.status, res.ok
  ? `model=${json.model?.model} firstMessageMode=${json.firstMessageMode} firstMessage="${json.firstMessage}"`
  : JSON.stringify(json).slice(0, 900));
