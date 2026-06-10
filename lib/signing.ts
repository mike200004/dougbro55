import { createSignatureRequest, getDocument } from "@/lib/db";
import { makeSignToken } from "@/lib/share";
import { sendEmail, emailConfigured } from "@/lib/email";
import { sendSms } from "@/lib/twilio";
import { normalizePhone } from "@/lib/phone";
import { logActivity } from "@/lib/activity";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";

export interface RequestSignatureResult {
  ok: boolean;
  message: string;
  sign_url?: string;
}

/**
 * Create a signature request for a document and deliver the signing link to
 * the signer by email and/or text. Shared by the web UI and the AI tools.
 */
export async function requestSignature(
  accountId: string,
  input: {
    documentId: string;
    signerName: string;
    signerEmail?: string | null;
    signerPhone?: string | null;
    actorId?: string | null;
  },
): Promise<RequestSignatureResult> {
  const doc = await getDocument(accountId, input.documentId);
  if (!doc) return { ok: false, message: "Document not found." };

  const email = (input.signerEmail || "").trim();
  const phone = normalizePhone(input.signerPhone || "");
  if (email && !/.+@.+\..+/.test(email)) {
    return { ok: false, message: "That email address doesn't look right." };
  }
  if (!email && !phone) {
    return { ok: false, message: "Give me the signer's email or mobile number and I'll send it over." };
  }

  const reqRow = await createSignatureRequest(accountId, {
    document_id: doc.id,
    signer_name: input.signerName || "",
    signer_email: email || null,
    signer_phone: phone || null,
    created_by: input.actorId ?? null,
  });
  const url = `${SITE}/sign/${makeSignToken(reqRow.id)}`;
  const docName = doc.title || "a document";
  const who = input.signerName?.trim();

  const delivered: string[] = [];
  if (email && emailConfigured()) {
    const sent = await sendEmail({
      to: email,
      subject: `Signature requested: ${docName}`,
      html: `<p>${who ? `${who}, you` : "You"}'ve been asked to sign “${docName}”.</p><p><a href="${url}">Review &amp; sign it here</a> — it takes under a minute.</p><p>— Pheme</p>`,
    });
    if (sent.ok) delivered.push(`emailed ${email}`);
  }
  if (phone) {
    const sent = await sendSms(phone, `${who ? who + ", you" : "You"}'ve been asked to sign "${docName}". Review & sign: ${url}`);
    if (sent.ok) delivered.push(`texted ${phone}`);
  }

  if (!delivered.length) {
    return {
      ok: true,
      sign_url: url,
      message: `Signature request created, but I couldn't deliver it automatically — share this link with ${who || "the signer"}: ${url}`,
    };
  }

  await logActivity(accountId, "signature_requested", `Signature requested from ${who || email || phone} for “${docName}”.`, {
    actorId: input.actorId ?? null,
  });
  return { ok: true, sign_url: url, message: `Sent for signature — ${delivered.join(" and ")}.` };
}
