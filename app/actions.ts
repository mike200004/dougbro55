"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/ratelimit";
import {
  createClient_,
  createDocument,
  createFormTemplate,
  deleteClient,
  deleteDocument,
  deleteFormTemplate,
  duplicateDocument,
  getDocument,
  getFormTemplate,
  insertMember,
  removeMember,
  renameFormTemplate,
  saveProfile,
  setDocumentArchived,
  setMemberStatus,
  updateClient,
  updateDocument,
} from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requestSignature } from "@/lib/signing";
import { admin } from "@/lib/supabase/admin";
import { requireAccount, getSessionUser } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { makeShareToken } from "@/lib/share";
import { sendSms } from "@/lib/twilio";
import { uploadTemplateFile } from "@/lib/storage";
import { detectAcroFields } from "@/lib/pdf/fill";
import { getTemplate, missingRequired } from "@/lib/templates";
import type { AgentProfile, ContactRole, DocType } from "@/lib/types";

const SEND_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB — matches the storage bucket limit

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";

type ActionResult =
  | { ok: true; message?: string; sign_url?: string; delivered?: boolean }
  | { ok: false; error: string };

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
  // Signup is an unauthenticated admin-powered action — dampen abuse per IP.
  const ip = ((await headers()).get("x-forwarded-for") || "unknown").split(",")[0].trim();
  if (!rateLimit(`signup:${ip}`, 5, 60 * 60_000)) {
    return { ok: false, error: "Too many signups from this connection — try again later." };
  }
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

export async function removeAssistantAction(memberId: string): Promise<ActionResult> {
  const account = await requireAccount();
  if (account.role !== "owner" || memberId === account.accountId) {
    return { ok: false, error: "Only the account owner can remove assistants." };
  }
  // Never delete an auth user we don't own: verify the member belongs to THIS
  // account and is an assistant before touching auth.
  const { data: member } = await admin()
    .from("account_members")
    .select("id, role")
    .eq("account_id", account.accountId)
    .eq("id", memberId)
    .maybeSingle();
  if (!member || member.role !== "assistant") {
    return { ok: false, error: "That person isn't an assistant on your account." };
  }
  await removeMember(account.accountId, memberId);
  await admin().auth.admin.deleteUser(memberId);
  revalidatePath("/settings");
  return { ok: true };
}

/** Re-send an expired/lost invite to a still-pending assistant. */
export async function resendInviteAction(memberId: string): Promise<ActionResult> {
  const account = await requireAccount();
  if (account.role !== "owner") return { ok: false, error: "Only the account owner can resend invites." };
  const { data: member } = await admin()
    .from("account_members")
    .select("id, role, status, email, name, phone")
    .eq("account_id", account.accountId)
    .eq("id", memberId)
    .maybeSingle();
  if (!member || member.role !== "assistant" || member.status !== "invited" || !member.email) {
    return { ok: false, error: "That invite can't be resent." };
  }
  // Invite links can only be issued for a fresh auth user — recreate it.
  const sb = admin();
  await sb.auth.admin.deleteUser(member.id);
  const { data: invited, error: inviteErr } = await sb.auth.admin.inviteUserByEmail(member.email, {
    redirectTo: `${SITE_URL}/accept-invite`,
  });
  if (inviteErr || !invited.user) {
    // The old member row now points at a deleted auth user — remove it so the
    // owner can re-invite cleanly.
    await removeMember(account.accountId, member.id);
    revalidatePath("/settings");
    return { ok: false, error: inviteErr?.message || "Could not resend — please invite them again." };
  }
  await removeMember(account.accountId, member.id);
  await insertMember({
    id: invited.user.id,
    account_id: account.accountId,
    role: "assistant",
    name: member.name ?? "",
    phone: member.phone,
    email: member.email,
    status: "invited",
  });
  revalidatePath("/settings");
  return { ok: true };
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
  const rawPhone = String(formData.get("phone") || "").trim();
  const phone = normalizePhone(rawPhone);
  if (rawPhone && !phone) redirect("/settings?saved=badphone");

  // The member row is what voice/SMS caller-id matches against — keep it in
  // sync with the profile, and never let two accounts claim the same number.
  if (phone) {
    const { data: taken } = await admin()
      .from("account_members")
      .select("id")
      .eq("phone", phone)
      .neq("id", accountId)
      .maybeSingle();
    if (taken) redirect("/settings?saved=phonetaken");
  }

  const profile: AgentProfile = {
    broker_agency_name: String(formData.get("broker_agency_name") || ""),
    agent_name: String(formData.get("agent_name") || ""),
    license_number: String(formData.get("license_number") || ""),
    street: String(formData.get("street") || ""),
    city_state_zip: String(formData.get("city_state_zip") || ""),
    email: String(formData.get("email") || ""),
    phone,
  };
  await saveProfile(accountId, profile);
  await admin()
    .from("account_members")
    .update({ ...(phone ? { phone } : {}), name: profile.agent_name, email: profile.email })
    .eq("id", accountId);
  revalidatePath("/settings");
  revalidatePath("/");
  redirect("/settings?saved=profile");
}

export async function createClientAction(formData: FormData) {
  const { accountId } = await requireAccount();
  const fullName = String(formData.get("full_name") || "").trim();
  if (!fullName) return;
  const rawPhone = String(formData.get("phone") || "").trim();
  await createClient_(accountId, {
    full_name: fullName,
    secondary_name: (formData.get("secondary_name") as string) || null,
    email: (formData.get("email") as string) || null,
    phone: rawPhone ? normalizePhone(rawPhone) || rawPhone : null,
    role: (formData.get("role") as ContactRole) || null,
    company: (formData.get("company") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  revalidatePath("/clients");
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
  let valid: string[];
  if (doc.template_id) {
    const ft = await getFormTemplate(accountId, doc.template_id);
    valid = (ft?.fields ?? []).map((f) => f.key);
  } else {
    valid = getTemplate(doc.type as DocType).fields.filter((f) => !f.source).map((f) => f.key);
  }
  const fields: Record<string, string> = {};
  for (const key of valid) fields[key] = String(formData.get(key) ?? "");
  await updateDocument(accountId, docId, {
    fields,
    title: String(formData.get("__title") || doc.title),
  });
  revalidatePath(`/documents/${docId}`);
  revalidatePath("/");
}

export async function uploadFormAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string; flat?: boolean }> {
  const { accountId, userId } = await requireAccount();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "Choose a PDF to upload." };
  if (file.type && !/pdf/i.test(file.type)) return { ok: false, error: "Please upload a PDF." };
  // Bound memory/CPU before parsing — don't hand an oversized PDF to pdf-lib.
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "That PDF is too large (max 20 MB)." };

  const bytes = Buffer.from(await file.arrayBuffer());
  let acroFields;
  try {
    acroFields = await detectAcroFields(bytes);
  } catch {
    return { ok: false, error: "Couldn't read that PDF. Make sure it's a valid form." };
  }
  if (!acroFields.length) {
    // Flat / scanned form — the client will run vision-based field placement.
    return { ok: false, flat: true, error: "This form has no fillable fields — let's place them." };
  }

  const name = (String(formData.get("name") || "").trim() || file.name.replace(/\.pdf$/i, "")) || "Uploaded form";
  const storagePath = `${accountId}/${randomUUID()}.pdf`;
  await uploadTemplateFile(storagePath, bytes);
  await createFormTemplate(accountId, {
    name,
    kind: "acroform",
    storage_path: storagePath,
    fields: acroFields,
    created_by: userId,
  });
  revalidatePath("/");
  return { ok: true };
}

/** Save a flat/scanned form with vision-detected overlay placements. */
export async function saveOverlayTemplateAction(input: {
  name: string;
  pdfBase64: string;
  fields: { key: string; label: string; type: string; placement: { page: number; x: number; y: number; size?: number; maxWidth?: number } }[];
}): Promise<ActionResult> {
  const { accountId, userId } = await requireAccount();
  if (!input.pdfBase64) return { ok: false, error: "Missing the PDF." };
  if (!input.fields?.length) return { ok: false, error: "Add at least one field." };
  // base64 inflates ~33%; cap the decoded size to match the upload limit.
  if (input.pdfBase64.length > MAX_UPLOAD_BYTES * 1.4) {
    return { ok: false, error: "That PDF is too large (max 20 MB)." };
  }

  const bytes = Buffer.from(input.pdfBase64, "base64");
  const storagePath = `${accountId}/${randomUUID()}.pdf`;
  await uploadTemplateFile(storagePath, bytes);
  await createFormTemplate(accountId, {
    name: input.name.trim() || "Uploaded form",
    kind: "overlay",
    storage_path: storagePath,
    fields: input.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: "text" as const,
      placement: f.placement,
    })),
    created_by: userId,
  });
  revalidatePath("/");
  return { ok: true };
}

export async function startFromTemplateAction(templateId: string) {
  const { accountId, userId } = await requireAccount();
  const ft = await getFormTemplate(accountId, templateId);
  if (!ft) return;
  const doc = await createDocument(accountId, {
    type: "uploaded",
    template_id: ft.id,
    title: `${ft.name} (new)`,
    created_by: userId,
  });
  redirect(`/documents/${doc.id}`);
}

export async function sendDocumentAction(
  docId: string,
  toPhone: string,
  recipientName?: string,
): Promise<ActionResult> {
  const { accountId } = await requireAccount();
  const doc = await getDocument(accountId, docId);
  if (!doc) return { ok: false, error: "Document not found." };
  if (!doc.template_id && missingRequired(doc.type as DocType, doc.fields).length) {
    return { ok: false, error: "Fill the required fields before sending." };
  }
  const to = normalizePhone(toPhone);
  if (!to) return { ok: false, error: "Enter a valid recipient phone number." };

  const docName = doc.template_id ? doc.title || "document" : getTemplate(doc.type as DocType).name;
  const link = `${SEND_SITE_URL}/api/share/${makeShareToken(docId)}`;
  const who = recipientName?.trim();
  const body = `${who ? who + ", " : ""}here is your ${docName}: ${link}`;
  const sent = await sendSms(to, body);
  if (!sent.ok) return { ok: false, error: sent.error || "Could not send the text." };
  return { ok: true };
}

export async function setDocumentStatusAction(docId: string, complete: boolean): Promise<ActionResult> {
  const { accountId, userId } = await requireAccount();
  const doc = await getDocument(accountId, docId);
  if (!doc) return { ok: false, error: "Document not found." };
  if (complete && !doc.template_id && missingRequired(doc.type as DocType, doc.fields).length > 0) {
    return { ok: false, error: "Save the document first — required fields are still empty on the saved copy." };
  }
  await updateDocument(accountId, docId, { status: complete ? "completed" : "draft" });
  if (complete) await logActivity(accountId, "document_filed", `Filed “${doc.title || "a document"}”.`, { actorId: userId });
  revalidatePath(`/documents/${docId}`);
  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Document lifecycle
// ---------------------------------------------------------------------------

export async function archiveDocumentAction(docId: string, archived: boolean) {
  const { accountId } = await requireAccount();
  await setDocumentArchived(accountId, docId, archived);
  revalidatePath("/documents");
  revalidatePath("/");
}

export async function deleteDocumentAction(docId: string) {
  const { accountId, userId } = await requireAccount();
  const doc = await getDocument(accountId, docId);
  if (!doc) return;
  await deleteDocument(accountId, docId);
  await logActivity(accountId, "document_deleted", `Deleted “${doc.title || "a document"}”.`, { actorId: userId });
  revalidatePath("/documents");
  revalidatePath("/");
}

export async function duplicateDocumentAction(docId: string): Promise<ActionResult> {
  const { accountId, userId } = await requireAccount();
  const copy = await duplicateDocument(accountId, docId, userId);
  if (!copy) return { ok: false, error: "Couldn't duplicate that document." };
  redirect(`/documents/${copy.id}`);
}

export async function requestSignatureAction(input: {
  docId: string;
  signerName: string;
  signerEmail?: string;
  signerPhone?: string;
}): Promise<ActionResult> {
  const { accountId, userId } = await requireAccount();
  const res = await requestSignature(accountId, {
    documentId: input.docId,
    signerName: input.signerName,
    signerEmail: input.signerEmail || null,
    signerPhone: input.signerPhone || null,
    actorId: userId,
  });
  revalidatePath(`/documents/${input.docId}`);
  revalidatePath("/documents");
  if (!res.ok) return { ok: false, error: res.message };
  // Pass the real outcome through — "created but not delivered" must not look
  // like success, and the fallback link must reach the user.
  return { ok: true, message: res.message, sign_url: res.delivered ? undefined : res.sign_url, delivered: res.delivered };
}

export async function cancelSignatureRequestAction(requestId: string, docId: string): Promise<ActionResult> {
  const { accountId } = await requireAccount();
  await admin()
    .from("signature_requests")
    .update({ status: "canceled" })
    .eq("account_id", accountId)
    .eq("id", requestId)
    .eq("status", "pending");
  revalidatePath(`/documents/${docId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function updateClientAction(clientId: string, formData: FormData): Promise<void> {
  const { accountId } = await requireAccount();
  const rawPhone = String(formData.get("phone") || "").trim();
  await updateClient(accountId, clientId, {
    full_name: String(formData.get("full_name") || ""),
    secondary_name: (formData.get("secondary_name") as string) || null,
    email: (formData.get("email") as string) || null,
    phone: rawPhone ? normalizePhone(rawPhone) || rawPhone : null,
    role: ((formData.get("role") as string) || null) as ContactRole | null,
    company: (formData.get("company") as string) || null,
    preferences: (formData.get("preferences") as string) || null,
    notes: (formData.get("notes") as string) || null,
  });
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/clients");
  revalidatePath("/");
}

export async function deleteClientAction(clientId: string) {
  const { accountId } = await requireAccount();
  await deleteClient(accountId, clientId);
  revalidatePath("/clients");
  redirect("/clients");
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function renameTemplateAction(templateId: string, name: string) {
  const { accountId } = await requireAccount();
  if (name.trim()) await renameFormTemplate(accountId, templateId, name.trim());
  revalidatePath("/");
}

export async function deleteTemplateAction(templateId: string): Promise<ActionResult> {
  const { accountId, userId } = await requireAccount();
  const tpl = await getFormTemplate(accountId, templateId);
  // Filled copies render from the template's stored PDF — deleting it would
  // break every document made from this form.
  const { count } = await admin()
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accountId)
    .eq("template_id", templateId);
  if (count && count > 0) {
    return {
      ok: false,
      error: `${count} document${count === 1 ? "" : "s"} were filled from this form — delete those first, or keep the form.`,
    };
  }
  await deleteFormTemplate(accountId, templateId);
  if (tpl) await logActivity(accountId, "template_deleted", `Removed the form “${tpl.name}”.`, { actorId: userId });
  revalidatePath("/");
  return { ok: true };
}


// ---------------------------------------------------------------------------
// Account deletion (owner only — removes the whole account)
// ---------------------------------------------------------------------------

export async function deleteAccountAction(confirmText: string): Promise<ActionResult> {
  const account = await requireAccount();
  if (account.role !== "owner") return { ok: false, error: "Only the account owner can delete the account." };
  if (confirmText !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
  const sb = admin();
  // Remove the account's uploaded + signed PDFs from storage (DB cascade
  // doesn't reach the storage bucket).
  try {
    const prefixes = [account.accountId, `${account.accountId}/signed`];
    for (const prefix of prefixes) {
      const { data: objs } = await sb.storage.from("form-templates").list(prefix, { limit: 1000 });
      const files = (objs ?? []).filter((o) => o.id).map((o) => `${prefix}/${o.name}`);
      if (files.length) await sb.storage.from("form-templates").remove(files);
    }
  } catch {
    // storage cleanup is best-effort — never block account deletion
  }
  // Remove assistants' logins first, then the owner (cascades all account data).
  const { data: members } = await sb.from("account_members").select("id").eq("account_id", account.accountId);
  for (const m of members ?? []) {
    if (m.id !== account.accountId) await sb.auth.admin.deleteUser(m.id);
  }
  await sb.auth.admin.deleteUser(account.accountId);
  return { ok: true };
}
