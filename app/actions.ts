"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createClient_,
  createDocument,
  getDocument,
  insertMember,
  removeMember,
  saveProfile,
  setMemberStatus,
  updateDocument,
} from "@/lib/db";
import { admin } from "@/lib/supabase/admin";
import { requireAccount, getSessionUser } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { makeShareToken } from "@/lib/share";
import { sendSms } from "@/lib/twilio";
import { getTemplate, missingRequired } from "@/lib/templates";
import type { AgentProfile, DocType } from "@/lib/types";

const SEND_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://dougbro55.vercel.app";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://dougbro55.vercel.app";

type ActionResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Account creation (owner) — admin-confirmed; creates profile + owner member.
// ---------------------------------------------------------------------------

export async function createAccountAction(input: {
  email: string;
  password: string;
  agent_name: string;
  phone: string;
  broker_agency_name?: string;
  license_number?: string;
  street?: string;
  city_state_zip?: string;
}): Promise<ActionResult> {
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  if (!email || !input.password) return { ok: false, error: "Email and password are required." };
  if (input.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (!phone) return { ok: false, error: "A valid phone number is required (it's how calls/texts reach your account)." };

  const sb = admin();
  const { data: existing } = await sb
    .from("account_members")
    .select("id")
    .eq("phone", phone)
    .maybeSingle();
  if (existing) return { ok: false, error: "That phone number is already registered." };

  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return { ok: false, error: createErr?.message || "Could not create account." };
  }
  const uid = created.user.id;

  const { error: profileErr } = await sb.from("profiles").insert({
    id: uid,
    email,
    phone,
    agent_name: input.agent_name ?? "",
    broker_agency_name: input.broker_agency_name ?? "",
    license_number: input.license_number ?? "",
    street: input.street ?? "",
    city_state_zip: input.city_state_zip ?? "",
  });
  if (profileErr) {
    await sb.auth.admin.deleteUser(uid);
    return { ok: false, error: profileErr.message };
  }

  try {
    await insertMember({
      id: uid,
      account_id: uid,
      role: "owner",
      name: input.agent_name ?? "",
      phone,
      email,
      status: "active",
    });
  } catch (e) {
    await sb.auth.admin.deleteUser(uid);
    return { ok: false, error: e instanceof Error ? e.message : "Could not create membership." };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Team / assistants
// ---------------------------------------------------------------------------

export async function inviteAssistantAction(input: {
  name: string;
  email: string;
  phone: string;
}): Promise<ActionResult> {
  const account = await requireAccount();
  if (account.role !== "owner") return { ok: false, error: "Only the account owner can invite assistants." };

  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  if (!email) return { ok: false, error: "Email is required." };
  if (!phone) return { ok: false, error: "A valid mobile number is required." };

  const sb = admin();
  const { data: existing } = await sb.from("account_members").select("id").eq("phone", phone).maybeSingle();
  if (existing) return { ok: false, error: "That phone number is already registered to someone." };

  const { data: invited, error: inviteErr } = await sb.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${SITE_URL}/accept-invite`,
  });
  if (inviteErr || !invited.user) {
    return { ok: false, error: inviteErr?.message || "Could not send the invite." };
  }

  try {
    await insertMember({
      id: invited.user.id,
      account_id: account.accountId,
      role: "assistant",
      name: input.name ?? "",
      phone,
      email,
      status: "invited",
    });
  } catch (e) {
    await sb.auth.admin.deleteUser(invited.user.id);
    return { ok: false, error: e instanceof Error ? e.message : "Could not add the assistant." };
  }

  revalidatePath("/settings");
  return { ok: true };
}

export async function removeAssistantAction(memberId: string): Promise<void> {
  const account = await requireAccount();
  if (account.role !== "owner" || memberId === account.accountId) return;
  await removeMember(account.accountId, memberId);
  await admin().auth.admin.deleteUser(memberId);
  revalidatePath("/settings");
}

/** Called after an invited assistant sets their password (now signed in). */
export async function acceptInviteAction(): Promise<void> {
  const user = await getSessionUser();
  if (user) await setMemberStatus(user.userId, "active");
}

// ---------------------------------------------------------------------------
// Profile / clients / documents — scoped to the effective account.
// ---------------------------------------------------------------------------

export async function saveProfileAction(formData: FormData) {
  const { accountId, role } = await requireAccount();
  if (role !== "owner") return; // only the owner edits the brokerage profile
  const profile: AgentProfile = {
    broker_agency_name: String(formData.get("broker_agency_name") || ""),
    agent_name: String(formData.get("agent_name") || ""),
    license_number: String(formData.get("license_number") || ""),
    street: String(formData.get("street") || ""),
    city_state_zip: String(formData.get("city_state_zip") || ""),
    email: String(formData.get("email") || ""),
    phone: normalizePhone(String(formData.get("phone") || "")),
  };
  await saveProfile(accountId, profile);
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function createClientAction(formData: FormData) {
  const { accountId } = await requireAccount();
  await createClient_(accountId, {
    full_name: String(formData.get("full_name") || ""),
    secondary_name: (formData.get("secondary_name") as string) || null,
    email: (formData.get("email") as string) || null,
    phone: (formData.get("phone") as string) || null,
    role: (formData.get("role") as "buyer" | "seller" | "both") || null,
    notes: (formData.get("notes") as string) || null,
  });
  revalidatePath("/");
}

export async function newDocumentAction(type: DocType) {
  const { accountId, userId } = await requireAccount();
  const tpl = getTemplate(type);
  const doc = await createDocument(accountId, {
    type,
    title: `${tpl.shortName} (new)`,
    created_by: userId,
  });
  redirect(`/documents/${doc.id}`);
}

export async function saveDocumentFieldsAction(docId: string, formData: FormData) {
  const { accountId } = await requireAccount();
  const doc = await getDocument(accountId, docId);
  if (!doc) return;
  const tpl = getTemplate(doc.type);
  const valid = tpl.fields.filter((f) => !f.source).map((f) => f.key);
  const fields: Record<string, string> = {};
  for (const key of valid) fields[key] = String(formData.get(key) ?? "");
  await updateDocument(accountId, docId, {
    fields,
    title: String(formData.get("__title") || doc.title),
  });
  revalidatePath(`/documents/${docId}`);
  revalidatePath("/");
}

export async function sendDocumentAction(
  docId: string,
  toPhone: string,
  recipientName?: string,
): Promise<ActionResult> {
  const { accountId } = await requireAccount();
  const doc = await getDocument(accountId, docId);
  if (!doc) return { ok: false, error: "Document not found." };
  const missing = missingRequired(doc.type, doc.fields);
  if (missing.length) return { ok: false, error: "Fill the required fields before sending." };
  const to = normalizePhone(toPhone);
  if (!to) return { ok: false, error: "Enter a valid recipient phone number." };

  const tpl = getTemplate(doc.type);
  const link = `${SEND_SITE_URL}/api/share/${makeShareToken(docId)}`;
  const who = recipientName?.trim();
  const body = `${who ? who + ", " : ""}here is your ${tpl.name}: ${link}`;
  const sent = await sendSms(to, body);
  if (!sent.ok) return { ok: false, error: sent.error || "Could not send the text." };
  return { ok: true };
}

export async function setDocumentStatusAction(docId: string, complete: boolean) {
  const { accountId } = await requireAccount();
  const doc = await getDocument(accountId, docId);
  if (!doc) return;
  if (complete && missingRequired(doc.type, doc.fields).length > 0) return;
  await updateDocument(accountId, docId, { status: complete ? "completed" : "draft" });
  revalidatePath(`/documents/${docId}`);
  revalidatePath("/");
}
