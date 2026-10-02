-- limecore#16 — checks for 20260926_client_errors.sql, run against a real
-- Postgres, never production.
--
-- Run (throwaway container):
--   docker run -d --rm --name cetest -e POSTGRES_PASSWORD=x postgres:17
--   docker cp supabase cetest:/work
--   docker exec cetest psql -U postgres -q \
--     -f /work/tests/client_errors.fixture.sql \
--     -f /work/migrations/20260926_client_errors.sql \
--     -f /work/tests/client_errors.test.sql
--   docker rm -f cetest
--
-- One PASS/FAIL line per check, then a summary; the final RAISE makes psql exit
-- non-zero if anything failed.

\set ON_ERROR_STOP 1
set client_min_messages = notice;
\o /dev/null

create table public.t_results (label text, ok boolean);
grant insert on public.t_results to public;
create function public.t_check(label text, ok boolean) returns void language plpgsql as $$
begin
  insert into public.t_results values (label, coalesce(ok, false));
  raise notice '% %', case when coalesce(ok, false) then 'PASS' else 'FAIL' end, label;
end $$;
create function public.t_rows(stmt text) returns int language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
create function public.t_refused(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when insufficient_privilege then
  return true;
end $$;
grant all on public.client_errors to anon, authenticated;  -- as Supabase's default grants do

\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
insert into auth.users values (:A), (:B);

-- ── Shape ─────────────────────────────────────────────────────────────────
select public.t_check('RLS is enabled on client_errors',
  (select relrowsecurity from pg_class where oid = 'public.client_errors'::regclass));
select public.t_check('exactly two policies: insert-own and select-own, both wrapped',
  (select count(*) = 2 and bool_and(coalesce(qual, with_check) like '%( SELECT auth.uid() AS uid)%')
     from pg_policies where tablename = 'client_errors'));
select public.t_check('the cap function is not callable by API roles',
  not has_function_privilege('authenticated', 'private.client_errors_cap()', 'execute')
  and not has_function_privilege('anon', 'private.client_errors_cap()', 'execute'));

-- ── As user A ─────────────────────────────────────────────────────────────
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false);

select public.t_check('A can send a report (user_id defaults to A)',
  public.t_rows($q$insert into public.client_errors (app, fingerprint, error_name, message)
                  values ('ncc', 'TypeError@App.tsx:1', 'TypeError', 'x is undefined')$q$) = 1);
select public.t_check('A cannot send a report as B',
  public.t_refused(format($q$insert into public.client_errors (user_id, app, fingerprint) values (%L, 'ncc', 'f')$q$, :B)));
select public.t_check('an unknown app is rejected',
  (select public.t_refused('select 1') = false) and exists (
    select 1 from pg_constraint where conrelid = 'public.client_errors'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%ncc%studydesk%limelog%'));
select public.t_check('a message over 500 characters is rejected by the column limit',
  (select count(*) from public.client_errors where char_length(message) > 500) = 0);
do $$
begin
  begin
    insert into public.client_errors (app, fingerprint, message) values ('ncc', 'f', repeat('x', 501));
    perform public.t_check('oversize message insert fails', false);
  exception when check_violation then
    perform public.t_check('oversize message insert fails', true);
  end;
end $$;
-- Write and read in separate statements: in one, Postgres may evaluate the
-- read (an InitPlan) before the write.
insert into public.client_errors (app, fingerprint, created_at)
  values ('ncc', 'backdated', now() - interval '10 days');
select public.t_check('created_at is the server''s, not the client''s (no backdating)',
  (select created_at > now() - interval '1 minute' from public.client_errors where fingerprint = 'backdated'));
select public.t_check('A reads back only A''s reports',
  (select count(*) = 2 and bool_and(user_id = :A) from public.client_errors));
select public.t_check('A cannot edit a report (0 rows)',
  public.t_rows($q$update public.client_errors set message = 'edited'$q$) = 0);
select public.t_check('A cannot delete a report (0 rows)',
  public.t_rows($q$delete from public.client_errors$q$) = 0);

-- The cap: 50 per day. A already has 2; 60 more attempts land 48.
do $$
begin
  for i in 1..60 loop
    insert into public.client_errors (app, fingerprint) values ('studydesk', 'loop-' || i);
  end loop;
end $$;
select public.t_check('the 50-a-day cap drops the rest silently',
  (select count(*) = 50 from public.client_errors));

-- ── As user B, and signed out ─────────────────────────────────────────────
select set_config('request.jwt.claim.sub', :B, false);
select public.t_check('B sees none of A''s reports',
  (select count(*) = 0 from public.client_errors));
select public.t_check('B has a separate daily allowance',
  public.t_rows($q$insert into public.client_errors (app, fingerprint) values ('limelog', 'b1')$q$) = 1);

select set_config('request.jwt.claim.sub', '', false);
set role anon;
select public.t_check('a signed-out caller cannot send a report (guests send nothing)',
  public.t_refused($q$insert into public.client_errors (user_id, app, fingerprint) values (null, 'ncc', 'g')$q$)
  or (select count(*) = 0 from public.client_errors));
select public.t_check('a signed-out caller reads nothing',
  (select count(*) = 0 from public.client_errors));
reset role;

-- ── Retention and account deletion ────────────────────────────────────────
update public.client_errors set created_at = now() - interval '91 days' where fingerprint like 'loop-%';
create temp table purge_run as select * from public.purge_soft_deleted();
select public.t_check('the weekly purge removes reports older than 90 days, and says so',
  (select purged = 48 from purge_run where table_name = 'client_errors'));
select public.t_check('it keeps the recent ones',
  (select count(*) = 3 from public.client_errors));
select public.t_check('the purge still reports all 12 tables it did before, plus client_errors',
  (select count(*) = 13 from purge_run)
  and (select array_agg(table_name order by table_name) from purge_run) =
      array['budget_categories','client_errors','goals','grades','manual_assets','portfolio_lots','readings',
            'study_sessions','subjects','tasks','transactions','watchlist_items','workout_sessions']);

delete from auth.users where id = :A;
select public.t_check('deleting the account deletes its reports',
  (select count(*) = 0 from public.client_errors where user_id = :A)
  and (select count(*) = 1 from public.client_errors where user_id = :B));

\o
do $$
declare
  passed int;
  total int;
begin
  select count(*) filter (where ok), count(*) into passed, total from public.t_results;
  raise notice '% / % checks passed', passed, total;
  if passed < total then
    raise exception 'limecore#16 migration tests failed';
  end if;
end $$;
