# Limecore Nexus OS Suite — Version Status Registry

> **Central coordination file.** Builders read/write at version completion. CTO pulls for cross-app decisions and milestone planning. Full build notes and resolved bug history in **NEXUS_CHANGELOG_ARCHIVE.md**.

---

## 🔴 PERMANENT PRIORITIES — WE HAVE REAL USERS

> Established 2026-07-26. These are standing constraints, not milestone items. They do not get closed. Every release from here forward is checked against them.

**Context:** the Supabase project (`Nexus OS Suite`, ref `hkktorzhaqnfqsnlstda`) holds real signup accounts, arriving steadily since 2026-07-07 — **178 as of the last count, see `P3` for the current figure.** These are strangers, not test accounts. The era of casual production changes is over.

> ⚠️ **Corrected 2026-07-26:** this section previously attributed the arrivals to "F-Droid discovery." That is not supported — the surge (45 signups week of 07-06, 39 week of 07-13) predates StudyDesk's fdroiddata merge on 07-25, and NCC/LimeLog are still unmerged, so F-Droid was distributing nothing during the surge. 83 of the 103 signed up via Google OAuth, which also does not fit an F-Droid audience. **The acquisition channel is currently unknown** — tracked as `ACT-5`.

### P1 — Schema migrations can now destroy other people's data

Real accounts hold real rows. A careless `ALTER TABLE`, column rename, or type change on production silently breaks live installs that are still running an older app version.

- No destructive DDL against production without a backup first.
- Additive-only by default: new nullable columns, new tables. Never rename or drop a column that a shipped app version still reads.
- Old app versions stay in the wild indefinitely on F-Droid — users update on their own schedule, or never. **Every schema change must remain backward-compatible with the oldest app version still plausibly installed.**
- Migrations go through `apply_migration`, never ad-hoc SQL against prod.

### P2 — RLS is now load-bearing security, not a formality

RLS is the only thing separating one stranger's grades, workouts, and financial holdings from another's. A policy hole is a real data breach affecting real people, not a bug.

- Status 2026-08-01: RLS enabled on all **30** public tables ✅ — the 27 figure predates `assignments`, `exams` and `study_actions`.
- **Verified at the policy level 2026-08-01, not just by advisor.** All 66 policies resolve to `auth.uid() = user_id` or an explicit ownership helper; **no `USING (true)` anywhere**; `private.*` share helpers are all `SECURITY DEFINER` with `search_path` pinned to `''`; the mutating routines (`purge_soft_deleted`, `soft_deleted_pending`, `erase_audit_log_for_user`, and now `check_ai_rate_limit`) are revoked from `anon` and `authenticated`.
- ⚠️ **The advisor alone cannot confirm this rule is being met.** It checks whether RLS is *enabled*; it does not evaluate whether a policy restricts anything, so `USING (true)` passes it silently. Re-running it after every DDL change is necessary but **not sufficient** — read `pg_policies` when a change touches a policy.
- Any new table ships with RLS enabled and a policy in the same migration. No exceptions, no "I'll add it after."
- Re-run `get_advisors(type: security)` after every DDL change.
- Security advisor 2026-07-26 flags **leaked-password protection disabled** in Supabase Auth. Already tracked as `PRE-3` in Open Blockers and deferred — the HaveIBeenPwned check requires the Pro plan. Revisit on upgrade, not actionable now.

### P3 — Activation, current numbers

Acquisition works; activation is improving but not settled. **Latest measured 2026-07-30** (superseded the original 2026-07-26 reading of ~5% — do not quote that figure, see archive):

**Refreshed 2026-08-01** (the snapshot previously carried the 07-30 reading of 178/42/23.6%, flagged there as stale — this is that fresh pull):

| Metric | Value |
|---|---|
| Total signup accounts | **193** |
| Accounts that wrote **any** row | **46** |
| **Activation rate** | **23.8%** |
| Signups in the last 7 days | **92** |
| Wrote rows on 2+ distinct days | **10 of 46** |
| Wrote anything in the last 7 days | **23** |
| Total data rows, all users, all time | 243 |
| Best-activating cohort | week of 07-06, 33.3% |

Activation is holding steady around 23–24% while the denominator keeps climbing — 92 signups in the last week alone, still accelerating, still from an unidentified channel.

> **⚠️ Corrected 2026-08-01 — "Return rate 5 of 178" was a measurement artifact and has been dropped from the table.**
>
> That figure came from `last_sign_in_at > created_at + 1 hour`. Native apps persist the session and refresh tokens rather than re-authenticating, so `last_sign_in_at` largely stops moving after signup. It was measuring *"got signed out and came back"*, which for a Capacitor app is close to nobody **by design** — not retention.
>
> Measured instead by data actually written: **10 of 46 activated users wrote rows on 2+ distinct days**, 3 have an activity span over a week, and **23 wrote something in the last 7 days**. Still a real retention problem, but roughly double the old figure and a different shape. Do not quote "5 of 178".

Engagement is shallow where it exists: 243 data rows across all 193 accounts, ~5 per activated user.

### P4 — StudyDesk is the flagship product

Owner call, 2026-08-01: "StudyDesk to be flagship product, it has seen greater growth I couldve ever thought and has the biggest combination of value for me + large potential userbase, here students." Not a task — a standing resource-allocation rule.

- Where a sequencing choice exists between StudyDesk and NCC/LimeLog, StudyDesk goes first.
- NCC and LimeLog are not deprioritized to zero — AUTH-2 and the score/workout-type items still matter — but ties break toward StudyDesk from here forward.
- Applied immediately in `NEXUS_V110_BUILD_PLAN.md`'s sequencing.

---

## Suite Metadata

| Field | Value |
|---|---|
| **Suite Version** | StudyDesk **`1.6.2` / vc16 🟢 RELEASED 2026-07-31** — tag `v1.6.2`, GitHub Release carries `StudyDesk-1.6.2.apk`, `Binaries:` URL verified live (200, 4 194 910 bytes), signing cert verified `27e17d1f…55e4` (the adopted F-Droid key). Supersedes `1.6.1`/vc15 (same day) and `1.6.0`/vc14 (2026-07-30, `f6a8d5e`). F-Droid auto-update picks it up on its next tag scan; no MR needed. NCC `1.7.2` 🟠 Review / LimeLog `1.8.3` 🟠 Review — **deliberately NOT bumped.** Their v1.8 code is merged to `develop` but untagged: releasing would force an MR update under linsui's standing rule ("if you release a new version please update this MR") and restart the test queue after 23 and 27 pipeline rounds. Bump to NCC 1.8.0 / LimeLog 1.9.0 only **after** !41550 and !41548 merge, at which point `AutoUpdateMode: Version` handles them with no MR at all. |
| **Status** | v1.8 Activation complete (see Prior Milestone). **F-Droid: StudyDesk is IN** (!41551 merged upstream) — updates are now automatic via `AutoUpdateMode: Version` + `UpdateCheckMode: Tags`, a new tag + GitHub Release carrying the signed `StudyDesk-X.Y.Z.apk` is the whole flow, no fdroiddata MR. Because auto-update clones the previous recipe verbatim, regressing anything in section A of `fdroid/FDROID_RELEASE_CHECKLIST.md` will silently break the next build with no review to catch it. NCC !41550 and LimeLog !41548 are CI-green on 1.7.2 / 1.8.3, awaiting linsui's merge — no action owed on our side. **⚠️ CTO rule:** no git writes from the CTO cowork sandbox (caused truncated-blob incidents in v1.5.4 + v1.6.1 — see archive). Builder dev machine is the only authorized committer; Desktop Commander merge/tag/push on the dev machine is safe. |
| **Last Updated** | 2026-08-01 (SEC-1 decided + built; P3 refreshed; ACT-5 marker data read) |
| **Updated By** | Builder, 2026-07-31 — **StudyDesk 1.6.1 + 1.6.2 released**, cross-device sync for assignments/exams/tasks (real user report, 3 new Supabase tables, Ownership Matrix updated in `CLAUDE.md`), in-app confirmation codes + 3 follow-up fixes, custom SMTP closed out end-to-end. **ACT-2/3/4 verified closed on all three apps by runtime measurement; v1.8 Activation is complete** — see Prior Milestone. NCC + LimeLog still intentionally unbumped, held behind !41550/!41548. **Still open: SEC-1 (now v1.9, see Active Milestone), ACT-5 awaiting data, R2/X-3 screenshots, AUTH-2, O-5, O-7, PRE-3** — the non-SEC-1 items carried into v1.10, see Next Milestone. Full prior update chain archived in **NEXUS_CHANGELOG_ARCHIVE.md**. |

---

## Active Milestone

| Field | Value |
|---|---|
| **Milestone** | `v1.9` ✅ **Decided and built 2026-08-01** — **SEC-1 only.** CTO call: the security decision (strangers building from public source write to production) takes the v1.9 slot rather than sitting feature-adjacent in a bigger milestone. Full plan in **NEXUS_V19_BUILD_PLAN.md**. |
| **Target Apps** | Shared (all three, one Supabase project). |
| **Summary** | **The advisor was the wrong evidence, and the right answer was reached anyway.** `get_advisors` reports whether RLS is *enabled*, not whether a policy restricts anything — `USING (true)` passes it silently — so the original "zero RLS-gap findings" could not carry the decision it was carrying. Verified directly instead: **30 public tables, 66 policies, every one `auth.uid() = user_id` or an ownership helper, no `USING (true)`.** The data boundary genuinely holds, so the anon key stays committed (F-Droid reproducibility requires it; the demo-project fallback would undo `FD-CI-GREEN`). **The one real gap was `ai-generate`** — the only endpoint with a marginal cost and an exhaustible quota. Open signup defeated its per-user cap by account rotation, and its "global" cap was per-isolate in-memory, so it capped nothing; anyone able to clone the repo could exhaust the Gemini free-tier daily quota and 429 every real user. Its own justification, *"personal suite, ~2 real users"*, had expired at 193 accounts. Fixed with a Postgres-backed limiter. |
| **Plan** | Full reasoning, the reproducibility conflict, the advisor correction and the `ai-generate` finding in **NEXUS_V19_BUILD_PLAN.md**. **Decision: the lighter path plus the `ai-generate` fix — no CAPTCHA.** Rejected on the signup data rather than on effort: the 07-27 cohort spreads naturally across a full day with varied local-parts and domains including seznam.cz, duck.com and tutanota.com, so there is no scripted-abuse evidence to justify friction on the funnel step already losing ~76%. Revisit if the signup *shape* changes. |
| **Next Milestone** | `v1.10` 🟡 Scoped 2026-08-01 in **NEXUS_V110_BUILD_PLAN.md** — everything v1.8 left on the table (StudyDesk assignment-type; NCC score-pacing bug + fitness-target flex, open design question; LimeLog cardio logging, refined to a distinct duration/distance flow per CTO clarification) plus five items from the braindump's second sync: StudyDesk onboarding-notification bug, icon redesign for StudyDesk+NCC, guest-mode avatar picker, **two native Android home-screen widgets** (Next Up + Calendar, GitHub issue #3 read directly — bigger native-code scope, likely its own release), and a Ko-fi/Stripe support link (Stripe account verified live). Plus `AUTH-2` and housekeeping. Sequenced per `P4`: small StudyDesk items first, widgets as a follow-up release, NCC/LimeLog items land on `develop` regardless (held from tagging either way). |
| **Prior Milestone** | `v1.8` ✅ **Activation — COMPLETE 2026-07-31.** `ACT-2` (auth-gate i18n), `ACT-3` (first-run framing), `ACT-4` (guest link above the fold) all verified closed by runtime measurement on all three apps. `ACT-5` instrumented (origin marker shipped) and now waiting on data. StudyDesk shipped 1.6.0→1.6.2 including a real user-reported cross-device sync fix (assignments/exams/tasks, 3 new tables), in-app confirmation codes, and custom SMTP end-to-end. NCC + LimeLog code merged to `develop` but deliberately unbumped, held behind !41550/!41548. Full detail archived in **NEXUS_CHANGELOG_ARCHIVE.md**. |

---

## Cross-App Dependency Matrix

> Mark cells with `BLOCKS`, `NEEDS`, or `—`. Row app depends on / blocks column app.

| | Nexus-Command-Center | LimeLog | StudyDesk |
|---|---|---|---|
| **Nexus-Command-Center** | — | NEEDS (reads workout_sessions/workout_sets via Supabase realtime) | NEEDS (reads subjects/grades/study_sessions via Supabase realtime) |
| **LimeLog** | — | — | — |
| **StudyDesk** | — | — | — |

---

## Open Blockers

| ID | App | Issue | Status |
|---|---|---|---|
| PRE-3 | Shared | Leaked-password protection (HaveIBeenPwned) requires Supabase Pro plan. Owner confirmed 2026-07-30 it's not available on the current plan — the only outstanding security advisor on the project. | ⏸ Deferred — plan-gated, not actionable. Revisit on any upgrade to Pro. |
| O-5 | Shared | **Backups off the free plan.** Free tier = 7-day retention, no PITR, now covering real user data. Chosen route (owner, 2026-07-30): weekly `pg_dump` to the dev machine. Script at `limecore/ops/backup-supabase.ps1` — runs in a `postgres:17` container, writes `-Fc` dumps to `D:\emilh\Backups\supabase`, verifies each with `pg_restore --list` before pruning to the newest 8, reads the connection URI from an untracked `ops/.db-url`. Does not replace PITR — weekly restore points, not point-in-time. | 🟠 In progress — script written + preflight-verified; needs the `.db-url` credential file and a Task Scheduler entry (both owner actions). |
| O-7 | Shared | **A weekly hard-delete job is live in production.** `cron.job` id 1, Sun 03:15 UTC, runs `purge_soft_deleted()` on `grades`/`study_sessions`/`readings`/`transactions`/`subjects` past a 90-day `deleted_at`. Verified 2026-07-30: 0 rows currently eligible, next run is a no-op. | 🟡 Working as designed. Interacts with `O-5`: irreversible deletes against a 7-day-retention, no-PITR backup posture — get the weekly dump running before the purge has anything to delete. |
| ACT-5 | Shared | Traffic source still unidentified. **193** signups now recorded (see P3). **First marker data read 2026-08-01: 5 accounts stamped, and all 5 are `app: studydesk`, `native: true`, `origin: https://localhost` — Capacitor native Android installs. Zero web, zero dev-server.** The "developers running cloned repos" hypothesis now has evidence against it from its own instrumentation, on top of being weakened by the activation numbers (the 07-06 cohort it was built on is now the *best*-activating one). Hand-sampling the 07-27 cohort agrees: signups spread naturally across a full day, varied local-parts, domains including seznam.cz / duck.com / tutanota.com — organic humans, not a bot farm or a lab. | 🟡 Still waiting on volume, but the leading hypothesis is now **disfavoured, not merely unconfirmed**. Only StudyDesk ships the marker (1.6.1+), so n=5; NCC/LimeLog carry it on `develop` untagged and will contribute nothing until !41550/!41548 merge. Re-read the `(native, platform, origin)` split once those ship. |
| SEC-1 | All three | **Strangers building from source write to the production database.** The Supabase URL + anon key must resolve at build time for F-Droid's reproducible builds, so anyone who clones any of the three public repos and runs a dev build gets a working client pointed at **production**. RLS is the only barrier — see `P2`. **Resolved 2026-08-01:** RLS verified at the *policy* level (30 tables, 66 policies, no `USING (true)`) rather than by advisor, which cannot see policy correctness; anon key stays committed, as F-Droid reproducibility requires and as Supabase intends. The one real gap was **`ai-generate`** — open signup defeated its per-user cap by account rotation, and its "global" cap was per-isolate in-memory, so anyone able to clone the repo could exhaust the Gemini free-tier daily quota and 429 every real user. Fixed with a Postgres-backed limiter (`20260801_ai_rate_limits.sql`) giving real global hourly/daily caps. CAPTCHA rejected **on the signup data** — no evidence of scripted abuse, and it would tax the funnel step already losing ~76%. | ✅ **Closed** — migration applied, advisor re-run unchanged (`PRE-3` only). Edge function redeploy still owed to activate the caps in production. |
| AUDIT-NCC-V15-1 | NCC | Sign-out "keep local data" leaves `work_quality_logs` (personal work self-assessments) in Dexie. Same posture as every other NCC table. | 🟡 Medium, non-blocking — consistent with the rest of the table family, not a regression. Revisit only if a per-table on-signout wipe policy is ever introduced suite-wide. |
| AUTH-2 | NCC, LimeLog | NCC and LimeLog have no code-entry screen — StudyDesk can confirm signup with the emailed code in-app, the other two are link-only. Not a regression: the installed Supabase template carries link *and* code from the same token, so the link path still works everywhere. | 🟡 Scoped into v1.10 — fold into the NCC/LimeLog bump, already held behind !41550/!41548. Port `AuthGate.jsx`'s code step; `OTP_MIN 6`/`OTP_MAX 10` are deliberately length-agnostic, don't reintroduce a hardcoded digit count. |
| R2/X-3 | All three | `phoneScreenshots` exist only for `en-US` and `zh-CN` in all three apps; the other eight store locales fall back. Text (title/description/changelogs) is already done in all ten locales. | 🟡 Open, needs device time. Scoped into v1.10. StudyDesk's newest locale strings landed on `develop` after `v1.6.2` was tagged, so they won't surface on F-Droid until the next release. |
| FD-META | NCC, LimeLog, StudyDesk | F-Droid `WebSite` field is unset on all three recipes (never populated, nothing stale) — `limecore.dev` is now the obvious value. `www.limecore.dev` also still worth a final check on its redirect status. | 🟡 Low priority, cheap. NCC/LimeLog can add in their open MRs; StudyDesk needs its own small MR. |
| HYG-1 | Shared | Same one-line `CLAUDE.md` consolidation sits uncommitted in all four repos (NCC, LimeLog, StudyDesk, limecore-site) — trimmed to a short pointer, never committed. Re-checked 2026-07-31, still the only dirty file in every repo. | ⚪ Harmless but persistent. Commit as a `chore:` in all four, or revert — an identical uncommitted diff in four repos indefinitely just means noise in every future `git status`. |
| Suite home | Shared | Where the legal pages live long-term is undecided — currently `gh-pages` on the NCC repo. A `limecore-suite` Vercel project would be nicer but the MCP returned 403 on project creation, needs the dashboard. | 🟡 Open, low urgency. Whatever URL is in the Google console must keep working — changing it means re-verifying with Google. |
| C-6 | Shared | Informational: free-tier Supabase projects pause after ~7 days of inactivity. | ⚪ Not a live risk while signups continue — worth knowing the mechanism before a quiet spell surprises you. |

---

## Integration & Shared Infrastructure

| Component | Owned By | Consumers | Status | Notes |
|---|---|---|---|---|
| Supabase Auth | Each app independently | NCC, LimeLog, StudyDesk | 🟡 Partial | Per-app sessions, no SSO. Cross-app sign-in = separate logins. SSO is v1.1+ scope. |
| Supabase DB + Realtime | Schema authority per app | All three | 🟢 Live | Shared DB. LimeLog push-only. StudyDesk bidirectional LWW. NCC reads all via realtime subscriptions. **Updated 2026-07-31:** StudyDesk now owns six tables — `subjects`, `grades`, `study_sessions`, plus `assignments`, `exams`, `study_actions` (added v1.6.1). The three new ones are StudyDesk-only; NCC does not read them, so the cross-app contract is unchanged. StudyDesk's realtime subscription covers all six. |
| Transactional email | Resend (eu-west-1) → Supabase SMTP | All three (shared auth) | 🟢 Live | `limecore.dev` verified in Resend; SPF/DKIM/bounce-MX correct. Note a wildcard `A` record on the apex hides mail DNS from wrong-record-type lookups — query `TXT`/`MX` explicitly before concluding anything is missing. Five bespoke branded templates in `limecore/email/`; **`confirm-signup-both.html` is the one installed** (carries link *and* code off one token). Inbound forwarding via ImprovMX works. |
| Design System | — | — | ⚪ None | NCC = Cyber Slate Glass (cyan). LimeLog = brutalist lime adaptation. StudyDesk = cream-paper (non-negotiable backbone). No shared component library — v1.1+ candidate. |
| Inter-App Event Bus | — | — | ⚪ None | All integration via Supabase as shared data layer. Sufficient for v1.0. |
| API Gateway / Proxy | — | NCC only | ⚠️ Dev-only | Vite dev proxy for Yahoo/Finnhub/CoinGecko/FX. Android Capacitor WebView bypasses CORS natively — verify on device before v1.1 adds sources. |

---

## Changelog

> Add new entries here at version completion. Full per-version changelog history (NCC v1.4.0 through v1.7.2, LimeLog v1.5.0 through v1.8.3, StudyDesk v1.4.0 through v1.6.0, the full F-Droid reproducible-builds saga, and the v1.8 Activation merge) is archived in **NEXUS_CHANGELOG_ARCHIVE.md**. Move an entry to the archive once it's superseded by the next release or fully closed out.

**2026-08-01 — v1.9 / SEC-1 decided and built; three registry figures corrected (remote Claude Code instance).**

**SEC-1 closed.** The anon key stays committed. What changed is that the claim underneath that decision is now actually verified: `get_advisors` only reports whether RLS is *enabled*, so a policy of `USING (true)` passes it silently, and the decision was resting on it entirely. Read `pg_policies` directly instead — **30 public tables, 66 policies, every one `auth.uid() = user_id` or an ownership helper, no `USING (true)` anywhere.** The conclusion survived; its evidence now supports it.

**The real gap was `ai-generate`, and it was not in the v1.9 plan.** It is the only endpoint with a marginal cost and a shared exhaustible quota, and neither of its limits bound anything: the per-user window keys on the JWT `sub` and signup is open, so rotating free accounts reset it for nothing, while the "global" cap sat in an in-memory Map and was therefore per-isolate. Anyone able to `git clone` could exhaust the Gemini free-tier daily quota and hand every real user a 429. The limiter justified itself with *"personal suite, ~2 real users"* — there are 193. New `public.ai_rate_limits` + `check_ai_rate_limit()` (migration `20260801_ai_rate_limits.sql`), mirroring the existing `share_invite_rate_limits` pattern: upsert-and-check, SECURITY DEFINER, `search_path` pinned, deny-all RLS, EXECUTE revoked from anon/authenticated. The in-memory limiter stays as a free first layer and as the fallback on database error, so an outage degrades instead of breaking an opt-in feature. Advisor re-run after the DDL: unchanged. **Edge function redeploy still owed** — the caps are not live until then.

**No CAPTCHA, rejected on evidence.** The 07-27 cohort was sampled by hand: spread across a full day, varied local-part lengths, domains including seznam.cz, duck.com and tutanota.com. That is organic human traffic, not a bot farm, and CAPTCHA would tax the funnel step already losing ~76%.

**Three corrections.** (a) **27 tables → 30** — the old count predates `assignments`/`exams`/`study_actions`. (b) **"Return rate 5 of 178" was a measurement artifact** and is dropped: it read `last_sign_in_at`, which native apps barely move because they refresh tokens rather than re-authenticating, so it measured "got signed out and came back", not retention. By rows written it is **10 of 46 activated users on 2+ distinct days**, 23 active in the last 7. (c) **ACT-5's leading hypothesis now has evidence against it** — all 5 stamped accounts are native Android StudyDesk installs, zero web, zero dev-server. P3 refreshed to **193 accounts / 46 activated / 23.8%**, with 92 signups in the last 7 days.

**2026-07-31 — StudyDesk v1.6.1 + v1.6.2 released; ACT-2/3/4 verified closed; custom SMTP finished (Builder).**

**StudyDesk 1.6.1/vc15 → 1.6.2/vc16, both tagged and released with `StudyDesk-<version>.apk`.** F-Droid picks both up on its next tag scan; no MR. Section A of `fdroid/FDROID_RELEASE_CHECKLIST.md` re-verified before each build, and the 1.6.2 APK's signing cert was checked against the adopted key (`27e17d1f…55e4`, `apksigner verify --print-certs`) rather than assumed. `Binaries:` URL confirmed live: 200, 4 194 910 bytes.

**v1.6.1 — assignments, exams and tasks now sync ([StudyDesk#6](https://github.com/Limekana/StudyDesk/issues/6), reported by a real user on two devices).** Subjects and grades synced; assignments, exams and manual tasks were local-only. New Supabase tables `assignments`, `exams`, `study_actions` (migration `20260730_assignments_exams_actions.sql`) — uuid pk, `user_id`, FK to `subjects`, jsonb `topics`, `updated_at` for LWW, `deleted_at` soft delete, RLS enabled with four explicit policies each. **This changes the Ownership Matrix: StudyDesk now owns six tables, not three.** Two deliberate design choices, both to avoid regressing what already worked: (a) the merge helper *removes* soft-deleted rows rather than keeping tombstones, because ~20 read sites in `App.jsx` do not filter on `deletedAt` and adding that filter everywhere was the larger regression surface; (b) the push is a single reconciler effect keyed on the arrays, not a call at each of ~15 mutation sites. Delete of a subject cascades to its assignments and exams, not to `study_actions`.

**v1.6.1 — in-app confirmation codes.** Signup can now be confirmed with the emailed code instead of only the link. The Supabase template carries **both** link and code off the same token, so there is no flag day and old emails keep working.

**v1.6.2 — three fixes to that new screen, two of them self-inflicted in 1.6.1.** The code field capped at 6 characters while this project's Mailer OTP Length is 8, so a valid code could not physically be entered; fixed length-agnostically (6–10) and every digit count stripped from the copy in all 10 locales so it cannot go stale if the setting changes. The Confirm button had no `:disabled` style at all, so a blocked button read as "darkens and does nothing" — now disabled looks disabled app-wide. And `input[type=password]` was missing from the shared input rule, so the password box rendered smaller than the email box above it.

**ACT-2, ACT-3 and ACT-4 verified closed on all three apps by runtime measurement, not by reading the diff.** With `limecore_lang=fi` all three gates render fully Finnish (ACT-2). All three lead with first-run framing — "Start studying" / "Tiliä ei tarvita", not "Welcome back" (ACT-3). Guest-link bottom edge at 380×592: **StudyDesk 430px, NCC 436px, LimeLog 437px**, all above the fold with `scrollHeight == innerHeight`, against the 683px that originally put it 91px below (ACT-4). **ACT-5's origin marker is now committed and pushed** in all three repos (it was implemented-but-uncommitted when last recorded).

**Custom SMTP closed out.** Five bespoke Limecore-branded email templates live in `limecore/email/` (confirm-signup ×3 variants, magic-link, reset-password, change-email); `confirm-signup-both.html` is installed in Supabase. Inbound forwarding via ImprovMX now works, the rate-limit mismatch is fixed, and the sender name is set. Worth recording: the confirmation link was **never broken** — 6 of 8 recent email signups had confirmed, 21s–6min after send. The failure was absent feedback, not a broken flow.

Full detail on the 2026-07-30 v1.8 Activation merge (StudyDesk v1.6.0 release, versionCode gotcha, NCC/LimeLog held) and the 2026-07-25 F-Droid finalization (NCC v1.7.2/LimeLog v1.8.3, StudyDesk merged upstream) archived in **NEXUS_CHANGELOG_ARCHIVE.md**.

---

*Snapshot taken 2026-08-01 from `D:\emilh\Projects\limecore\Nexus_Version_Status.md`. Will drift from the live file over time.*
