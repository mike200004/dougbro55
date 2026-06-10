// Authoring tool: typesets the built-in business document library as branded
// PDFs with embedded AcroForm fields (field name == schema key), then emits
// lib/templates/generated.ts so the PDFs and the registry can never drift.
//
//   node scripts/generate-templates.mjs
//
// Re-run after editing a spec; commit both the PDFs and generated.ts.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync } from "fs";
import path from "path";

const INK = rgb(0.106, 0.169, 0.267);
const GOLD = rgb(0.663, 0.518, 0.247);
const MUTED = rgb(0.38, 0.36, 0.33);
const FAINT = rgb(0.65, 0.62, 0.58);

const PAGE = [612, 792];
const MARGIN = 56;
const WIDTH = PAGE[0] - MARGIN * 2;

const DISCLAIMER =
  "Provided by Pheme (pheme.deals) as a general convenience form — not legal advice. Confirm it meets your state, association, and brokerage requirements before use.";

// ---------------------------------------------------------------------------
// Typesetting kit
// ---------------------------------------------------------------------------

async function makeDoc() {
  const pdf = await PDFDocument.create();
  const fonts = {
    body: await pdf.embedFont(StandardFonts.TimesRoman),
    bodyBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    label: await pdf.embedFont(StandardFonts.Helvetica),
    labelBold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const form = pdf.getForm();
  const ctx = { pdf, form, fonts, page: pdf.addPage(PAGE), y: PAGE[1] - MARGIN };
  return ctx;
}

function ensure(ctx, h) {
  if (ctx.y - h < MARGIN + 28) {
    ctx.page = ctx.pdf.addPage(PAGE);
    ctx.y = PAGE[1] - MARGIN;
  }
}

function wrap(font, text, size, width) {
  const out = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    const probe = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(probe, size) > width && cur) {
      out.push(cur);
      cur = w;
    } else cur = probe;
  }
  if (cur) out.push(cur);
  return out;
}

function title(ctx, text, subtitle) {
  const size = 17;
  const w = ctx.fonts.bodyBold.widthOfTextAtSize(text, size);
  ctx.page.drawText(text, { x: (PAGE[0] - w) / 2, y: ctx.y - size, size, font: ctx.fonts.bodyBold, color: INK });
  ctx.y -= size + 7;
  ctx.page.drawRectangle({ x: (PAGE[0] - 64) / 2, y: ctx.y, width: 64, height: 1.6, color: GOLD });
  ctx.y -= 12;
  if (subtitle) {
    const sw = ctx.fonts.label.widthOfTextAtSize(subtitle, 8.5);
    ctx.page.drawText(subtitle, { x: (PAGE[0] - sw) / 2, y: ctx.y - 8.5, size: 8.5, font: ctx.fonts.label, color: MUTED });
    ctx.y -= 18;
  }
  ctx.y -= 6;
}

function sec(ctx, text) {
  ensure(ctx, 26);
  ctx.y -= 8;
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 1, width: 14, height: 2, color: GOLD });
  ctx.page.drawText(text.toUpperCase(), { x: MARGIN + 20, y: ctx.y - 4, size: 8.5, font: ctx.fonts.labelBold, color: INK });
  ctx.y -= 18;
}

function para(ctx, text, opts = {}) {
  const size = opts.size ?? 9.6;
  const lh = size + 3.2;
  const font = opts.bold ? ctx.fonts.bodyBold : ctx.fonts.body;
  const color = opts.muted ? MUTED : INK;
  const lines = wrap(font, text, size, WIDTH);
  ensure(ctx, lines.length * lh + 4);
  for (const line of lines) {
    ctx.page.drawText(line, { x: MARGIN, y: ctx.y - size, size, font, color });
    ctx.y -= lh;
  }
  ctx.y -= 4;
}

function small(ctx, text) {
  para(ctx, text, { size: 7.6, muted: true });
}

function textField(ctx, key, x, y, w, h, opts = {}) {
  const tf = ctx.form.createTextField(key);
  if (opts.multiline) tf.enableMultiline();
  tf.addToPage(ctx.page, { x, y, width: w, height: h, borderWidth: 0 });
  tf.setFontSize(opts.fontSize ?? 9.5);
  return tf;
}

/** A row of labeled blanks. Each def: {key,label,w?} — w is a flex weight. */
function row(ctx, defs) {
  const H = 34;
  ensure(ctx, H);
  const gap = 14;
  const totalW = WIDTH - gap * (defs.length - 1);
  const weights = defs.map((d) => d.w ?? 1);
  const wsum = weights.reduce((a, b) => a + b, 0);
  let x = MARGIN;
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    const w = (totalW * weights[i]) / wsum;
    ctx.page.drawText(d.label.toUpperCase(), { x, y: ctx.y - 7, size: 6.8, font: ctx.fonts.labelBold, color: MUTED });
    textField(ctx, d.key, x, ctx.y - 25, w, 15);
    ctx.page.drawLine({ start: { x, y: ctx.y - 26 }, end: { x: x + w, y: ctx.y - 26 }, thickness: 0.7, color: FAINT });
    x += w + gap;
  }
  ctx.y -= H;
}

/** Full-width multiline box. */
function area(ctx, def, h = 64) {
  ensure(ctx, h + 16);
  ctx.page.drawText(def.label.toUpperCase(), { x: MARGIN, y: ctx.y - 7, size: 6.8, font: ctx.fonts.labelBold, color: MUTED });
  ctx.y -= 12;
  ctx.page.drawRectangle({
    x: MARGIN, y: ctx.y - h, width: WIDTH, height: h,
    borderColor: FAINT, borderWidth: 0.7,
  });
  textField(ctx, def.key, MARGIN + 3, ctx.y - h + 2, WIDTH - 6, h - 4, { multiline: true, fontSize: 9 });
  ctx.y -= h + 8;
}

/** Checkbox + wrapped statement text. */
function check(ctx, key, text) {
  const size = 8.8;
  const lh = size + 3;
  const tx = MARGIN + 18;
  const lines = wrap(ctx.fonts.body, text, size, WIDTH - 18);
  ensure(ctx, lines.length * lh + 8);
  const cb = ctx.form.createCheckBox(key);
  cb.addToPage(ctx.page, { x: MARGIN, y: ctx.y - 11, width: 10, height: 10, borderColor: INK, borderWidth: 1 });
  for (const line of lines) {
    ctx.page.drawText(line, { x: tx, y: ctx.y - size, size, font: ctx.fonts.body, color: INK });
    ctx.y -= lh;
  }
  ctx.y -= 6;
}

/** Signature lines (no widgets — e-sign appends a certificate page). */
function sig(ctx, captions) {
  const H = 44;
  ensure(ctx, H + 10);
  ctx.y -= 16;
  const gap = 26;
  const w = (WIDTH - gap * (captions.length - 1)) / captions.length;
  let x = MARGIN;
  for (const cap of captions) {
    ctx.page.drawLine({ start: { x, y: ctx.y - 14 }, end: { x: x + w, y: ctx.y - 14 }, thickness: 0.8, color: INK });
    ctx.page.drawText(cap.toUpperCase(), { x, y: ctx.y - 24, size: 6.8, font: ctx.fonts.labelBold, color: MUTED });
    x += w + gap;
  }
  ctx.y -= H;
}

function footer(ctx) {
  const lines = wrap(ctx.fonts.label, DISCLAIMER, 6.8, WIDTH);
  let y = 34 + lines.length * 9;
  for (const line of lines) {
    ctx.page.drawText(line, { x: MARGIN, y: y - 9, size: 6.8, font: ctx.fonts.label, color: FAINT });
    y -= 9;
  }
}

// ---------------------------------------------------------------------------
// Spec runner — renders ops and collects the field schema in order
// ---------------------------------------------------------------------------

async function render(spec) {
  const ctx = await makeDoc();
  const fields = [];
  const def = (d, type) => {
    fields.push({
      key: d.key, label: d.label, type: d.type ?? type,
      ...(d.required ? { required: true } : {}),
      ...(d.source ? { source: d.source } : {}),
      ...(d.hint ? { hint: d.hint } : {}),
    });
    return d;
  };

  title(ctx, spec.name, spec.subtitle);
  for (const op of spec.body) {
    if (op.t === "para") para(ctx, op.text, op);
    else if (op.t === "small") small(ctx, op.text);
    else if (op.t === "sec") sec(ctx, op.text);
    else if (op.t === "gap") ctx.y -= op.h;
    else if (op.t === "row") row(ctx, op.fields.map((f) => def(f, "text")));
    else if (op.t === "area") area(ctx, def(op.field, "longtext"), op.h);
    else if (op.t === "check") check(ctx, def(op.field, "checkbox").key, op.text);
    else if (op.t === "sig") sig(ctx, op.captions);
    else throw new Error(`unknown op ${op.t}`);
  }
  footer(ctx);

  ctx.form.updateFieldAppearances(ctx.fonts.label);
  const bytes = await ctx.pdf.save();
  return { bytes, fields, pages: ctx.pdf.getPageCount() };
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

const F = {
  property: { key: "propertyAddress", label: "Property address", required: true, hint: "Full street address, town, state." },
  date: { key: "date", label: "Date", type: "date", required: true },
  brokerage: { key: "brokerageFirm", label: "Brokerage firm", source: "broker_agency_name" },
  agent: { key: "agentName", label: "Agent", source: "agent_name" },
};

const SPECS = [
  {
    id: "listing_agreement",
    name: "Exclusive Right to Sell Listing Agreement",
    shortName: "Listing",
    category: "Listings & transactions",
    description: "Appoints the brokerage as the seller's exclusive listing agent — price, term, and commission.",
    body: [
      { t: "para", text: "The Seller named below appoints the Brokerage named below as Seller's sole and exclusive agent to market and sell the Property, on the terms set out in this Agreement." },
      { t: "row", fields: [F.property] },
      { t: "row", fields: [{ key: "sellerName", label: "Seller(s)", required: true, w: 2 }, { key: "sellerPhone", label: "Seller phone" }] },
      { t: "row", fields: [
        { key: "listPrice", label: "List price ($)", type: "currency", required: true },
        { key: "commissionPercent", label: "Commission (%)", type: "percent", required: true },
        { key: "coopCommission", label: "Co-broke share (%)", type: "percent", hint: "Portion offered to a cooperating buyer's broker." },
      ] },
      { t: "row", fields: [
        { key: "startDate", label: "Listing start", type: "date", required: true },
        { key: "endDate", label: "Listing end", type: "date", required: true },
      ] },
      { t: "area", field: { key: "exclusions", label: "Exclusions / special terms (optional)", hint: "Items excluded from the sale or special listing terms." }, h: 46 },
      { t: "sec", text: "Terms" },
      { t: "para", text: "1. Exclusive right to sell. The commission stated above is earned if, during the listing term, the Property is sold or exchanged by the Brokerage, the Seller, or anyone else, or if a ready, willing and able buyer is procured at the list price or any price the Seller accepts." },
      { t: "para", text: "2. Cooperation and MLS. The Brokerage may place the Property in the multiple listing service(s) it participates in, cooperate with and compensate other licensed brokers as stated above, and share listing information as customary." },
      { t: "para", text: "3. Marketing. The Seller authorizes the Brokerage to advertise the Property, place signage where permitted, photograph the Property, and use those materials in marketing." },
      { t: "para", text: "4. Fair housing. The Property is offered in full compliance with federal, state, and local fair housing laws, without regard to any protected class." },
      { t: "para", text: "5. Protection period. If, within 90 days after this listing ends, the Seller contracts to sell to a buyer introduced during the term, the commission above remains payable, unless the Property is then relisted with another broker." },
      { t: "row", fields: [F.brokerage, F.agent, F.date] },
      { t: "sig", captions: ["Seller", "Seller", "For the Brokerage"] },
    ],
  },
  {
    id: "general_addendum",
    name: "Addendum / Amendment to Contract",
    shortName: "Addendum",
    category: "Listings & transactions",
    description: "Adds or amends terms on an existing contract — all other terms stay in force.",
    body: [
      { t: "para", text: "This Addendum is made part of the contract identified below. To the extent these terms conflict with the contract, these terms control." },
      { t: "row", fields: [F.property] },
      { t: "row", fields: [
        { key: "contractDate", label: "Contract dated", type: "date", required: true },
        { key: "sellerName", label: "Seller(s)", required: true },
        { key: "buyerName", label: "Buyer(s)", required: true },
      ] },
      { t: "area", field: { key: "terms", label: "The parties agree as follows", required: true, hint: "The new or amended terms, in plain language." }, h: 170 },
      { t: "para", text: "All other terms and conditions of the contract remain unchanged and in full force and effect." },
      { t: "row", fields: [F.date] },
      { t: "sig", captions: ["Seller", "Buyer"] },
    ],
  },
  {
    id: "escalation_addendum",
    name: "Escalation Clause Addendum",
    shortName: "Escalation",
    category: "Listings & transactions",
    description: "Automatically escalates the buyer's offer over competing bona fide offers, up to a cap.",
    body: [
      { t: "para", text: "This Addendum is made part of the purchase offer for the Property below." },
      { t: "row", fields: [F.property] },
      { t: "row", fields: [{ key: "buyerName", label: "Buyer(s)", required: true }, { key: "sellerName", label: "Seller(s)" }] },
      { t: "row", fields: [
        { key: "baseOfferPrice", label: "Base offer price ($)", type: "currency", required: true },
        { key: "escalationIncrement", label: "Escalation increment ($)", type: "currency", required: true },
        { key: "maxPrice", label: "Maximum price ($)", type: "currency", required: true },
      ] },
      { t: "sec", text: "How the escalation works" },
      { t: "para", text: "If the Seller receives one or more bona fide competing offers with a net price higher than the base offer price above, the Buyer's offer price automatically increases to the highest such competing offer plus the escalation increment, but never above the maximum price stated above." },
      { t: "para", text: "The Seller must deliver a complete copy of the competing offer (with buyer identity redacted as needed) with any acceptance relying on this clause. All other terms of the Buyer's offer remain unchanged." },
      { t: "row", fields: [F.date] },
      { t: "sig", captions: ["Buyer", "Seller"] },
    ],
  },
  {
    id: "mutual_release",
    name: "Mutual Release & Termination",
    shortName: "Release",
    category: "Listings & transactions",
    description: "Terminates a contract by mutual agreement and directs the deposit.",
    body: [
      { t: "para", text: "The parties below agree to terminate the contract identified here and release one another from any further obligation under it, on the terms stated." },
      { t: "row", fields: [F.property] },
      { t: "row", fields: [
        { key: "contractDate", label: "Contract dated", type: "date", required: true },
        { key: "buyerName", label: "Buyer(s)", required: true },
        { key: "sellerName", label: "Seller(s)", required: true },
      ] },
      { t: "row", fields: [{ key: "depositDisposition", label: "Earnest money deposit shall be released to", required: true, hint: "Who receives the deposit, and how it is split if shared." }] },
      { t: "area", field: { key: "releaseTerms", label: "Additional terms (optional)" }, h: 56 },
      { t: "para", text: "Upon disbursement of the deposit as directed above, the contract is terminated and each party releases the other, the brokerages, and their agents from all claims arising out of the contract or the transaction." },
      { t: "row", fields: [F.date] },
      { t: "sig", captions: ["Buyer", "Seller"] },
    ],
  },
  {
    id: "deposit_receipt",
    name: "Earnest Money Deposit Receipt",
    shortName: "Deposit receipt",
    category: "Listings & transactions",
    description: "Acknowledges receipt of a buyer's earnest money deposit and where it's held.",
    body: [
      { t: "row", fields: [F.property] },
      { t: "row", fields: [{ key: "buyerName", label: "Received from (buyer)", required: true, w: 2 }, { key: "contractDate", label: "Contract dated", type: "date" }] },
      { t: "row", fields: [
        { key: "depositAmount", label: "Amount received ($)", type: "currency", required: true },
        { key: "paymentMethod", label: "Form of payment", hint: "Check, wire, or ACH." },
        { key: "receivedDate", label: "Date received", type: "date", required: true },
      ] },
      { t: "row", fields: [{ key: "escrowHolder", label: "Held in escrow by", required: true, hint: "Escrow agent, brokerage, or attorney holding the funds." }] },
      { t: "para", text: "The deposit above has been received and will be held and applied in accordance with the contract between the parties. If the contract does not close, the deposit will be disbursed as the contract provides or as the parties direct in writing." },
      { t: "row", fields: [F.brokerage, F.agent, F.date] },
      { t: "sig", captions: ["Received by", "Buyer"] },
    ],
  },
  {
    id: "referral_agreement",
    name: "Referral Fee Agreement",
    shortName: "Referral",
    category: "Brokerage & office",
    description: "Broker-to-broker referral — who's referred, who pays, and the fee.",
    body: [
      { t: "para", text: "The Referring Brokerage refers the client below to the Receiving Brokerage, which agrees to pay the referral fee stated here." },
      { t: "row", fields: [
        { key: "referringBrokerage", label: "Referring brokerage", required: true },
        { key: "referringAgent", label: "Referring agent", required: true },
      ] },
      { t: "row", fields: [
        { key: "receivingBrokerage", label: "Receiving brokerage", required: true, hint: "Often your own brokerage." },
        { key: "receivingAgent", label: "Receiving agent" },
      ] },
      { t: "row", fields: [{ key: "clientName", label: "Referred client", required: true, w: 2 }, { key: "propertyOrArea", label: "Property / market area" }] },
      { t: "row", fields: [
        { key: "referralFeePercent", label: "Referral fee (%)", type: "percent", required: true, hint: "Percent of the receiving side's gross commission." },
        { key: "payableTerms", label: "Payable", w: 2, hint: "E.g. at closing, from the receiving side's gross commission." },
      ] },
      { t: "sec", text: "Terms" },
      { t: "para", text: "1. The referral fee is earned only upon a closed transaction between the referred client and the Receiving Brokerage, and is payable from the Receiving Brokerage's gross commission as stated above." },
      { t: "para", text: "2. Each party represents that it holds an active real estate license in its jurisdiction and that the fee may lawfully be paid broker-to-broker. Nothing here creates an employment, agency, or partnership relationship between the brokerages." },
      { t: "para", text: "3. This agreement covers the referred client for transactions commenced within 12 months of the date below, unless otherwise stated." },
      { t: "row", fields: [F.date] },
      { t: "sig", captions: ["Referring broker", "Receiving broker"] },
    ],
  },
  {
    id: "commission_disbursement",
    name: "Commission Disbursement Authorization",
    shortName: "CDA",
    category: "Brokerage & office",
    description: "Instructs the closing agent how to pay out the brokerage's commission (CDA).",
    body: [
      { t: "para", text: "To the closing agent named below: the Brokerage authorizes you to disburse its commission for this transaction exactly as set out here." },
      { t: "row", fields: [F.property] },
      { t: "row", fields: [
        { key: "closingDate", label: "Closing date", type: "date", required: true },
        { key: "salesPrice", label: "Sales price ($)", type: "currency", required: true },
      ] },
      { t: "row", fields: [{ key: "buyerName", label: "Buyer(s)" }, { key: "sellerName", label: "Seller(s)" }] },
      { t: "row", fields: [
        { key: "grossCommission", label: "Gross commission ($)", type: "currency", required: true },
        { key: "agentSplit", label: "Agent split", hint: "E.g. 70/30." },
        { key: "transactionFee", label: "Transaction fee ($)", type: "currency" },
      ] },
      { t: "row", fields: [
        { key: "agentPayout", label: "Pay to agent ($)", type: "currency", required: true },
        { key: "payableTo", label: "Agent payee name", required: true, w: 2, hint: "Exactly as the check/wire should read." },
      ] },
      { t: "row", fields: [{ key: "disburseBy", label: "Closing agent (attorney / title / escrow)", required: true }] },
      { t: "area", field: { key: "deliveryInstructions", label: "Delivery instructions (optional)", hint: "Wire per instructions on file, mail, pickup…" }, h: 44 },
      { t: "para", text: "Any remainder of the gross commission not disbursed above is payable to the Brokerage. This authorization may only be changed in writing by the Brokerage." },
      { t: "row", fields: [F.brokerage, { ...F.agent, key: "authorizedBy", label: "Authorized by" }, F.date] },
      { t: "sig", captions: ["For the Brokerage"] },
    ],
  },
  {
    id: "independent_contractor",
    name: "Independent Contractor Agreement",
    shortName: "Contractor (ICA)",
    category: "Brokerage & office",
    description: "Short-form broker–salesperson agreement: status, split, and termination.",
    body: [
      { t: "para", text: "The Brokerage and the Salesperson named below agree that the Salesperson will be affiliated with the Brokerage as an independent contractor on these terms." },
      { t: "row", fields: [
        { ...F.brokerage, required: true },
        { key: "contractorName", label: "Salesperson", required: true },
        { key: "licenseNumber", label: "License #" },
      ] },
      { t: "row", fields: [
        { key: "commissionSplit", label: "Commission split", required: true, hint: "E.g. 70/30 (salesperson/brokerage)." },
        { key: "transactionFee", label: "Transaction fee ($)", type: "currency" },
        { key: "startDate", label: "Start date", type: "date", required: true },
      ] },
      { t: "sec", text: "Terms" },
      { t: "para", text: "1. Independent contractor. The Salesperson is an independent contractor, not an employee. The Salesperson controls their own schedule and methods, is responsible for their own taxes, and is not entitled to employee benefits." },
      { t: "para", text: "2. Licensing and conduct. The Salesperson will keep an active license, work under the Brokerage as required by law, and comply with applicable law, any applicable REALTOR® code of ethics, and the Brokerage's written policies." },
      { t: "para", text: "3. Commissions. Commissions are payable to the Brokerage and divided per the split above after any stated fees, payable promptly after the Brokerage receives them. No commission is owed on transactions the Brokerage does not collect on." },
      { t: "para", text: "4. Expenses. The Salesperson bears their own business expenses (dues, MLS, transportation, marketing) unless agreed in writing." },
      { t: "para", text: "5. Termination. Either party may terminate at any time by written notice. Pending transactions are handled per Brokerage policy stated in writing, or split as above if none." },
      { t: "para", text: "6. Confidentiality. Brokerage records, client information, and transaction files remain the Brokerage's property and must be kept confidential and returned on termination." },
      { t: "area", field: { key: "termNotes", label: "Additional terms (optional)" }, h: 46 },
      { t: "row", fields: [F.date] },
      { t: "sig", captions: ["For the Brokerage", "Salesperson"] },
    ],
  },
  {
    id: "lead_paint_disclosure",
    name: "Lead-Based Paint Disclosure",
    shortName: "Lead paint",
    category: "Leasing & compliance",
    description: "Federal lead-based paint disclosure for pre-1978 housing sales.",
    body: [
      { t: "sec", text: "Lead warning statement" },
      { t: "para", size: 8.4, text: "Every purchaser of any interest in residential real property on which a residential dwelling was built prior to 1978 is notified that such property may present exposure to lead from lead-based paint that may place young children at risk of developing lead poisoning. Lead poisoning in young children may produce permanent neurological damage, including learning disabilities, reduced intelligence quotient, behavioral problems, and impaired memory. Lead poisoning also poses a particular risk to pregnant women. The seller of any interest in residential real property is required to provide the buyer with any information on lead-based paint hazards from risk assessments or inspections in the seller's possession and notify the buyer of any known lead-based paint hazards. A risk assessment or inspection for possible lead-based paint hazards is recommended prior to purchase." },
      { t: "row", fields: [F.property] },
      { t: "sec", text: "Seller's disclosure" },
      { t: "check", field: { key: "leadKnown", label: "Known lead-based paint present", hint: "Check if the seller knows of lead-based paint or hazards; explain below." }, text: "Seller has knowledge of lead-based paint and/or lead-based paint hazards in the housing (explain below)." },
      { t: "area", field: { key: "leadKnownDetails", label: "Known lead-based paint / hazards (if any)" }, h: 36 },
      { t: "check", field: { key: "noLeadKnowledge", label: "No knowledge of lead-based paint", hint: "Check if the seller has no knowledge of lead-based paint or hazards." }, text: "Seller has no knowledge of lead-based paint and/or lead-based paint hazards in the housing." },
      { t: "check", field: { key: "recordsProvided", label: "Records provided", hint: "Check if reports/records were provided; list below." }, text: "Seller has provided the buyer with all available records and reports pertaining to lead-based paint and/or hazards (list below)." },
      { t: "area", field: { key: "recordsList", label: "Records / reports provided (if any)" }, h: 32 },
      { t: "check", field: { key: "noRecords", label: "No records or reports", hint: "Check if the seller has no reports or records." }, text: "Seller has no reports or records pertaining to lead-based paint and/or lead-based paint hazards in the housing." },
      { t: "sec", text: "Buyer's acknowledgment" },
      { t: "check", field: { key: "pamphletReceived", label: "EPA pamphlet received" }, text: "Buyer has received the pamphlet “Protect Your Family from Lead in Your Home.”" },
      { t: "check", field: { key: "inspectionOpportunity", label: "10-day inspection opportunity" }, text: "Buyer has received a 10-day opportunity (or other mutually agreed period) to conduct a risk assessment or inspection for lead-based paint hazards." },
      { t: "check", field: { key: "inspectionWaived", label: "Inspection waived" }, text: "Buyer has waived the opportunity to conduct a risk assessment or inspection for lead-based paint hazards." },
      { t: "row", fields: [
        { key: "sellerName", label: "Seller(s)", required: true },
        { key: "buyerName", label: "Buyer(s)", required: true },
      ] },
      { t: "row", fields: [F.agent, F.date] },
      { t: "para", size: 8.4, text: "The parties have reviewed the information above and certify, to the best of their knowledge, that the information they have provided is true and accurate." },
      { t: "sig", captions: ["Seller", "Buyer", "Agent"] },
    ],
  },
  {
    id: "rental_application",
    name: "Rental Application",
    shortName: "Rental app",
    category: "Leasing & compliance",
    description: "Tenant application: contact, income, references, and screening consent.",
    body: [
      { t: "row", fields: [{ ...F.property, label: "Property applying for" }] },
      { t: "row", fields: [
        { key: "applicantName", label: "Applicant name", required: true, w: 2 },
        { key: "applicantPhone", label: "Phone", required: true },
      ] },
      { t: "row", fields: [
        { key: "applicantEmail", label: "Email", w: 2 },
        { key: "moveInDate", label: "Desired move-in", type: "date", required: true },
      ] },
      { t: "row", fields: [{ key: "currentAddress", label: "Current address", required: true }] },
      { t: "row", fields: [
        { key: "employer", label: "Employer" },
        { key: "position", label: "Position" },
        { key: "monthlyIncome", label: "Monthly income ($)", type: "currency" },
      ] },
      { t: "row", fields: [{ key: "landlordRef", label: "Current landlord (name & phone)" }] },
      { t: "row", fields: [
        { key: "occupants", label: "All occupants (names / ages)" },
        { key: "pets", label: "Pets (type / number)" },
      ] },
      { t: "gap", h: 4 },
      { t: "check", field: { key: "creditConsent", label: "Screening consent", required: true, hint: "Applicant must consent to credit/background screening." }, text: "Applicant certifies the information above is true and authorizes the brokerage and/or landlord to obtain credit reports, background checks, and to verify employment, income, and rental history." },
      { t: "row", fields: [F.date] },
      { t: "sig", captions: ["Applicant"] },
    ],
  },
];

// ---------------------------------------------------------------------------

const root = path.join(import.meta.dirname, "..");
const out = [];
for (const spec of SPECS) {
  const { bytes, fields, pages } = await render(spec);
  const file = `templates/${spec.id.replace(/_/g, "-")}.pdf`;
  writeFileSync(path.join(root, file), bytes);
  out.push({
    id: spec.id,
    name: spec.name,
    shortName: spec.shortName,
    description: spec.description,
    category: spec.category,
    kind: "acroform",
    file,
    pages,
    fields,
    placements: {},
  });
  console.log(`${file}  (${pages}p, ${fields.length} fields)`);
}

const ts = `// AUTO-GENERATED by scripts/generate-templates.mjs — do not edit by hand.
// Edit the specs in that script and re-run it; commit the PDFs alongside.
import type { TemplateDef } from "./types";

export const generatedTemplates: TemplateDef[] = ${JSON.stringify(out, null, 2)} as TemplateDef[];
`;
writeFileSync(path.join(root, "lib/templates/generated.ts"), ts);
console.log(`lib/templates/generated.ts  (${out.length} templates)`);
