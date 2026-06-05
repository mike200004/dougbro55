import {
  createClient_,
  createDocument,
  getClient,
  getDocument,
  getProfile,
  listClients,
  updateDocument,
} from "@/lib/db";
import { getTemplate, missingRequired, userFields } from "@/lib/templates";
import type { DocType } from "@/lib/types";

const DOC_TYPES: DocType[] = ["buyer_rep", "purchase", "dual_agency"];

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
    name: "create_document",
    description:
      "Start a new document of the given type. Returns the document id, the fields you need to collect (with labels and which are required), and which required fields are still missing. Optionally link a client.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: DOC_TYPES,
          description:
            "buyer_rep = Exclusive Right to Represent Buyer; purchase = Purchase Agreement; dual_agency = Dual Agency Consent.",
        },
        client_id: { type: "string", description: "Optional client to associate." },
        title: { type: "string", description: "Optional title; one is generated if omitted." },
      },
      required: ["type"],
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
];

function fieldSchemaFor(type: DocType) {
  return userFields(type).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.type,
    required: Boolean(f.required),
    hint: f.hint,
  }));
}

function missingLabels(type: DocType, values: Record<string, string>) {
  const keys = missingRequired(type, values);
  const fields = userFields(type);
  return keys.map((k) => fields.find((f) => f.key === k)?.label ?? k);
}

export interface ToolContext {
  accountId: string;
}

export async function runTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  const acc = ctx.accountId;
  switch (name) {
    case "get_agent_profile": {
      const profile = await getProfile(acc);
      return profile ?? { note: "No agent profile set yet. Ask the user to fill it in Settings." };
    }

    case "list_clients":
      return await listClients(acc);

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
      });
      return {
        document_id: doc.id,
        type,
        title: doc.title,
        fields: fieldSchemaFor(type),
        missing_required: missingLabels(type, doc.fields),
      };
    }

    case "set_document_fields": {
      const docId = String(input.document_id);
      const doc = await getDocument(acc, docId);
      if (!doc) return { error: `Document ${docId} not found` };
      const tpl = getTemplate(doc.type);
      const valid = new Set(tpl.fields.filter((f) => !f.source).map((f) => f.key));
      const incoming = (input.fields as Record<string, string>) ?? {};
      const accepted: Record<string, string> = {};
      const rejected: string[] = [];
      for (const [k, v] of Object.entries(incoming)) {
        if (valid.has(k)) accepted[k] = String(v);
        else rejected.push(k);
      }
      const updated = await updateDocument(acc, docId, { fields: accepted });
      return {
        document_id: docId,
        updated_fields: Object.keys(accepted),
        rejected_unknown_keys: rejected,
        missing_required: missingLabels(doc.type, updated.fields),
      };
    }

    case "get_document": {
      const docId = String(input.document_id);
      const doc = await getDocument(acc, docId);
      if (!doc) return { error: `Document ${docId} not found` };
      return {
        document_id: doc.id,
        type: doc.type,
        title: doc.title,
        status: doc.status,
        values: doc.fields,
        fields: fieldSchemaFor(doc.type),
        missing_required: missingLabels(doc.type, doc.fields),
      };
    }

    case "finalize_document": {
      const docId = String(input.document_id);
      const doc = await getDocument(acc, docId);
      if (!doc) return { error: `Document ${docId} not found` };
      const missing = missingLabels(doc.type, doc.fields);
      if (missing.length) {
        return {
          ok: false,
          missing_required: missing,
          message: "Cannot finalize: required fields are still missing.",
        };
      }
      const updated = await updateDocument(acc, docId, { status: "completed" });
      return {
        ok: true,
        document_id: updated.id,
        status: updated.status,
        message: "Document filed to the dashboard. The agent can download the filled PDF.",
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
