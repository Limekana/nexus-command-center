-- limecore#16 — opt-in, self-hosted error reports for all three apps.
--
-- Design decided 2026-09-21 (CTO + owner), and bound by the v1.16 privacy
-- policy (#50), which describes exactly this:
--   - Self-hosted here. No third-party crash SDK (that would earn an F-Droid
--     `Tracking` anti-feature and contradict the policy).
--   - Opt-in, off by default; accounts only. Guests send nothing, so there is
--     no anonymous insert path for the public anon key to spam (SEC-1 class).
--   - The client scrubs and truncates before sending; the column limits below
--     enforce the same ceilings server-side, so a modified client cannot store
--     more than the policy says.
--   - At most 50 reports per user per day, dropped silently past that.
--   - Kept 90 days, purged by the existing weekly job.
--   - Deleted with the account (FK cascade: delete-account uses
--     auth.admin.deleteUser) and included in the user's export.
--
-- ONE deliberate deviation from the issue text, flagged for review: #16 says
-- "insert-own only, no select", but its own acceptance requires that "export
-- contains them", which a user cannot do without reading their rows. So users
-- may SELECT their own reports (never anyone else's), and still cannot
-- update or delete them. Reading back what you sent is not a risk; an export
-- that silently omits it would contradict the policy.
--
-- P1: a new table only, plus one added statement in purge_soft_deleted(); no
-- existing column changes. P2: RLS and policies in this same migration.
-- Tested against Postgres 17: supabase/tests/client_errors.test.sql.
-- NOT yet applied to production — owner confirms before `apply_migration`.

-- ── Guard: only extend the purge function we have actually read ─────────────
-- purge_soft_deleted() is rewritten below with one added block. Replacing a
-- version of it that changed since 2026-09-26 would silently undo that change,
-- so the migration refuses to run unless the live body is the one this file
-- was written against.
do $$
begin
  if md5(pg_get_functiondef('public.purge_soft_deleted(interval)'::regprocedure))
       <> '94fb1f3617dc7b2635992b200a2b12ee' then
    raise exception 'limecore#16: purge_soft_deleted() changed since 2026-09-26; re-read it and update this migration';
  end if;
end $$;

-- ── The table ────────────────────────────────────────────────────────────────
create table if not exists public.client_errors (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  app          text        not null check (app in ('ncc', 'studydesk', 'limelog')),
  app_version  text        check (app_version is null or char_length(app_version) <= 32),
  platform     text        check (platform is null or char_length(platform) <= 32),
  os_version   text        check (os_version is null or char_length(os_version) <= 120),
  error_name   text        check (error_name is null or char_length(error_name) <= 120),
  message      text        check (message is null or char_length(message) <= 500),
  stack        text        check (stack is null or char_length(stack) <= 4000),
  screen       text        check (screen is null or char_length(screen) <= 200),
  fingerprint  text        not null check (char_length(fingerprint) between 1 and 200),
  created_at   timestamptz not null default now()
);

create index if not exists client_errors_user_created_idx
  on public.client_errors (user_id, created_at desc);

alter table public.client_errors enable row level security;

create policy client_errors_insert_own
  on public.client_errors for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy client_errors_select_own
  on public.client_errors for select to authenticated
  using ((select auth.uid()) = user_id);
-- No update or delete policy: with RLS on, both are denied to every API role.

-- ── 50 per user per day ───────────────────────────────────────────────────────
-- A crash loop on one device must not become thousands of rows. Past the cap
-- the insert is dropped silently (RETURN NULL), so the client sees success and
-- has nothing to retry. created_at is set here, not trusted from the client,
-- so the window cannot be dodged by backdating.
create or replace function private.client_errors_cap()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  new.created_at := now();
  if (select count(*) from public.client_errors
       where user_id = new.user_id and created_at > now() - interval '1 day') >= 50 then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function private.client_errors_cap() from public, anon, authenticated;

create trigger client_errors_cap
  before insert on public.client_errors
  for each row execute function private.client_errors_cap();

-- ── 90-day retention, in the existing weekly job ────────────────────────────
-- cron job 1 runs `select public.purge_soft_deleted()` on Sundays at 03:15
-- UTC. Everything above the client_errors block is the live body as read on
-- 2026-09-26 (see the guard), unchanged.
create or replace function public.purge_soft_deleted(retain interval default '90 days'::interval)
 returns table(table_name text, purged bigint)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_catalog'
as $function$
declare
  cutoff timestamptz := now() - retain;
  n bigint;
begin
  delete from grades          where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'grades'; purged := n; return next;

  delete from study_sessions  where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'study_sessions'; purged := n; return next;

  delete from readings        where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'readings'; purged := n; return next;

  delete from transactions    where deleted_at is not null and deleted_at < cutoff;
  get diagnostics n = row_count; table_name := 'transactions'; purged := n; return next;

  -- CHANGED: guard extended from 3 children to all 8. `assignments` and
  -- `exams` are the load-bearing additions — they are ON DELETE CASCADE, so
  -- omitting them is what made this function destructive rather than merely
  -- incomplete.
  delete from subjects s
   where s.deleted_at is not null and s.deleted_at < cutoff
     and not exists (select 1 from grades g            where g.subject_id  = s.id and g.deleted_at  is null)
     and not exists (select 1 from study_sessions ss   where ss.subject_id = s.id and ss.deleted_at is null)
     and not exists (select 1 from readings r          where r.subject_id  = s.id and r.deleted_at  is null)
     and not exists (select 1 from assignments a       where a.subject_id  = s.id and a.deleted_at  is null)
     and not exists (select 1 from exams e             where e.subject_id  = s.id and e.deleted_at  is null)
     and not exists (select 1 from study_actions sa    where sa.subject_id = s.id and sa.deleted_at is null)
     and not exists (select 1 from timetable_entries t where t.subject_id  = s.id and t.deleted_at  is null)
     and not exists (select 1 from planned_sessions p  where p.subject_id  = s.id and p.deleted_at  is null);
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

  -- limecore#16: error reports are kept for the retention window, then go.
  -- Not a soft delete: a report is removed by age alone.
  delete from client_errors    where created_at < cutoff;
  get diagnostics n = row_count; table_name := 'client_errors'; purged := n; return next;
end;
$function$;
