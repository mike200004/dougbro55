import { NextRequest, NextResponse } from "next/server";
import { upsertSubscription, verifyStripeSignature } from "@/lib/billing";

export const runtime = "nodejs";

interface StripeObject {
  id?: string;
  customer?: string;
  status?: string;
  client_reference_id?: string;
  subscription?: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: { price?: { id?: string } }[] };
}

/**
 * Stripe webhook: keeps the subscriptions table in sync. Handles checkout
 * completion and subscription lifecycle events.
 */
export async function POST(req: NextRequest) {
  const payload = await req.text();
  if (!verifyStripeSignature(payload, req.headers.get("stripe-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { type: string; data: { object: StripeObject } };
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const obj = event.data?.object ?? {};
  const accountId = obj.metadata?.account_id || obj.client_reference_id;

  switch (event.type) {
    case "checkout.session.completed": {
      if (accountId) {
        await upsertSubscription({
          account_id: accountId,
          stripe_customer_id: (obj.customer as string) ?? null,
          stripe_subscription_id: (obj.subscription as string) ?? null,
          status: "active",
        });
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      if (accountId) {
        await upsertSubscription({
          account_id: accountId,
          stripe_customer_id: (obj.customer as string) ?? null,
          stripe_subscription_id: obj.id ?? null,
          status: event.type.endsWith("deleted") ? "canceled" : obj.status || "active",
          price_id: obj.items?.data?.[0]?.price?.id ?? null,
          current_period_end: obj.current_period_end
            ? new Date(obj.current_period_end * 1000).toISOString()
            : null,
        });
      }
      break;
    }
    default:
      break; // acknowledge everything else
  }

  return NextResponse.json({ received: true });
}
