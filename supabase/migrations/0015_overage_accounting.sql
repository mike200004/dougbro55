-- 0015: atomic, self-healing voice-overage accounting.
--
-- recordCallUsage previously computed overage from an unlocked read-then-write
-- snapshot: two calls ending concurrently (normal on multi-seat plans) each
-- billed against the same stale baseline, silently under-billing; and a call
-- whose Stripe invoiceitem POST failed could never be billed later (its
-- vapi_call_id idempotency row already existed). This function fixes both:
--
--  * pg_advisory_xact_lock serializes overage math per account, so concurrent
--    call-ends compute against a consistent total.
--  * Billing is DELTA-based: true window overage minus what's already been
--    claimed. Any minutes a previous call failed to bill are automatically
--    swept into the next call's claim — lost Stripe responses self-heal.
--  * The claim is recorded on the triggering row INSIDE the same transaction,
--    before Stripe is called. If the Stripe POST then fails, the app un-claims
--    (row goes back to unbilled) and the minutes return to the pool.
--
-- The app posts ONE invoiceitem per claim, idempotency-keyed on the triggering
-- row, so a retried delivery can never double-bill a claim.

create or replace function public.record_call_overage(
  p_account_id uuid,
  p_row_id uuid,
  p_window_start timestamptz,
  p_included_minutes integer
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_true_overage integer;
  v_claimed integer;
  v_delta integer;
begin
  -- One account's overage math at a time; lock releases on commit/rollback.
  perform pg_advisory_xact_lock(hashtext(p_account_id::text));

  select greatest(
           0,
           coalesce(sum(ceil(seconds / 60.0)), 0)::integer - p_included_minutes
         )
    into v_true_overage
    from public.call_usage
   where account_id = p_account_id
     and created_at >= p_window_start;

  select coalesce(sum(overage_minutes), 0)::integer
    into v_claimed
    from public.call_usage
   where account_id = p_account_id
     and created_at >= p_window_start
     and overage_billed;

  v_delta := greatest(0, v_true_overage - v_claimed);
  if v_delta > 0 then
    update public.call_usage
       set overage_minutes = v_delta,
           overage_billed = true
     where id = p_row_id;
  end if;

  return v_delta;
end;
$$;

revoke execute on function public.record_call_overage(uuid, uuid, timestamptz, integer)
  from public, anon, authenticated;
