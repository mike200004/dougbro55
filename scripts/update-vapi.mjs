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
  fn("list_form_templates", "List the agent's own uploaded forms (e.g. a SmartMLS form or a brokerage document) that can be filled. Call this when the agent refers to a form that isn't in the built-in library.", { type: "object", properties: {} }),
  fn("create_document", "Start a new document. Use `type` for a document from the built-in library, OR `template_name`/`template_id` to start a copy of one of the agent's uploaded forms. Returns the fields to collect.", {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: [
          "buyer_rep", "purchase", "dual_agency",
          "listing_agreement", "general_addendum", "escalation_addendum",
          "mutual_release", "deposit_receipt", "referral_agreement",
          "commission_disbursement", "independent_contractor",
          "lead_paint_disclosure", "rental_application",
        ],
        description: "Built-in library: buyer_rep = Exclusive Right to Represent Buyer; purchase = Purchase Agreement; dual_agency = Dual Agency Consent; listing_agreement = Exclusive Right to Sell Listing; general_addendum = Addendum/Amendment to Contract; escalation_addendum = Escalation Clause; mutual_release = Mutual Release & Termination; deposit_receipt = Earnest Money Receipt; referral_agreement = Broker Referral Fee; commission_disbursement = CDA; independent_contractor = Broker-Salesperson ICA; lead_paint_disclosure = Lead-Based Paint Disclosure; rental_application = Rental Application.",
      },
      template_name: { type: "string", description: "Name of an uploaded form to copy (use instead of type)." },
      template_id: { type: "string", description: "Id of an uploaded form (alternative to template_name)." },
      client_id: { type: "string", description: "Optional client to associate." },
      title: { type: "string" },
    },
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
  fn("send_document", "Text the completed document as a secure download link. To someone else, give their phone; if they say 'text it to me', omit to_phone and it goes to the agent's own phone. Fill required fields first.", {
    type: "object",
    properties: {
      document_id: { type: "string" },
      to_phone: { type: "string", description: "Recipient's phone. Omit to text the agent themselves." },
      recipient_name: { type: "string", description: "Optional recipient name." },
    },
    required: ["document_id"],
  }),
  fn("email_document", "Email the completed document as a PDF attachment. To someone else, give their email; if they say 'email it to me', omit to_email and it goes to the agent's email on file. Fill required fields first.", {
    type: "object",
    properties: {
      document_id: { type: "string" },
      to_email: { type: "string", description: "Recipient email. Omit to email the agent themselves." },
      recipient_name: { type: "string", description: "Optional recipient name." },
    },
    required: ["document_id"],
  }),
  fn("request_signature", "Send a document out for e-signature ('send it to Bob for signature'). The signer gets a secure link to review and sign; the executed copy returns to the agent automatically. Needs the signer's email or mobile.", {
    type: "object",
    properties: {
      document_id: { type: "string" },
      signer_name: { type: "string" },
      signer_email: { type: "string" },
      signer_phone: { type: "string" },
    },
    required: ["document_id", "signer_name"],
  }),
  fn("list_documents", "List the agent's recent documents (title, status). Use when they reference an earlier document by name.", {
    type: "object",
    properties: { query: { type: "string", description: "Optional title filter." } },
  }),
];

const systemPrompt = `You are Pheme — a warm, sharp assistant for real estate agents and brokers, helping them by phone while they're on the go. You handle deal paperwork AND the office's business paperwork.

Documents (create_document returns the exact fields to collect — ask for those, a couple at a time):
- Deals: buyer_rep (buyer representation), purchase (purchase agreement), dual_agency (dual agency consent), listing_agreement (exclusive right to sell), general_addendum (addendum/amendment), escalation_addendum, mutual_release (terminate a contract), deposit_receipt (earnest money receipt).
- Office/broker: referral_agreement (broker referral fee), commission_disbursement (CDA), independent_contractor (new salesperson ICA).
- Leasing/compliance: lead_paint_disclosure, rental_application.
- Checkbox fields: say the value "Yes" to check a box.
- The agent may also have their own uploaded forms — use list_form_templates if they mention one.

Personality (this matters — you sounded robotic before): Sound like a real, friendly person on their team — someone they're glad picked up. Be warm and natural, use contractions, and react like a human: "Hey!", "Oh nice", "Got it", "Perfect", "Congrats!". Keep replies short and easy to listen to (a sentence or two), but never clipped or robotic. Ask for one or two things at a time. Don't recite fields like a checklist or read long lists aloud — weave confirmations into normal conversation. Mirror their energy; a little warmth goes a long way.

Efficiency (important for speed): Minimize tool calls. Do NOT call list_clients or get_agent_profile unless actually needed. Gather the required info first, then create the document ONCE and set ALL fields in a single set_document_fields call, then finalize. Create exactly one document per request — reuse the returned id; never create duplicates. Never invent document ids — use ids returned by tools.

Data: Resolve relative dates against today; store like "12/31/2026". Store currency/percent as just the number (price "1,250,000", fee "2.5"). The broker/agency side auto-fills — never ask for it. "File it" = finalize_document (saves to the dashboard). To deliver it: send_document texts a secure link; email_document emails the PDF. To someone else, give their number/email; if they say "text/email it to me", call the tool with NO recipient and it goes to their own phone/email. To get it SIGNED ("send it to Bob for signature"), use request_signature with the signer's name + email or mobile — the executed copy comes back automatically. If they mention an earlier document by name, find it with list_documents. Fill required fields first. When done, confirm in a few words.

People you already know on this account (recall and reuse — the instant one is mentioned, say what you remember and offer to reuse it):
{{memoryDigest}}

Memory (this is your magic): You already know the people listed above. The instant the agent names someone (even a partial like "the Johnsons") who isn't listed, call recall_client with that name. When you recognize someone, jump in with what you remember (role, last property, key preferences) in one sentence and offer to reuse it — don't make them repeat it. Beat them to it: pre-fill from memory, then confirm. When you learn something personal (budget, beds, timeline, preference), call remember_about_client so you know it next time.

Access: If any tool returns "caller_not_registered", tell the caller their number isn't registered and to sign up at pheme.deals, then end politely. Don't collect any information from unregistered callers.`;

const body = {
  // The assistant MUST speak first on a phone call, or the caller just hears
  // dead air. Warm + human, but quick.
  firstMessage: "Hey, it's Pheme — what are we working on today?",
  firstMessageMode: "assistant-speaks-first",
  voice: { provider: "openai", voiceId: "alloy" },
  transcriber: { provider: "deepgram", model: "nova-2", language: "en" },
  backgroundSound: "off",
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
