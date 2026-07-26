# Limecore Nexus OS Suite — Version Status Registry

> **Central coordination file.** Builders read/write at version completion. CTO pulls for cross-app decisions and milestone planning. Full build notes and resolved bug history in **NEXUS_CHANGELOG_ARCHIVE.md**.

---

## 🔴 PERMANENT PRIORITIES — WE HAVE REAL USERS

> Established 2026-07-26. These are standing constraints, not milestone items. They do not get closed. Every release from here forward is checked against them.

**Context:** the Supabase project (`Nexus OS Suite`, ref `hkktorzhaqnfqsnlstda`) has **103 real signup accounts** as of 2026-07-26, arriving steadily since 2026-07-07. These are strangers, not test accounts. The era of casual production changes is over.

> ⚠️ **Corrected 2026-07-26:** this section previously attributed the arrivals to "F-Droid discovery." That is not supported — the surge (45 signups week of 07-06, 39 week of 07-13) predates StudyDesk's fdroiddata merge on 07-25, and NCC/LimeLog are still unmerged, so F-Droid was distributing nothing during the surge. 83 of the 103 signed up via Google OAuth, which also does not fit an F-Droid audience. **The acquisition channel is currently unknown** — tracked as `ACT-5`.

### P1 — Schema migrations can now destroy other people's data

Real accounts hold real rows. A careless `ALTER TABLE`, column rename, or type change on production silently breaks live installs that are still running an older app version.

- No destructive DDL against production without a backup first.
- Additive-only by default: new nullable columns, new tables. Never rename or drop a column that a shipped app version still reads.
- Old app versions stay in the wild indefinitely on F-Droid — users update on their own schedule, or never. **Every schema change must remain backward-compatible with the oldest app version still plausibly installed.**
- Migrations go through `apply_migration`, never ad-hoc SQL against prod.

### P2 — RLS is now load-bearing security, not a formality

RLS is the only thing separating one stranger's grades, workouts, and financial holdings from another's. A policy hole is a real data breach affecting real people, not a bug.

- Status 2026-07-26: RLS enabled on all 27 public tables. ✅
- Any new table ships with RLS enabled and a policy in the same migration. No exceptions, no "I'll add it after."
- Re-run `get_advisors(type: security)` after every DDL change.
- Security advisor 2026-07-26 flags **leaked-password protection disabled** in Supabase Auth. Already tracked as `PRE-3` in Open Blockers and deferred — the HaveIBeenPwned check requires the Pro plan. Revisit on upgrade, not actionable now.

### P3 — Activation is broken and is now the top product problem

Acquisition works. Activation does not. Hard numbers, 2026-07-26:

| Metric | Value |
|---|---|
| Total signup accounts | 103 |
| Accounts with **any** data in any table | 7 |
| Of those, accounts that are Emil's own | 2 (they hold 530/530 workout_sets) |
| **Genuine external users who logged anything** | **5** |
| Users who ever signed in again on a later day | 4 |
| Deepest external footprint | 4 study sessions + 1 grade |

**~5% activation, ~0% retention.** ~98 people created an account, looked at the app, and never entered a single row. The funnel leak is between signup and first meaningful action, and closing it outranks every new feature currently in the plan — including the Growth hub.

> ⚠️ **Second correction, 2026-07-26 — the denominator is suspect.** Only 52 APK downloads exist across all repos all-time, no web build is deployed anywhere, and F-Droid distributed nothing during the surge. The leading hypothesis is now that most of these 103 accounts are **developers who cloned the public repos and ran them against production**, not end users who bounced. See `ACT-5 Findings`. The real end-user count may be close to the 5 accounts that wrote data. ACT-2/3/4 were found by direct code inspection and stand on their own; do not size or justify them against the 5% figure until ACT-5 is settled.

---

## Suite Metadata

| Field | Value |
|---|---|
| **Suite Version** | NCC `1.7.2` 🟠 Review / LimeLog `1.8.3` 🟠 Review / StudyDesk `1.5.4` 🟢 **MERGED INTO F-DROID** — StudyDesk MR !41551 was merged upstream (metadata now in `fdroid/fdroiddata` master with build entries for 1.5.1 + 1.5.4). NCC + LimeLog re-released 2026-07-25 with self-hosted fonts; their recipes re-pinned to the new dereferenced commits and CI-green on both MRs. |
| **Status** | v1.7 shipped for NCC + LimeLog (2026-07-12) — see Changelog. **F-Droid: StudyDesk is IN** (!41551 merged upstream). NCC !41550 and LimeLog !41548 are CI-green on 1.7.2 / 1.8.3 and awaiting linsui's merge — no action owed on our side. The earlier reproducible-build mismatch is fully resolved (see `FD-CI-GREEN`). **Note on future StudyDesk releases:** now that it's merged, updates are automatic via `AutoUpdateMode: Version` + `UpdateCheckMode: Tags` — a new tag + a GitHub Release carrying the signed `StudyDesk-X.Y.Z.apk` is the whole flow, no fdroiddata MR. Because auto-update clones the previous recipe verbatim, regressing anything in section A of `fdroid/FDROID_RELEASE_CHECKLIST.md` will silently break the next build with no review to catch it. **⚠️ CTO rule:** no git writes from the CTO cowork sandbox (caused truncated-blob incidents in v1.5.4 + v1.6.1 — see archive). Builder dev machine is the only authorized committer; Desktop Commander merge/tag/push on the dev machine is safe. |
| **Last Updated** | 2026-07-25 |
| **Updated By** | Builder, 2026-07-25 — F-Droid round closed out. Canonicalized both recipes against fdroidserver master, bumped NCC→1.7.2/vc26 and LimeLog→1.8.3/vc19 with **dereferenced** commit hashes, pushed both MR branches green, and posted the status comment on !41550. Confirmed StudyDesk !41551 is merged upstream. Folded the durable knowledge (forky Node, `refs/tags/<tag>^{}` dereference, `NonFreeNet` map form, self-hosted fonts) into `fdroid/FDROID_RELEASE_CHECKLIST.md`. Full prior update chain (keystore fixes, GitHub Release publishing, reproducible-build diagnosis) archived in **NEXUS_CHANGELOG_ARCHIVE.md**. Nothing currently owed on our side. |

---

## Active Milestone

| Field | Value |
|---|---|
| **Milestone** | `v1.7` ✅ Bug-fix/feature scope shipped for NCC + LimeLog (2026-07-12: NCC v1.7.0, LimeLog v1.8.0), then carried through three F-Droid packaging rounds to NCC v1.7.2 / LimeLog v1.8.3 / StudyDesk v1.5.4 (2026-07-25). Only the self-improvement hub (Growth) was reverted before the 2026-07-12 ship and remains open — see Plan below. Full shipped-item detail archived in **NEXUS_CHANGELOG_ARCHIVE.md**. |
| **Target Apps** | NCC, LimeLog (Growth hub only). No StudyDesk items identified. |
| **Summary** | All bug-fix items from the original v1.7 plan (NCC: forced-logout, dividend auto-realize, VIX/Fear&Greed, habit-reminder recheck; LimeLog: cloud sync pull, Health Connect calories, photo-capture, backgrounding state loss) are shipped. Remaining open scope is the self-improvement hub, deferred out of the 2026-07-12 ship. |
| **Plan** | **Self-improvement hub (Growth) — still open, not started.** New destination page stacking a Habits summary section (links through to existing, unchanged `/habits` + `/habits/add`) and a Reading summary section (new `/reading` + `/reading/add` routes) as a card stack, so a future third module is just another card. Habits' schema/logic untouched, only its entry point changes; Dashboard's `HabitsDashboardStrip` becomes a combined summary pointing at the hub instead of straight to `/habits`. Reading stays scoped to title/status(want-to-read/reading/finished)/page-progress only — no due dates or reminders (what killed the old feature). **Nav decision:** try it as its own 5th bottom tab in a feature branch first; fall back to the Dashboard-strip pattern if 5 tabs doesn't feel right. **Candidate third module:** a journal/reflection log (free-text, timestamped, optional mood tag, append-only) — genuinely different data shape from Habits/Reading, not committed yet, decide when the hub itself is being built. Still open: hub nav label (candidate "Growth"), whether `reading_count` Goals integration comes back now or later. **Backlog note (Habits, unscheduled):** weekly-goal quantified habits (e.g. "150 min exercise/week" vs. fixed daily amount) needs a `habits.ts` schema addition (current `HabitFrequencyKind` is `daily`/`specific_days` only) — if bundled with the hub, it breaks the "Habits schema untouched" assumption above; flagging the conflict, not deciding it. |
| **Next Milestone** | `v1.8` — **Activation + braindump additions. 🛑 BUILD HELD — implementation not to start until CTO gives the go.** Scoped 2026-07-26 in **NEXUS_V18_BUILD_PLAN.md**. Core: ACT-2 (translate the auth gates — the only untranslated screens in the suite, and the first screen every new user sees), ACT-3 (first-run gate framed for returning users), ACT-4 (guest link below the fold ≤640px), ACT-5 (identify the real acquisition channel — do first). **CTO additions (2026-07-26, from the Obsidian braindump — feature items, ranked below activation per P3):** StudyDesk gets assignment-type-as-free-text folded into the v1.6.0 release itself (CTO call, expands that release's scope). NCC and LimeLog get their braindump items (NCC: mid-week score pacing bug + configurable weekly fitness target — mechanism still undecided; LimeLog: loggable non-gym workout types — open question whether this needs a shared-table schema change) added to the same held `develop` bucket as their ACT-2/3/4 work, since neither taggable until its MR merges anyway. Full detail + open questions in the build plan's "CTO additions" section. **Release scope DECIDED 2026-07-26: StudyDesk v1.6.0 ships alone (now carrying the assignment-type item too); NCC + LimeLog held until !41550 and !41548 merge**, so neither MR ends up adding an already-superseded version. StudyDesk is already merged, so its release is tag + GitHub Release only — which also means `AutoUpdateMode: Version` clones the previous recipe verbatim and section A of `fdroid/FDROID_RELEASE_CHECKLIST.md` is a hard gate with no MR review behind it. Still open: version-bump confirmation, and the two undecided design questions (fitness-target mechanism, workout-type schema impact) before either NCC/LimeLog item goes into a branch. |
| **Prior Milestone** | `v1.6` ✅ COMPLETE 2026-06-27 — NCC v1.6.0 / LimeLog v1.7.0 / StudyDesk v1.5.0. i18n (FI/EN/FR/DE/ES/ZH) · real onboarding flows · Period/Jakso model (StudyDesk) · F-Droid submission (all three MRs green, awaiting maintainer merge). |

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
| PRE-3 | Shared | Leaked-password protection (HaveIBeenPwned) requires Supabase Pro plan. | ⏸ Deferred — revisit if/when the project upgrades to Pro. |
| ACT-1 | Shared (StudyDesk first) | **Signup gate before value — INVESTIGATED 2026-07-26, original hypothesis DISPROVEN.** Guest mode already ships in all three apps (`lib/guestMode`), so no app has ever hard-required an account. More decisively: all 103 accounts *passed* the gate and then entered nothing — the leak is post-signup, not at the gate. See `ACT-1 Findings` below for the four defects that were actually found (untranslated gate blocking the language picker; "Welcome back" first-run framing; guest link below the fold on ≤640px viewports; unknown traffic source). Superseded by ACT-2..ACT-5. | 🟢 Closed — investigation complete, findings split into ACT-2..ACT-5 |
| ACT-2 | All three | **Auth gate is the only untranslated screen in the suite, and it is the first screen every new user sees.** `AuthGate.jsx` (SD), `Login.tsx` (NCC), `FirstLaunchAuth.tsx` (LL) contain zero `t()` calls — every string is an English literal. Verified at runtime: with `limecore_lang=fi` the gate renders fully English while onboarding behind it renders fully Finnish. The language picker is onboarding step 0, which renders *after* the gate in all three apps (LimeLog's own comment: "Onboarding gate — only after auth is satisfied"). A non-English user cannot reach the language picker without first transacting with an English-only wall. | 🔴 Open — highest-confidence activation defect |
| ACT-3 | All three | **First-run gate is framed for returning users.** StudyDesk's gate defaults to `mode='signin'` with the heading "Welcome back" and subtitle "Pick up where you left off." — shown to someone who has never opened the app. Trivial fix (default to signup framing on first run, signin thereafter). | 🔴 Open — cheap |
| ACT-4 | StudyDesk (check NCC/LL) | **"Continue as guest" falls below the fold on smaller devices.** Measured at 380px: guest link bottom = 683px. Fits an S24-class ~732px viewport, but is 43px below the fold at 640px and 91px below at 592px. Page does scroll (`overflow: visible`), but the centered card reads as a complete screen, so there is no scroll affordance. The one control that bypasses signup is the one control a mid/low-end device user may never see. | 🔴 Open — verify equivalent measurement for NCC + LimeLog |
| ACT-5 | Shared | **Traffic source is unidentified — P3's "via F-Droid discovery" is unsupported.** Signup surge begins week of 2026-07-06 (45) and 2026-07-13 (39), but StudyDesk only merged into fdroiddata on 2026-07-25 and NCC/LimeLog are still unmerged — F-Droid was distributing none of the apps during the surge. Corroborating: 83 of 103 signups used **Google** OAuth, which is not the behaviour of a privacy-selected F-Droid audience. Until the real channel is known, activation work is being aimed at an audience that has not been identified. **→ Leading hypothesis established 2026-07-26, see `ACT-5 Findings` below: these are most likely developers running cloned repos against production, not end users.** | 🟠 Open — hypothesis formed, needs confirmation; blocks correct targeting of ACT-2..ACT-4 |
| SEC-1 | All three | **🔴 Strangers building from source write to the production database.** The Supabase project URL + anon key must be resolvable at build time for F-Droid's reproducible builds (see the "missing env fallback" fix in `FD-CI-GREEN`), so anyone who clones any of the three public repos and runs a dev build gets a working client pointed at **production** `hkktorzhaqnfqsnlstda`. RLS is then the only thing separating an arbitrary stranger's session from every real user's rows — see `P2`. **Decide:** should the committed fallback point at production at all, or at a separate throwaway demo Supabase project, with production credentials supplied only via CI secrets at release time? Note F-Droid's reproducible-build requirement constrains the options — whatever is committed must be what F-Droid builds. Not yet scoped. | 🔴 Open — security, decide before any further public promotion |
| AUDIT-NCC-V15-1 | NCC | Sign-out "keep local data" leaves `work_quality_logs` (personal work self-assessments) in Dexie. Same posture as every other NCC table. | 🟡 Medium, non-blocking — consistent with the rest of the table family, not a regression. Revisit only if a per-table on-signout wipe policy is ever introduced suite-wide. |
| FD-CI-GREEN | NCC, LimeLog, StudyDesk | Reproducible-build + F-Droid packaging bugs across three MR rounds (canonical metadata, `AutoUpdateMode` schema, Node install method, `cap sync` cwd, AGP dependency-metadata block, stale synced assets, missing env fallback, dereferenced `commit:` hash, self-hosted fonts). | 🟢 **Resolved 2026-07-25.** All three fdroiddata MRs (!41550 NCC / !41548 LimeLog / !41551 StudyDesk) CI-green; StudyDesk merged into fdroiddata master, NCC + LimeLog awaiting linsui's merge. Nothing owed on our side. Full bug-by-bug history (8 distinct issues across three diagnosis rounds) archived in **NEXUS_CHANGELOG_ARCHIVE.md**. |

---

## ACT-5 Findings — where the 103 accounts actually came from

> Investigated 2026-07-26 (CTO). Hypothesis, not yet confirmed. Recorded so ACT-2..ACT-4 are not tuned against a denominator that turns out to be fictional.

### Evidence gathered

| Check | Result |
|---|---|
| GitHub Release APK downloads, **all repos, all time** | **52** (NCC 15, LimeLog 16, StudyDesk 21) — and an unknown share of those are Emil, F-Droid CI, and RB verification builders |
| Vercel projects on the account | Only `limecore` (marketing site) and `felt`. **No web deployment of any app exists** |
| Vercel Web Analytics | Not enabled — no traffic data available for the marketing site |
| Auth provider split | 83 Google OAuth / 20 email |
| Signup hour-of-day (Europe/Helsinki) | **Flat across all 24 hours.** 25 of 103 arrived 00:00–07:00 — no diurnal curve |
| Email shape | 32 match `name+digits@`, 14 have ≥16-char random local parts, 19 carry no name in metadata |
| Same-minute signup clusters | 0 — not a scripted burst |
| `auth.audit_log_entries` | Empty (retention window elapsed) — **no IP data available**, the one check that would settle this |

### Why "real end users" does not fit

52 lifetime APK downloads cannot produce 103 accounts, and there was no F-Droid distribution during the 07-06/07-13 surge. There is no web build to sign up on. So the great majority of these accounts were created by people who were **not running a distributed copy of the app.**

### Leading hypothesis: developers running cloned repos against production

All three repos are public, and the Supabase URL + anon key must resolve at build time for F-Droid's reproducible builds (the "missing env fallback" item in `FD-CI-GREEN`). So `git clone` + a dev build yields a working client pointed at **production**. A developer poking at the code clicks Google OAuth because it is one click, looks around, writes nothing, and never returns.

This fits every observation: no APK download required, worldwide hours, Google-heavy, ~0 rows written, ~0 return visits, and timing that tracks the blog post and the recent GitHub stars rather than any release event.

### Consequences

1. **P3's denominator is probably wrong.** "98 users bounced" is more likely "~98 developers ran the code once." Genuine end users are closer to the 5 accounts that wrote anything. ACT-2/3/4 are real defects found by direct code inspection and remain worth fixing on their own merits — but they should not be justified by, or measured against, the 5% figure.
2. **Security: see `SEC-1`.** Strangers running cloned code are writing to production. RLS is the only barrier.

### How to confirm or kill this

- Enable Vercel Web Analytics on `limecore` — establishes whether the marketing site is even getting traffic, and from where.
- Add a client-side origin/platform marker at signup (e.g. write `platform` + `app_version` into `profiles` on account creation). Native Capacitor builds, dev servers on `localhost`, and any future web build then separate cleanly. **This is the single highest-value instrumentation change available and it is cheap.**
- Check whether GitHub repo traffic (clones/unique cloners, Insights → Traffic, 14-day window) correlates with the signup curve.
- Confirm whether the committed env fallback in each repo currently resolves to production.

---

## Integration & Shared Infrastructure

| Component | Owned By | Consumers | Status | Notes |
|---|---|---|---|---|
| Supabase Auth | Each app independently | NCC, LimeLog, StudyDesk | 🟡 Partial | Per-app sessions, no SSO. Cross-app sign-in = separate logins. SSO is v1.1+ scope. |
| Supabase DB + Realtime | Schema authority per app | All three | 🟢 Live | Shared DB. LimeLog push-only. StudyDesk bidirectional LWW. NCC reads all via realtime subscriptions. |
| Design System | — | — | ⚪ None | NCC = Cyber Slate Glass (cyan). LimeLog = brutalist lime adaptation. StudyDesk = cream-paper (non-negotiable backbone). No shared component library — v1.1+ candidate. |
| Inter-App Event Bus | — | — | ⚪ None | All integration via Supabase as shared data layer. Sufficient for v1.0. |
| API Gateway / Proxy | — | NCC only | ⚠️ Dev-only | Vite dev proxy for Yahoo/Finnhub/CoinGecko/FX. Android Capacitor WebView bypasses CORS natively — verify on device before v1.1 adds sources. |

---

## Changelog

> Add new entries here at version completion. Full per-version changelog history (NCC v1.4.0 through v1.7.1, LimeLog v1.5.0 through v1.8.2, StudyDesk v1.4.0 through v1.5.2, the full F-Droid reproducible-builds saga, and everything earlier) is archived in **NEXUS_CHANGELOG_ARCHIVE.md**. Move an entry to the archive once it's superseded by the next release or fully closed out.

**2026-07-25 — F-Droid finalization: NCC v1.7.2 / LimeLog v1.8.3, StudyDesk merged upstream (Builder).** Three further review points from linsui, all resolved: Node installed via `apt-get -t forky` instead of a curl'ed tarball; `commit:` re-pinned to the *dereferenced* tag hash (`refs/tags/<tag>^{}`, not the annotated tag object); Google Fonts removed in favor of self-hosted woff2 (was render-blocking and could hang the app offline), with LimeLog's `NonFreeNet` reason updated to disclose the AI debrief's Gemini call. Shipped as NCC v1.7.2/vc26 and LimeLog v1.8.3/vc19. **StudyDesk MR !41551 merged into `fdroid/fdroiddata` master** — future StudyDesk releases are now tag + GitHub Release only, no MR. NCC !41550 and LimeLog !41548 are CI-green and awaiting linsui's merge; nothing further owed on our side.

---

*File: `D:\emilh\Projects\limecore\Nexus_Version_Status.md`*
*Do not restructure headers — builder chats and CTO coordination depend on stable section names.*
