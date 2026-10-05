-- v1.17 (limecore#10) — a supporter who changes their login email keeps their
-- Ko-fi renewals.
--
-- ── The gap ──────────────────────────────────────────────────────────────────
--
-- v1.17 lets users change their login email. The entitlement row itself is
-- keyed on user_id, so a change does not remove a perk that is already live.
-- What breaks is the NEXT payment: Ko-fi still sends the old checkout address,
-- and kofi_match_user looked for it only as a confirmed primary address or a
-- self-declared kofi_alt_email. After the change it is neither, so the renewal
-- matched nobody, the webhook logged "needs manual linking", and the perk ran
-- out at expires_at. On 2026-10-05 all three live entitlements were matched on
-- the account's primary address, so every current supporter was exposed.
--
-- Worse than a lapse: with the old address free, ANY user could name it as
-- their kofi_alt_email, and the supporter's next renewal went to them. Email
-- change must not ship before this function does.
--
-- ── The fix ──────────────────────────────────────────────────────────────────
--
-- One new step: an address that already paid for an account keeps paying for
-- that account. supporter_entitlements.source_email is written only by the
-- verified webhook, after a match, so it is a record of who this Ko-fi address
-- belongs to rather than anything a user can assert.
--
-- Where it sits in the order is the security decision:
--   1. Confirmed primary address. Unchanged and still first: whoever holds the
--      confirmed address has proved they control the inbox Ko-fi pays from.
--   2. Address held by any other account (unconfirmed, soft-deleted,
--      anonymous) -> no match. Unchanged and still before the new step, so an
--      unconfirmed sign-up on a supporter's old address still cannot take
--      their renewal (it can only stall it until the squat is resolved).
--   3. NEW: the account this address last paid for, if it still exists.
--   4. Self-declared kofi_alt_email. Unchanged, and after step 3 so a claim
--      can never outrank a verified payment history.
--
-- Signature, SECURITY DEFINER, search_path and the EXECUTE revoke are the same
-- as 20260823_supporter_entitlements.sql; only the body changes. The webhook
-- needs no change.
--
-- Tested on Postgres 17 against the 20260823 function, 8 cases: the old one
-- loses the renewal after an email change and hands it to an alt-email
-- claimant; this one keeps it, and the other six (renewal, unconfirmed squat,
-- inbox holder confirming the old address, alt with no history, soft-deleted
-- account, unknown address) answer exactly as before.

create or replace function public.kofi_match_user(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user  uuid;
begin
  if v_email = '' then
    return null;
  end if;

  -- 1. Confirmed primary address. The only authoritative match.
  select u.id into v_user
    from auth.users u
   where lower(u.email) = v_email
     and u.email_confirmed_at is not null
     and u.deleted_at is null
     and coalesce(u.is_anonymous, false) = false
   order by u.created_at
   limit 1;

  if v_user is not null then
    return v_user;
  end if;

  -- 2. The address is spoken for by SOME account (unconfirmed, soft-deleted,
  --    anonymous) — do not fall through, or the unconfirmed-signup attack
  --    reopens through the back door.
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    return null;
  end if;

  -- 3. limecore#10: the account this address has already paid for. This is
  --    what keeps a supporter's renewals after they change their login email.
  select e.user_id into v_user
    from public.supporter_entitlements e
    join auth.users u on u.id = e.user_id
   where lower(e.source_email) = v_email
     and u.deleted_at is null
     and coalesce(u.is_anonymous, false) = false
   order by e.first_supported_at
   limit 1;

  if v_user is not null then
    return v_user;
  end if;

  -- 4. Self-declared alternate. Oldest account wins a tie, deterministically,
  --    so a race between two claimants resolves the same way every retry.
  select u.id into v_user
    from auth.users u
   where lower(u.raw_user_meta_data->>'kofi_alt_email') = v_email
     and u.deleted_at is null
     and coalesce(u.is_anonymous, false) = false
   order by u.created_at
   limit 1;

  return v_user;
end;
$$;

revoke execute on function public.kofi_match_user(text)
  from public, anon, authenticated;

comment on function public.kofi_match_user(text) is
  'Resolves a Ko-fi checkout email to a user id. Confirmed primary address first; an address held by any other account matches nobody; then the account the address last paid for (survives a login-email change, limecore#10); then self-declared kofi_alt_email. Service role only.';
