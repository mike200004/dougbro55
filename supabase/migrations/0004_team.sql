-- Phase 4: team members (assistants). Run in the Supabase SQL Editor.

-- Everyone who can act on an account: the owner plus invited assistants.
create table if not exists account_members (
  id uuid primary key references auth.users(id) on delete cascade,  -- the member's login
  account_id uuid not null references auth.users(id) on delete cascade, -- the owner's id (the account)
  role text not null default 'assistant' check (role in ('owner','assistant')),
  name text not null default '',
  phone text unique,                       -- E.164, their caller ID / login phone
  email text,
  status text not null default 'invited' check (status in ('active','invited')),
  created_at timestamptz not null default now()
);
create index if not exists account_members_account_idx on account_members (account_id);

-- Attribution: who created a document.
alter table documents add column if not exists created_by uuid references auth.users(id) on delete set null;

-- Backfill: one owner member per existing profile.
insert into account_members (id, account_id, role, name, phone, email, status)
select id, id, 'owner', agent_name, phone, email, 'active'
from profiles
on conflict (id) do nothing;

-- Member-aware RLS (backstop; app still filters by account via service role).
alter table account_members enable row level security;
drop policy if exists "member self/own" on account_members;
create policy "member self/own" on account_members
  for all using (id = auth.uid() or account_id = auth.uid())
  with check (account_id = auth.uid());

-- Let any member (owner or assistant) reach the account's data.
drop policy if exists "own clients"   on clients;
drop policy if exists "own documents" on documents;
drop policy if exists "own profile"   on profiles;

create policy "account clients" on clients for all
  using (account_id in (select account_id from account_members where id = auth.uid()))
  with check (account_id in (select account_id from account_members where id = auth.uid()));

create policy "account documents" on documents for all
  using (account_id in (select account_id from account_members where id = auth.uid()))
  with check (account_id in (select account_id from account_members where id = auth.uid()));

create policy "account profile" on profiles for all
  using (id in (select account_id from account_members where id = auth.uid()))
  with check (id in (select account_id from account_members where id = auth.uid()));
