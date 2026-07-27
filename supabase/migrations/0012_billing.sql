-- 0012: Stripe billing — subscriptions, per-call voice usage, webhook idempotency.
-- (Applied to the production project via the Supabase MCP on 2026-07-27.)

create table if not exists subscriptions (
  account_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'trialing',
  plan text check (plan in ('solo','pro','brokerage')),
  price_id text,
  billing_interval text check (billing_interval in ('month','year')),
  minutes_included integer not null default 0,
  overage_cents_per_min integer not null default 40,
  seats integer not null default 1,
  cancel_at_period_end boolean not null default false,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table subscriptions enable row level security;
drop policy if exists "member reads subscription" on subscriptions;
create policy "member reads subscription" on subscriptions for select
  using (account_id in (select account_id from account_members where id = auth.uid()));
-- writes are service-role only (no insert/update/delete policies)

create table if not exists call_usage (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  vapi_call_id text unique,
  caller_phone text,
  started_at timestamptz,
  ended_at timestamptz,
  seconds integer not null default 0,
  overage_minutes integer not null default 0,
  overage_billed boolean not null default false,
  summary text,
  created_at timestamptz not null default now()
);
create index if not exists call_usage_account_created_idx on call_usage (account_id, created_at desc);
alter table call_usage enable row level security;
drop policy if exists "member reads call_usage" on call_usage;
create policy "member reads call_usage" on call_usage for select
  using (account_id in (select account_id from account_members where id = auth.uid()));

create table if not exists stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);
alter table stripe_events enable row level security;
-- service-role only: no policies
