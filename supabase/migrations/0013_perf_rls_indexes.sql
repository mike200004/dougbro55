-- 0013: performance advisor fixes.
-- 1. RLS policies: wrap auth.uid() in a scalar subselect so Postgres evaluates
--    it once per query instead of once per row (auth_rls_initplan lint).
-- 2. Cover the foreign keys the linter flagged — these also speed up the
--    cascade scans that run when an auth user (account/assistant) is deleted.

-- account_members ------------------------------------------------------------
drop policy if exists "member self/own" on account_members;
create policy "member self/own" on account_members
  for all using (id = (select auth.uid()) or account_id = (select auth.uid()))
  with check (account_id = (select auth.uid()));

-- member-scoped account tables ------------------------------------------------
drop policy if exists "account clients" on clients;
create policy "account clients" on clients for all
  using (account_id in (select account_id from account_members where id = (select auth.uid())))
  with check (account_id in (select account_id from account_members where id = (select auth.uid())));

drop policy if exists "account documents" on documents;
create policy "account documents" on documents for all
  using (account_id in (select account_id from account_members where id = (select auth.uid())))
  with check (account_id in (select account_id from account_members where id = (select auth.uid())));

drop policy if exists "account profile" on profiles;
create policy "account profile" on profiles for all
  using (id in (select account_id from account_members where id = (select auth.uid())))
  with check (id in (select account_id from account_members where id = (select auth.uid())));

drop policy if exists "account form_templates" on form_templates;
create policy "account form_templates" on form_templates for all
  using (account_id in (select account_id from account_members where id = (select auth.uid())))
  with check (account_id in (select account_id from account_members where id = (select auth.uid())));

drop policy if exists "account activity" on activity;
create policy "account activity" on activity for all
  using (account_id in (select account_id from account_members where id = (select auth.uid())))
  with check (account_id in (select account_id from account_members where id = (select auth.uid())));

drop policy if exists "account signature_requests" on signature_requests;
create policy "account signature_requests" on signature_requests for all
  using (account_id in (select account_id from account_members where id = (select auth.uid())))
  with check (account_id in (select account_id from account_members where id = (select auth.uid())));

drop policy if exists "member reads subscription" on subscriptions;
create policy "member reads subscription" on subscriptions for select
  using (account_id in (select account_id from account_members where id = (select auth.uid())));

drop policy if exists "member reads call_usage" on call_usage;
create policy "member reads call_usage" on call_usage for select
  using (account_id in (select account_id from account_members where id = (select auth.uid())));

-- foreign-key covering indexes -------------------------------------------------
create index if not exists activity_actor_idx on activity (actor_id);
create index if not exists documents_created_by_idx on documents (created_by);
create index if not exists documents_template_idx on documents (template_id);
create index if not exists form_templates_created_by_idx on form_templates (created_by);
create index if not exists signature_requests_created_by_idx on signature_requests (created_by);
create index if not exists sms_sessions_account_idx on sms_sessions (account_id);
