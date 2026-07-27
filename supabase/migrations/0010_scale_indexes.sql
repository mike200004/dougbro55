-- 0010: indexes for the multi-user hot paths.
-- latestDraft: WHERE account_id = ? AND status = 'draft' ORDER BY updated_at DESC LIMIT 1
create index if not exists documents_account_status_updated_idx
  on documents (account_id, status, updated_at desc);

-- buildMemoryDigest: most-recently-seen clients per account
-- (clients ORDER BY last_seen_at DESC ... LIMIT n, scoped to account_id).
create index if not exists clients_account_lastseen_idx
  on clients (account_id, last_seen_at desc nulls last);
