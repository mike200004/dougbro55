-- Phase 7: full SaaS — activity log, e-signatures, billing, archive.
-- Run once in the Supabase SQL Editor.

-- Documents can be archived (hidden from default views, never silently deleted).
alter table documents add column if not exists archived boolean not null default false;
create index if not exists documents_account_archived_idx on documents (account_id, archived);

-- Account activity feed / audit trail.
create table if not exists activity (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null,
  message text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_account_created_idx on activity (account_id, created_at desc);
alter table activity enable row level security;
drop policy if exists "account activity" on activity;
create policy "account activity" on activity for all
  using (account_id in (select account_id from account_members where id = auth.uid()))
  with check (account_id in (select account_id from account_members where id = auth.uid()));

-- E-signature requests on documents.
create table if not exists signature_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references documents(id) on delete cascade,
  signer_name text not null default '',
  signer_email text,
  signer_phone text,
  status text not null default 'pending' check (status in ('pending','signed','declined','canceled')),
  signed_path text,
  audit jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  signed_at timestamptz
);
create index if not exists signature_requests_account_idx on signature_requests (account_id, created_at desc);
create index if not exists signature_requests_document_idx on signature_requests (document_id);
alter table signature_requests enable row level security;
drop policy if exists "account signature_requests" on signature_requests;
create policy "account signature_requests" on signature_requests for all
  using (account_id in (select account_id from account_members where id = auth.uid()))
  with check (account_id in (select account_id from account_members where id = auth.uid()));
