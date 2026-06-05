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

/** Resolve an account id from a caller's phone (E.164). */
export async function getAccountByPhone(phone: string): Promise<string | null> {
  if (!phone) return null;
  const { data } = await admin()
    .from("profiles")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  return (data?.id as string) ?? null;
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
  input: Omit<Client, "id" | "created_at">,
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

export async function createDocument(
  accountId: string,
  input: {
    type: DocType;
    title: string;
    client_id?: string | null;
    fields?: Record<string, string>;
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
