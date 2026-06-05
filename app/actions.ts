"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createClient_,
  createDocument,
  saveProfile,
  updateDocument,
} from "@/lib/db";
import { admin } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/auth";
import { normalizePhone } from "@/lib/phone";
import { getTemplate, missingRequired } from "@/lib/templates";
import type { AgentProfile, DocType } from "@/lib/types";

// ---------------------------------------------------------------------------
// Auth — account creation (admin-confirmed so there's no email round-trip).
// Sign-in/out happen client-side via the browser Supabase client.
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
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  if (!email || !input.password) return { ok: false, error: "Email and password are required." };
  if (input.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (!phone) return { ok: false, error: "A valid phone number is required (it's how calls/texts reach your account)." };

  const sb = admin();

  // Ensure the phone isn't already registered to another account.
  const { data: existing } = await sb.from("profiles").select("id").eq("phone", phone).maybeSingle();
  if (existing) return { ok: false, error: "That phone number is already registered." };

  const { data: created, error: createErr } = await sb.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    return { ok: false, error: createErr?.message || "Could not create account." };
  }

  const { error: profileErr } = await sb.from("profiles").insert({
    id: created.user.id,
    email,
    phone,
    agent_name: input.agent_name ?? "",
    broker_agency_name: input.broker_agency_name ?? "",
    license_number: input.license_number ?? "",
    street: input.street ?? "",
    city_state_zip: input.city_state_zip ?? "",
  });
  if (profileErr) {
    // Roll back the auth user so the email can be reused.
    await sb.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: profileErr.message };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Profile / clients / documents — all scoped to the signed-in account.
// ---------------------------------------------------------------------------

export async function saveProfileAction(formData: FormData) {
  const { userId } = await requireAccount();
  const profile: AgentProfile = {
    broker_agency_name: String(formData.get("broker_agency_name") || ""),
    agent_name: String(formData.get("agent_name") || ""),
    license_number: String(formData.get("license_number") || ""),
    street: String(formData.get("street") || ""),
    city_state_zip: String(formData.get("city_state_zip") || ""),
    email: String(formData.get("email") || ""),
    phone: normalizePhone(String(formData.get("phone") || "")),
  };
  await saveProfile(userId, profile);
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function createClientAction(formData: FormData) {
  const { userId } = await requireAccount();
  await createClient_(userId, {
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
  const { userId } = await requireAccount();
  const tpl = getTemplate(type);
  const doc = await createDocument(userId, { type, title: `${tpl.shortName} (new)` });
  redirect(`/documents/${doc.id}`);
}

export async function saveDocumentFieldsAction(docId: string, formData: FormData) {
  const { userId } = await requireAccount();
  const { getDocument } = await import("@/lib/db");
  const doc = await getDocument(userId, docId);
  if (!doc) return;
  const tpl = getTemplate(doc.type);
  const valid = tpl.fields.filter((f) => !f.source).map((f) => f.key);
  const fields: Record<string, string> = {};
  for (const key of valid) fields[key] = String(formData.get(key) ?? "");
  await updateDocument(userId, docId, {
    fields,
    title: String(formData.get("__title") || doc.title),
  });
  revalidatePath(`/documents/${docId}`);
  revalidatePath("/");
}

export async function setDocumentStatusAction(docId: string, complete: boolean) {
  const { userId } = await requireAccount();
  const { getDocument } = await import("@/lib/db");
  const doc = await getDocument(userId, docId);
  if (!doc) return;
  if (complete && missingRequired(doc.type, doc.fields).length > 0) return;
  await updateDocument(userId, docId, { status: complete ? "completed" : "draft" });
  revalidatePath(`/documents/${docId}`);
  revalidatePath("/");
}
