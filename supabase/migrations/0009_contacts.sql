-- 0009: the client book becomes a full rolodex — other agents, attorneys,
-- lenders, inspectors. Widens the role check and adds a company/firm field.
alter table public.clients drop constraint if exists clients_role_check;
alter table public.clients add constraint clients_role_check
  check (role is null or role in ('buyer','seller','both','agent','attorney','lender','inspector','other'));
alter table public.clients add column if not exists company text;
