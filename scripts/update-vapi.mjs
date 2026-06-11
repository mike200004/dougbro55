// Push the full voice-agent configuration to the live Vapi assistant + phone
// number. Field names validated against Vapi's live OpenAPI spec (2026-06).
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
const SECRET = env.VAPI_SERVER_SECRET || "";
const ASSISTANT_ID = "8e46aebd-e589-4d6f-a614-7e2dfdfc621a";
const PHONE_NUMBER = "+14752703374";
const TOOLS_URL = "https://pheme.deals/api/voice/tools";
const ASSISTANT_URL = "https://pheme.deals/api/voice/assistant";

const headers = SECRET ? { "x-vapi-secret": SECRET } : undefined;

// ---------------------------------------------------------------------------
// Tools — each with spoken filler messages so the caller never sits in silence.
// `say` = spoken when the tool starts (variants picked at random); slow tools
// also get a delayed "still working" line. No request-complete: the model
// reacts to the real result.
// ---------------------------------------------------------------------------
const fn = (name, description, parameters, opts = {}) => ({
  type: "function",
  function: { name, description, parameters },
  server: { url: TOOLS_URL, timeoutSeconds: opts.timeout ?? 20, ...(headers ? { headers } : {}) },
  messages: [
    ...(opts.say ? opts.say.map((content) => ({ type: "request-start", content })) : []),
    {
      type: "request-response-delayed",
      content: opts.delayedSay ?? "One sec.",
      timingMilliseconds: opts.delayed ?? 2500,
    },
    { type: "request-failed", content: opts.failedSay ?? "Hmm, that didn't go through — one sec." },
  ],
});

const tools = [
  { type: "endCall" },
  fn("get_agent_profile", "Get the agent's own profile (broker/agency name, license, address, email, phone). Auto-fills the broker side; only call if actually needed.", { type: "object", properties: {} }),
  fn("list_clients", "List the agent's saved clients (names + roles). Only call if the agent refers to an existing client you can't recall by name.", { type: "object", properties: {} }),
  fn("recall_client", "Recall everything about a person by name — even partial/family names ('the Johnsons') or a name you may have misheard; matching is fuzzy and the stored spelling wins. Returns contact info, role, preferences, and past deals. Call the INSTANT a person or property is mentioned.", {
    type: "object",
    properties: { name: { type: "string", description: "Person or family name to recall." } },
    required: ["name"],
  }),
  fn("remember_about_client", "Save a fact/preference about a person for next time (e.g. 'pre-approved to 900k', 'prefers texts').", {
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
  fn("list_form_templates", "List the agent's own uploaded forms (e.g. a SmartMLS form or a brokerage document) that can be filled. Call when they mention a form that isn't in the built-in library.", { type: "object", properties: {} }),
  fn("create_document", "Start a new document. Use `type` for the built-in library, OR `template_name`/`template_id` for one of the agent's uploaded forms. Returns the exact fields to collect — never guess fields.", {
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
  }, { say: ["Okay — pulling that one up.", "On it."], delayedSay: "Almost there.", delayed: 4000 }),
  fn("set_document_fields", "Set/update field values on a document (the field labels work as keys). Returns remaining required fields. Call this every two or three answers — don't hold the whole deal in your head.", {
    type: "object",
    properties: {
      document_id: { type: "string" },
      fields: { type: "object", description: "Map of field label/key -> string value.", additionalProperties: { type: "string" } },
    },
    required: ["document_id", "fields"],
  }, { delayedSay: "Got it — writing that in.", delayed: 2500 }),
  fn("get_document", "Get a document's filled values and missing required fields.", {
    type: "object",
    properties: { document_id: { type: "string" } },
    required: ["document_id"],
  }),
  fn("finalize_document", "File a completed document (all required fields must be set). After filing it can be texted, emailed, or sent for signature.", {
    type: "object",
    properties: { document_id: { type: "string" } },
    required: ["document_id"],
  }, { say: ["Filing it now."], timeout: 45 }),
  fn("send_document", "Text the document as a secure link. For 'send/text it to me' or any send with no named recipient, call this with NO to_phone — it automatically goes to the number the agent is calling from (NEVER ask the caller for their own number). Only pass to_phone for a THIRD PARTY.", {
    type: "object",
    properties: {
      document_id: { type: "string" },
      to_phone: { type: "string", description: "THIRD-PARTY recipient's phone only. Omit entirely to send to the caller themselves." },
      recipient_name: { type: "string" },
    },
    required: ["document_id"],
  }, { say: ["Texting it over now."], delayedSay: "Still sending — one sec.", delayed: 6000, failedSay: "That text didn't go through — let me try once more.", timeout: 45 }),
  fn("email_document", "Email the completed document as a PDF attachment — to a recipient, or to the agent themselves when no email is given ('email it to me').", {
    type: "object",
    properties: {
      document_id: { type: "string" },
      to_email: { type: "string", description: "Recipient email. Omit to email the agent themselves." },
      recipient_name: { type: "string" },
    },
    required: ["document_id"],
  }, { say: ["Sending that off — give me a few seconds."], delayedSay: "Almost done — attaching the PDF.", delayed: 7000, timeout: 60 }),
  fn("request_signature", "Send a document for e-signature. The signer gets a secure link by email and/or text; the executed copy comes back automatically and the agent is notified. Needs the signer's email or mobile.", {
    type: "object",
    properties: {
      document_id: { type: "string" },
      signer_name: { type: "string" },
      signer_email: { type: "string" },
      signer_phone: { type: "string" },
    },
    required: ["document_id", "signer_name"],
  }, { say: ["Sending it out for signature."], delayedSay: "One more second.", delayed: 7000, timeout: 60 }),
  fn("list_documents", "List recent documents (title, status). Use when they reference an earlier document by name or ask what got filed.", {
    type: "object",
    properties: { query: { type: "string", description: "Optional title filter." } },
  }),
];

// ---------------------------------------------------------------------------
// The voice system prompt. One template variable: {{memoryDigest}} — the
// assistant-request webhook fills it with the full caller context (date,
// identity, in-progress draft, client memory, registration status).
// ---------------------------------------------------------------------------
const systemPrompt = `You are Pheme — a warm, sharp assistant for real estate agents and brokers, on the phone. You handle their deal paperwork and office paperwork hands-free. Assume the caller may be driving.

CALLER CONTEXT (if blank or it looks like a placeholder, you simply have no saved context — rely on your tools):
{{memoryDigest}}

DOCUMENTS you can start instantly with create_document (it returns the exact fields to collect — never guess fields):
- Deals: buyer_rep (buyer representation), purchase (purchase agreement), dual_agency (dual agency consent), listing_agreement (exclusive right to sell), general_addendum (addendum/amendment), escalation_addendum, mutual_release (terminate a contract), deposit_receipt (earnest money receipt).
- Office/broker: referral_agreement (broker referral fee), commission_disbursement (CDA), independent_contractor (new salesperson ICA).
- Leasing/compliance: lead_paint_disclosure, rental_application.
- They may also have uploaded their own forms — list_form_templates when they mention a form not listed here. If a form doesn't exist anywhere, say so plainly and offer the closest one — never pretend.

SPEAKING — everything you produce is HEARD, not read:
- Never speak ids, links, URLs, tokens, field keys, or anything technical. Say "I texted you the link" — never the link itself. Ids in tool results are for you, not them.
- Numbers the way agents say them: $925,000 → "nine twenty-five"; $1,250,000 → "one point two five million"; 2.5 → "two and a half percent". Dates in words ("Friday, June twelfth"). Phone numbers digit by digit. Store full numerals ("925,000", "12/31/2026").
- Never list or enumerate aloud — no bullets, no "first… second…", and never read out a list of fields you're going to need. Just start with the first one.
- One question per turn, and put the question LAST in your sentence. Naturally paired items may share a turn ("when does it start, and when does it end?"). One or two short sentences per reply.
- Vary your acknowledgments — never open consecutive turns the same way, and no "Hey" after the greeting. If they interrupt, drop your sentence and follow them.
- Never announce that you're about to do something — the system speaks a short line while a tool runs ("Filing it now."). Just call the tool.

WORKFLOW — walk the form in order, like a colleague reading down the page:
- The moment you know which document they need, call create_document. It returns the fields in ORDER and tool results tell you next_field — that is ALWAYS the next thing to ask. Ask for ONE field per turn (two only when naturally paired, like start and end dates). Never ask for a batch of fields up front and never recite the field list.
- Make it feel like you're both looking at the same page: acknowledge what they just gave you in a couple of words, then read the document's next line as the ask — "Got it. Next is the property — known and described as…?", "Okay, purchase price — what are we putting?". The field's label IS the document's next line; speak it naturally and let them fill in the blank.
- Walk the WHOLE document, every line — not just the required ones. The form is only done when next_field comes back null; never offer to finalize before that. If a line doesn't apply or they say skip, set it to "-" (the standard dash through an unused blank) and keep moving; a checkbox that doesn't apply gets "No". Checkbox pairs ("is / is not contingent", "disclosure furnished / not furnished") are ONE yes-or-no question — set the matching box to Yes and move on.
- If the caller volunteers several answers in one breath, save them ALL with one set_document_fields, then pick up from the next_field the result gives you — don't make them repeat anything.
- Push values with set_document_fields every one or two answers — calls drop; never hold a whole deal in your head. Use the document_id the tool returned; one document per request; never invent ids.
- On long uploaded forms, drop a quick progress note every five or six fields ("about halfway") and offer an out ("want to keep going, or fill the rest from the dashboard?"). The caller can say "skip" — move to the next field.
- If the caller context shows a DOCUMENT IN PROGRESS, continue that one — only start fresh if they clearly want a different document. When only a couple of fields remain, fold them into one sentence: "I just need the price and the closing date."
- Confirm ONCE, then act: before you finalize, send to a third party, or request a signature, give one compact recap — the people, the property, the money, the dates — and get a clear yes. Don't read each answer back while collecting; a quick varied "got it" is plenty. After the yes, run the remaining tools without narrating each one.
- When they ask to send or sign a finished document that isn't filed yet, that same single yes covers filing it too — finalize first, then send; don't ask twice.
- Resolve relative dates ("end of year", "next Friday") against today's date in the caller context. If the caller context has NO "Today is" line, ask for the explicit date instead of guessing. Checkbox fields: set the value "Yes" to check; confirm consent checkboxes out loud in plain words first.
- The broker/agency side of every form auto-fills from their profile — never ask for it.
- Delivery: send_document texts a secure link; email_document emails the PDF; request_signature sends a signing link and the executed copy comes back automatically. After filing, offer the next step — "Want me to text it to you, or send it out for signature?" — don't mention dashboards unless they ask.
- "Send it to me" / "text it to me" / no recipient named: call send_document with NO to_phone. It automatically goes to the number they're calling from. NEVER ask the caller for their own phone number — you already have it. Same for "email it to me": email_document with no to_email goes to their email on file.

NAMES AND NUMBERS YOU HEAR (the transcript WILL garble them):
- The moment a person is named, call recall_client — a rough match to someone you already know beats re-asking, and the stored spelling wins over what you heard. Greet matches with what you remember in one sentence and offer to reuse it; never make them repeat what you know.
- Spell-confirm NEW names going onto documents ("That's C-O-L-E-T-T-E?"). New emails: read back once, slowly; if it's still wrong after two tries, offer to text a link to a phone number instead. New phone numbers: repeat all ten digits back before sending anything to them.
- When you learn something personal (budget, timeline, preferences, life details), call remember_about_client so you know it next time.

WHEN SOMETHING FAILS: never read an error message aloud. Quietly retry once. If it still fails, say it in plain words and offer the nearest alternative — text failed → offer email; email not set up → text the link; can't find a document → ask what it was called and use list_documents. If create_document says a type is unknown or unavailable, that document isn't enabled on this account yet — say so and offer the buyer rep, purchase agreement, or dual agency consent instead. NEVER tell them something was created, filed, or sent unless a tool actually returned success — no false promises, ever.

WRAPPING UP: when they signal they're done ("that's all", "I'm good", "thanks, bye"), give a one-line recap of what got done — "You're set: listing filed and the link's on your phone" — then call endCall. Don't add your own goodbye; the system speaks the goodbye line when the call ends. Ask "anything else?" at most once per call. They also get a text recap after the call.

UNREGISTERED CALLERS: if the caller context says UNREGISTERED, or any tool returns caller_not_registered — don't collect personal or deal information and don't call other tools. Their number isn't on a Pheme account yet: they can sign up at pheme dot deals (pronounce it "FEE-mee dot deals"), or if they're an existing user on a new phone, update their number in Settings on the website. Then say goodbye warmly and call endCall.`;

// ---------------------------------------------------------------------------
// Assistant PATCH body
// ---------------------------------------------------------------------------
const makeBody = (model) => ({
  firstMessage: "Hey, it's Pheme — what are we working on?",
  firstMessageMode: "assistant-speaks-first",
  // Pickup rustle was clipping the greeting mid-sentence — let it finish.
  firstMessageInterruptionsEnabled: false,
  voice: {
    provider: "11labs",
    voiceId: "paula",
    model: "eleven_turbo_v2_5",
    fallbackPlan: { voices: [{ provider: "openai", voiceId: "nova" }] },
  },
  transcriber: {
    provider: "deepgram",
    model: "nova-3",
    language: "en",
    numerals: true,
    keyterm: [
      "Pheme", "buyer rep", "dual agency", "addendum", "escalation clause",
      "mutual release", "earnest money", "escrow", "CDA", "commission disbursement",
      "referral fee", "listing agreement", "SmartMLS", "co-broke", "lead paint",
      "rental application", "e-signature", "pre-approved", "closing date", "binder",
    ],
  },
  backgroundSound: "off",
  backgroundSpeechDenoisingPlan: { smartDenoisingPlan: { enabled: true } },
  startSpeakingPlan: {
    waitSeconds: 0.4,
    smartEndpointingPlan: { provider: "livekit" },
  },
  stopSpeakingPlan: { numWords: 0, voiceSeconds: 0.25, backoffSeconds: 1 },
  hooks: [
    {
      // 25s, not lower: the clock only resets on USER speech, so during a
      // finalize+send tool chain the caller is legitimately silent for 10s+.
      on: "customer.speech.timeout",
      options: { timeoutSeconds: 25, triggerMaxCount: 3, triggerResetMode: "onUserSpeech" },
      do: [{ type: "say", exact: ["Still with me?", "No rush — I'm here.", "Take your time."] }],
    },
  ],
  maxDurationSeconds: 1500,
  endCallMessage: "Bye for now!",
  analysisPlan: {
    summaryPlan: {
      enabled: true,
      timeoutSeconds: 10,
      messages: [
        {
          role: "system",
          content:
            "You write the post-call recap text message that Pheme (a real-estate AI assistant) sends TO THE AGENT after their phone call. Second person, under 280 characters, no greeting, no sign-off. Lead with what got DONE (documents created/filed, texts/emails sent, signatures requested, clients remembered) with the key names/numbers, then anything still needed. If nothing got done, one line on what was discussed.",
        },
        { role: "user", content: "Transcript:\n\n{{transcript}}\n\nEnded reason: {{endedReason}}" },
      ],
    },
  },
  model: {
    provider: "openai",
    model,
    temperature: 0.3,
    // Caps the WHOLE completion including tool-call JSON — a batched
    // set_document_fields with long names/addresses needs headroom. Spoken
    // brevity is enforced by the prompt, not this ceiling.
    maxTokens: 500,
    messages: [{ role: "system", content: systemPrompt }],
    tools,
  },
});

async function patchAssistant() {
  // Try the better model first; fall back if Vapi rejects the enum.
  for (const model of ["gpt-4.1-mini", "gpt-4o-mini"]) {
    const body = makeBody(model);
    const res = await fetch(`https://api.vapi.ai/assistant/${ASSISTANT_ID}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${VAPI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) {
      const json = JSON.parse(text);
      console.log(`PATCH ASSISTANT: ${res.status} model=${json.model?.model} voice=${json.voice?.provider}/${json.voice?.voiceId} transcriber=${json.transcriber?.model} tools=${json.model?.tools?.length}`);
      return true;
    }
    console.error(`PATCH ASSISTANT (${model}): ${res.status} ${text.slice(0, 600)}`);
    if (!text.includes("model")) return false; // not a model-enum problem — don't retry
  }
  return false;
}

async function patchNumber() {
  const nums = await (await fetch("https://api.vapi.ai/phone-number", {
    headers: { Authorization: `Bearer ${VAPI_KEY}` },
  })).json();
  const num = Array.isArray(nums) ? nums.find((n) => n.number === PHONE_NUMBER) : null;
  if (!num) {
    console.error("PATCH NUMBER: phone number not found");
    return;
  }
  const res = await fetch(`https://api.vapi.ai/phone-number/${num.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${VAPI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      server: { url: ASSISTANT_URL, timeoutSeconds: 10, ...(headers ? { headers } : {}) },
    }),
  });
  const text = await res.text();
  console.log(`PATCH NUMBER: ${res.status}${res.ok ? "" : " " + text.slice(0, 400)}`);
}

const ok = await patchAssistant();
if (ok) await patchNumber();
else process.exit(1);
