-- v1.11 Monetization — supporter entitlements, written only by a verified Ko-fi webhook.
--
-- ── What this is, and what it deliberately is not ────────────────────────────
--
-- This grants cosmetic perks: alternate themes and a supporter badge. It is an
-- HONESTY MECHANISM, NOT A LICENCE ENFORCEMENT BOUNDARY, and the distinction
-- decides how much machinery is justified here.
--
-- All three apps are open source and distributed through F-Droid, which builds
-- them FROM SOURCE. The themes ship inside the APK. Anyone who wants the paid
-- themes without paying can read the check, delete it, and build. That is not a
-- hole to be plugged — it is what shipping GPL-adjacent FOSS means, and any
-- attempt to obfuscate it would fail against a reproducible-builds pipeline
-- whose entire purpose is proving the binary matches the readable source.
--
-- So: no device attestation, no signed entitlement blobs, no obfuscation. The
-- client-side gate is a courtesy latch.
--
-- What IS defended, rigorously, is the DATA. A row here says a real person paid
-- real money, and it must be impossible to forge one, to grant yourself one, or
-- to take someone else's. Hence: no client write path of any kind, a webhook
-- that verifies before it reads, and matching rules that cannot be aimed at
-- another account.
--
-- ── Why there is no `active` boolean ─────────────────────────────────────────
--
-- The build plan specified `(user_id, tier, active, alt_email)`. Two of those
-- do not survive contact with how Ko-fi actually behaves.
--
-- `active` cannot work as a boolean. Ko-fi's webhook fires on PAYMENT events.
-- A membership that lapses, expires or is cancelled produces no webhook at all,
-- so a boolean set true on payment has nothing that would ever set it false —
-- every supporter would be entitled forever after one month. `expires_at`
-- inverts that: each payment pushes the date forward, and a lapse expires on
-- its own with no event required. Liveness is `expires_at > now()`.
--
-- `alt_email` cannot live on this table. The whole point of the alt-email
-- fallback is that a user sets it BEFORE they are matched — but this table has
-- no client write path, and creating one to hold a self-declared string would
-- put a writable column on the entitlement record itself. It lives in the
-- user's own auth metadata instead (the mechanism `limecore_origin` and
-- `referral_source` already use), where the user can write their own and no
-- one else's, and where it needs no DDL at all.
--
-- ── Shape ────────────────────────────────────────────────────────────────────
--
-- One row per user, keyed on the user. RLS on, with a SELECT policy and
-- DELIBERATELY NO INSERT, UPDATE OR DELETE POLICY: under RLS, a command with no
-- policy is denied, so the omission IS the rule. The only writer is the Edge
-- Function, which holds the service role and bypasses RLS by design.
--
-- EXECUTE/INSERT/UPDATE/DELETE are also revoked from `anon` and `authenticated`
-- so PostgREST will not even offer the verbs.
--
-- `on delete cascade` ties entitlement lifetime to the account, so the existing
-- account-deletion path erases it with everything else and no separate erasure
-- step is needed.

create table if not exists public.supporter_entitlements (
  -- The account, and the primary key. One entitlement per user; a second
  -- payment updates this row rather than adding another.
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Ko-fi's `tier_name`, verbatim and untrusted for anything but display and
  -- which perk set to unlock. Never parsed for money.
  tier text not null,

  -- Liveness. Each verified payment sets this to payment time + one billing
  -- period + grace. See the Edge Function for why the grace exists.
  expires_at timestamptz not null,

  -- Which address matched, so an unmatched or mis-matched payment can be
  -- diagnosed later without going back to Ko-fi's dashboard.
  source_email text not null,

  -- Ko-fi's `message_id`. Webhooks retry; this makes a replayed delivery
  -- diagnosable, and the upsert idempotent in practice.
  kofi_message_id text,

  first_supported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.supporter_entitlements is
  'Cosmetic supporter perks. Written ONLY by the verified kofi-webhook Edge Function; no client write path exists. Liveness is expires_at > now(), not a boolean — Ko-fi emits no cancellation event.';

alter table public.supporter_entitlements enable row level security;

-- The only thing a client may do. Scoped to the caller's own row, which is the
-- same predicate every other table in this project uses (P2).
drop policy if exists supporter_entitlements_select_own on public.supporter_entitlements;
create policy supporter_entitlements_select_own on public.supporter_entitlements
  for select to authenticated
  using (auth.uid() = user_id);

-- No INSERT / UPDATE / DELETE policy, on purpose. Do not add one.

-- Defence in depth over RLS. Supabase's default privileges hand every new table
-- in `public` full rights to anon, authenticated AND service_role — which is why
-- `ai_rate_limits` still carries anon=arwdDxtm despite being a deny-all table and
-- relies on RLS alone. Stripping the verbs here means PostgREST does not even
-- advertise INSERT/UPDATE/DELETE on this table, so a policy mistake later cannot
-- quietly open a write path. service_role is untouched, which is how the Edge
-- Function keeps its upsert.
revoke all on public.supporter_entitlements from anon, authenticated;
grant select on public.supporter_entitlements to authenticated;

-- Reading your own entitlement is a per-app-launch operation on a
-- single-row-per-user table, so the primary key already serves it. No further
-- index is warranted and adding one would only cost writes.

-- ── Matching a Ko-fi payment to an account ───────────────────────────────────
--
-- Lives in SQL rather than in the Edge Function for two reasons: the GoTrue
-- admin API has no "get user by email", so doing it in TypeScript would mean
-- paginating every user on every webhook; and the ordering rules below are
-- security-relevant enough to want in one atomic, reviewable place.
--
-- SECURITY DEFINER because it reads `auth.users`, which the caller cannot.
-- `search_path` is pinned so a shadowing object in a caller-controlled schema
-- cannot redirect the lookups, and EXECUTE is revoked from every client role —
-- only the service role reaches it, which means PostgREST will not expose it.
--
-- ── The two attacks this ordering exists to stop ─────────────────────────────
--
-- 1. UNCONFIRMED-SIGNUP INTERCEPTION. Signup is open. Without the
--    `email_confirmed_at` requirement, anyone could register an account using a
--    supporter's Ko-fi checkout address, never confirm it, and collect that
--    supporter's entitlement on the next renewal. Requiring a confirmed address
--    means the match is only ever made against an address Supabase has seen the
--    holder prove control of. This is the single most important line here.
--
-- 2. ALT-EMAIL CLAIM-JUMPING. `kofi_alt_email` is self-declared in the user's
--    own metadata, so it is an assertion, not a proof. It is therefore consulted
--    ONLY when no confirmed primary matched, and is refused outright if the
--    address belongs to any account at all — including a soft-deleted one —
--    because otherwise a user could name a stranger's checkout address and
--    receive their perk.
--
-- Anonymous users are excluded: they have no real address to match on.
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
  --    anonymous) — do not fall through to the self-declared path, or the
  --    unconfirmed-signup attack reopens through the back door.
  if exists (select 1 from auth.users u where lower(u.email) = v_email) then
    return null;
  end if;

  -- 3. Self-declared alternate. Oldest account wins a tie, deterministically,
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

-- Same lesson as check_ai_rate_limit: anything created in `public` is exposed by
-- PostgREST as an RPC, and a SECURITY DEFINER routine that reads auth.users must
-- not be callable by anon or authenticated. The Edge Function reaches it with the
-- service-role key, whose grant is deliberately left in place.
revoke execute on function public.kofi_match_user(text)
  from public, anon, authenticated;

comment on function public.kofi_match_user(text) is
  'Resolves a Ko-fi checkout email to a user id. Confirmed primary address only; self-declared kofi_alt_email is a fallback and is refused if the address belongs to any account. Service role only.';
