import { admin } from "@/lib/supabase/admin";
import type { AgentProfile, Client, DocumentRecord, DocType } from "@/lib/types";

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

// ---------------------------------------------------------------------------
// Client memory: auto-learn, recall, and the priming digest
// ---------------------------------------------------------------------------

function normName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
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
  const existing = (await listClients(accountId)).find(
    (c) => normName(c.full_name) === normName(name),
  );
  if (existing) {
    const patch: Partial<Client> = { last_seen_at: nowIso() };
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

/** Auto-learn the parties + property from a document's fields. */
export async function rememberParties(accountId: string, doc: DocumentRecord): Promise<void> {
  const f = doc.fields || {};
  let primary: Client | null = null;
  if (f.buyerName) primary = (await upsertClientByName(accountId, { name: f.buyerName, role: "buyer" })) ?? primary;
  if (f.sellerName) {
    const seller = await upsertClientByName(accountId, { name: f.sellerName, role: "seller" });
    if (!primary) primary = seller;
  }
  // Link the document to the primary party if it isn't linked yet.
  if (primary && !doc.client_id) {
    await admin().from("documents").update({ client_id: primary.id }).eq("account_id", accountId).eq("id", doc.id);
  }
}

export interface Deal {
  type: DocType;
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
      nameMatches(d.fields?.buyerName, client.full_name) ||
      nameMatches(d.fields?.sellerName, client.full_name),
  );
  const deals: Deal[] = theirs.map((d) => ({
    type: d.type,
    property: d.fields?.propertyAddress || "",
    status: d.status,
    date: d.created_at,
  }));
  const coParties = Array.from(
    new Set(
      theirs.flatMap((d) =>
        [d.fields?.buyerName, d.fields?.sellerName].filter(
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
  if (!client) return null;
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
        nameMatches(d.fields?.buyerName, c.full_name) ||
        nameMatches(d.fields?.sellerName, c.full_name),
    );
    const property = lastDoc?.fields?.propertyAddress;
    const name = c.secondary_name ? `${c.full_name} & ${c.secondary_name}` : c.full_name;
    const bits = [c.role, property, c.preferences].filter(Boolean).join(", ");
    return `- ${name}${bits ? ` — ${bits}` : ""}`;
  });
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function listDocuments(accountId: string): Promise<DocumentRecord[]> {
  const { data } = await admin()
    .from("documents")
    .select("*")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false });
  return (data as DocumentRecord[]) ?? [];
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

/** Fetch a document by id without account scoping (for token-authorized share links). */
export async function getDocumentById(docId: string): Promise<DocumentRecord | null> {
  const { data } = await admin().from("documents").select("*").eq("id", docId).maybeSingle();
  return (data as DocumentRecord) ?? null;
}

export async function createDocument(
  accountId: string,
  input: {
    type: DocType;
    title: string;
    client_id?: string | null;
    fields?: Record<string, string>;
    created_by?: string | null;
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
