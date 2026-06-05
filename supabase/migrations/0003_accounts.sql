-- Phase 3: accounts, per-user data, RLS. Run in the Supabase SQL Editor.

-- Per-user profile (id = auth user). Replaces the old singleton agent_profile.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text unique,                       -- E.164, used to match incoming calls/SMS
  broker_agency_name text not null default '',
  agent_name text not null default '',
  license_number text not null default '',
  street text not null default '',
  city_state_zip text not null default '',
  created_at timestamptz not null default now()
);

-- Ownership on existing tables.
alter table clients      add column if not exists account_id uuid references auth.users(id) on delete cascade;
alter table documents     add column if not exists account_id uuid references auth.users(id) on delete cascade;
alter table sms_sessions  add column if not exists account_id uuid references auth.users(id) on delete cascade;

create index if not exists clients_account_idx   on clients (account_id);
create index if not exists documents_account_idx on documents (account_id);

drop table if exists agent_profile;

-- RLS backstop (the app also filters explicitly by account_id via the service role).
alter table profiles     enable row level security;
alter table clients      enable row level security;
alter table documents    enable row level security;
alter table sms_sessions enable row level security;

drop policy if exists "own profile"   on profiles;
drop policy if exists "own clients"   on clients;
drop policy if exists "own documents" on documents;

create policy "own profile"   on profiles  for all using (id = auth.uid())         with check (id = auth.uid());
create policy "own clients"   on clients   for all using (account_id = auth.uid()) with check (account_id = auth.uid());
create policy "own documents" on documents for all using (account_id = auth.uid()) with check (account_id = auth.uid());
-- sms_sessions is server-only (service role bypasses RLS); no user policy.
