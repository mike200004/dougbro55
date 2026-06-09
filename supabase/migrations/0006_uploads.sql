-- Phase 6: uploaded, reusable form templates. Run in the Supabase SQL Editor.
-- (The Storage bucket `form-templates` is created programmatically via the
-- service-role client; only these tables/policies need the SQL editor.)

create table if not exists form_templates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'acroform' check (kind in ('acroform', 'overlay')),
  storage_path text not null,
  fields jsonb not null default '[]'::jsonb, -- [{key,label,type,acro_name?,options?,placement?}]
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists form_templates_account_idx on form_templates (account_id);

-- A document is either a built-in (type) or a copy of an uploaded template.
alter table documents add column if not exists template_id uuid references form_templates(id) on delete set null;

-- Allow the 'uploaded' document type (copies of uploaded templates).
alter table documents drop constraint if exists documents_type_check;
alter table documents add constraint documents_type_check
  check (type in ('buyer_rep', 'purchase', 'dual_agency', 'uploaded'));

-- Member-aware RLS (backstop; data access goes through the service role).
alter table form_templates enable row level security;
drop policy if exists "account form_templates" on form_templates;
create policy "account form_templates" on form_templates for all
  using (account_id in (select account_id from account_members where id = auth.uid()))
  with check (account_id in (select account_id from account_members where id = auth.uid()));
