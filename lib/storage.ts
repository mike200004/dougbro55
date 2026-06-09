import { admin } from "@/lib/supabase/admin";

const BUCKET = "form-templates";

/** Create the private templates bucket if it doesn't exist yet (idempotent). */
export async function ensureTemplatesBucket(): Promise<void> {
  const sb = admin();
  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: "20MB",
    });
    // Ignore "already exists" races.
    if (error && !/exist/i.test(error.message)) throw new Error(error.message);
  }
}

export async function uploadTemplateFile(path: string, bytes: Buffer): Promise<void> {
  await ensureTemplatesBucket();
  const { error } = await admin()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (error) throw new Error(error.message);
}

export async function downloadTemplateFile(path: string): Promise<Buffer> {
  const { data, error } = await admin().storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(error?.message || "Template file not found");
  return Buffer.from(await data.arrayBuffer());
}
