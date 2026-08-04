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

/**
 * The Stripe API version this file's response parsing is written against.
 * Verified live on 2026-08-04 (the account default at the time). Bump only
 * alongside re-reading Stripe's changelog for the objects we touch:
 * subscriptions, checkout sessions, invoices, invoiceitems, refunds, balance.
 */
export const STRIPE_API_VERSION = "2026-06-24.dahlia";

async function stripeReq(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Record<string, string>,
  opts?: { idempotencyKey?: string },
): Promise<Record<string, unknown>> {
  const qs = params ? new URLSearchParams(params).toString() : "";
  const url = `https://api.stripe.com/v1${path}${method !== "POST" && qs ? `?${qs}` : ""}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      // Pin the API version we actually parse. Without this every call
      // inherits the Stripe ACCOUNT's default version, which Stripe can move
      // (or someone can bump in the dashboard) with no code change here —
      // silently reshaping the responses this file reads. Upgrading is now a
      // deliberate edit, tested against the new shape.
      "Stripe-Version": STRIPE_API_VERSION,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      // GETs are naturally idempotent (and don't need the header) — only
      // mutations carry a key, and only when the caller supplied one.
      ...(method !== "GET" && opts?.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    ...(method === "POST" && qs ? { body: qs } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data?.error as { message?: string })?.message || `Stripe error ${res.status}`;
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

// Deterministic, semantically-scoped idempotency keys: a lost-response retry
// of the SAME logical mutation reuses the same key (Stripe returns the first
// result instead of creating a duplicate), while a genuinely different
// operation gets a different key. Must stay <= 255 chars (Stripe's limit).
function idempotencyKey(...parts: (string | number)[]): string {
  return parts.map(String).join(":").slice(0, 255);
}

// Coarse time bucket (current hour) — collapses an immediate retry into the
// same key without permanently blocking a later, separate attempt.
function hourBucket(): string {
  return Math.floor(Date.now() / 3_600_000).toString();
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
      // If the plan can't be resolved (catalog drift, manually-created
      // price), fail in the CUSTOMER's favor: grant Solo's allowance rather
      // than 0 included minutes — 0 would bill every minute as overage from
      // the first second, i.e. silently overcharge.
      minutesIncluded: sub.minutes_included || def?.minutes || PLANS[0].minutes,
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
    // Latest monthly anniversary of the period start that is <= now. Built by
    // walking candidate months and clamping the day-of-month (a Jan-31 anchor
    // must yield Feb-28, never roll into March — and never land in the future).
    const now = new Date();
    const day = periodStart.getUTCDate();
    const time = [periodStart.getUTCHours(), periodStart.getUTCMinutes(), periodStart.getUTCSeconds()] as const;
    for (let back = 0; back <= 2; back++) {
      const y = now.getUTCFullYear();
      const m = now.getUTCMonth() - back;
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const candidate = new Date(Date.UTC(y, m, Math.min(day, lastDay), ...time));
      if (candidate <= now) return candidate < periodStart ? periodStart : candidate;
    }
    return periodStart;
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
      // Delta to bill. Preferred path: the 0015 RPC — per-account advisory
      // lock (concurrent call-ends can't compute against the same stale
      // total) and delta accounting (true window overage minus what's already
      // claimed), which also sweeps in minutes a previous call failed to
      // bill. The claim lands on this row inside the RPC's transaction; if
      // Stripe then rejects the invoice item we un-claim so the minutes
      // return to the pool. Falls back to the old unlocked snapshot math
      // until the migration is applied.
      let delta = 0;
      let claimedInRpc = false;
      if (rowId) {
        const rpc = await admin().rpc("record_call_overage", {
          p_account_id: input.accountId,
          p_row_id: rowId,
          p_window_start: usageWindowStart(state).toISOString(),
          p_included_minutes: before.includedMinutes,
        });
        if (!rpc.error) {
          delta = Number(rpc.data ?? 0) || 0;
          claimedInRpc = delta > 0;
        } else {
          if (["42883", "PGRST202", "42703"].includes(rpc.error.code ?? "")) {
            console.warn("[billing] migration 0015 not applied — unlocked snapshot overage math in use");
          } else {
            console.error("[billing] overage RPC failed; using snapshot math", rpc.error);
          }
          delta = after.overageMinutes - before.overageMinutes;
        }
      }
      if (delta > 0) {
        const rate = state.overageCentsPerMin || 40;
        const when = new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "America/New_York",
        });
        try {
          // vapi_call_id is the natural idempotency unit — this claim must
          // never bill twice, even if Stripe's response to a prior attempt
          // was lost (Vercel timeout/network blip) and the whole recording
          // gets retried. Falls back to the call_usage row id (still
          // per-call) when there's no vapi_call_id to key on.
          const key = idempotencyKey("overage", input.vapiCallId || rowId || crypto.randomUUID());
          await stripeReq(
            "POST",
            "/invoiceitems",
            {
              customer: state.sub.stripe_customer_id,
              currency: "usd",
              amount: String(delta * rate),
              description: `Voice overage — ${delta} min beyond plan allowance (call on ${when})`,
            },
            { idempotencyKey: key },
          );
          overageBilledMinutes = delta;
          if (rowId && !claimedInRpc) {
            await admin()
              .from("call_usage")
              .update({ overage_minutes: delta, overage_billed: true })
              .eq("id", rowId);
          }
        } catch (err) {
          console.error("[billing] overage invoice item failed", err);
          if (rowId && claimedInRpc) {
            // Release the claim so the next call's RPC re-bills these minutes.
            await admin()
              .from("call_usage")
              .update({ overage_minutes: 0, overage_billed: false })
              .eq("id", rowId)
              .then((r) => {
                if (r.error) console.error("[billing] overage un-claim failed — minutes stranded until manual sweep", r.error);
              });
          }
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
  const lookupKey = lookupKeyFor(input.plan, input.interval);
  const price = await priceIdForLookup(lookupKey);
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
  // Hour-bucketed: an immediate retry (lost response) dedupes, but a
  // genuinely later checkout attempt for the same plan isn't blocked forever.
  const key = idempotencyKey("checkout", input.accountId, lookupKey, hourBucket());
  const session = await stripeReq("POST", "/checkout/sessions", params, { idempotencyKey: key });
  return session.url as string;
}

/**
 * Auto-heal for the double-checkout race: an account with an ACTIVE
 * subscription completed a second Checkout (two tabs, retry an hour later).
 * The DB is keyed one-subscription-per-account, so the newcomer would either
 * overwrite the original's ids (orphaning a live subscription that charges
 * forever, invisibly) or double-bill alongside it. Instead: cancel the NEW
 * subscription immediately and refund its initial charge. Throws on real
 * failure so the webhook 500s and Stripe redelivers — the DELETE tolerates
 * 404 (already canceled) and the refund is idempotency-keyed, so retrying the
 * heal is safe.
 */
export async function cancelDuplicateSubscription(sub: {
  id: string;
  latest_invoice?: unknown;
}): Promise<void> {
  const id = String(sub.id);
  try {
    await stripeReq("DELETE", `/subscriptions/${id}`);
  } catch (err) {
    if ((err as { status?: number }).status !== 404) throw err;
  }
  const latestInvoice = typeof sub.latest_invoice === "string" ? sub.latest_invoice : null;
  if (latestInvoice) {
    const inv = await stripeReq("GET", `/invoices/${latestInvoice}`);
    const pi = typeof inv.payment_intent === "string" ? inv.payment_intent : null;
    if (pi && inv.status === "paid" && Number(inv.amount_paid || 0) > 0) {
      await stripeReq(
        "POST",
        "/refunds",
        { payment_intent: pi },
        { idempotencyKey: idempotencyKey("duprefund", id) },
      );
    }
  }
}

export async function createPortalSession(customerId: string): Promise<string> {
  const session = await stripeReq("POST", "/billing_portal/sessions", {
    customer: customerId,
    return_url: `${SITE}/settings`,
  });
  return session.url as string;
}

/**
 * Switch an EXISTING active subscription to a different plan/interval in
 * place, with immediate proration. Critical: an active subscriber must never
 * be sent through Checkout again — that would create a second, parallel
 * subscription that double-bills every cycle.
 */
export async function changeSubscriptionPlan(
  stripeSubscriptionId: string,
  plan: PlanKey,
  interval: "month" | "year",
): Promise<void> {
  const price = await priceIdForLookup(lookupKeyFor(plan, interval));
  const current = await fetchStripeSubscription(stripeSubscriptionId);
  const item = (current.items?.data?.[0] as { id?: string; price?: { id?: string } } | undefined);
  const itemId = item?.id;
  if (!itemId) throw new Error("Could not read the current subscription item.");
  // Keyed on subscription + FROM price + TO price + minute: a lost-response
  // retry (seconds later) dedupes, while flip-flopping Solo→Pro→Solo→Pro
  // gets fresh keys — the source price differs on the way back, and the
  // minute bucket separates a same-direction re-switch. (Hour buckets
  // collided here: the 3rd switch in an hour replayed the 1st response and
  // silently no-opped in Stripe while the UI claimed success.)
  const fromPrice = item?.price?.id || "unknown";
  const minuteBucket = Math.floor(Date.now() / 60_000).toString();
  const key = idempotencyKey("planchange", stripeSubscriptionId, fromPrice, price, minuteBucket);
  await stripeReq(
    "POST",
    `/subscriptions/${stripeSubscriptionId}`,
    {
      "items[0][id]": itemId,
      "items[0][price]": price,
      proration_behavior: "always_invoice", // charge/credit the difference now
      cancel_at_period_end: "false",
    },
    { idempotencyKey: key },
  );
}

/**
 * Cancel a subscription immediately (used when the account itself is being
 * deleted — otherwise Stripe would keep charging a customer whose account no
 * longer exists). Unbilled overage is swept onto a final invoice first.
 */
export async function cancelStripeSubscriptionNow(
  sub: Subscription | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!stripeConfigured() || !sub?.stripe_subscription_id) return { ok: true };
  try {
    if (sub.stripe_customer_id) await invoicePendingItems(sub.stripe_customer_id);
    // Canceling a subscription is a DELETE in Stripe's API (there is no
    // /cancel sub-path for subscriptions — that's subscription *schedules*).
    await stripeReq("DELETE", `/subscriptions/${sub.stripe_subscription_id}`);
    return { ok: true };
  } catch (err) {
    // An already-canceled sub 404s — that's success for our purposes. Any
    // OTHER failure must be reported so account deletion can refuse to
    // proceed: deleting the account cascades the subscriptions row away, and
    // an orphaned live subscription would keep charging a card forever with
    // nobody able to see it.
    if ((err as { status?: number }).status === 404) return { ok: true };
    console.error("[billing] cancel on account delete failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "Stripe cancellation failed" };
  }
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

/**
 * Thrown by upsertSubscription. `.code` preserves the underlying Postgres
 * error code (e.g. "23503") so callers can branch on it precisely instead of
 * parsing message text.
 */
class SubscriptionWriteError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "SubscriptionWriteError";
    this.code = code;
  }
}

/**
 * True when upsertSubscription failed on Postgres 23503 — a foreign-key
 * violation on subscriptions.account_id -> auth.users. The only way to hit
 * that here is an account that no longer exists: deleteAccountAction cancels
 * the Stripe subscription and THEN deletes the auth user, which cascades the
 * subscriptions row away (see 0012_billing.sql), so a customer.subscription.*
 * webhook landing afterward has nothing left to attach to. That's a no-op,
 * not a processing failure.
 */
export function isMissingAccountError(err: unknown): boolean {
  return err instanceof SubscriptionWriteError && err.code === "23503";
}

export async function upsertSubscription(
  input: {
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
  },
  opts?: {
    /** Top-level Stripe event `created` (unix seconds) — the monotonic guard key. */
    eventCreatedAt?: number | null;
    /** Bypass the monotonic guard (a terminal state must always be able to land). */
    force?: boolean;
  },
): Promise<void> {
  const lastEventAt = opts?.eventCreatedAt != null ? new Date(opts.eventCreatedAt * 1000).toISOString() : null;
  // No event to guard on (e.g. checkout.session.completed, which isn't part
  // of the subscription's own out-of-order event stream) -> always write,
  // same as the old unconditional upsert.
  const force = opts?.force ?? lastEventAt === null;
  // Atomic INSERT ... ON CONFLICT ... WHERE inside the DB function (see
  // migration 0014) — race-safe against out-of-order/concurrent webhook
  // deliveries in a way a JS read-then-write compare could not guarantee.
  const { error } = await admin().rpc("upsert_subscription_guarded", {
    p_account_id: input.account_id,
    p_stripe_customer_id: input.stripe_customer_id ?? null,
    p_stripe_subscription_id: input.stripe_subscription_id ?? null,
    p_status: input.status,
    p_plan: input.plan ?? null,
    p_price_id: input.price_id ?? null,
    p_billing_interval: input.billing_interval ?? null,
    p_minutes_included: input.minutes_included ?? 0,
    p_overage_cents_per_min: input.overage_cents_per_min ?? 40,
    p_seats: input.seats ?? 1,
    p_cancel_at_period_end: input.cancel_at_period_end ?? false,
    p_current_period_start: input.current_period_start ?? null,
    p_current_period_end: input.current_period_end ?? null,
    p_last_event_at: lastEventAt,
    p_force: force,
  });
  if (!error) return;
  // Migration 0014 not applied yet (42883 = undefined_function, 42703 =
  // undefined_column). Fall back to the plain upsert so a deploy that lands
  // before the migration still records subscriptions correctly — it just
  // doesn't get the out-of-order guard until the migration runs. Remove this
  // fallback once 0014 is applied everywhere.
  if (error.code === "42883" || error.code === "PGRST202" || error.code === "42703") {
    console.warn("[billing] upsert_subscription_guarded missing — apply migration 0014; using unguarded upsert");
    const plain = await admin()
      .from("subscriptions")
      .upsert({ ...input, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
    if (plain.error) throw new SubscriptionWriteError(plain.error.message, plain.error.code);
    return;
  }
  throw new SubscriptionWriteError(error.message, error.code);
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
    const key = idempotencyKey("finalinvoice", customerId, hourBucket());
    await stripeReq(
      "POST",
      "/invoices",
      {
        customer: customerId,
        auto_advance: "true",
        collection_method: "charge_automatically",
        pending_invoice_items_behavior: "include",
        description: "Final voice-minute overage",
      },
      { idempotencyKey: key },
    );
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
