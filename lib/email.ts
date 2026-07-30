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
  /**
   * Agent identity for client-facing mail: the display name becomes
   * "«agent» via Pheme" (the address stays on pheme.deals for DKIM/SPF
   * alignment) and replies go to the agent, not our unmonitored inbox.
   */
  onBehalfOf?: { name?: string | null; replyTo?: string | null };
}): Promise<SendEmailResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, configured: false, error: "Email is not set up yet." };

  const agentName = opts.onBehalfOf?.name?.trim().replace(/["<>\r\n]/g, "");
  const address = FROM.match(/<([^>]+)>/)?.[1] || FROM;
  const from = agentName ? `${agentName} via Pheme <${address}>` : FROM;
  const replyTo = opts.onBehalfOf?.replyTo?.trim();

  const body: Record<string, unknown> = {
    from,
    to: [opts.to],
    subject: opts.subject,
    html: opts.html,
    ...(replyTo && /.+@.+\..+/.test(replyTo) ? { reply_to: [replyTo] } : {}),
    ...(opts.text ? { text: opts.text } : {}),
    ...(opts.attachment
      ? { attachments: [{ filename: opts.attachment.filename, content: opts.attachment.contentBase64 }] }
      : {}),
  };

  // A network-level throw here (Resend outage, DNS, timeout) must surface as
  // {ok:false}, never as an exception — callers treat sendEmail as
  // infallible-to-throw, and an uncaught throw from a server action wedges
  // the calling button in its busy state with no error shown.
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.error("[email] Resend unreachable", err);
    return { ok: false, configured: true, error: "Email service unreachable — try again shortly." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, configured: true, error: data?.message || `Email error ${res.status}` };
  }
  return { ok: true, configured: true, id: data?.id };
}
