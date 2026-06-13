import { createSignatureRequest, getDocument } from "@/lib/db";
import { isDocType, missingRequired, userFields } from "@/lib/templates";
import type { DocType } from "@/lib/types";
import { makeSignToken } from "@/lib/share";
import { sendEmail, emailConfigured, escapeHtml } from "@/lib/email";
import { sendSms } from "@/lib/twilio";
import { normalizePhone } from "@/lib/phone";
import { logActivity } from "@/lib/activity";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";

export interface RequestSignatureResult {
  ok: boolean;
  message: string;
  sign_url?: string;
  /** True when the link actually went out by email or text. */
  delivered?: boolean;
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

  // Never send a half-empty legal document out for signature. (Uploaded forms
  // — including orphans whose template was deleted — have no required-field
  // metadata, so only built-in types are checked.)
  if (!doc.template_id && isDocType(doc.type)) {
    const missingKeys = missingRequired(doc.type as DocType, doc.fields);
    if (missingKeys.length) {
      const fields = userFields(doc.type as DocType);
      const labels = missingKeys.map((k) => fields.find((f) => f.key === k)?.label ?? k);
      return { ok: false, message: `Fill the required fields first — still missing: ${labels.join(", ")}.` };
    }
  }

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

  // Deliver by email and text in parallel — on a phone call the agent is
  // waiting through this.
  const [emailed, texted] = await Promise.all([
    email && emailConfigured()
      ? sendEmail({
          to: email,
          subject: `Signature requested: ${docName}`,
          html: `<p>${who ? `${escapeHtml(who)}, you` : "You"}'ve been asked to sign “${escapeHtml(docName)}”.</p><p><a href="${escapeHtml(url)}">Review &amp; sign it here</a> — it takes under a minute.</p><p>— Pheme</p>`,
        })
      : Promise.resolve(null),
    phone
      ? sendSms(phone, `${who ? who + ", you" : "You"}'ve been asked to sign "${docName}". Review & sign: ${url}`)
      : Promise.resolve(null),
  ]);
  const delivered: string[] = [];
  if (emailed?.ok) delivered.push(`emailed ${email}`);
  if (texted?.ok) delivered.push(`texted ${phone}`);

  if (!delivered.length) {
    return {
      ok: true,
      delivered: false,
      sign_url: url,
      message: `Signature request created, but I couldn't deliver it automatically — share this link with ${who || "the signer"}: ${url}`,
    };
  }

  await logActivity(accountId, "signature_requested", `Signature requested from ${who || email || phone} for “${docName}”.`, {
    actorId: input.actorId ?? null,
  });
  return { ok: true, delivered: true, sign_url: url, message: `Sent for signature — ${delivered.join(" and ")}.` };
}
