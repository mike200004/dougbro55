import { admin } from "@/lib/supabase/admin";
import type {
  AgentProfile,
  Client,
  DocumentRecord,
  DocumentType,
  DocType,
  FormTemplate,
  FormTemplateField,
  SignatureRequest,
} from "@/lib/types";

/**
 * All data access, scoped by account (the auth user id). Uses the service-role
 * client and filters explicitly by account_id; RLS is a backstop.
 */

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Accounts / profiles
// ---------------------------------------------------------------------------

export const EMPTY_PROFILE: AgentProfile = {
  broker_agency_name: "",
  agent_name: "",
  license_number: "",
  street: "",
  city_state_zip: "",
  email: "",
  phone: "",
};

const PROFILE_COLS =
  "broker_agency_name, agent_name, license_number, street, city_state_zip, email, phone";

export async function getProfile(accountId: string): Promise<AgentProfile | null> {
  const { data } = await admin()
    .from("profiles")
    .select(PROFILE_COLS)
    .eq("id", accountId)
    .maybeSingle();
  return (data as AgentProfile) ?? null;
}

export async function saveProfile(
  accountId: string,
  profile: AgentProfile,
): Promise<AgentProfile> {
  const { data, error } = await admin()
    .from("profiles")
    .update(profile)
    .eq("id", accountId)
    .select(PROFILE_COLS)
    .single();
  if (error) throw new Error(error.message);
  return data as AgentProfile;
}

// ---------------------------------------------------------------------------
// Members (owner + assistants)
// ---------------------------------------------------------------------------

export interface Member {
  id: string;
  account_id: string;
  role: "owner" | "assistant";
  name: string;
  phone: string | null;
  email: string | null;
  status: "active" | "invited";
  created_at: string;
}

export interface ResolvedActor {
  accountId: string;
  memberId: string;
  name: string;
  role: "owner" | "assistant";
}

/** Resolve the account + actor for a logged-in user. */
export async function getMember(userId: string): Promise<ResolvedActor | null> {
  const { data } = await admin()
    .from("account_members")
    .select("account_id, name, role")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return { accountId: data.account_id, memberId: userId, name: data.name, role: data.role };
}

/** Resolve the account + actor from a caller's phone (E.164) — owner or assistant. */
export async function getAccountByPhone(phone: string): Promise<ResolvedActor | null> {
  if (!phone) return null;
  const { data } = await admin()
    .from("account_members")
    .select("id, account_id, name, role")
    .eq("phone", phone)
    .maybeSingle();
  if (!data) return null;
  return { accountId: data.account_id, memberId: data.id, name: data.name, role: data.role };
}

export async function listMembers(accountId: string): Promise<Member[]> {
  const { data } = await admin()
    .from("account_members")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: true });
  return (data as Member[]) ?? [];
}

export async function insertMember(m: {
  id: string;
  account_id: string;
  role: "owner" | "assistant";
  name: string;
  phone: string | null;
  email: string | null;
  status: "active" | "invited";
}): Promise<void> {
  const { error } = await admin().from("account_members").insert(m);
  if (error) throw new Error(error.message);
}

export async function setMemberStatus(memberId: string, status: "active" | "invited"): Promise<void> {
  await admin().from("account_members").update({ status }).eq("id", memberId);
}

/** Remove an assistant from an account (owner-scoped; never the owner). */
export async function removeMember(accountId: string, memberId: string): Promise<void> {
  await admin()
    .from("account_members")
    .delete()
    .eq("account_id", accountId)
    .eq("id", memberId)
    .eq("role", "assistant");
}

/** Map member id -> display name for an account (for attribution display). */
export async function memberNames(accountId: string): Promise<Record<string, string>> {
  const members = await listMembers(accountId);
  return Object.fromEntries(members.map((m) => [m.id, m.name]));
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function listClients(accountId: string): Promise<Client[]> {
  const { data } = await admin()
    .from("clients")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  return (data as Client[]) ?? [];
}

export async function getClient(
  accountId: string,
  clientId: string,
): Promise<Client | null> {
  const { data } = await admin()
    .from("clients")
    .select("*")
    .eq("account_id", accountId)
    .eq("id", clientId)
    .maybeSingle();
  return (data as Client) ?? null;
}

export async function createClient_(
  accountId: string,
  input: Omit<Client, "id" | "created_at" | "preferences" | "last_seen_at"> & {
    preferences?: string | null;
    last_seen_at?: string | null;
  },
): Promise<Client> {
  const { data, error } = await admin()
    .from("clients")
    .insert({ ...input, account_id: accountId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Client;
}

export async function updateClient(
  accountId: string,
  clientId: string,
  patch: Partial<Pick<Client, "full_name" | "secondary_name" | "email" | "phone" | "role" | "notes" | "preferences">>,
): Promise<void> {
  await admin().from("clients").update(patch).eq("account_id", accountId).eq("id", clientId);
}

export async function deleteClient(accountId: string, clientId: string): Promise<void> {
  await admin().from("clients").delete().eq("account_id", accountId).eq("id", clientId);
}

// ---------------------------------------------------------------------------
// Client memory: auto-learn, recall, and the priming digest
// ---------------------------------------------------------------------------

function normName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Field keys differ by template: dual_agency/purchase use buyerName/sellerName/
// propertyAddress; buyer_rep uses buyerNames/propertyDescription (no seller).
function docBuyer(f?: Record<string, string> | null): string {
  return f?.buyerName || f?.buyerNames || "";
}
function docSeller(f?: Record<string, string> | null): string {
  return f?.sellerName || "";
}
function docProperty(f?: Record<string, string> | null): string {
  return f?.propertyAddress || f?.propertyDescription || "";
}

/** True if `needle` (e.g. "the Johnsons" / "Johnson") refers to `name`. */
function nameMatches(name: string | null | undefined, needle: string): boolean {
  const a = normName(name);
  const b = normName(needle).replace(/^the\s+/, "");
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  // token overlap (surname match): "robert johnson" vs "the johnsons"
  const at = new Set(a.split(" "));
  return b.split(" ").some((t) => t.length > 2 && (at.has(t) || at.has(t.replace(/s$/, ""))));
}

async function patchClient(
  accountId: string,
  clientId: string,
  patch: Partial<Client>,
): Promise<void> {
  await admin().from("clients").update(patch).eq("account_id", accountId).eq("id", clientId);
}

/** Insert or update a client by name; merges role and bumps last_seen_at. */
export async function upsertClientByName(
  accountId: string,
  input: { name: string; role?: "buyer" | "seller"; secondary?: string | null },
): Promise<Client | null> {
  const name = input.name?.trim();
  if (!name) return null;
  const clients = await listClients(accountId);
  const target = normName(name);
  const tokens = (s: string) => s.split(/[\s,]+/).filter(Boolean);
  const targetToks = tokens(target);

  // Exact match, else "same party" via token-subset (handles a buyer string
  // growing across calls: "Robert Johnson" -> "Robert Johnson, Mary Johnson").
  let existing = clients.find((c) => normName(c.full_name) === target);
  if (!existing) {
    existing = clients.find((c) => {
      const ct = tokens(normName(c.full_name));
      if (!ct.length) return false;
      const roleOk = !c.role || !input.role || c.role === input.role || c.role === "both";
      const subset = ct.every((t) => targetToks.includes(t)) || targetToks.every((t) => ct.includes(t));
      return roleOk && subset;
    });
  }
  if (existing) {
    const patch: Partial<Client> = { last_seen_at: nowIso() };
    // Keep the longer / more complete name.
    if (target.length > normName(existing.full_name).length) patch.full_name = name;
    if (input.role && existing.role && existing.role !== input.role && existing.role !== "both") {
      patch.role = "both";
    } else if (input.role && !existing.role) {
      patch.role = input.role;
    }
    if (input.secondary && !existing.secondary_name) patch.secondary_name = input.secondary;
    await patchClient(accountId, existing.id, patch);
    return { ...existing, ...patch };
  }
  return await createClient_(accountId, {
    full_name: name,
    secondary_name: input.secondary ?? null,
    email: null,
    phone: null,
    role: input.role ?? null,
    notes: null,
    last_seen_at: nowIso(),
  });
}

function surnameStem(name: string): string {
  const toks = normName(name).split(/[\s,]+/).filter(Boolean);
  return (toks[toks.length - 1] || "").replace(/s$/, "");
}

function roleCompatible(a: Client["role"], b: Client["role"]): boolean {
  return !a || !b || a === b || a === "both" || b === "both";
}

/**
 * Fold same-surname, same-role duplicates into `keep` (e.g. a preferences-only
 * record the assistant created via remember_about_client before the party was
 * on a document). Merges preferences/notes and deletes the extras.
 */
async function consolidate(accountId: string, keep: Client): Promise<Client> {
  const stem = surnameStem(keep.full_name);
  if (!stem) return keep;
  const dups = (await listClients(accountId)).filter(
    (c) => c.id !== keep.id && surnameStem(c.full_name) === stem && roleCompatible(c.role, keep.role),
  );
  if (!dups.length) return keep;
  const merged: Partial<Client> = {};
  const prefs = [keep.preferences, ...dups.map((d) => d.preferences)].filter(Boolean).join("; ");
  const notes = [keep.notes, ...dups.map((d) => d.notes)].filter(Boolean).join("; ");
  if (prefs) merged.preferences = prefs;
  if (notes) merged.notes = notes;
  for (const d of dups) {
    if (d.full_name.length > (merged.full_name ?? keep.full_name).length) merged.full_name = d.full_name;
    if (!keep.secondary_name && d.secondary_name) merged.secondary_name = d.secondary_name;
    if (!keep.email && d.email) merged.email = d.email;
    if (!keep.phone && d.phone) merged.phone = d.phone;
    if (d.role && d.role !== keep.role) merged.role = keep.role ? "both" : d.role;
  }
  await patchClient(accountId, keep.id, merged);
  await admin().from("clients").delete().eq("account_id", accountId).in("id", dups.map((d) => d.id));
  return { ...keep, ...merged };
}

/** Auto-learn the parties + property from a document's fields. */
export async function rememberParties(accountId: string, doc: DocumentRecord): Promise<void> {
  const f = doc.fields || {};
  const buyer = docBuyer(f);
  const seller = docSeller(f);
  let primary: Client | null = null;
  if (buyer) {
    const b = await upsertClientByName(accountId, { name: buyer, role: "buyer" });
    if (b) primary = await consolidate(accountId, b);
  }
  if (seller) {
    const s = await upsertClientByName(accountId, { name: seller, role: "seller" });
    if (s) {
      const c = await consolidate(accountId, s);
      if (!primary) primary = c;
    }
  }
  // Link the document to the primary party if it isn't linked yet.
  if (primary && !doc.client_id) {
    await admin().from("documents").update({ client_id: primary.id }).eq("account_id", accountId).eq("id", doc.id);
  }
}

export interface Deal {
  type: DocumentType;
  property: string;
  status: string;
  date: string;
}

export interface Dossier {
  client: Client;
  deals: Deal[];
  coParties: string[];
}

/** Everything we remember about a person, found by fuzzy name. */
export async function getClientDossier(accountId: string, name: string): Promise<Dossier | null> {
  const clients = await listClients(accountId);
  const matches = clients.filter(
    (c) => nameMatches(c.full_name, name) || nameMatches(c.secondary_name, name),
  );
  if (!matches.length) return null;
  matches.sort((a, b) => (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? ""));
  const client = matches[0];

  const docs = await listDocuments(accountId);
  const theirs = docs.filter(
    (d) =>
      d.client_id === client.id ||
      nameMatches(docBuyer(d.fields), client.full_name) ||
      nameMatches(docSeller(d.fields), client.full_name),
  );
  const deals: Deal[] = theirs.map((d) => ({
    type: d.type,
    property: docProperty(d.fields),
    status: d.status,
    date: d.created_at,
  }));
  const coParties = Array.from(
    new Set(
      theirs.flatMap((d) =>
        [docBuyer(d.fields), docSeller(d.fields)].filter(
          (n): n is string => !!n && !nameMatches(n, client.full_name),
        ),
      ),
    ),
  );
  return { client, deals, coParties };
}

/** Append a freeform fact to a client's preferences memory (found by name). */
export async function rememberAboutClient(
  accountId: string,
  name: string,
  note: string,
): Promise<Client | null> {
  const clients = await listClients(accountId);
  const client =
    clients.find((c) => normName(c.full_name) === normName(name)) ||
    clients.find((c) => nameMatches(c.full_name, name) || nameMatches(c.secondary_name, name));
  // Create-if-missing: the assistant may say "remember that…" before the person
  // is on a document. Store it now; rememberParties/consolidate will fold it in.
  if (!client) {
    return await createClient_(accountId, {
      full_name: name.trim(),
      secondary_name: null,
      email: null,
      phone: null,
      role: null,
      notes: null,
      preferences: note.trim(),
      last_seen_at: nowIso(),
    });
  }
  const prefs = [client.preferences, note.trim()].filter(Boolean).join("; ");
  await patchClient(accountId, client.id, { preferences: prefs, last_seen_at: nowIso() });
  return { ...client, preferences: prefs };
}

/** Compact "people you know" digest to prime the assistant before the agent speaks. */
export async function buildMemoryDigest(accountId: string, limit = 12): Promise<string> {
  const clients = await listClients(accountId);
  if (!clients.length) return "";
  clients.sort((a, b) =>
    (b.last_seen_at ?? b.created_at).localeCompare(a.last_seen_at ?? a.created_at),
  );
  const docs = await listDocuments(accountId);
  const lines = clients.slice(0, limit).map((c) => {
    const lastDoc = docs.find(
      (d) =>
        d.client_id === c.id ||
        nameMatches(docBuyer(d.fields), c.full_name) ||
        nameMatches(docSeller(d.fields), c.full_name),
    );
    const property = lastDoc ? docProperty(lastDoc.fields) : "";
    const name = c.secondary_name ? `${c.full_name} & ${c.secondary_name}` : c.full_name;
    const bits = [c.role, property, c.preferences].filter(Boolean).join(", ");
    return `- ${name}${bits ? ` — ${bits}` : ""}`;
  });
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function listDocuments(
  accountId: string,
  opts?: { includeArchived?: boolean },
): Promise<DocumentRecord[]> {
  let q = admin()
    .from("documents")
    .select("*")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false });
  if (!opts?.includeArchived) q = q.eq("archived", false);
  const { data } = await q;
  return (data as DocumentRecord[]) ?? [];
}

export async function setDocumentArchived(
  accountId: string,
  docId: string,
  archived: boolean,
): Promise<void> {
  await admin()
    .from("documents")
    .update({ archived, updated_at: nowIso() })
    .eq("account_id", accountId)
    .eq("id", docId);
}

export async function deleteDocument(accountId: string, docId: string): Promise<void> {
  await admin().from("documents").delete().eq("account_id", accountId).eq("id", docId);
}

/** Start a fresh draft from an existing document (same type/template, same fields). */
export async function duplicateDocument(
  accountId: string,
  docId: string,
  createdBy?: string | null,
): Promise<DocumentRecord | null> {
  const doc = await getDocument(accountId, docId);
  if (!doc) return null;
  return await createDocument(accountId, {
    type: doc.type,
    template_id: doc.template_id,
    title: `${doc.title || "Document"} (copy)`,
    client_id: doc.client_id,
    fields: { ...doc.fields },
    created_by: createdBy ?? null,
  });
}

export async function getDocument(
  accountId: string,
  docId: string,
): Promise<DocumentRecord | null> {
  const { data } = await admin()
    .from("documents")
    .select("*")
    .eq("account_id", accountId)
    .eq("id", docId)
    .maybeSingle();
  return (data as DocumentRecord) ?? null;
}

/**
 * The most recent still-open draft for an account (within `withinMinutes`).
 * Lets a conversation continue a document across turns instead of orphaning it,
 * since tool-created document ids aren't carried in the text transcript.
 */
export async function latestDraft(
  accountId: string,
  withinMinutes = 180,
): Promise<DocumentRecord | null> {
  const { data } = await admin()
    .from("documents")
    .select("*")
    .eq("account_id", accountId)
    .eq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const ageMin = (Date.now() - new Date((data as DocumentRecord).updated_at).getTime()) / 60000;
  return ageMin <= withinMinutes ? (data as DocumentRecord) : null;
}

// ---------------------------------------------------------------------------
// Uploaded form templates (reusable)
// ---------------------------------------------------------------------------

export async function createFormTemplate(
  accountId: string,
  input: {
    name: string;
    kind: "acroform" | "overlay";
    storage_path: string;
    fields: FormTemplateField[];
    created_by?: string | null;
  },
): Promise<FormTemplate> {
  const { data, error } = await admin()
    .from("form_templates")
    .insert({
      account_id: accountId,
      name: input.name,
      kind: input.kind,
      storage_path: input.storage_path,
      fields: input.fields,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as FormTemplate;
}

export async function listFormTemplates(accountId: string): Promise<FormTemplate[]> {
  const { data } = await admin()
    .from("form_templates")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  return (data as FormTemplate[]) ?? [];
}

export async function getFormTemplate(
  accountId: string,
  templateId: string,
): Promise<FormTemplate | null> {
  const { data } = await admin()
    .from("form_templates")
    .select("*")
    .eq("account_id", accountId)
    .eq("id", templateId)
    .maybeSingle();
  return (data as FormTemplate) ?? null;
}

export async function renameFormTemplate(
  accountId: string,
  templateId: string,
  name: string,
): Promise<void> {
  await admin().from("form_templates").update({ name }).eq("account_id", accountId).eq("id", templateId);
}

export async function deleteFormTemplate(accountId: string, templateId: string): Promise<void> {
  const tpl = await getFormTemplate(accountId, templateId);
  if (!tpl) return;
  await admin().from("form_templates").delete().eq("account_id", accountId).eq("id", templateId);
  await admin().storage.from("form-templates").remove([tpl.storage_path]);
}

/** Find a template by fuzzy name (for "start a copy of …" over voice/SMS). */
export async function findFormTemplateByName(
  accountId: string,
  name: string,
): Promise<FormTemplate | null> {
  const all = await listFormTemplates(accountId);
  const n = normName(name);
  return (
    all.find((t) => normName(t.name) === n) ||
    all.find((t) => normName(t.name).includes(n) || n.includes(normName(t.name))) ||
    null
  );
}

/** Fetch a document by id without account scoping (for token-authorized share links). */
export async function getDocumentById(docId: string): Promise<DocumentRecord | null> {
  const { data } = await admin().from("documents").select("*").eq("id", docId).maybeSingle();
  return (data as DocumentRecord) ?? null;
}

export async function createDocument(
  accountId: string,
  input: {
    type: DocumentType;
    title: string;
    client_id?: string | null;
    fields?: Record<string, string>;
    created_by?: string | null;
    template_id?: string | null;
  },
): Promise<DocumentRecord> {
  const { data, error } = await admin()
    .from("documents")
    .insert({
      account_id: accountId,
      type: input.type,
      title: input.title,
      client_id: input.client_id ?? null,
      status: "draft",
      fields: input.fields ?? {},
      created_by: input.created_by ?? null,
      template_id: input.template_id ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as DocumentRecord;
}

export async function updateDocument(
  accountId: string,
  docId: string,
  patch: Partial<Pick<DocumentRecord, "fields" | "status" | "title" | "client_id">>,
): Promise<DocumentRecord> {
  // Merge fields with existing values so partial updates accumulate.
  let nextFields = patch.fields;
  if (patch.fields) {
    const current = await getDocument(accountId, docId);
    nextFields = { ...(current?.fields ?? {}), ...patch.fields };
  }
  const { data, error } = await admin()
    .from("documents")
    .update({ ...patch, ...(nextFields ? { fields: nextFields } : {}), updated_at: nowIso() })
    .eq("account_id", accountId)
    .eq("id", docId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as DocumentRecord;
}

// ---------------------------------------------------------------------------
// Signature requests
// ---------------------------------------------------------------------------

export async function createSignatureRequest(
  accountId: string,
  input: {
    document_id: string;
    signer_name: string;
    signer_email?: string | null;
    signer_phone?: string | null;
    created_by?: string | null;
  },
): Promise<SignatureRequest> {
  const { data, error } = await admin()
    .from("signature_requests")
    .insert({
      account_id: accountId,
      document_id: input.document_id,
      signer_name: input.signer_name,
      signer_email: input.signer_email ?? null,
      signer_phone: input.signer_phone ?? null,
      created_by: input.created_by ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SignatureRequest;
}

/** Unscoped fetch — the signing page authorizes by HMAC token, not session. */
export async function getSignatureRequestById(id: string): Promise<SignatureRequest | null> {
  const { data } = await admin().from("signature_requests").select("*").eq("id", id).maybeSingle();
  return (data as SignatureRequest) ?? null;
}

export async function updateSignatureRequest(
  id: string,
  patch: Partial<Pick<SignatureRequest, "status" | "signed_path" | "audit" | "signed_at" | "signer_name">>,
): Promise<void> {
  await admin().from("signature_requests").update(patch).eq("id", id);
}

export async function listSignatureRequests(
  accountId: string,
  documentId?: string,
): Promise<SignatureRequest[]> {
  let q = admin()
    .from("signature_requests")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (documentId) q = q.eq("document_id", documentId);
  const { data } = await q;
  return (data as SignatureRequest[]) ?? [];
}

/** Latest completed signature for a document, if any (signed PDFs chain). */
export async function latestSignedRequest(documentId: string): Promise<SignatureRequest | null> {
  const { data } = await admin()
    .from("signature_requests")
    .select("*")
    .eq("document_id", documentId)
    .eq("status", "signed")
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SignatureRequest) ?? null;
}

// ---------------------------------------------------------------------------
// SMS sessions (per-phone conversation memory)
// ---------------------------------------------------------------------------

export interface SmsTurn {
  role: "user" | "assistant";
  content: string;
}

export async function getSmsSession(phone: string): Promise<SmsTurn[]> {
  const { data } = await admin()
    .from("sms_sessions")
    .select("transcript")
    .eq("phone", phone)
    .maybeSingle();
  return ((data?.transcript as SmsTurn[]) ?? []) as SmsTurn[];
}

export async function saveSmsSession(
  phone: string,
  accountId: string,
  transcript: SmsTurn[],
): Promise<void> {
  await admin()
    .from("sms_sessions")
    .upsert({ phone, account_id: accountId, transcript, updated_at: nowIso() });
}
