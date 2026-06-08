// One-time Vapi provisioning: creates the voice assistant (gpt-4o + our system
// prompt + document tools -> our webhook) and imports the Twilio number for voice.
// Run: node scripts/provision-vapi.mjs
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
const WEBHOOK = "https://pheme.deals/api/voice/tools";
const NUMBER = "+14752703374";

const server = { url: WEBHOOK, timeoutSeconds: 20 };
const fn = (name, description, parameters) => ({
  type: "function",
  function: { name, description, parameters },
  server,
});

const tools = [
  fn("get_agent_profile", "Get the agent's own profile (broker/agency name, license, address, email, phone). These auto-fill the broker side of every document, so never ask the user for them.", { type: "object", properties: {} }),
  fn("list_clients", "List the agent's saved clients.", { type: "object", properties: {} }),
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
  fn("finalize_document", "Mark a document complete and file it to the dashboard. Only works when all required fields are present.", {
    type: "object",
    properties: { document_id: { type: "string" } },
    required: ["document_id"],
  }),
];

const systemPrompt = `You are the voice assistant for a Connecticut real estate agent's portal ("Pheme"). You help the agent quickly fill out and file three official Connecticut documents, hands-free, while they drive.

The three documents:
- buyer_rep: Exclusive Right to Represent Buyer Agreement (needs buyer name(s), property/area, term start + expiration dates, and the fee % of purchase price).
- purchase: Purchase Agreement (needs agreement date, seller, buyer, property description, and price).
- dual_agency: Dual Agency Consent Agreement (needs property address, seller, and buyer).

How you work on a phone call:
- Use the tools to create clients/documents, set field values, and finalize. Never invent document ids — use ids returned by the tools.
- Collect info conversationally and ONE or TWO items at a time. Keep replies short and spoken-friendly. Don't read long lists aloud.
- Confirm key details back briefly (names, property, price, dates) before finalizing.
- Resolve relative dates against today's date. Store dates like "12/31/2026". For currency/percent, store just the number (e.g. price "1,250,000", fee "2.5").
- The broker/agency side auto-fills from the agent's profile — never ask for it.
- "File it" = finalize_document (saves to the dashboard). To "send it" to someone, call send_document with their phone — it texts a secure link to the PDF.
- When finalized, tell the agent it's filed and they can grab the PDF from the dashboard.`;

async function vapi(path, body) {
  const res = await fetch(`https://api.vapi.ai${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${VAPI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { ok: res.ok, status: res.status, json };
}

// 1. Create assistant
const assistantBody = {
  name: "Pheme Assistant",
  firstMessage: "Hi, this is your Pheme assistant. Which document would you like to work on — a buyer rep, a purchase agreement, or a dual agency consent?",
  model: {
    provider: "openai",
    model: "gpt-4o",
    messages: [{ role: "system", content: systemPrompt }],
    tools,
  },
  voice: { provider: "openai", voiceId: "alloy" },
};

const a = await vapi("/assistant", assistantBody);
console.log("CREATE ASSISTANT:", a.status, a.ok ? `id=${a.json.id}` : JSON.stringify(a.json).slice(0, 800));
if (!a.ok) process.exit(1);
const assistantId = a.json.id;

// 2. Import the Twilio number into Vapi for voice, attached to the assistant
const p = await vapi("/phone-number", {
  provider: "twilio",
  number: NUMBER,
  twilioAccountSid: env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: env.TWILIO_AUTH_TOKEN,
  assistantId,
  name: "Pheme Voice",
});
console.log("IMPORT NUMBER:", p.status, p.ok ? `phone-number id=${p.json.id} number=${p.json.number}` : JSON.stringify(p.json).slice(0, 800));
