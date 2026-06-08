-- Phase 5: persistent client memory. Run in the Supabase SQL Editor.

-- Freeform personal memory the assistant captures and recalls
-- ("pre-approved $900k, wants 3BR in Darien, prefers texts, has a dog").
alter table clients add column if not exists preferences text;

-- Last time this client was touched (for recency-ordered recall).
alter table clients add column if not exists last_seen_at timestamptz default now();

-- Fast case-insensitive name lookup for recall + dedupe-on-learn.
create index if not exists clients_account_lname_idx on clients (account_id, lower(full_name));
