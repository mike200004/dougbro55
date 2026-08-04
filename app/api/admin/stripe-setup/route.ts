import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { PLANS, STRIPE_API_VERSION, lookupKeyFor, stripeConfigured } from "@/lib/billing";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * One-shot, idempotent Stripe environment setup — runs with the DEPLOYMENT's
 * own STRIPE_SECRET_KEY, so switching modes (sandbox → live) never requires
 * handling the key outside Vercel. Ensures:
 *   - the 3 products exist WITH a tax_code (Managed Payments refuses Checkout
 *     on products without one), keyed by metadata.plan
 *   - the 6 prices exist under the canonical lookup_keys the app resolves
 *   - a webhook endpoint for this site exists (the signing secret is only
 *     revealed on creation — it's returned once in this response so it can be
 *     pasted into STRIPE_WEBHOOK_SECRET)
 *
 * POST-only, fail-closed behind ADMIN_SETUP_SECRET (constant-time compare).
 * With ?probe=1 it also creates a throwaway Checkout session to prove the
 * key + catalog + tax configuration actually work end to end (sessions expire
 * on their own; nothing is charged).
 */

const TAX_CODE = "txcd_10103000"; // SaaS — business use
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pheme.deals";
const WEBHOOK_URL = `${SITE}/api/stripe/webhook`;
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];

function authorized(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SETUP_SECRET;
  const header = req.headers.get("x-admin-secret") ?? "";
  if (!secret || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function stripe(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const qs = params ? new URLSearchParams(params).toString() : "";
  const res = await fetch(`https://api.stripe.com/v1${path}${method === "GET" && qs ? `?${qs}` : ""}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      // Same pin as lib/billing.ts — this route reads the same object shapes.
      "Stripe-Version": STRIPE_API_VERSION,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(method === "POST" && qs ? { body: qs } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((data?.error as { message?: string })?.message || `Stripe ${res.status} on ${path}`);
  }
  return data;
}

interface StripeListed {
  id: string;
  lookup_key?: string;
  unit_amount?: number;
  url?: string;
  status?: string;
  tax_code?: string | null;
  metadata?: Record<string, string>;
  enabled_events?: string[];
  recurring?: { interval?: string };
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "STRIPE_SECRET_KEY is not set on this deployment." }, { status: 500 });
  }

  const report: Record<string, unknown> = {};
  try {
    // Which mode is this deployment's key in?
    const balance = await stripe("GET", "/balance");
    report.livemode = balance.livemode === true;

    // --- ?audit=1: read-only money reconciliation --------------------------
    // Answers "is anything touching my money?" with raw numbers from the
    // deployment's own key: every subscription, customer, charge, invoice,
    // and refund, plus the balance. Creates/mutates NOTHING.
    if (req.nextUrl.searchParams.get("audit") === "1") {
      const [subs, customers, charges, invoices, refunds] = await Promise.all([
        stripe("GET", "/subscriptions", { status: "all", limit: "100" }),
        stripe("GET", "/customers", { limit: "100" }),
        stripe("GET", "/charges", { limit: "100" }),
        stripe("GET", "/invoices", { limit: "100" }),
        stripe("GET", "/refunds", { limit: "100" }),
      ]);
      const list = (x: Record<string, unknown>) => (x.data ?? []) as Record<string, unknown>[];
      const byStatus = (rows: Record<string, unknown>[]) =>
        rows.reduce<Record<string, number>>((acc, r) => {
          const s = String(r.status ?? "unknown");
          acc[s] = (acc[s] ?? 0) + 1;
          return acc;
        }, {});
      const cents = (rows: Record<string, unknown>[], field: string) =>
        rows.reduce((sum, r) => sum + (Number(r[field]) || 0), 0);
      report.audit = {
        subscriptions: {
          count: list(subs).length,
          byStatus: byStatus(list(subs)),
          ids: list(subs).map((s) => ({ id: s.id, status: s.status, account: (s.metadata as Record<string, string> | null)?.account_id ?? null })),
        },
        customers: list(customers).length,
        charges: {
          count: list(charges).length,
          grossCents: cents(list(charges), "amount"),
          refundedCents: cents(list(charges), "amount_refunded"),
        },
        invoices: { count: list(invoices).length, byStatus: byStatus(list(invoices)) },
        refunds: { count: list(refunds).length, totalCents: cents(list(refunds), "amount") },
        balance: {
          available: (balance.available as { amount: number; currency: string }[] | undefined) ?? [],
          pending: (balance.pending as { amount: number; currency: string }[] | undefined) ?? [],
        },
      };
      return NextResponse.json(report);
    }

    // --- products (keyed by metadata.plan) --------------------------------
    const existingProducts = (await stripe("GET", "/products", { active: "true", limit: "100" }))
      .data as StripeListed[];
    const productByPlan = new Map<string, StripeListed>();
    for (const p of existingProducts) if (p.metadata?.plan) productByPlan.set(p.metadata.plan, p);

    const products: Record<string, string> = {};
    for (const def of PLANS) {
      let prod = productByPlan.get(def.key);
      if (!prod) {
        prod = (await stripe("POST", "/products", {
          name: `Pheme ${def.name}`,
          description: `${def.blurb}: ${def.minutes.toLocaleString()} AI voice-assistant minutes a month, ${def.seats} team seat${def.seats === 1 ? "" : "s"}, unlimited documents, e-signatures, SMS and web assistant.`,
          tax_code: TAX_CODE,
          "metadata[plan]": def.key,
          "metadata[minutes_included]": String(def.minutes),
          "metadata[seats]": String(def.seats),
          "metadata[overage_cents_per_min]": String(def.overageCentsPerMin),
        })) as unknown as StripeListed;
        products[def.key] = `created ${prod.id}`;
      } else if (!prod.tax_code) {
        await stripe("POST", `/products/${prod.id}`, { tax_code: TAX_CODE });
        products[def.key] = `exists ${prod.id} (tax_code added)`;
      } else {
        products[def.key] = `exists ${prod.id}`;
      }
      productByPlan.set(def.key, prod);
    }
    report.products = products;

    // --- prices (keyed by lookup_key) -------------------------------------
    const wanted = PLANS.flatMap((def) => [
      { def, interval: "month" as const, lookup: lookupKeyFor(def.key, "month"), usd: def.monthlyUsd },
      { def, interval: "year" as const, lookup: lookupKeyFor(def.key, "year"), usd: def.annualUsd },
    ]);
    const lkParams: Record<string, string> = { limit: "20", active: "true" };
    wanted.forEach((w, i) => (lkParams[`lookup_keys[${i}]`] = w.lookup));
    const existingPrices = (await stripe("GET", "/prices", lkParams)).data as StripeListed[];
    const priceByLookup = new Map(existingPrices.map((p) => [p.lookup_key, p]));

    const prices: Record<string, string> = {};
    for (const w of wanted) {
      const found = priceByLookup.get(w.lookup);
      if (found) {
        prices[w.lookup] =
          found.unit_amount === w.usd * 100
            ? `exists ${found.id}`
            : `exists ${found.id} — WARNING amount ${found.unit_amount} ≠ expected ${w.usd * 100}`;
        continue;
      }
      const created = (await stripe("POST", "/prices", {
        product: productByPlan.get(w.def.key)!.id,
        currency: "usd",
        unit_amount: String(w.usd * 100),
        "recurring[interval]": w.interval,
        lookup_key: w.lookup,
        nickname: `${w.def.name} ${w.interval === "year" ? "annual (2 months free)" : "monthly"}`,
        "metadata[plan]": w.def.key,
      })) as unknown as StripeListed;
      prices[w.lookup] = `created ${created.id}`;
    }
    report.prices = prices;

    // --- webhook endpoint ---------------------------------------------------
    const endpoints = (await stripe("GET", "/webhook_endpoints", { limit: "100" })).data as StripeListed[];
    const existing = endpoints.find((e) => e.url === WEBHOOK_URL && e.status === "enabled");
    if (!existing) {
      const params: Record<string, string> = { url: WEBHOOK_URL };
      WEBHOOK_EVENTS.forEach((ev, i) => (params[`enabled_events[${i}]`] = ev));
      const created = await stripe("POST", "/webhook_endpoints", params);
      report.webhook = {
        id: created.id,
        created: true,
        // Revealed exactly once, here — paste into STRIPE_WEBHOOK_SECRET.
        signing_secret: created.secret,
      };
    } else {
      const missing = WEBHOOK_EVENTS.filter((ev) => !(existing.enabled_events ?? []).includes(ev));
      if (missing.length) {
        const params: Record<string, string> = {};
        const all = [...new Set([...(existing.enabled_events ?? []), ...missing])];
        all.forEach((ev, i) => (params[`enabled_events[${i}]`] = ev));
        await stripe("POST", `/webhook_endpoints/${existing.id}`, params);
      }
      report.webhook = { id: existing.id, created: false, events_added: missing };
    }

    // --- optional end-to-end checkout probe --------------------------------
    if (req.nextUrl.searchParams.get("probe") === "1") {
      const soloMonthly = (await stripe("GET", "/prices", { "lookup_keys[0]": lookupKeyFor("solo", "month"), limit: "1" }))
        .data as StripeListed[];
      const session = await stripe("POST", "/checkout/sessions", {
        mode: "subscription",
        "line_items[0][price]": soloMonthly[0].id,
        "line_items[0][quantity]": "1",
        success_url: `${SITE}/settings?billing=success`,
        cancel_url: `${SITE}/settings?billing=canceled`,
        client_reference_id: "00000000-0000-0000-0000-000000000000",
      });
      report.checkout_probe = {
        ok: !!session.url,
        livemode: session.livemode,
        session: session.id,
      };
    }

    return NextResponse.json(report);
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    return NextResponse.json(report, { status: 500 });
  }
}
