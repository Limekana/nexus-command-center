-- L-10 — close the audit_log erasure gap (GDPR Art. 17).
--
-- APPLIED 2026-07-29 to project hkktorzhaqnfqsnlstda, with sign-off, as
-- migrations `audit_log_erasure` and `audit_log_erasure_revoke_rpc`.
--
-- Verified by catalog read (see the footer). NOT verified behaviourally: doing
-- that means deleting an account, and every account on this project is a real
-- person's (SEC-1). 140 audit rows before and after, unchanged.
--
-- ── The defect ────────────────────────────────────────────────────────────────
--
-- public.audit_log.changed_by declares ON DELETE SET NULL (confdeltype = 'n',
-- verified against the live catalog). When an account is deleted, every table
-- that declares ON DELETE CASCADE from auth.users loses its rows — but audit_log
-- keeps its rows and merely nulls the pointer.
--
-- The queue recorded this as "content survives, merely un-attributed". That
-- undersells it. The audit trigger snapshots whole rows, so the payload carries
-- its own copy of the owner:
--
--   140 rows total     138 with new_values->>'user_id'
--                      113 with old_values->>'user_id'
--                      119 containing a task title
--                       21 containing a budget category name
--
-- The row therefore stays fully attributable to the deleted user after the FK is
-- nulled. Nothing is anonymised; one of two pointers is removed. The table's own
-- RLS policy is the proof, because it reads through the payload as a second
-- path:
--
--   changed_by = auth.uid()
--   OR coalesce(new_values->>'user_id', old_values->>'user_id')::uuid = auth.uid()
--
-- ── Why this shape of fix ─────────────────────────────────────────────────────
--
-- The delete-account Edge Function deliberately holds no list of tables to
-- clear, and says why: "an explicit delete list is a thing you forget to update,
-- and the failure is silent." That principle is correct, and audit_log is the
-- proof of it — the gap exists precisely because this one table opted out of the
-- cascade the function relies on. So the fix belongs in the database, not in a
-- new delete list in the function.
--
-- Two statements, because there are two attribution paths and the FK can only
-- see one of them:
--
--   1. changed_by → ON DELETE CASCADE. Covers the common case, enforced by the
--      database, and works for a deletion made through any route — the Edge
--      Function, the Supabase dashboard, or raw SQL.
--
--   2. A BEFORE DELETE trigger on auth.users for the payload path. Needed
--      because a shared budget or task can be edited by someone other than its
--      owner: changed_by = the editor, payload user_id = the owner. Deleting the
--      owner would otherwise leave their task titles behind under the editor's
--      id, and deleting the editor would take away a row documenting a change
--      to data that is still live. There are zero such rows today, but sharing
--      is a shipped feature, so this is a hole waiting rather than a hypothesis.
--
-- The trigger condition is deliberately identical to the RLS SELECT policy
-- above, which gives the table a property worth stating plainly: anything a user
-- can read about themselves is exactly what erasure removes.

begin;

-- 1. changed_by: SET NULL → CASCADE.
alter table public.audit_log
  drop constraint if exists audit_log_changed_by_fkey;

alter table public.audit_log
  add constraint audit_log_changed_by_fkey
  foreign key (changed_by) references auth.users (id) on delete cascade;

-- 2. The payload path. SECURITY DEFINER because the trigger runs while the
--    auth.users row is being deleted and must not be subject to audit_log's RLS.
create or replace function public.erase_audit_log_for_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  delete from public.audit_log
   where changed_by = old.id
      or coalesce(new_values ->> 'user_id', old_values ->> 'user_id')::uuid = old.id;
  return old;
end;
$$;

drop trigger if exists erase_audit_log_before_user_delete on auth.users;

create trigger erase_audit_log_before_user_delete
  before delete on auth.users
  for each row
  execute function public.erase_audit_log_for_user();

-- 3. Applied as a follow-up after the security advisor flagged it, and folded
--    in here so the file is reproducible from scratch.
--
--    Creating the function in `public` made PostgREST expose it at
--    /rest/v1/rpc/erase_audit_log_for_user, callable by anon and authenticated
--    as SECURITY DEFINER. Calling it directly would fail anyway ("trigger
--    functions can only be called as triggers"), so this was hygiene rather
--    than a live hole — but a SECURITY DEFINER function has no business being
--    reachable from the public API, and the advisor was right to say so.
--
--    Safe for the trigger: PostgreSQL checks EXECUTE on a trigger function at
--    CREATE TRIGGER time, not on each fire, and the deletion path runs as the
--    service role regardless.
revoke execute on function public.erase_audit_log_for_user() from public;
revoke execute on function public.erase_audit_log_for_user() from anon;
revoke execute on function public.erase_audit_log_for_user() from authenticated;

commit;

-- ── Verification — run 2026-07-29, all green ─────────────────────────────────
--
--   select confdeltype from pg_constraint
--    where conname = 'audit_log_changed_by_fkey';           -- 'c'    ✓ (was 'n')
--
--   select tgenabled, tgtype from pg_trigger
--    where tgname = 'erase_audit_log_before_user_delete';   -- 'O', BEFORE ROW DELETE ✓
--
--   select has_function_privilege('anon', oid, 'EXECUTE'),
--          has_function_privilege('authenticated', oid, 'EXECUTE')
--     from pg_proc where proname = 'erase_audit_log_for_user';  -- false, false ✓
--
--   select count(*) from public.audit_log;                  -- 140, unchanged ✓
--
-- The security advisor is back to its one pre-existing warning (leaked-password
-- protection, which is owner action O-6).
--
-- NOT verified behaviourally, and deliberately so: proving the trigger fires
-- means deleting an account, and every account on this project belongs to a
-- real person (SEC-1). If you ever want that proof, take it on a Supabase
-- branch, never here.
