-- Pheme schema. Apply once the Supabase project is provisioned
-- (via the Supabase MCP apply_migration or `supabase db push`).

create table if not exists agent_profile (
  id integer primary key default 1,
  broker_agency_name text not null default '',
  agent_name text not null default '',
  license_number text not null default '',
  street text not null default '',
  city_state_zip text not null default '',
  email text not null default '',
  phone text not null default '',
  constraint agent_profile_singleton check (id = 1)
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  secondary_name text,
  email text,
  phone text,
  role text check (role in ('buyer','seller','both')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('buyer_rep','purchase','dual_agency')),
  client_id uuid references clients(id) on delete set null,
  title text not null default '',
  status text not null default 'draft' check (status in ('draft','completed')),
  fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_updated_at_idx on documents (updated_at desc);
create index if not exists documents_client_id_idx on documents (client_id);
