import { promises as fs } from "fs";
import path from "path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { AgentProfile, Client, DocumentRecord, DocType } from "@/lib/types";

/**
 * Storage abstraction. Uses Supabase when SUPABASE env vars are present;
 * otherwise falls back to a local JSON file so the app runs end-to-end in dev
 * (and before the Supabase project is provisioned). Same shape either way.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const usingSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

let _sb: SupabaseClient | null = null;
function sb(): SupabaseClient {
  if (!_sb) _sb = createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: false } });
  return _sb;
}

// ---------------------------------------------------------------------------
// Local JSON fallback
// ---------------------------------------------------------------------------

const DATA_FILE = path.join(process.cwd(), ".data", "store.json");

interface LocalStore {
  profile: AgentProfile | null;
  clients: Client[];
  documents: DocumentRecord[];
  sms_sessions: Record<string, SmsTurn[]>;
}

const EMPTY: LocalStore = {
  profile: null,
  clients: [],
  documents: [],
  sms_sessions: {},
};

async function readLocal(): Promise<LocalStore> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

async function writeLocal(store: LocalStore): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(store, null, 2));
}

// Deterministic-ish id without Math.random in hot paths; fine for local dev.
let _counter = 0;
function id(): string {
  _counter += 1;
  return `${Date.now().toString(36)}-${_counter.toString(36)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Agent profile
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

export async function getProfile(): Promise<AgentProfile | null> {
  if (usingSupabase) {
    const { data } = await sb().from("agent_profile").select("*").limit(1).maybeSingle();
    return (data as AgentProfile) ?? null;
  }
  return (await readLocal()).profile;
}

export async function saveProfile(profile: AgentProfile): Promise<AgentProfile> {
  if (usingSupabase) {
    const { data, error } = await sb()
      .from("agent_profile")
      .upsert({ id: 1, ...profile })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as AgentProfile;
  }
  const store = await readLocal();
  store.profile = profile;
  await writeLocal(store);
  return profile;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function listClients(): Promise<Client[]> {
  if (usingSupabase) {
    const { data } = await sb().from("clients").select("*").order("created_at", { ascending: false });
    return (data as Client[]) ?? [];
  }
  return (await readLocal()).clients;
}

export async function getClient(clientId: string): Promise<Client | null> {
  if (usingSupabase) {
    const { data } = await sb().from("clients").select("*").eq("id", clientId).maybeSingle();
    return (data as Client) ?? null;
  }
  return (await readLocal()).clients.find((c) => c.id === clientId) ?? null;
}

export async function createClient_(
  input: Omit<Client, "id" | "created_at">,
): Promise<Client> {
  if (usingSupabase) {
    const { data, error } = await sb().from("clients").insert(input).select().single();
    if (error) throw new Error(error.message);
    return data as Client;
  }
  const store = await readLocal();
  const client: Client = { id: id(), created_at: nowIso(), ...input };
  store.clients.unshift(client);
  await writeLocal(store);
  return client;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function listDocuments(): Promise<DocumentRecord[]> {
  if (usingSupabase) {
    const { data } = await sb().from("documents").select("*").order("updated_at", { ascending: false });
    return (data as DocumentRecord[]) ?? [];
  }
  return (await readLocal()).documents;
}

export async function getDocument(docId: string): Promise<DocumentRecord | null> {
  if (usingSupabase) {
    const { data } = await sb().from("documents").select("*").eq("id", docId).maybeSingle();
    return (data as DocumentRecord) ?? null;
  }
  return (await readLocal()).documents.find((d) => d.id === docId) ?? null;
}

export async function createDocument(input: {
  type: DocType;
  title: string;
  client_id?: string | null;
  fields?: Record<string, string>;
}): Promise<DocumentRecord> {
  const base = {
    type: input.type,
    title: input.title,
    client_id: input.client_id ?? null,
    status: "draft" as const,
    fields: input.fields ?? {},
  };
  if (usingSupabase) {
    const { data, error } = await sb().from("documents").insert(base).select().single();
    if (error) throw new Error(error.message);
    return data as DocumentRecord;
  }
  const store = await readLocal();
  const ts = nowIso();
  const doc: DocumentRecord = { id: id(), created_at: ts, updated_at: ts, ...base };
  store.documents.unshift(doc);
  await writeLocal(store);
  return doc;
}

// ---------------------------------------------------------------------------
// SMS sessions (per-phone conversation memory for Twilio)
// ---------------------------------------------------------------------------

export interface SmsTurn {
  role: "user" | "assistant";
  content: string;
}

export async function getSmsSession(phone: string): Promise<SmsTurn[]> {
  if (usingSupabase) {
    const { data } = await sb()
      .from("sms_sessions")
      .select("transcript")
      .eq("phone", phone)
      .maybeSingle();
    return ((data?.transcript as SmsTurn[]) ?? []) as SmsTurn[];
  }
  return (await readLocal()).sms_sessions[phone] ?? [];
}

export async function saveSmsSession(
  phone: string,
  transcript: SmsTurn[],
): Promise<void> {
  if (usingSupabase) {
    await sb()
      .from("sms_sessions")
      .upsert({ phone, transcript, updated_at: nowIso() });
    return;
  }
  const store = await readLocal();
  store.sms_sessions[phone] = transcript;
  await writeLocal(store);
}

export async function updateDocument(
  docId: string,
  patch: Partial<Pick<DocumentRecord, "fields" | "status" | "title" | "client_id">>,
): Promise<DocumentRecord> {
  if (usingSupabase) {
    const { data, error } = await sb()
      .from("documents")
      .update({ ...patch, updated_at: nowIso() })
      .eq("id", docId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as DocumentRecord;
  }
  const store = await readLocal();
  const doc = store.documents.find((d) => d.id === docId);
  if (!doc) throw new Error(`Document ${docId} not found`);
  if (patch.fields) doc.fields = { ...doc.fields, ...patch.fields };
  if (patch.status) doc.status = patch.status;
  if (patch.title) doc.title = patch.title;
  if (patch.client_id !== undefined) doc.client_id = patch.client_id;
  doc.updated_at = nowIso();
  await writeLocal(store);
  return doc;
}
