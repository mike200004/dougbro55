-- 0014: monotonic guard against out-of-order Stripe subscription webhooks.
--
-- Stripe does not guarantee webhook delivery order. Without a guard, an older
-- customer.subscription.created/updated snapshot delivered AFTER a newer one
-- can silently overwrite the row back to a stale status/plan/period. Track
-- the event's own timestamp and only accept a write that's at least as new as
-- what's already stored — via an atomic INSERT ... ON CONFLICT ... WHERE
-- (race-safe under concurrent deliveries), not a read-then-write JS compare.
--
-- customer.subscription.deleted passes p_force=true: cancellation is a
-- terminal state and must always be able to land, even in the pathological
-- case where its own event timestamp were ever judged stale.

alter table subscriptions add column if not exists last_event_at timestamptz;

create or replace function public.upsert_subscription_guarded(
  p_account_id uuid,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_status text,
  p_plan text,
  p_price_id text,
  p_billing_interval text,
  p_minutes_included integer,
  p_overage_cents_per_min integer,
  p_seats integer,
  p_cancel_at_period_end boolean,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_last_event_at timestamptz,
  p_force boolean default false
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.subscriptions (
    account_id, stripe_customer_id, stripe_subscription_id, status, plan, price_id,
    billing_interval, minutes_included, overage_cents_per_min, seats,
    cancel_at_period_end, current_period_start, current_period_end,
    last_event_at, updated_at
  )
  values (
    p_account_id, p_stripe_customer_id, p_stripe_subscription_id, p_status, p_plan, p_price_id,
    p_billing_interval, p_minutes_included, p_overage_cents_per_min, p_seats,
    p_cancel_at_period_end, p_current_period_start, p_current_period_end,
    p_last_event_at, now()
  )
  on conflict (account_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    status = excluded.status,
    plan = excluded.plan,
    price_id = excluded.price_id,
    billing_interval = excluded.billing_interval,
    minutes_included = excluded.minutes_included,
    overage_cents_per_min = excluded.overage_cents_per_min,
    seats = excluded.seats,
    cancel_at_period_end = excluded.cancel_at_period_end,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    -- high-water mark: never move backwards, even when p_force bypasses the
    -- guard below to let a "deleted" event land.
    last_event_at = greatest(public.subscriptions.last_event_at, excluded.last_event_at),
    updated_at = excluded.updated_at
  where p_force
     or public.subscriptions.last_event_at is null
     or excluded.last_event_at is null
     or public.subscriptions.last_event_at <= excluded.last_event_at;
end;
$$;

-- Service-role-only write path (webhook handler uses the service role key,
-- which bypasses RLS; SECURITY INVOKER means anyone else calling this RPC
-- directly is still bound by the table's existing RLS policies — this just
-- makes the intent explicit and removes the blanket PUBLIC execute grant
-- Postgres creates by default). The function name is unique in its schema,
-- so no argument-type list is required to identify it.
revoke all on function public.upsert_subscription_guarded from public;
grant execute on function public.upsert_subscription_guarded to service_role;
