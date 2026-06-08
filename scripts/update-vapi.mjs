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
const WEBHOOK = "https://pheme.deals/api/voice/tools";

const server = { url: WEBHOOK, timeoutSeconds: 20 };
const fn = (name, description, parameters) => ({
  type: "function",
  function: { name, description, parameters },
  server,
});

const tools = [
  fn("get_agent_profile", "Get the agent's own profile (broker/agency name, license, address, email, phone). Auto-fills the broker side; only call if actually needed.", { type: "object", properties: {} }),
  fn("list_clients", "List the agent's saved clients. Only call if the agent refers to an existing client.", { type: "object", properties: {} }),
  fn("recall_client", "Recall everything you remember about a person by name (even a partial/family name like 'the Johnsons'): contact, role, preferences, and past deals/properties. Call this the instant a client or property is mentioned so you can reuse what you know instead of re-asking.", {
    type: "object",
    properties: { name: { type: "string", description: "Person or family name to recall." } },
    required: ["name"],
  }),
  fn("remember_about_client", "Save a freeform fact/preference about a person so you know it next time (e.g. 'pre-approved to 900k', 'wants 3BR in Darien', 'prefers texts').", {
    type: "object",
    properties: { name: { type: "string" }, note: { type: "string" } },
    required: ["name", "note"],
  }),
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
  fn("send_document", "Text the completed document to a recipient as a secure download link. All required fields must be filled first. Provide the recipient's phone number.", {
    type: "object",
    properties: {
      document_id: { type: "string" },
      to_phone: { type: "string", description: "Recipient's phone number." },
      recipient_name: { type: "string", description: "Optional recipient name." },
    },
    required: ["document_id", "to_phone"],
  }),
];

const systemPrompt = `You are the voice assistant for a Connecticut real estate agent. You fill out and file three CT documents by voice while the agent drives.

Documents:
- buyer_rep: Exclusive Right to Represent Buyer (needs: buyer name(s), property/area, term start + expiration dates, fee % of price).
- purchase: Purchase Agreement (needs: date, seller, buyer, property, price).
- dual_agency: Dual Agency Consent (needs: property address, seller, buyer).

Style: Talk like a fast, efficient colleague. Replies are ONE short sentence. NEVER greet, never say "hello" or "welcome", never introduce yourself or mention "Pheme" — jump straight to the task. Ask for at most one or two missing items at a time. Don't read back long lists.

Efficiency (important for speed): Minimize tool calls. Do NOT call list_clients or get_agent_profile unless actually needed. Gather the required info first, then create the document ONCE and set ALL fields in a single set_document_fields call, then finalize. Create exactly one document per request — reuse the returned id; never create duplicates. Never invent document ids — use ids returned by tools.

Data: Resolve relative dates against today; store like "12/31/2026". Store currency/percent as just the number (price "1,250,000", fee "2.5"). The broker/agency side auto-fills — never ask for it. "File it" = finalize_document (saves to the dashboard). To "send it" to someone, use send_document with their phone number — it texts them a secure link to the PDF (fill required fields first). When done, confirm in a few words.

People you already know on this account (recall and reuse — the instant one is mentioned, say what you remember and offer to reuse it):
{{memoryDigest}}

Memory (this is your magic): You already know the people listed above. The instant the agent names someone (even a partial like "the Johnsons") who isn't listed, call recall_client with that name. When you recognize someone, jump in with what you remember (role, last property, key preferences) in one sentence and offer to reuse it — don't make them repeat it. Beat them to it: pre-fill from memory, then confirm. When you learn something personal (budget, beds, timeline, preference), call remember_about_client so you know it next time.

Access: If any tool returns "caller_not_registered", tell the caller their number isn't registered and to sign up at pheme.deals, then end politely. Don't collect any information from unregistered callers.`;

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
