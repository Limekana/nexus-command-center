-- SEC-1 — a durable rate limiter for the `ai-generate` Edge Function.
--
-- ── Why this exists ───────────────────────────────────────────────────────────
--
-- SEC-1 is "strangers building from public source write to the production
-- database." The Supabase URL and anon key have to resolve at build time for
-- F-Droid's reproducible builds, so `git clone` + a dev build yields a working
-- client pointed at production. That is Supabase's intended model — the anon
-- key identifies the project, RLS is the authorization boundary — and RLS was
-- verified at the policy level on 2026-08-01: 30 public tables, 66 policies,
-- every one resolving to `auth.uid() = user_id` or an ownership helper, no
-- `USING (true)` anywhere. The data boundary holds.
--
-- What does NOT hold is the one endpoint with a marginal cost and a shared,
-- exhaustible quota. `ai-generate` proxies Gemini on a server-side API key,
-- and its limiter had two compounding flaws:
--
--   1. The per-user window keys on the JWT `sub`. Signup is open, so rotating
--      free accounts resets the bucket at zero cost to the attacker.
--   2. The global cap lived in an in-memory Map, so it was per-isolate, not
--      per-deployment. Supabase spins up isolates on cold start, concurrent
--      load and geographic routing, so it never bounded total call volume.
--      The function's own comment said as much and named this table as the
--      fix.
--
-- Together those meant anyone who could clone the repo could exhaust the
-- project's Gemini free-tier daily request quota and hand every real user a
-- 429. Not a data breach — a cheap denial-of-service on a shipped feature,
-- and uncapped billing exposure the moment the Gemini tier stops being free.
--
-- The limiter's stated justification was "personal suite, ~2 real users."
-- There are 193 accounts as of today. That premise is what expired.
--
-- ── Shape ─────────────────────────────────────────────────────────────────────
--
-- Mirrors the rate limiter this database already has — `share_invite_rate_limits`
-- plus `check_share_invite_rate_limit()`: upsert-and-check in one statement,
-- SECURITY DEFINER, `search_path` pinned, RLS on with a deny-all policy, and
-- EXECUTE revoked so PostgREST cannot reach it.
--
-- One deliberate difference. That table keys on `(user_id, bucket date)`, so it
-- grows a row per user per day forever. This one keys on `bucket` alone and
-- resets the window in place, which bounds the table at one row per distinct
-- caller rather than one per caller-day.
--
-- Fixed windows, not sliding. A sliding window needs a row per request; a fixed
-- window needs one row total. The cost is that a caller can straddle a boundary
-- and get up to 2x the limit across it, which is fine for a quota guard whose
-- job is bounding a daily budget, not pacing individual calls.

create table if not exists public.ai_rate_limits (
  -- 'user:<uuid>' | 'user:<uuid>:day' | 'global:hour' | 'global:day'
  bucket       text primary key,
  window_start timestamptz not null default now(),
  hits         integer not null default 0
);

comment on table public.ai_rate_limits is
  'SEC-1: durable call counters for the ai-generate Edge Function. Written only '
  'by check_ai_rate_limit() under service_role; unreachable from client sessions.';

-- P2 — RLS and its policy ship in the same migration as the table, no
-- exceptions. Nothing outside `service_role` has any business here, so this is
-- the same deny-all used by share_invite_rate_limits rather than an ownership
-- predicate: the rows are infrastructure counters, not user data.
alter table public.ai_rate_limits enable row level security;

drop policy if exists deny_all_direct_access on public.ai_rate_limits;
create policy deny_all_direct_access on public.ai_rate_limits
  for all to anon, authenticated
  using (false) with check (false);

-- Counts one call against `p_bucket` and reports whether it is allowed.
--
-- Returns true when the call is within `p_limit` for the current window, false
-- when it is over. The hit is recorded either way — unlike the in-memory
-- limiter, which drops rejected calls from its window. Recording rejections
-- means a caller that keeps hammering stays blocked for the rest of the window
-- instead of trickling through as older timestamps age out, which is the
-- behaviour worth having against deliberate abuse.
create or replace function public.check_ai_rate_limit(
  p_bucket text,
  p_limit  integer,
  p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into public.ai_rate_limits as a (bucket, window_start, hits)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update
    -- Both SET expressions see the pre-update row, so they agree on whether
    -- the stored window has expired: expired resets to a fresh window at 1,
    -- live increments in place.
    set window_start = case when a.window_start < now() - p_window
                            then now() else a.window_start end,
        hits         = case when a.window_start < now() - p_window
                            then 1 else a.hits + 1 end
  returning a.hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

-- Same lesson as the L-10 trigger function and the L-7 purge: anything created
-- in `public` is exposed by PostgREST as an RPC, and a SECURITY DEFINER routine
-- that writes rows must not be callable by anon or authenticated. The Edge
-- Function reaches it with the service-role key, which bypasses these grants.
revoke execute on function public.check_ai_rate_limit(text, integer, interval)
  from public, anon, authenticated;
