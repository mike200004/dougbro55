import { sendEmail, escapeHtml, emailConfigured } from "@/lib/email";

/**
 * Branded transactional emails. Thin templates over lib/email's transport —
 * every user-controlled value is escaped, every send is best-effort (callers
 * defer these; a mail hiccup must never break the action that triggered it).
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#faf7f2;font-family:Georgia,'Times New Roman',serif;color:#241f1a;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="font-size:22px;font-weight:bold;letter-spacing:0.5px;margin-bottom:18px;">Pheme</div>
  <div style="background:#ffffff;border:1px solid #e7ded2;border-radius:10px;padding:26px 24px;">
    <h1 style="font-size:19px;margin:0 0 14px;">${escapeHtml(title)}</h1>
    ${bodyHtml}
  </div>
  <p style="font-size:12px;color:#8a8175;margin-top:18px;">
    Pheme — real estate paperwork, off your plate. <a href="${SITE}" style="color:#8a8175;">pheme.deals</a>
  </p>
</div>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:22px 0;"><a href="${escapeHtml(href)}"
    style="background:#1f2937;color:#f5efe4;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:15px;display:inline-block;">
    ${escapeHtml(label)}</a></p>
  <p style="font-size:12px;color:#8a8175;">If the button doesn't work, copy this link:<br>${escapeHtml(href)}</p>`;
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  if (!emailConfigured()) return;
  const first = escapeHtml(name.trim().split(/\s+/)[0] || "there");
  await sendEmail({
    to,
    subject: "Welcome to Pheme — your assistant is ready",
    html: layout(
      "Welcome to Pheme",
      `<p>Hi ${first},</p>
       <p>Your account is live and your <strong>14-day free trial</strong> has started — it includes
       <strong>30 voice-assistant minutes</strong>, plus unlimited documents, uploads, and e-signatures.</p>
       <p>Three things to try first:</p>
       <ol style="padding-left:20px;">
         <li>Call <strong>(475) 270-3374</strong> from the phone you signed up with — your assistant already knows you.</li>
         <li>Upload a form you actually use; fill it by voice next time.</li>
         <li>Send a document for e-signature straight from the editor.</li>
       </ol>
       ${button(`${SITE}/`, "Open your dashboard")}`,
    ),
  });
}

export async function sendPasswordResetEmail(to: string, link: string): Promise<boolean> {
  const res = await sendEmail({
    to,
    subject: "Reset your Pheme password",
    html: layout(
      "Reset your password",
      `<p>Someone (hopefully you) asked to reset the password for this account.
       The link below is single-use and expires in about an hour.</p>
       ${button(link, "Choose a new password")}
       <p style="font-size:13px;color:#8a8175;">Didn't ask for this? You can safely ignore it — your password is unchanged.</p>`,
    ),
  });
  return res.ok;
}

export async function sendInviteEmail(
  to: string,
  opts: { inviterName: string; agencyName?: string; link: string },
): Promise<boolean> {
  const inviter = escapeHtml(opts.inviterName || "Your agent");
  const agency = opts.agencyName ? ` at ${escapeHtml(opts.agencyName)}` : "";
  const res = await sendEmail({
    to,
    subject: opts.inviterName ? `${opts.inviterName} invited you to Pheme` : "You've been invited to Pheme",
    html: layout(
      "You're invited to Pheme",
      `<p>${inviter}${agency} invited you to help run their real-estate paperwork on Pheme —
       documents, e-signatures, and the phone assistant, all under their account.</p>
       ${button(opts.link, "Accept the invite & set your password")}
       <p style="font-size:13px;color:#8a8175;">This link is single-use. If it expires, ask ${inviter} to re-send the invite.</p>`,
    ),
  });
  return res.ok;
}

export async function sendSubscriptionStartedEmail(
  to: string,
  opts: { planName: string; minutes: number; interval: "month" | "year" },
): Promise<void> {
  await sendEmail({
    to,
    subject: `You're on Pheme ${opts.planName} — thank you`,
    html: layout(
      `Welcome to Pheme ${escapeHtml(opts.planName)}`,
      `<p>Your subscription is active. Each month you get
       <strong>${opts.minutes.toLocaleString()} voice-assistant minutes</strong>, plus unlimited
       documents, uploads, e-signatures, texts, and the web assistant.</p>
       <p>Billing renews ${opts.interval === "year" ? "yearly" : "monthly"}; manage your plan,
       payment method, and invoices any time from Settings → Plan &amp; billing.</p>
       ${button(`${SITE}/settings`, "Manage your plan")}`,
    ),
  });
}

export async function sendPaymentFailedEmail(to: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Pheme: we couldn't charge your card",
    html: layout(
      "Payment didn't go through",
      `<p>Your latest Pheme payment failed. We'll retry automatically over the next few days,
       but if the card on file has expired or changed, you can fix it in one minute:</p>
       ${button(`${SITE}/settings`, "Update payment method")}
       <p style="font-size:13px;color:#8a8175;">If payment keeps failing, your plan will pause and the
       phone assistant will stop answering until it's sorted.</p>`,
    ),
  });
}

export async function sendSubscriptionCanceledEmail(to: string, endsAt: string | null): Promise<void> {
  const when = endsAt
    ? new Date(endsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;
  await sendEmail({
    to,
    subject: "Your Pheme subscription has ended",
    html: layout(
      "Sorry to see you go",
      `<p>Your Pheme subscription is canceled${when ? ` as of <strong>${escapeHtml(when)}</strong>` : ""}.
       Your documents and client book are safe and you can still sign in — but the phone
       assistant and document filing are paused.</p>
       <p>Changed your mind? Restarting takes a minute:</p>
       ${button(`${SITE}/pricing`, "Restart your plan")}`,
    ),
  });
}

export async function sendUsageWarningEmail(
  to: string,
  opts: {
    threshold: number; // 0.8 or 1.0
    usedMinutes: number;
    includedMinutes: number;
    plan: string;
    overageAllowed: boolean;
    overageCentsPerMin: number;
  },
): Promise<void> {
  const pct = Math.round(opts.threshold * 100);
  const atLimit = opts.threshold >= 1;
  const subject = atLimit
    ? opts.overageAllowed
      ? "Pheme: you've used all your included voice minutes"
      : "Pheme: your trial voice minutes are used up"
    : `Pheme: ${pct}% of your voice minutes used`;
  const body = atLimit
    ? opts.overageAllowed
      ? `<p>You've used <strong>${opts.usedMinutes} of ${opts.includedMinutes}</strong> included
         voice minutes this cycle on the ${escapeHtml(opts.plan)} plan. Calls keep working —
         additional minutes bill at <strong>$${(opts.overageCentsPerMin / 100).toFixed(2)}/minute</strong>
         on your next invoice. If this happens often, a bigger plan is usually cheaper.</p>
         ${button(`${SITE}/settings`, "Review usage & plans")}`
      : `<p>You've used all <strong>${opts.includedMinutes} trial voice minutes</strong>.
         The phone assistant is paused until you pick a plan — documents, texts, and the web
         assistant keep working during your trial.</p>
         ${button(`${SITE}/pricing`, "Pick a plan")}`
    : `<p>Heads up — you've used <strong>${opts.usedMinutes} of ${opts.includedMinutes}</strong>
       voice minutes this cycle. ${
         opts.overageAllowed
           ? `Beyond the allowance, minutes bill at $${(opts.overageCentsPerMin / 100).toFixed(2)}/min.`
           : "When they run out, the phone assistant pauses until you upgrade."
       }</p>
       ${button(`${SITE}/settings`, "See your usage")}`;
  await sendEmail({ to, subject, html: layout(subject, body) });
}
