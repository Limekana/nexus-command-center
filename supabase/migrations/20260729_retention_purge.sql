-- L-7 — scheduled hard-delete of soft-deleted rows.
--
-- APPLIED 2026-07-29 to project hkktorzhaqnfqsnlstda, with sign-off.
--
-- ── What this is for ──────────────────────────────────────────────────────────
--
-- Deleting an item in any of the three apps sets `deleted_at` rather than
-- removing the row, so the deletion can propagate to the user's other devices.
-- Nothing ever removed those tombstones, so "deleted" data sat in the database
-- indefinitely. The privacy policy was deliberately written to describe that
-- behaviour rather than promise a window nothing enforced; this is the job that
-- lets the wording be tightened.
--
-- ── Why 90 days and not 30 ────────────────────────────────────────────────────
--
-- The tombstone IS the deletion signal. Remove it before a user's second device
-- has synced and that device, seeing no row, treats its local copy as new and
-- pushes it back — the deleted item returns. So the window has to outlive a
-- realistic gap between opening two devices, and someone who does not open
-- their tablet for two months is not unusual.
--
-- 90 days also makes the first run a no-op: the oldest tombstone in the database
-- is 2026-06-27 and the first signup was 2026-05-11, so nothing yet qualifies.
-- Installing the mechanism and mass-deleting on the same day are two different
-- risks, and this separates them.
--
-- ── The part that needed care ─────────────────────────────────────────────────
--
-- Hard-deleting a tombstoned parent is NOT confined to that row. Checked
-- against the live catalog:
--
--   grades.subject_id            -> subjects            ON DELETE CASCADE
--   workout_sets.session_id      -> workout_sessions    ON DELETE CASCADE
--   budget_category_shares       -> budget_categories   ON DELETE CASCADE
--   task_shares.task_id          -> tasks               ON DELETE CASCADE
--   study_sessions.subject_id    -> subjects            ON DELETE SET NULL
--   readings.subject_id          -> subjects            ON DELETE SET NULL
--   transactions.category_id     -> budget_categories   ON DELETE SET NULL
--   transactions.account_id      -> manual_assets       ON DELETE SET NULL
--
-- So purging one soft-deleted subject would CASCADE-DELETE its grades —
-- including any grade row that is still live — and null the subject off live
-- study sessions and readings. Today that is harmless because the clients
-- soft-delete children alongside the parent: the count of live children under a
-- tombstoned parent is currently 0 across every one of those relationships,
-- verified before writing this.
--
-- But that is a client behaviour, not a structural guarantee. One client bug, or
-- one half-synced device, and the job would quietly destroy live coursework.
-- Every parent delete below is therefore guarded by a NOT EXISTS over its live
-- children. A guarded parent is skipped, keeps its tombstone, and shows up in
-- `soft_deleted_pending()` — visible and recoverable, rather than silently
-- destructive.
--
-- `archived_at` on `subjects` and `habits` is deliberately NOT touched.
-- Archiving is "keep but hide", a state the user can undo. It is not a deletion
-- and must never be purged.

create extension if not exists pg_cron;

-- ── Read-only preview ─────────────────────────────────────────────────────────
-- What a purge would remove right now, without removing it. Use this before
-- changing the window, and to see anything the guards are holding back.
create or replace function public.soft_deleted_pending(retain interval default '90 days')
returns table (table_name text, eligible bigint, blocked_by_live_children bigint)
language sql
security definer
set search_path = public, pg_catalog
as $$
  with cutoff as (select now() - retain as ts)
  select 'subjects',
         count(*) filter (where not exists (
           select 1 from grades g where g.subject_id = s.id and g.deleted_at is null
           union all select 1 from study_sessions ss where ss.subject_id = s.id and ss.deleted_at is null
           union all select 1 from readings r where r.subject_id = s.id and r.deleted_at is null)),
         count(*) filter (where exists (
           select 1 from grades g where g.subject_id = s.id and g.deleted_at is null
           union all select 1 from study_sessions ss where ss.subject_id = s.id and ss.deleted_at is null
           union all select 1 from readings r where r.subject_id = s.id and r.deleted_at is null))
    from subjects s, cutoff where s.deleted_at is not null and s.deleted_at < cutoff.ts
  union all
  select 'budget_categories',
         count(*) filter (where not exists (select 1 from transactions t where t.category_id = bc.id and t.deleted_at is null)),
         count(*) filter (where exists     (select 1 from transactions t where t.category_id = bc.id and t.deleted_at is null))
    from budget_categories bc, cutoff where bc.deleted_at is not null and bc.deleted_at < cutoff.ts
  union all
  select 'manual_assets',
         count(*) filter (where not exists (select 1 from transactions t where (t.account_id = ma.id or t.destination_account_id = ma.id) and t.deleted_at is null)),
         count(*) filter (where exists     (select 1 from transactions t where (t.account_id = ma.id or t.destination_account_id = ma.id) and t.deleted_at is null))
    from manual_assets ma, cutoff where ma.deleted_at is not null and ma.deleted_at < cutoff.ts
  union all
  select t.tbl, t.n, 0::bigint from (
    select 'goals'::text tbl, count(*) n from goals, cutoff where deleted_at is not null and deleted_at < cutoff.ts
    union all select 'grades', count(*) from grades, cutoff where deleted_at is not null and deleted_at < cutoff.ts
    union all select 'portfolio_lots', count(*) from portfolio_lots, cutoff where deleted_at is not null and deleted_at < cutoff.ts
    union all select 'readings', count(*) from readings, cutoff where deleted_at is not null and deleted_at < cutoff.ts
    union all select 'study_sessions', count(*) from study_sessions, cutoff where deleted_at is not null and deleted_at < cutoff.ts
    union all select 'tasks', count(*) from tasks, cutoff where deleted_at is not null and deleted_at < cutoff.ts
    union all select 'transactions', count(*) from transactions, cutoff where deleted_at is not null and deleted_at < cutoff.ts
    union all select 'watchlist_items', count(*) from watchlist_items, cutoff where deleted_at is not null and deleted_at < cutoff.ts
    union all select 'workout_sessions', count(*) from workout_sessions, cutoff where deleted_at is not null and deleted_at < cutoff.ts
  ) t
$$;

-- ── The purge ─────────────────────────────────────────────────────────────────
-- Returns what it removed, so a scheduled run leaves an inspectable result in
-- cron.job_run_details rather than deleting silently.
create or replace function public.purge_soft_deleted(retain interval default '90 days')
returns table (table_name text, purged bigint)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  cutoff timestamptz := now() - retain;
  n bigint;
begin
  -- Children first, so a parent that only had soft-deleted children becomes
  -- eligible in the same run rather than waiting for the next one.
  delete from grades          where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'grades'; purged := n; return next;

  delete from study_sessions  where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'study_sessions'; purged := n; return next;

  delete from readings        where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'readings'; purged := n; return next;

  delete from transactions    where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'transactions'; purged := n; return next;

  -- Parents, each guarded: skip any row that still has a LIVE child, because
  -- the FKs above would cascade-delete or null it.
  delete from subjects s
   where s.deleted_at is not null and s.deleted_at < cutoff
     and not exists (select 1 from grades g         where g.subject_id  = s.id and g.deleted_at  is null)
     and not exists (select 1 from study_sessions ss where ss.subject_id = s.id and ss.deleted_at is null)
     and not exists (select 1 from readings r        where r.subject_id  = s.id and r.deleted_at  is null);
  get diagnostics n = row_count; table_name := 'subjects'; purged := n; return next;

  delete from budget_categories bc
   where bc.deleted_at is not null and bc.deleted_at < cutoff
     and not exists (select 1 from transactions t where t.category_id = bc.id and t.deleted_at is null);
  get diagnostics n = row_count; table_name := 'budget_categories'; purged := n; return next;

  delete from manual_assets ma
   where ma.deleted_at is not null and ma.deleted_at < cutoff
     and not exists (select 1 from transactions t
                      where (t.account_id = ma.id or t.destination_account_id = ma.id)
                        and t.deleted_at is null);
  get diagnostics n = row_count; table_name := 'manual_assets'; purged := n; return next;

  -- No inbound FK from anything with its own lifecycle. workout_sets and
  -- task_shares cascade from these by design: a set belongs to its session and
  -- a share belongs to its task, so neither outlives its parent.
  delete from goals            where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'goals'; purged := n; return next;

  delete from portfolio_lots   where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'portfolio_lots'; purged := n; return next;

  delete from tasks            where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'tasks'; purged := n; return next;

  delete from watchlist_items  where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'watchlist_items'; purged := n; return next;

  delete from workout_sessions where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'workout_sessions'; purged := n; return next;
end;
$$;

-- Neither function belongs on the public API. Same lesson as the L-10 trigger
-- function: anything created in `public` is exposed by PostgREST as an RPC, and
-- a SECURITY DEFINER routine that deletes rows must not be callable by anon or
-- authenticated.
revoke execute on function public.soft_deleted_pending(interval) from public, anon, authenticated;
revoke execute on function public.purge_soft_deleted(interval)  from public, anon, authenticated;

-- Weekly, Sunday 03:15 UTC. Weekly rather than nightly because the window is 90
-- days — running it 7x more often buys nothing and just adds 6 more chances to
-- fire while something else is mid-migration.
select cron.schedule('purge-soft-deleted', '15 3 * * 0',
                     $$select public.purge_soft_deleted()$$);
