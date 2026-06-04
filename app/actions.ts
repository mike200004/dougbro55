"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createClient_,
  createDocument,
  getDocument,
  saveProfile,
  updateDocument,
} from "@/lib/db";
import { getTemplate, missingRequired } from "@/lib/templates";
import type { AgentProfile, DocType } from "@/lib/types";

export async function saveProfileAction(formData: FormData) {
  const profile: AgentProfile = {
    broker_agency_name: String(formData.get("broker_agency_name") || ""),
    agent_name: String(formData.get("agent_name") || ""),
    license_number: String(formData.get("license_number") || ""),
    street: String(formData.get("street") || ""),
    city_state_zip: String(formData.get("city_state_zip") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
  };
  await saveProfile(profile);
  revalidatePath("/settings");
  revalidatePath("/");
}

export async function createClientAction(formData: FormData) {
  await createClient_({
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
  const tpl = getTemplate(type);
  const doc = await createDocument({ type, title: `${tpl.shortName} (new)` });
  redirect(`/documents/${doc.id}`);
}

export async function saveDocumentFieldsAction(
  docId: string,
  formData: FormData,
) {
  const doc = await getDocument(docId);
  if (!doc) return;
  const tpl = getTemplate(doc.type);
  const valid = tpl.fields.filter((f) => !f.source).map((f) => f.key);
  const fields: Record<string, string> = {};
  for (const key of valid) {
    fields[key] = String(formData.get(key) ?? "");
  }
  await updateDocument(docId, { fields, title: String(formData.get("__title") || doc.title) });
  revalidatePath(`/documents/${docId}`);
  revalidatePath("/");
}

export async function setDocumentStatusAction(docId: string, complete: boolean) {
  const doc = await getDocument(docId);
  if (!doc) return;
  if (complete && missingRequired(doc.type, doc.fields).length > 0) {
    // Don't complete while required fields are missing.
    return;
  }
  await updateDocument(docId, { status: complete ? "completed" : "draft" });
  revalidatePath(`/documents/${docId}`);
  revalidatePath("/");
}
