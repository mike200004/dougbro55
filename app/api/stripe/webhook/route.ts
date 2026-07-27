import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/supabase/admin";
import {
  accountForCustomer,
  fetchStripeSubscription,
  invoicePendingItems,
  planDef,
  subscriptionRow,
  upsertSubscription,
  verifyStripeSignature,
} from "@/lib/billing";
import { getProfile } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import {
  sendPaymentFailedEmail,
  sendSubscriptionCanceledEmail,
  sendSubscriptionStartedEmail,
} from "@/lib/emails";
import { defer } from "@/lib/defer";

export const runtime = "nodejs";
export const maxDuration = 30;

interface StripeObject {
  id?: string;
  object?: string;
  customer?: string;
  status?: string;
  client_reference_id?: string;
  subscription?: string;
  cancel_at_period_end?: boolean;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string>;
  billing_reason?: string;
  items?: {
    data?: {
      current_period_start?: number;
      current_period_end?: number;
      price?: { id?: string; lookup_key?: string; metadata?: Record<string, string>; recurring?: { interval?: string } };
    }[];
  };
  parent?: { subscription_details?: { subscription?: string; metadata?: Record<string, string> } };
}

/**
 * Stripe webhook — the single source of truth for the subscriptions table.
 * Signature-verified, idempotent by event id (stripe_events ledger), and every
 * side effect beyond the DB write (emails, final invoices) is deferred so the
 * 200 goes back to Stripe fast.
 */
export async function POST(req: NextRequest) {
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { id?: string; type: string; data: { object: StripeObject } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Idempotency: first delivery inserts, redeliveries find the row and ack.
  if (event.id) {
    const { data: seen } = await admin()
      .from("stripe_events")
      .upsert({ id: event.id, type: event.type }, { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if ((seen ?? []).length === 0) return NextResponse.json({ received: true, duplicate: true });
  }

  const obj = event.data?.object ?? {};

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const accountId = obj.client_reference_id || obj.metadata?.account_id;
        if (!accountId || !obj.subscription) break;
        // The session payload doesn't carry plan/period details — fetch the
        // subscription so the row lands complete in one write.
        const sub = await fetchStripeSubscription(obj.subscription);
        const row = subscriptionRow(accountId, sub);
        await upsertSubscription(row);
        await logActivity(accountId, "billing", `Subscribed to Pheme ${planDef(row.plan)?.name ?? ""}`.trim() + ".");
        defer(async () => {
          const profile = await getProfile(accountId).catch(() => null);
          const def = planDef(row.plan);
          if (profile?.email && def) {
            await sendSubscriptionStartedEmail(profile.email, {
              planName: def.name,
              minutes: def.minutes,
              interval: row.billing_interval === "year" ? "year" : "month",
            });
          }
        });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const accountId =
          obj.metadata?.account_id || (obj.customer ? await accountForCustomer(obj.customer) : null);
        if (!accountId) break;
        const row = subscriptionRow(accountId, obj as Parameters<typeof subscriptionRow>[1]);
        if (event.type === "customer.subscription.deleted") {
          row.status = "canceled";
          // No renewal invoice will ever sweep pending overage items — bill
          // them now, then tell the owner.
          const customer = obj.customer;
          defer(async () => {
            if (customer) await invoicePendingItems(customer);
            const profile = await getProfile(accountId).catch(() => null);
            if (profile?.email) {
              await sendSubscriptionCanceledEmail(profile.email, row.current_period_end ?? null);
            }
          });
          await logActivity(accountId, "billing", "Subscription canceled.");
        }
        await upsertSubscription(row);
        break;
      }

      case "invoice.payment_failed": {
        const customer = obj.customer;
        if (!customer) break;
        const accountId = await accountForCustomer(customer);
        if (!accountId) break;
        await logActivity(accountId, "billing", "A payment failed — card needs attention.");
        defer(async () => {
          const profile = await getProfile(accountId).catch(() => null);
          if (profile?.email) await sendPaymentFailedEmail(profile.email);
        });
        break;
      }

      default:
        break; // acknowledge everything else
    }
  } catch (err) {
    // Return 500 so Stripe retries — but only for genuinely unprocessed work.
    console.error(`[stripe] ${event.type} failed`, err);
    if (event.id) await admin().from("stripe_events").delete().eq("id", event.id);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
