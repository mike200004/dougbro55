-- 0011: beta gate. New owner signups land in 'pending' until manually approved
-- (flip account_members.status to 'active' in the Supabase dashboard). Existing
-- members are already 'active'/'invited', so this only affects new signups.
alter table public.account_members drop constraint if exists account_members_status_check;
alter table public.account_members add constraint account_members_status_check
  check (status in ('active', 'invited', 'pending'));
