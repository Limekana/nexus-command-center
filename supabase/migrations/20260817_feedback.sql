-- v1.10 — in-app feedback channel for all three suite apps.
--
-- ── Why this table, and why here ──────────────────────────────────────────────
--
-- The suite had no way for a user to say anything back. The apps are public
-- (F-Droid, GitHub) and the account count passed 193 on 2026-08-01, so "I'll
-- hear about problems because I am the only user" stopped being true a while
-- ago. Everything reaching the owner today does so out of band, which means
-- most of it does not reach them at all.
--
-- It lives in the NCC migrations directory because it is suite infrastructure
-- rather than any one app's domain, and NCC already hosts the other suite-level
-- backend surface (the `suite-session` Edge Function). This is NOT a case of
-- NCC becoming schema-authoritative over another app's data: no app reads
-- another app's feedback, and the ownership matrix in CLAUDE.md is untouched.
-- All three apps write here; none of them reads anyone else's row, because RLS
-- makes that impossible.
--
-- ── Shape ─────────────────────────────────────────────────────────────────────
--
-- Append-only from the client's point of view: there is a SELECT policy and an
-- INSERT policy and deliberately no UPDATE or DELETE policy, so a submitted
-- report cannot be quietly edited or withdrawn from the app. RLS with no
-- policy for a command denies that command, so the omission IS the rule.
--
-- `id` is supplied by the client, not defaulted server-side, so the offline
-- outbox can retry an insert that may or may not have landed the first time.
-- The primary key makes the retry idempotent — the same submission upserts
-- onto itself instead of arriving twice. That is the same trick every other
-- queued operation in this suite uses, and it is the reason `id` is not
-- `default gen_random_uuid()`.
--
-- CHECK constraints are here rather than only in the UI because the anon key
-- plus a clone of the public source is a perfectly good API client. The
-- database is the only place a length bound actually holds.

create table if not exists public.feedback (
  id           uuid primary key,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  app          text        not null check (app in ('ncc', 'limelog', 'studydesk')),
  app_version  text        check (app_version is null or char_length(app_version) <= 32),
  platform     text        check (platform is null or char_length(platform) <= 32),
  category     text        not null check (category in ('bug', 'idea', 'praise', 'other')),
  rating       smallint    check (rating is null or rating between 1 and 5),
  message      text        not null check (char_length(message) between 1 and 4000),
  created_at   timestamptz not null default now()
);

alter table public.feedback enable row level security;

-- A user can read back what they sent — the app shows "your previous reports"
-- so a person can see their report was recorded rather than wondering.
create policy feedback_select_own
  on public.feedback for select
  using (user_id = auth.uid());

-- The WITH CHECK is what stops a caller writing a row attributed to somebody
-- else; without it the anon key would be enough to forge feedback as any user
-- whose id was known.
create policy feedback_insert_own
  on public.feedback for insert
  with check (user_id = auth.uid());

-- No UPDATE policy and no DELETE policy: see the note above. Erasure still
-- works, via ON DELETE CASCADE from auth.users when the account is deleted
-- through the `delete-account` function.

create index if not exists feedback_user_created_idx
  on public.feedback (user_id, created_at desc);

-- Reading everyone's feedback is an owner task done through the dashboard or a
-- service-role query, deliberately not something any shipped client can do.
