# NEXUS v1.8 Build Plan — Activation

**Milestone:** `v1.8` — Activation
**Release scope:** **StudyDesk v1.6.0 only.** NCC + LimeLog held — see Sequencing.
**Registry:** `Nexus_Version_Status.md`
**Prior:** v1.7 complete (NCC v1.7.2 / LimeLog v1.8.3 / StudyDesk v1.5.4)
**Origin:** ACT-1 investigation, 2026-07-26. Findings split into ACT-2..ACT-5.

> ## 🛑 BUILD HELD — do not start implementation
>
> CTO has not given the go. Plan is scoped and ready; no code is to be written
> against ACT-2..ACT-5 until explicitly released.
>
> **Decided so far (2026-07-26):** ship StudyDesk alone; hold NCC + LimeLog
> until !41550 and !41548 merge.
> **Still open:** CTO additions to scope (see bottom section), and confirmation
> of the version bumps.

---

## Milestone Goal

Close the gap between signup and first logged row. 103 accounts, 5 external users
with any data, 4 who ever returned on a later day.

**Framing correction (matters for how this milestone is judged):** the original
ACT-1 hypothesis — "the app demands an account before showing value" — is
**disproven**. Guest mode ships in all three apps and has since StudyDesk v1.1.
Every one of the 103 accounts *passed* the gate and then entered nothing. So the
measurable failure is post-signup, and ACT-2..ACT-4 are best understood as
**removing friction that suppresses installs we can't see**, not as fixing the
103 we can. Do not expect the 103 to reactivate.

---

## ACT-2 — Translate the auth gates (highest confidence, lowest risk)

**Defect.** The auth gate is the only untranslated screen in the suite, and it is
the first screen every new user sees. Zero `t()` calls across all four auth
screens; every string is an English literal. Verified at runtime: with
`limecore_lang=fi`, the gate renders fully English while the onboarding directly
behind it renders fully Finnish.

**Why it bites.** The language picker is onboarding step 0, which renders *after*
the gate in all three apps (LimeLog's own comment: `// Onboarding gate — only
after auth is satisfied`). A non-English user must transact with an English wall
to reach the screen that would have spoken their language.

**Design call — no new picker UI is needed.** All three apps already run
`detectLanguage()` with a device-locale fallback (`navigator.languages[0]` →
base tag → `en`), verified identical in all three `src/i18n/index.*`. A Finnish
device *already* resolves `lng: 'fi'` at boot — the gate is hardcoded English
despite i18n being live and correct. So translating the strings alone fixes the
common case with no layout change and no new screen.

**Files.**

| App | File | Lines |
|---|---|---|
| StudyDesk | `src/features/auth/AuthGate.jsx` | 292 |
| NCC | `src/screens/auth/Login.tsx` | 227 |
| NCC | `src/screens/auth/Signup.tsx` | 156 |
| LimeLog | `src/components/FirstLaunchAuth.tsx` | 285 |

Plus 18 locale files (6 languages × 3 apps) under `src/i18n/locales/`.

**Tasks.**
1. Add an `auth.*` key block to `en.json` in each app; mirror into `fi/fr/de/es/zh`.
2. Wrap every literal in the four screens. Include the guest caption
   ("LOCAL ONLY · NO CLOUD SYNC · YOU CAN SIGN IN LATER") and the Nexus SSO note.
3. **Supabase error strings** — `error.message` from `signInWithPassword` /
   `signUp` / `exchangeCodeForSession` is server-supplied English. Map the
   handful of common codes (invalid credentials, user already registered, weak
   password, network failure) to translated copy; fall through to the raw
   message for anything unmapped rather than swallowing it.
4. Verify by forcing each of the 6 locales and confirming no English remains.

**Optional (CTO call):** a compact language chip on the gate for the case where
device locale ≠ user preference. Not required for the common case; adds surface
to a screen that ACT-4 wants *shorter*, so these two interact — decide together.

---

## ACT-3 — First-run gate is framed for returning users

**Defect.** StudyDesk's gate initialises `mode = 'signin'` and renders
**"Welcome back"** / **"Pick up where you left off."** to someone who has never
opened the app.

**Fix.** Initialise from a first-run signal rather than a constant. The existing
`studydesk-onboarded` flag is set *after* onboarding, which is behind the gate,
so it is a valid "has this device ever completed first run" test at gate time —
no new flag needed. Default to signup framing when unset, signin when set.

**Also audit** NCC `Login.tsx` (`"Command Center · Sign in"`) and LimeLog
`FirstLaunchAuth.tsx` for the same returning-user assumption.

Copy for the first-run branch should carry the local-first promise, not just an
account pitch — this is the screen where "you don't need an account" has to land.

---

## ACT-4 — "Continue as guest" falls below the fold on smaller phones

**Measured**, StudyDesk gate at 380px width, guest link bottom = **683px**:

| Device class | Usable viewport | Guest link |
|---|---|---|
| S24 / flagship | ~732px | visible |
| Common midrange | 640px | **43px below fold** |
| Small / older | 592px | **91px below fold** |

The page scrolls (`overflow: visible`, wrap grows past `min-height:100vh`), but
the centred card reads as a complete screen so there is no scroll affordance.
The only control that bypasses signup is the one a cheaper-device user may never
see. Adding the Nexus SSO button (~78px, shown when NCC is installed) pushes it
below the fold on flagships too.

**Recommended fix — progressive disclosure of the email form.** Collapse the
email/password fields behind a "Sign in with email" disclosure. That removes
~180px, fixes the fold on every device class in the table, and simplifies a
screen currently offering four parallel paths (Nexus · Google · email · guest).
Preserves the v1.1 decision to keep guest visually distinct from the login
methods rather than promoting it to a third button.

**Constraints.**
- Per standing rules, this is a UI change → run `/frontend-design` first.
- StudyDesk's cream-paper aesthetic is non-negotiable; NCC and LimeLog keep
  their own systems. Three separate passes, not one shared component.
- Re-measure all three gates at 592 / 640 / 732px after the change. Task
  includes taking the NCC + LimeLog baseline measurements, which were not
  captured in the ACT-1 investigation.

---

## ACT-5 — Identify the acquisition channel (do this first)

**Finding.** The registry attributed the 103 signups to "F-Droid discovery."
Unsupported:

| Week | Signups | via Google |
|---|---|---|
| 2026-05-11 | 2 | 1 |
| 2026-06-01 | 1 | 1 |
| 2026-07-06 | 45 | 37 |
| 2026-07-13 | 39 | 35 |
| 2026-07-20 | 16 | 9 |

The surge begins week of **07-06**. StudyDesk merged into fdroiddata on
**07-25**; NCC and LimeLog are still unmerged. F-Droid was distributing none of
the apps during the surge. Corroborating: **83 of 103 chose Google OAuth**,
which is not how a privacy-selected F-Droid audience behaves.

**Why it goes first.** ACT-2 assumes a multilingual, privacy-motivated,
possibly-lower-end-device audience. Every one of those assumptions comes from
the F-Droid story, and the F-Droid story is wrong. If these are, say, users from
a single link on one forum in one country, the priority order changes.

**Investigation (no app code).**
1. GitHub release asset download counts per tag, all three repos — compare
   against the signup curve.
2. GitHub repo traffic / referrer data for the surge window.
3. Vercel analytics on `limecore-site` for the same window.
4. Locale distribution of existing accounts as a weak geography proxy.

Deliberately **not** proposing an in-app "how did you hear about us" prompt —
adding a question to first run is the opposite of this milestone's goal.

---

## Sequencing — F-Droid interaction ✅ DECIDED 2026-07-26

**Decision (CTO): ship StudyDesk v1.6.0 alone. Hold NCC and LimeLog until
!41550 and !41548 merge.**

NCC !41550 and LimeLog !41548 are open, CI-green, and pinned to **1.7.2 /
1.8.3**. Tagging 1.8.0 / 1.9.0 now would leave both MRs adding an already-
superseded version, forcing another canonicalisation + CI round and more of
linsui's time. Holding avoids that entirely: once merged, `AutoUpdateMode:
Version` picks up new tags with no MR at all.

**Release consequence.** StudyDesk is already merged and auto-updates from tags,
so v1.6.0 ships the moment it's tagged with a GitHub Release carrying the signed
APK. ⚠️ Auto-update clones the previous recipe verbatim — any regression against
section A of `fdroid/FDROID_RELEASE_CHECKLIST.md` breaks the next build
silently, with **no MR review to catch it**. Section A is a hard gate on this
release, not a formality.

**Working assumption for when build starts (flagged, revisit at go):** do the
ACT-2/3/4 work for *all three* apps on `develop`, but tag and release only
StudyDesk. NCC/LimeLog changes then ride the next release once their MRs land.
This keeps the suite from drifting into three divergent auth-gate
implementations and avoids re-deriving the work later. The alternative — build
StudyDesk only — is cheaper now but leaves ACT-2 half-done across the suite for
an unbounded period, since neither MR has a merge ETA.

Revised scope for the v1.8 *release*:

| App | Current | v1.8 release | Note |
|---|---|---|---|
| StudyDesk | 1.5.4 | **1.6.0 — ships** | merged; tag + GitHub Release is the whole flow |
| NCC | 1.7.2 | held | code may land on develop; no tag until !41550 merges |
| LimeLog | 1.8.3 | held | code may land on develop; no tag until !41548 merges |

---

## Baseline measurement (add before shipping)

Capture the pre-v1.8 activation numbers so the milestone can be judged rather
than guessed. Suggested definition — *fraction of accounts created in a window
that hold ≥1 row in any owned table within 7 days*. Current value ≈ 5% (5/103,
all-time). Without a stored baseline, the next registry entry will be another
qualitative claim.

---

## Version bump proposal (CTO to confirm)

| App | Current | Proposed | Ships in v1.8? | Rationale |
|---|---|---|---|---|
| StudyDesk | 1.5.4 | 1.6.0 | ✅ yes | ACT-2/3/4 change first-run behaviour; carries the ACT-4 design work — MINOR |
| NCC | 1.7.2 | 1.8.0 | ⏸ held | tag only after !41550 merges |
| LimeLog | 1.8.3 | 1.9.0 | ⏸ held | tag only after !41548 merges |

Arguable as PATCH if the CTO reads these as pure defect fixes. ACT-4 restructures
a screen, which tips it to MINOR in my read.

---

## CTO additions

**Added 2026-07-26, from the Obsidian Nexus OS Suite braindump.** These are feature/UX items, not activation defects — they do not get to jump the P3 priority ranking. Placement below reflects that: StudyDesk's item is folded into the v1.8 *release* (CTO call, since StudyDesk is shipping this milestone); NCC's and LimeLog's items go on `develop` only, in the same held bucket as their ACT-2/3/4 work, since neither app tags until its fdroiddata MR merges regardless of scope — no release cost to adding them here.

### StudyDesk — folds into v1.6.0 release scope (ships with ACT-2/3/4)

**Assignment "type" as free text.** Currently a closed enum (presets + "Other", no way to specify what "Other" means). Replace with a field that accepts a custom label — either a text input that also offers the existing presets as quick-picks, or an "Other" selection that reveals a label field. **Before scoping as trivial:** confirm NCC's read side (`subjects`/`grades`, the only StudyDesk tables NCC consumes per the Cross-App Dependency Matrix) doesn't assume the fixed enum anywhere in its UI or filters — if assignment `type` isn't part of that shared surface at all, this is StudyDesk-only and low-risk. **Folding this in expands v1.6.0's scope beyond pure activation fixes** — CTO has accepted that trade-off; flagging so it's not lost by the time this ships. Does not change the MINOR version call.

### NCC — develop only, no tag (rides the next release once !41550 merges)

1. **Life/Fitness composite score reads artificially low mid-week (bug).** Score currently appears to compute `completed / weekly-target`, so on e.g. Wednesday with 2 of 3 weekly workouts logged it shows well under 100 even though the user is exactly on pace. **Fix direction:** pace-adjust against *expected-by-elapsed-time-in-the-week* rather than the full weekly target, capping at 100 once the actual weekly target is met early. **Not yet started:** locate the exact composite-score source file before scoping a branch — not identified in this pass.
2. **Fitness weekly target (currently hardcoded at 3 workouts) needs to flex for sick/injured weeks.** The braindump's framing — fewer required when sick, still fewer but achievable when injured, more baseline than 3 for someone training 4+×/week — describes per-week variability, not just a different fixed number. **Open design question, genuinely undecided, decide before building:** (a) a static per-user baseline in Life Profile settings (simple, but can't flex week-to-week for sickness/injury), or (b) an ad-hoc per-week override on top of a baseline default (matches the braindump's actual framing, but is a bigger feature — needs its own small schema + UI). **Note the overlap:** this is the same "flexible weekly target" problem as the Habits backlog note in the Active Milestone's carried-over Growth-hub plan (`habits.ts` weekly-aggregate targets). Worth deciding the general mechanism once rather than solving it twice across two different domains (Fitness score, Habits).

### LimeLog — develop only, no tag (rides the next release once !41548 merges)

**Loggable "other" workout types** (basketball, cycling, running, swimming, custom/other) so non-gym training counts toward NCC's fitness score via the shared `workout_sessions`/`workout_sets` tables. **Open question, not yet checked — verify before estimating:** does NCC's fitness score already count all logged sessions regardless of type, or does it filter to gym/strength-specific sessions? If NCC filters, this needs a schema change to a shared table (new type/column or enum value on `workout_sessions`), which per the Shared Supabase Data Contract requires a migration file + updates to every consuming app + **explicit confirmation before any `apply_migration` or DDL** — not just LimeLog-side UI work. Determine which case this is first.

---

*File: `D:\emilh\Projects\limecore\NEXUS_V18_BUILD_PLAN.md`*
