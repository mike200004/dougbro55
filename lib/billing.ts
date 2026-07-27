import crypto from "crypto";
import { admin } from "@/lib/supabase/admin";
import type { PlanKey, Subscription } from "@/lib/types";

/**
 * Stripe billing via the REST API (no SDK dependency).
 *
 * Pricing reflects the real cost structure: AI voice calls are the expensive
 * feature (a long call runs ~40 minutes of model + voice + telephony time), so
 * every plan carries a monthly voice-minute allowance and paid plans bill
 * per-minute overage as Stripe invoice items (they land on the next invoice).
 * Documents, e-signatures, SMS, and the web assistant are unmetered.
 *
 * Prices are resolved by lookup_key, never by hardcoded id — recreating the
 * catalog in live mode with the same lookup keys is all it takes to leave
 * sandbox. Without STRIPE_SECRET_KEY the app falls back to free "beta" mode
 * (everything unlocked) rather than breaking.
 */

export const TRIAL_DAYS = 14;
export const TRIAL_MINUTES = 30;
export const TRIAL_SEATS = 2; // owner + one assistant, enough to feel the product

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";

export interface PlanDef {
  key: PlanKey;
  name: string;
  monthlyUsd: number;
  annualUsd: number;
  minutes: number;
  seats: number;
  overageCentsPerMin: number;
  blurb: string;
}

export const PLANS: PlanDef[] = [
  {
    key: "solo",
    name: "Solo",
    monthlyUsd: 49,
    annualUsd: 490,
    minutes: 100,
    seats: 1,
    overageCentsPerMin: 40,
    blurb: "For the individual agent",
  },
  {
    key: "pro",
    name: "Pro",
    monthlyUsd: 99,
    annualUsd: 990,
    minutes: 300,
    seats: 3,
    overageCentsPerMin: 35,
    blurb: "For the busy agent with help",
  },
  {
    key: "brokerage",
    name: "Brokerage",
    monthlyUsd: 249,
    annualUsd: 2490,
    minutes: 1000,
    seats: 10,
    overageCentsPerMin: 30,
    blurb: "For teams and brokerages",
  },
];

export function planDef(key: string | null | undefined): PlanDef | null {
  return PLANS.find((p) => p.key === key) ?? null;
}

export function lookupKeyFor(plan: PlanKey, interval: "month" | "year"): string {
  return `${plan}_${interval === "year" ? "annual" : "monthly"}`;
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// ---------------------------------------------------------------------------
// Stripe REST
// ---------------------------------------------------------------------------

async function stripeReq(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const qs = params ? new URLSearchParams(params).toString() : "";
  const url = `https://api.stripe.com/v1${path}${method === "GET" && qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(method === "POST" && qs ? { body: qs } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (data?.error as { message?: string })?.message || `Stripe error ${res.status}`;
    throw new Error(err);
  }
  return data;
}

// lookup_key -> price id, cached per warm lambda (survives sandbox→live key
// swaps across deploys because it's never persisted).
let priceCache: Map<string, string> | null = null;

export async function priceIdForLookup(lookupKey: string): Promise<string> {
  if (priceCache?.has(lookupKey)) return priceCache.get(lookupKey)!;
  const keys = PLANS.flatMap((p) => [lookupKeyFor(p.key, "month"), lookupKeyFor(p.key, "year")]);
  const params: Record<string, string> = { limit: "10", active: "true" };
  keys.forEach((k, i) => (params[`lookup_keys[${i}]`] = k));
  const res = await stripeReq("GET", "/prices", params);
  const cache = new Map<string, string>();
  for (const price of (res.data as { id: string; lookup_key?: string }[]) ?? []) {
    if (price.lookup_key) cache.set(price.lookup_key, price.id);
  }
  priceCache = cache;
  const id = cache.get(lookupKey);
  if (!id) throw new Error(`No Stripe price found for ${lookupKey} — is the catalog set up?`);
  return id;
}

// ---------------------------------------------------------------------------
// Subscription state
// ---------------------------------------------------------------------------

export async function getSubscription(accountId: string): Promise<Subscription | null> {
  const { data } = await admin()
    .from("subscriptions")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();
  return (data as Subscription) ?? null;
}

export interface PlanState {
  /** beta = Stripe not configured (everything free); otherwise the live plan. */
  plan: "beta" | "trial" | PlanKey | "expired";
  active: boolean;
  /** Voice minutes included in the current window (Infinity in beta mode). */
  minutesIncluded: number;
  /** Paid plans may exceed the allowance (billed per minute); trials may not. */
  overageAllowed: boolean;
  overageCentsPerMin: number;
  seats: number;
  trialDaysLeft?: number;
  cancelAtPeriodEnd?: boolean;
  periodEnd?: string | null;
  sub: Subscription | null;
}

const PAID_STATUSES = new Set(["active", "trialing", "past_due"]);

export async function getPlanState(accountId: string): Promise<PlanState> {
  if (!stripeConfigured()) {
    return {
      plan: "beta",
      active: true,
      minutesIncluded: Number.POSITIVE_INFINITY,
      overageAllowed: false,
      overageCentsPerMin: 0,
      seats: Number.POSITIVE_INFINITY,
      sub: null,
    };
  }

  const sub = await getSubscription(accountId);
  if (sub && PAID_STATUSES.has(sub.status)) {
    const def = planDef(sub.plan);
    return {
      plan: (sub.plan as PlanKey) ?? "solo",
      active: true,
      minutesIncluded: sub.minutes_included || def?.minutes || 0,
      overageAllowed: true,
      overageCentsPerMin: sub.overage_cents_per_min || def?.overageCentsPerMin || 40,
      seats: sub.seats || def?.seats || 1,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      periodEnd: sub.current_period_end,
      sub,
    };
  }

  // No live subscription — the account is on (or past) the signup trial.
  const { data: owner } = await admin()
    .from("account_members")
    .select("created_at")
    .eq("id", accountId)
    .maybeSingle();
  const started = owner?.created_at ? new Date(owner.created_at).getTime() : Date.now();
  const daysUsed = (Date.now() - started) / 86_400_000;
  if (daysUsed <= TRIAL_DAYS) {
    return {
      plan: "trial",
      active: true,
      minutesIncluded: TRIAL_MINUTES,
      overageAllowed: false,
      overageCentsPerMin: 0,
      seats: TRIAL_SEATS,
      trialDaysLeft: Math.max(0, Math.ceil(TRIAL_DAYS - daysUsed)),
      sub,
    };
  }
  return {
    plan: "expired",
    active: false,
    minutesIncluded: 0,
    overageAllowed: false,
    overageCentsPerMin: 0,
    seats: 1,
    sub,
  };
}

// ---------------------------------------------------------------------------
// Voice usage
// ---------------------------------------------------------------------------

/**
 * Start of the current voice-minute window. Monthly plans follow the Stripe
 * billing period; annual plans reset monthly on the subscription's day-of-month
 * anniversary; trial/expired accounts use their all-time total.
 */
export function usageWindowStart(state: PlanState): Date {
  const sub = state.sub;
  if (sub && PAID_STATUSES.has(sub.status) && sub.current_period_start) {
    const periodStart = new Date(sub.current_period_start);
    if (sub.billing_interval !== "year") return periodStart;
    // Latest monthly anniversary of the period start that is <= now.
    const now = new Date();
    const anchor = new Date(periodStart);
    anchor.setUTCFullYear(now.getUTCFullYear(), now.getUTCMonth(), anchor.getUTCDate());
    if (anchor > now) anchor.setUTCMonth(anchor.getUTCMonth() - 1);
    if (anchor < periodStart) return periodStart;
    return anchor;
  }
  return new Date(0); // trial/expired: all-time
}

export interface VoiceUsage {
  usedMinutes: number;
  includedMinutes: number;
  remainingMinutes: number;
  overageMinutes: number;
  windowStart: string;
}

export async function getVoiceUsage(accountId: string, state?: PlanState): Promise<VoiceUsage> {
  const s = state ?? (await getPlanState(accountId));
  const windowStart = usageWindowStart(s);
  const { data } = await admin()
    .from("call_usage")
    .select("seconds")
    .eq("account_id", accountId)
    .gte("created_at", windowStart.toISOString())
    .limit(5000);
  const usedMinutes = (data ?? []).reduce(
    (sum, row) => sum + Math.ceil(((row as { seconds: number }).seconds || 0) / 60),
    0,
  );
  const included = s.minutesIncluded;
  return {
    usedMinutes,
    includedMinutes: included,
    remainingMinutes: Number.isFinite(included) ? Math.max(0, included - usedMinutes) : Number.POSITIVE_INFINITY,
    overageMinutes: Number.isFinite(included) ? Math.max(0, usedMinutes - included) : 0,
    windowStart: windowStart.toISOString(),
  };
}

export interface RecordCallResult {
  recorded: boolean;
  usage: VoiceUsage | null;
  /** minutes of THIS call that fell beyond the allowance and were invoiced */
  overageBilledMinutes: number;
  /** usage thresholds (0.8 / 1.0) crossed by this call — for warning emails */
  crossed: number[];
  state: PlanState | null;
}

/**
 * Record a finished voice call and bill any overage. Idempotent on the Vapi
 * call id, so webhook redelivery can't double-bill. Never throws — a billing
 * hiccup must not break the call-recap path.
 */
export async function recordCallUsage(input: {
  accountId: string;
  vapiCallId?: string | null;
  callerPhone?: string | null;
  seconds: number;
  startedAt?: string | null;
  endedAt?: string | null;
  summary?: string | null;
}): Promise<RecordCallResult> {
  const none: RecordCallResult = { recorded: false, usage: null, overageBilledMinutes: 0, crossed: [], state: null };
  try {
    const seconds = Math.max(0, Math.round(input.seconds || 0));
    if (!seconds) return none;

    const state = await getPlanState(input.accountId);
    const before = await getVoiceUsage(input.accountId, state);

    const insert = await admin()
      .from("call_usage")
      .upsert(
        {
          account_id: input.accountId,
          vapi_call_id: input.vapiCallId || null,
          caller_phone: input.callerPhone || null,
          seconds,
          started_at: input.startedAt || null,
          ended_at: input.endedAt || null,
          summary: input.summary ? input.summary.slice(0, 2000) : null,
        },
        { onConflict: "vapi_call_id", ignoreDuplicates: true },
      )
      .select("id");
    // Duplicate delivery (same call id) — everything already happened.
    if (input.vapiCallId && (insert.data ?? []).length === 0) return none;
    const rowId = (insert.data?.[0] as { id: string } | undefined)?.id;

    const callMinutes = Math.ceil(seconds / 60);
    const after: VoiceUsage = {
      ...before,
      usedMinutes: before.usedMinutes + callMinutes,
      remainingMinutes: Number.isFinite(before.includedMinutes)
        ? Math.max(0, before.includedMinutes - (before.usedMinutes + callMinutes))
        : Number.POSITIVE_INFINITY,
      overageMinutes: Number.isFinite(before.includedMinutes)
        ? Math.max(0, before.usedMinutes + callMinutes - before.includedMinutes)
        : 0,
    };

    // Bill the newly-overage minutes of this call on paid plans.
    let overageBilledMinutes = 0;
    if (
      state.overageAllowed &&
      Number.isFinite(before.includedMinutes) &&
      state.sub?.stripe_customer_id &&
      stripeConfigured()
    ) {
      const newOverage = after.overageMinutes - before.overageMinutes;
      if (newOverage > 0) {
        const rate = state.overageCentsPerMin || 40;
        const when = new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "America/New_York",
        });
        try {
          await stripeReq("POST", "/invoiceitems", {
            customer: state.sub.stripe_customer_id,
            currency: "usd",
            amount: String(newOverage * rate),
            description: `Voice overage — ${newOverage} min beyond plan allowance (call on ${when})`,
          });
          overageBilledMinutes = newOverage;
          if (rowId) {
            await admin()
              .from("call_usage")
              .update({ overage_minutes: newOverage, overage_billed: true })
              .eq("id", rowId);
          }
        } catch (err) {
          console.error("[billing] overage invoice item failed", err);
        }
      }
    }

    // Which warning thresholds did this call cross?
    const crossed: number[] = [];
    if (Number.isFinite(before.includedMinutes) && before.includedMinutes > 0) {
      for (const t of [0.8, 1.0]) {
        const mark = before.includedMinutes * t;
        if (before.usedMinutes < mark && after.usedMinutes >= mark) crossed.push(t);
      }
    }

    return { recorded: true, usage: after, overageBilledMinutes, crossed, state };
  } catch (err) {
    console.error("[billing] recordCallUsage failed", err);
    return none;
  }
}

// ---------------------------------------------------------------------------
// Checkout / portal
// ---------------------------------------------------------------------------

export async function createCheckoutSession(input: {
  accountId: string;
  email: string;
  plan: PlanKey;
  interval: "month" | "year";
  existingCustomerId?: string | null;
}): Promise<string> {
  const price = await priceIdForLookup(lookupKeyFor(input.plan, input.interval));
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    client_reference_id: input.accountId,
    success_url: `${SITE}/settings?billing=success`,
    cancel_url: `${SITE}/settings?billing=canceled`,
    allow_promotion_codes: "true",
    "subscription_data[metadata][account_id]": input.accountId,
    "metadata[account_id]": input.accountId,
  };
  if (input.existingCustomerId) params.customer = input.existingCustomerId;
  else params.customer_email = input.email;
  const session = await stripeReq("POST", "/checkout/sessions", params);
  return session.url as string;
}

export async function createPortalSession(customerId: string): Promise<string> {
  const session = await stripeReq("POST", "/billing_portal/sessions", {
    customer: customerId,
    return_url: `${SITE}/settings`,
  });
  return session.url as string;
}

// ---------------------------------------------------------------------------
// Webhook helpers
// ---------------------------------------------------------------------------

/** Verify a Stripe webhook signature (manual HMAC — no SDK needed). */
export function verifyStripeSignature(payload: string, header: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // replay window
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
  plan?: PlanKey | null;
  price_id?: string | null;
  billing_interval?: "month" | "year" | null;
  minutes_included?: number;
  overage_cents_per_min?: number;
  seats?: number;
  cancel_at_period_end?: boolean;
  current_period_start?: string | null;
  current_period_end?: string | null;
}): Promise<void> {
  const { error } = await admin()
    .from("subscriptions")
    .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
  if (error) throw new Error(error.message);
}

interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: {
    data?: {
      current_period_start?: number;
      current_period_end?: number;
      price?: { id?: string; lookup_key?: string; metadata?: Record<string, string>; recurring?: { interval?: string } };
    }[];
  };
}

/**
 * Normalize a Stripe subscription object (from the API or a webhook payload)
 * into our subscriptions row. Periods live on the ITEM in newer API versions,
 * on the subscription in older payloads — read both.
 */
export function subscriptionRow(
  accountId: string,
  sub: StripeSubscription,
): Parameters<typeof upsertSubscription>[0] {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  const lookup = price?.lookup_key || "";
  const plan =
    (PLANS.find((p) => lookup.startsWith(p.key))?.key as PlanKey | undefined) ??
    ((price?.metadata?.plan as PlanKey | undefined) || null);
  const def = planDef(plan);
  const interval =
    price?.recurring?.interval === "year" || lookup.endsWith("annual") ? ("year" as const) : ("month" as const);
  const periodStart = item?.current_period_start ?? sub.current_period_start;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
  return {
    account_id: accountId,
    stripe_customer_id: sub.customer ?? null,
    stripe_subscription_id: sub.id ?? null,
    status: sub.status || "active",
    plan,
    price_id: price?.id ?? null,
    billing_interval: interval,
    minutes_included: def?.minutes ?? 0,
    overage_cents_per_min: def?.overageCentsPerMin ?? 40,
    seats: def?.seats ?? 1,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  };
}

export async function fetchStripeSubscription(subscriptionId: string): Promise<StripeSubscription> {
  return (await stripeReq("GET", `/subscriptions/${subscriptionId}`, {
    "expand[0]": "items.data.price",
  })) as unknown as StripeSubscription;
}

/**
 * When a subscription is fully canceled, any un-invoiced overage items would
 * be orphaned (no renewal invoice will ever sweep them). Bill them now.
 */
export async function invoicePendingItems(customerId: string): Promise<void> {
  try {
    const pending = await stripeReq("GET", "/invoiceitems", {
      customer: customerId,
      pending: "true",
      limit: "1",
    });
    if (((pending.data as unknown[]) ?? []).length === 0) return;
    await stripeReq("POST", "/invoices", {
      customer: customerId,
      auto_advance: "true",
      collection_method: "charge_automatically",
      pending_invoice_items_behavior: "include",
      description: "Final voice-minute overage",
    });
  } catch (err) {
    console.error("[billing] final overage invoice failed", err);
  }
}

/** Friendly one-liner the AI can speak when an account can't use voice. */
export const UPGRADE_MESSAGE =
  "This account's Pheme plan isn't active — head to pheme.deals and pick a plan in Settings to keep using the phone assistant.";

/** Look up which account a Stripe customer belongs to (webhook fallback). */
export async function accountForCustomer(customerId: string): Promise<string | null> {
  const { data } = await admin()
    .from("subscriptions")
    .select("account_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data as { account_id: string } | null)?.account_id ?? null;
}
