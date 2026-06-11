import {
  createClient_,
  createDocument,
  findFormTemplateByName,
  getClient,
  getClientDossier,
  getDocument,
  getFormTemplate,
  getProfile,
  listClients,
  listDocuments,
  listFormTemplates,
  rememberAboutClient,
  rememberParties,
  updateDocument,
} from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { defer } from "@/lib/defer";
import { requestSignature } from "@/lib/signing";
import { getTemplate, isDocType, missingRequired, templateList, userFields } from "@/lib/templates";
import type { DocumentRecord } from "@/lib/types";
import { makeShareToken } from "@/lib/share";
import { sendSms } from "@/lib/twilio";
import { sendEmail, emailConfigured } from "@/lib/email";
import { renderDocument } from "@/lib/pdf/fill";
import { normalizePhone } from "@/lib/phone";
import type { DocType } from "@/lib/types";

const DOC_TYPES: DocType[] = templateList.map((t) => t.id);
const DOC_TYPE_GUIDE = templateList
  .map((t) => `${t.id} = ${t.name}`)
  .join("; ");
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";

/** Provider-neutral tool spec. `parameters` is a JSON Schema. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const toolSpecs: ToolSpec[] = [
  {
    name: "get_agent_profile",
    description:
      "Get the agent's own profile (broker/agency name, license, address, email, phone). These auto-fill the broker side of every document, so you never need to ask the user for them.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "list_clients",
    description: "List the agent's saved clients.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "recall_client",
    description:
      "Recall everything you remember about a person by name (even a partial/family name like 'the Johnsons'). Returns their contact info, role, preferences, and past deals/properties. Call this the moment a client or property is mentioned, so you can greet them by name and reuse what you know instead of re-asking.",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "Person or family name to recall." } },
      required: ["name"],
    },
  },
  {
    name: "remember_about_client",
    description:
      "Save a freeform fact or preference about a person so you'll know it next time (e.g. 'pre-approved to $900k', 'wants 3BR in Darien', 'prefers texts', 'has a dog named Max'). Use whenever you learn something personal or useful about a client.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Who this is about." },
        note: { type: "string", description: "The fact/preference to remember." },
      },
      required: ["name", "note"],
    },
  },
  {
    name: "create_client",
    description:
      "Create a new client (a buyer or seller the agent is working with).",
    parameters: {
      type: "object",
      properties: {
        full_name: { type: "string", description: "Primary client name(s)." },
        secondary_name: { type: "string", description: "Co-buyer/co-seller name, if any." },
        email: { type: "string" },
        phone: { type: "string" },
        role: { type: "string", enum: ["buyer", "seller", "both"] },
        notes: { type: "string" },
      },
      required: ["full_name"],
    },
  },
  {
    name: "list_form_templates",
    description:
      "List the agent's own uploaded form templates (forms they've uploaded, like a SmartMLS form or a brokerage document) that can be filled out. Call this when the agent refers to a form that isn't in the built-in library.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "create_document",
    description:
      "Start a new document. Use `type` for a document from the built-in library, OR `template_name`/`template_id` to start a copy of one of the agent's uploaded forms. Returns the document id and the fields to collect.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: DOC_TYPES,
          description: `Built-in library: ${DOC_TYPE_GUIDE}.`,
        },
        template_name: {
          type: "string",
          description: "Name of an uploaded form template to copy (use instead of `type`).",
        },
        template_id: { type: "string", description: "Id of an uploaded form template (alternative to template_name)." },
        client_id: { type: "string", description: "Optional client to associate." },
        title: { type: "string", description: "Optional title; one is generated if omitted." },
      },
    },
  },
  {
    name: "set_document_fields",
    description:
      "Set or update one or more field values on a document. Keys must be valid field keys for that document type (call create_document or get_document to see them). Returns the remaining required fields still missing.",
    parameters: {
      type: "object",
      properties: {
        document_id: { type: "string" },
        fields: {
          type: "object",
          description: "Map of field key -> value (all values are strings).",
          additionalProperties: { type: "string" },
        },
      },
      required: ["document_id", "fields"],
    },
  },
  {
    name: "get_document",
    description:
      "Get a document's current values, its full field schema, and which required fields are still missing.",
    parameters: {
      type: "object",
      properties: { document_id: { type: "string" } },
      required: ["document_id"],
    },
  },
  {
    name: "finalize_document",
    description:
      "Mark a document complete and file it to the dashboard. Only succeeds when all required fields are present. The agent can then download the filled PDF.",
    parameters: {
      type: "object",
      properties: { document_id: { type: "string" } },
      required: ["document_id"],
    },
  },
  {
    name: "send_document",
    description:
      "Text the completed document as a secure download link. Use this when the agent says to send it somewhere — to a client/attorney/other agent (give their number), or to THEMSELVES (e.g. 'text it to me', 'send it to my phone') — in which case omit to_phone and it goes to the agent's own number.",
    parameters: {
      type: "object",
      properties: {
        document_id: { type: "string" },
        to_phone: {
          type: "string",
          description: "Recipient's phone number. Omit (or leave blank) to send to the agent themselves.",
        },
        recipient_name: { type: "string", description: "Optional recipient name for the message." },
      },
      required: ["document_id"],
    },
  },
  {
    name: "email_document",
    description:
      "Email the completed document as a PDF attachment. Use when the agent says to email it — to someone (give their email), or to THEMSELVES ('email it to me') in which case omit to_email and it goes to the agent's email on file. Required fields must be filled first.",
    parameters: {
      type: "object",
      properties: {
        document_id: { type: "string" },
        to_email: { type: "string", description: "Recipient email. Omit to email the agent themselves." },
        recipient_name: { type: "string", description: "Optional recipient name." },
      },
      required: ["document_id"],
    },
  },
  {
    name: "request_signature",
    description:
      "Send a document out for e-signature. The signer gets a secure link (by email and/or text) to review and sign; the executed copy comes back to the agent automatically. Use when the agent says things like 'send it to Bob for signature' or 'get this signed'. Requires the signer's email or mobile number.",
    parameters: {
      type: "object",
      properties: {
        document_id: { type: "string" },
        signer_name: { type: "string", description: "The signer's full name." },
        signer_email: { type: "string", description: "Signer's email (preferred)." },
        signer_phone: { type: "string", description: "Signer's mobile number (alternative)." },
      },
      required: ["document_id", "signer_name"],
    },
  },
  {
    name: "list_documents",
    description:
      "List the agent's recent documents (title, status, type) — use when they ask 'what did we file', want to reopen something, or reference an earlier document by name.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Optional name/title filter." } },
    },
  },
];

function fieldSchemaFor(type: DocType) {
  return userFields(type).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: Boolean(f.required),
    hint: f.hint,
    pairedWith: f.pairedWith,
  }));
}

function missingLabels(type: DocType, values: Record<string, string>) {
  const keys = missingRequired(type, values);
  const fields = userFields(type);
  return keys.map((k) => fields.find((f) => f.key === k)?.label ?? k);
}

interface DocSchema {
  validKeys: Set<string>;
  fields: { key: string; label: string; type: string; required: boolean; options?: string[]; pairedWith?: string[] }[];
  missing: (values: Record<string, string>) => string[];
  uploaded: boolean;
  /** Map a possibly-loose incoming key (e.g. "client_name") to the real field key. */
  resolveKey: (incoming: string) => string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function makeResolver(fields: { key: string; label: string }[]): (k: string) => string | null {
  const map = new Map<string, string>();
  for (const f of fields) {
    map.set(norm(f.key), f.key);
    if (f.label) map.set(norm(f.label), f.key);
  }
  return (incoming: string) => map.get(norm(incoming)) ?? null;
}

/** Field schema for a document — built-in template OR uploaded form template. */
async function docSchema(acc: string, doc: DocumentRecord): Promise<DocSchema> {
  if (doc.template_id) {
    const tpl = await getFormTemplate(acc, doc.template_id);
    const fields = (tpl?.fields ?? []).map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: false,
      options: f.options,
    }));
    return {
      validKeys: new Set(fields.map((f) => f.key)),
      fields,
      missing: () => [], // uploaded forms have no required-field metadata
      uploaded: true,
      resolveKey: makeResolver(fields),
    };
  }
  const type = doc.type as DocType;
  const fields = fieldSchemaFor(type);
  return {
    validKeys: new Set(userFields(type).filter((f) => !f.source).map((f) => f.key)),
    fields,
    missing: (values) => missingLabels(type, values),
    uploaded: false,
    resolveKey: makeResolver(fields),
  };
}

/**
 * Voice walkthrough cursor: tells the model exactly what to ask next so a
 * phone call moves through the ENTIRE form top-to-bottom — required and
 * optional lines alike — instead of jumping around or stopping after the
 * required handful. Skipped lines get "-" (the standard dash through an
 * unused blank), which also advances the cursor. A field whose pairedWith
 * companion is already set (e.g. the "is / is not contingent" pair) counts
 * as handled.
 */
function walkCursor(
  schema: DocSchema,
  values: Record<string, string>,
): { next_field: string | null; next_is_optional?: boolean; progress?: string; note?: string } {
  const filled = new Set(
    Object.entries(values)
      .filter(([, v]) => String(v ?? "").trim())
      .map(([k]) => k),
  );
  const remaining = schema.fields.filter(
    (f) => !filled.has(f.key) && !(f.pairedWith ?? []).some((p) => filled.has(p)),
  );
  const total = schema.fields.length;
  const done = total - remaining.length;
  if (!remaining.length) {
    return { next_field: null, note: "Every line is handled — recap the key details, get a yes, then finalize." };
  }
  const next = remaining[0];
  return {
    next_field: next.label,
    ...(next.required ? {} : { next_is_optional: true }),
    progress: `${done} of ${total} lines handled`,
  };
}

export interface ToolContext {
  accountId: string;
  actorId?: string; // who is acting (owner or assistant member id)
  actorPhone?: string; // the acting agent's own phone (caller/sender) — for "send it to me"
  /**
   * "voice" gets compact tool results: every token in a result is re-read by
   * the conversation LLM on EVERY later turn of the call, so big payloads make
   * the whole call slower. Web/SMS keep the full shapes.
   */
  channel?: "voice" | "sms" | "web";
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const acc = ctx.accountId;
  const voice = ctx.channel === "voice";
  switch (name) {
    case "get_agent_profile": {
      const profile = await getProfile(acc);
      return profile ?? { note: "No agent profile set yet. Ask the user to fill it in Settings." };
    }

    case "list_clients": {
      const clients = await listClients(acc);
      if (!voice) return clients;
      clients.sort((a, b) =>
        (b.last_seen_at ?? b.created_at).localeCompare(a.last_seen_at ?? a.created_at),
      );
      return {
        count: clients.length,
        clients: clients.slice(0, 25).map((c) => ({
          name: c.secondary_name ? `${c.full_name} & ${c.secondary_name}` : c.full_name,
          role: c.role,
        })),
        note: "Details for any of them via recall_client.",
      };
    }

    case "recall_client": {
      const dossier = await getClientDossier(acc, String(input.name || ""));
      if (!dossier) return { found: false, message: `No memory of "${input.name}" yet.` };
      const { client, deals, coParties } = dossier;
      return {
        found: true,
        name: client.full_name,
        secondary_name: client.secondary_name,
        role: client.role,
        email: client.email,
        phone: client.phone,
        preferences: client.preferences,
        notes: client.notes,
        co_parties: coParties,
        deals: (voice ? deals.slice(0, 5) : deals).map((d) => ({ type: d.type, property: d.property, status: d.status, date: d.date })),
      };
    }

    case "remember_about_client": {
      const c = await rememberAboutClient(acc, String(input.name || ""), String(input.note || ""));
      if (!c) return { ok: false, message: `No client named "${input.name}" found to attach that to.` };
      // Voice: don't echo the ever-growing preferences string back into the call context.
      return voice
        ? { ok: true, name: c.full_name, message: "Got it — I'll remember that." }
        : { ok: true, name: c.full_name, preferences: c.preferences, message: "Got it — I'll remember that." };
    }

    case "create_client": {
      const client = await createClient_(acc, {
        full_name: String(input.full_name),
        secondary_name: (input.secondary_name as string) ?? null,
        email: (input.email as string) ?? null,
        phone: (input.phone as string) ?? null,
        role: (input.role as "buyer" | "seller" | "both") ?? null,
        notes: (input.notes as string) ?? null,
      });
      return client;
    }

    case "create_document": {
      // Copy of an uploaded form template?
      const templateRef = (input.template_id as string) || (input.template_name as string);
      if (templateRef) {
        const tpl = input.template_id
          ? await getFormTemplate(acc, String(input.template_id))
          : await findFormTemplateByName(acc, String(input.template_name));
        if (!tpl) {
          return { error: `No uploaded form matching "${templateRef}". Use list_form_templates to see what's available.` };
        }
        const doc = await createDocument(acc, {
          type: "uploaded",
          template_id: tpl.id,
          title: (input.title as string) || `${tpl.name} (new)`,
          client_id: (input.client_id as string) ?? null,
          created_by: ctx.actorId ?? null,
        });
        // Build the schema from the template already in hand — no re-fetch.
        const fields = tpl.fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          required: false,
          options: f.options,
        }));
        if (voice) {
          const labels = fields.map((f) => f.label);
          return {
            document_id: doc.id,
            template: tpl.name,
            title: doc.title,
            total_fields: labels.length,
            ask_in_order: labels.slice(0, 40),
            start_with: labels[0] ?? null,
            note: "Walk the form top to bottom in this exact order, one field at a time. Set values with set_document_fields using these labels as keys; its result tells you the next field to ask.",
          };
        }
        return { document_id: doc.id, template: tpl.name, title: doc.title, fields, missing_required: [] };
      }

      const type = input.type as DocType;
      if (!DOC_TYPES.includes(type)) return { error: `Unknown document type: ${type}` };
      const tpl = getTemplate(type);
      let title = (input.title as string) || "";
      if (!title) {
        const client = input.client_id ? await getClient(acc, String(input.client_id)) : null;
        title = client ? `${tpl.shortName} — ${client.full_name}` : `${tpl.shortName} (new)`;
      }
      const doc = await createDocument(acc, {
        type,
        title,
        client_id: (input.client_id as string) ?? null,
        created_by: ctx.actorId ?? null,
      });
      if (voice) {
        // Labels only — the fuzzy key resolver accepts labels as keys, and the
        // voice model never needs machine keys/types/hints.
        const fields = userFields(type);
        const labels = fields.map((f) => f.label);
        return {
          document_id: doc.id,
          type,
          title: doc.title,
          ask_in_order: labels,
          required: fields.filter((f) => f.required).map((f) => f.label),
          start_with: labels[0] ?? null,
          note: "Walk the WHOLE document in this exact order, one line at a time — don't stop after the required ones. Set values with set_document_fields using these labels as keys; its result tells you the next line. Skipped line = set it to '-'.",
        };
      }
      return {
        document_id: doc.id,
        type,
        title: doc.title,
        fields: fieldSchemaFor(type),
        missing_required: missingLabels(type, doc.fields),
      };
    }

    case "list_form_templates": {
      const tpls = await listFormTemplates(acc);
      return tpls.map((t) => ({ id: t.id, name: t.name, field_count: t.fields.length }));
    }

    case "set_document_fields": {
      const docId = String(input.document_id);
      const doc = await getDocument(acc, docId);
      if (!doc) return { error: `Document ${docId} not found` };
      const schema = await docSchema(acc, doc);
      const incoming = (input.fields as Record<string, string>) ?? {};
      const accepted: Record<string, string> = {};
      const rejected: string[] = [];
      for (const [k, v] of Object.entries(incoming)) {
        const canonical = schema.validKeys.has(k) ? k : schema.resolveKey(k);
        if (canonical) accepted[canonical] = String(v);
        else rejected.push(k);
      }
      const updated = await updateDocument(acc, docId, { fields: accepted }, doc);
      // Voice: auto-learn AFTER the response — it's bookkeeping, and this tool
      // runs on nearly every turn of a call. Web/SMS run a multi-round tool
      // loop in ONE request, where a later recall_client in the same turn must
      // see the just-learned parties — keep it awaited there.
      if (voice) defer(() => rememberParties(acc, updated));
      else await rememberParties(acc, updated);
      return {
        document_id: docId,
        updated_fields: Object.keys(accepted),
        ...(rejected.length
          ? { rejected_unknown_keys: rejected, warning: "Those keys did NOT save — re-ask and set them with the field labels." }
          : {}),
        missing_required: schema.missing(updated.fields),
        ...(voice ? walkCursor(schema, updated.fields) : {}),
      };
    }

    case "get_document": {
      const docId = String(input.document_id);
      const doc = await getDocument(acc, docId);
      if (!doc) return { error: `Document ${docId} not found — use the id returned by create_document, or find it with list_documents.` };
      const schema = await docSchema(acc, doc);
      if (voice) {
        const byKey = new Map(schema.fields.map((f) => [f.key, f.label]));
        const filled: Record<string, string> = {};
        for (const [k, v] of Object.entries(doc.fields)) {
          if (String(v).trim()) filled[byKey.get(k) ?? k] = String(v);
        }
        return {
          document_id: doc.id,
          title: doc.title,
          status: doc.status,
          filled,
          missing_required: schema.missing(doc.fields),
          ...walkCursor(schema, doc.fields),
        };
      }
      return {
        document_id: doc.id,
        type: doc.type,
        title: doc.title,
        status: doc.status,
        values: doc.fields,
        fields: schema.fields,
        missing_required: schema.missing(doc.fields),
      };
    }

    case "finalize_document": {
      const docId = String(input.document_id);
      const doc = await getDocument(acc, docId);
      if (!doc) return { error: `Document ${docId} not found — use the id returned by create_document, or find it with list_documents.` };
      // Uploaded forms have no required-field metadata — skip the template fetch.
      const missing = !doc.template_id && isDocType(doc.type) ? missingLabels(doc.type, doc.fields) : [];
      if (missing.length) {
        return {
          ok: false,
          missing_required: missing,
          message: "Cannot finalize: required fields are still missing.",
        };
      }
      // Don't file a totally blank uploaded form.
      if (doc.template_id && Object.values(doc.fields).every((v) => !String(v).trim())) {
        return {
          ok: false,
          message: "Set at least one field on this form before filing it.",
        };
      }
      const updated = await updateDocument(acc, docId, { status: "completed" });
      if (voice) defer(() => rememberParties(acc, doc));
      else await rememberParties(acc, doc); // ensure parties + property are remembered
      await logActivity(acc, "document_filed", `Filed “${updated.title || "a document"}”.`, { actorId: ctx.actorId });
      return {
        ok: true,
        document_id: updated.id,
        status: updated.status,
        message: "Filed. It can be downloaded from the dashboard, texted, emailed, or sent for signature.",
      };
    }

    case "send_document": {
      const docId = String(input.document_id);
      const doc = await getDocument(acc, docId);
      if (!doc) return { error: `Document ${docId} not found — use the id returned by create_document, or find it with list_documents.` };
      const missing = !doc.template_id && isDocType(doc.type) ? missingLabels(doc.type, doc.fields) : [];
      if (missing.length) {
        return { ok: false, missing_required: missing, message: "Fill the required fields before sending." };
      }
      // "Send it to me" / no recipient → the caller's own number, falling back
      // to the phone on their profile. Never make the caller dictate the
      // number they're calling from.
      const explicitTo = normalizePhone(String(input.to_phone || ""));
      const profile = explicitTo ? null : await getProfile(acc);
      const to = explicitTo || ctx.actorPhone || normalizePhone(profile?.phone || "") || "";
      if (!to) {
        return {
          ok: false,
          message: "I don't have a mobile number on file for you — what's the best number to text it to?",
        };
      }
      const toSelf = !explicitTo;

      const docName = doc.template_id ? doc.title || "document" : getTemplate(doc.type as DocType).name;
      const link = `${SITE_URL}/api/share/${makeShareToken(docId)}`;
      const who = (input.recipient_name as string)?.trim();
      const body = `${who ? who + ", " : ""}here is your ${docName}: ${link}`;

      const sent = await sendSms(to, body);
      if (!sent.ok) {
        return { ok: false, message: `Could not send the text: ${sent.error}` };
      }

      // Carriers can silently drop texts from a number that hasn't finished
      // A2P registration — for self-sends, also email the link so the agent
      // always has a copy that arrives.
      let emailedToo = false;
      const selfEmail = toSelf ? (profile ?? (await getProfile(acc)))?.email || "" : "";
      if (toSelf && selfEmail && emailConfigured()) {
        emailedToo = true;
        defer(() =>
          sendEmail({
            to: selfEmail,
            subject: docName,
            html: `<p>Here’s your ${docName}: <a href="${link}">view &amp; download the PDF</a>.</p><p>— Pheme</p>`,
          }),
        );
      }

      await logActivity(acc, "document_sent", `Texted “${doc.title || "a document"}” to ${toSelf ? "the agent" : to}.`, { actorId: ctx.actorId });
      return {
        ok: true,
        to,
        link,
        message: toSelf
          ? emailedToo
            ? "Texted it to your phone and emailed you a copy."
            : "Texted it to your phone."
          : `Sent the link by text to ${to}.`,
      };
    }

    case "email_document": {
      const docId = String(input.document_id);
      const doc = await getDocument(acc, docId);
      if (!doc) return { error: `Document ${docId} not found — use the id returned by create_document, or find it with list_documents.` };
      const miss = !doc.template_id && isDocType(doc.type) ? missingLabels(doc.type, doc.fields) : [];
      if (miss.length) {
        return { ok: false, missing_required: miss, message: "Fill the required fields before sending." };
      }
      if (doc.template_id && Object.values(doc.fields).every((v) => !String(v).trim())) {
        return { ok: false, message: "Fill at least one field before sending." };
      }
      let to = String(input.to_email || "").trim();
      if (!to) to = (await getProfile(acc))?.email || ""; // "email it to me"
      if (!/.+@.+\..+/.test(to)) {
        return { ok: false, message: "What email address should I send it to?" };
      }
      const { bytes, filename } = await renderDocument(doc);
      const docName = doc.template_id ? doc.title || "your document" : getTemplate(doc.type as DocType).name;
      const link = `${SITE_URL}/api/share/${makeShareToken(docId)}`;
      const who = (input.recipient_name as string)?.trim();
      const sent = await sendEmail({
        to,
        subject: `${docName}${who ? ` for ${who}` : ""}`,
        html: `<p>${who ? `${who}, here` : "Here"}'s your ${docName}, attached as a PDF.</p><p>You can also <a href="${link}">view it online</a>.</p><p>— Pheme</p>`,
        attachment: { filename: `${filename}.pdf`, contentBase64: Buffer.from(bytes).toString("base64") },
      });
      if (!sent.ok) {
        return sent.configured
          ? { ok: false, message: `Couldn't email it: ${sent.error}` }
          : { ok: false, message: "Email isn't set up yet on this account — I can text you the link instead." };
      }
      await logActivity(acc, "document_emailed", `Emailed “${doc.title || "a document"}” to ${to}.`, { actorId: ctx.actorId });
      return { ok: true, to, message: `Emailed it to ${to}.` };
    }

    case "request_signature": {
      // requestSignature fetches and validates the document itself — no pre-fetch.
      const rs = await requestSignature(acc, {
        documentId: String(input.document_id),
        signerName: String(input.signer_name || ""),
        signerEmail: (input.signer_email as string) || null,
        signerPhone: (input.signer_phone as string) || null,
        actorId: ctx.actorId ?? null,
      });
      return rs;
    }

    case "list_documents": {
      const docs = await listDocuments(acc);
      const q = String(input.query || "").toLowerCase().trim();
      const filtered = q ? docs.filter((d) => (d.title || "").toLowerCase().includes(q)) : docs;
      return filtered.slice(0, voice ? 8 : 12).map((d) => ({
        document_id: d.id,
        title: d.title,
        status: d.status,
        type: d.type === "uploaded" ? "uploaded form" : d.type,
        updated_at: voice ? d.updated_at.slice(0, 10) : d.updated_at,
      }));
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
