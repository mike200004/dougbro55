import crypto from "crypto";
import { admin } from "@/lib/supabase/admin";
import type { Subscription } from "@/lib/types";

/**
 * Stripe billing via the REST API (no SDK dependency). Activates when
 * STRIPE_SECRET_KEY / STRIPE_PRICE_PRO / STRIPE_WEBHOOK_SECRET are set; until
 * then every account is on the free early-access plan ("beta") with full
 * features — honest, fully-working launch mode rather than a fake paywall.
 */

const TRIAL_DAYS = 14;
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";

export function stripeConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PRO);
}

async function stripe(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (data?.error as { message?: string })?.message || `Stripe error ${res.status}`;
    throw new Error(err);
  }
  return data;
}

export async function getSubscription(accountId: string): Promise<Subscription | null> {
  const { data } = await admin()
    .from("subscriptions")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();
  return (data as Subscription) ?? null;
}

export interface PlanState {
  plan: "beta" | "trial" | "pro" | "expired";
  active: boolean; // may the account use paid features right now?
  daysLeft?: number; // trial days remaining
}

/** Resolve the account's plan. Without Stripe keys everyone is on free beta. */
export async function getPlan(accountId: string): Promise<PlanState> {
  if (!stripeConfigured()) return { plan: "beta", active: true };

  const sub = await getSubscription(accountId);
  if (sub && ["active", "trialing", "past_due"].includes(sub.status)) {
    return { plan: "pro", active: true };
  }

  // Trial window runs from the owner's signup date.
  const { data: owner } = await admin()
    .from("account_members")
    .select("created_at")
    .eq("id", accountId)
    .maybeSingle();
  const started = owner?.created_at ? new Date(owner.created_at).getTime() : Date.now();
  const daysUsed = (Date.now() - started) / 86_400_000;
  if (daysUsed <= TRIAL_DAYS) {
    return { plan: "trial", active: true, daysLeft: Math.max(0, Math.ceil(TRIAL_DAYS - daysUsed)) };
  }
  return { plan: "expired", active: false };
}

/** Friendly one-liner the AI can speak when a trial has lapsed. */
export const UPGRADE_MESSAGE =
  "Your Pheme trial has ended — head to Settings on pheme.deals to upgrade and keep filing documents.";

export async function createCheckoutSession(accountId: string, email: string): Promise<string> {
  const session = await stripe("/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": process.env.STRIPE_PRICE_PRO!,
    "line_items[0][quantity]": "1",
    customer_email: email,
    client_reference_id: accountId,
    success_url: `${SITE}/settings?billing=success`,
    cancel_url: `${SITE}/settings?billing=canceled`,
    "subscription_data[metadata][account_id]": accountId,
    "metadata[account_id]": accountId,
  });
  return session.url as string;
}

export async function createPortalSession(customerId: string): Promise<string> {
  const session = await stripe("/billing_portal/sessions", {
    customer: customerId,
    return_url: `${SITE}/settings`,
  });
  return session.url as string;
}

/** Verify a Stripe webhook signature (manual HMAC — no SDK needed). */
export function verifyStripeSignature(payload: string, header: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((kv) => kv.split("=") as [string, string]),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  // Reject events older than 5 minutes (replay protection).
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function upsertSubscription(input: {
  account_id: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  status: string;
  price_id?: string | null;
  current_period_end?: string | null;
}): Promise<void> {
  await admin()
    .from("subscriptions")
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
}
