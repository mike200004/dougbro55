/**
 * Email delivery via Resend. Activates when RESEND_API_KEY is set; until then
 * email sending returns a clear "not configured" result (no silent failure).
 */
const FROM = process.env.EMAIL_FROM || "Pheme <documents@pheme.deals>";

/**
 * Escape user-controlled text before interpolating it into an outbound email's
 * HTML. Document titles, recipient names, signer names, and call recaps all
 * originate from users — without this, markup in those values is delivered as
 * live HTML in the recipient's inbox (content/link spoofing in a Pheme-branded
 * email). Always wrap untrusted values; never the static template markup.
 */
export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
  configured: boolean;
}

export function emailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachment?: { filename: string; contentBase64: string };
}): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, configured: false, error: "Email is not set up yet." };

  const body: Record<string, unknown> = {
    from: FROM,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
    ...(opts.text ? { text: opts.text } : {}),
    ...(opts.attachment
      ? { attachments: [{ filename: opts.attachment.filename, content: opts.attachment.contentBase64 }] }
      : {}),
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, configured: true, error: data?.message || `Email error ${res.status}` };
  }
  return { ok: true, configured: true, id: data?.id };
}
