-- Per-phone SMS conversation memory for the Twilio assistant.
create table if not exists sms_sessions (
  phone text primary key,
  transcript jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
