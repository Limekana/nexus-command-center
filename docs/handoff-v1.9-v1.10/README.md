# Remote Work Handoff — v1.9 (SEC-1) + v1.10 (features) — NCC

**Committed 2026-08-01.** You (a remote Claude Code instance, or Emil working
from elsewhere) don't have `Projects/CLAUDE.md` or `~/.claude/CLAUDE.md` —
that root sits above any single repo, so a clone of just this one doesn't
carry it. Everything load-bearing from it is restated below. Read this whole
file before touching code.

---

## What this handoff covers

Two small milestones, both scoped 2026-08-01, both on `develop`, neither
tagged/released yet:

- **v1.9 — SEC-1 only.** A security decision (see `NEXUS_V19_BUILD_PLAN_SNAPSHOT.md`), not really NCC-specific code — it's about the shared Supabase project. Read it for context; there's nothing to build here yet, it needs the owner's sign-off on the recommended path first.
- **v1.10 — held-back features + housekeeping.** Full detail in `NEXUS_V110_BUILD_PLAN_SNAPSHOT.md`. **Your items in this repo:**
  - **Item 2** — Life/Fitness composite score reads low mid-week (pacing bug, not yet located in source).
  - **Item 3** — fitness weekly target hardcoded at 3, needs to flex — **open design question, not decided, do not build until it's picked** (static baseline vs. per-week override).
  - **Item 10 (`AUTH-2`)** — port StudyDesk's OTP code-entry step here. `OTP_MIN 6`/`OTP_MAX 10`, don't hardcode a digit count.
  - **Item 6** — icon redesign for bottom tabs, alongside StudyDesk (LimeLog's are already fine, that's the bar).
  - **None of this tags a release** — NCC stays at `1.7.2` unbumped until fdroiddata MR !41550 merges (see Suite Metadata in the snapshot). Code lands on `develop` regardless.

`NEXUS_VERSION_STATUS_SNAPSHOT.md` is the full cross-app registry — read it for the parts that aren't NCC-specific (StudyDesk's status, the standing P1–P4 priorities, all Open Blockers) since decisions here can affect or be affected by the other two apps.

---

## Standing priorities (P1–P4 from the registry — these do not expire)

- **P1 — real user data.** No destructive DDL against production without a backup first. Additive-only migrations (new nullable columns/tables, never rename/drop what a shipped app version still reads — old versions stay in the wild indefinitely via F-Droid). Migrations go through `apply_migration`, never ad-hoc SQL.
- **P2 — RLS is load-bearing.** Any new table ships with RLS + policy in the same migration, no exceptions. Re-run `get_advisors(type: security)` after every DDL change.
- **P3 — activation.** Real signups, real activation-rate tracking — see the snapshot for current numbers, they move fast, don't quote a stale figure.
- **P4 — StudyDesk is the flagship product** (owner call, 2026-08-01). Where a sequencing choice exists between StudyDesk and NCC/LimeLog, StudyDesk goes first. NCC/LimeLog items still matter, but ties break toward StudyDesk.

## Git flow (restated from `CLAUDE.md` §4, updated 2026-08-01)

- `main` (sacred, release tags only) ← `develop` (integration) ← `feature/*` (cut from develop, `--no-ff` merge).
- **Promotion to `main` is PR-only** as of 2026-07-30 — this repo is branch-protected (required status check, 0-approval PRs, `enforce_admins: true`, force-push/deletion blocked). A direct local `git checkout main && git merge --no-ff develop && git push` is rejected outright. Actual flow: push `develop` → open a PR `develop → main` → CI runs → merge (0 approvals needed) → tag. Tags are unaffected by branch protection.
- Hotfixes: `main` → `hotfix/*` → `main` (tag, via PR) + back-merge to `develop`.
- Commits: Conventional (`feat:`, `fix:`, `chore:`), explicit version bump in the commit message.

## Build gate (restated from `CLAUDE.md` §1)

- NCC: `npm run build` | `npm run cap:sync` | secrets check: `npm run check:secrets`
- Verify build **before** tagging or merging to `main`.

## Shared Data Architecture (restated from `CLAUDE.md` §2)

- Database: Supabase (`hkktorzhaqnfqsnlstda`). UUID primary keys; RLS `user_id = auth.uid()` required on every table.
- Ownership Matrix: StudyDesk owns `subjects`, `grades`, `study_sessions`, `assignments`, `exams`, `study_actions` (last three added 2026-07-30, StudyDesk-only, NCC doesn't read them). LimeLog owns `workout_sessions`, `sets` (push-only sync). **NCC is read-only for sessions; read+upsert (LWW `updated_at`) for subjects/grades — never schema-authoritative.**
- **Any schema DDL requires explicit user approval before running migrations, and must update every consumer app.** This is directly relevant to Item 4 in the v1.10 plan (LimeLog's cardio-logging fields) if NCC's score logic needs to change to count the new session shape.

## Hard forbidden actions (restated from `CLAUDE.md` §5)

- Do not run git commits inside a sandboxed execution shell (causes blob truncation) — commit from a real machine shell.
- Do not read, print, or commit `.env` or secret keys.
- Do not force-push, `git reset --hard`, or rewrite branch history.
- Do not deploy/push `limecore-site` without explicit user confirmation (not this repo, but applies suite-wide if you touch that one too).

## F-Droid note specific to this repo

NCC's fdroiddata MR (!41550) is CI-green and awaiting maintainer merge, pinned to `1.7.2`. **Do not tag a new version** until that merges — tagging now would force an MR metadata update and restart its CI queue after 23+ pipeline rounds. Code changes land on `develop` and ride the next release once the merge happens.

---

*This bundle: `README.md` (this file) + three snapshot files, taken 2026-08-01 from `D:\emilh\Projects\limecore\`. They will drift from the live registry over time — treat them as a starting point, not a live source, if this handoff is still in use more than a couple of weeks out.*
