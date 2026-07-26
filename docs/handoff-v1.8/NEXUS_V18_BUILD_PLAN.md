# NEXUS v1.8 Build Plan — Activation

**Milestone:** `v1.8` — Activation
**Release scope:** **StudyDesk v1.6.0 only.** NCC + LimeLog held — see Sequencing.
**Registry:** `Nexus_Version_Status.md`
**Prior:** v1.7 complete (NCC v1.7.2 / LimeLog v1.8.3 / StudyDesk v1.5.4)
**Origin:** ACT-1 investigation, 2026-07-26. Findings split into ACT-2..ACT-5.

> ## ▶️ BUILD RELEASED — 2026-07-26
>
> Emil gave the go. Implementation has started; the hold below is superseded
> and kept only for provenance.
>
> **Decided so far (2026-07-26):** ship StudyDesk alone; hold NCC + LimeLog
> until !41550 and !41548 merge. Both open design questions are now **answered
> from the code** — see the CTO additions section. Version bumps still
> unconfirmed.
>
> <details><summary>Original hold text</summary>
>
> 🛑 BUILD HELD — CTO has not given the go. Plan is scoped and ready; no code
> is to be written against ACT-2..ACT-5 until explicitly released.
> </details>

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

### ✅ NCC baseline measured 2026-07-26 — NCC has no ACT-4 defect

The plan flagged that NCC's and LimeLog's baselines were never captured. NCC's
now is, against the built app at 380px width:

| State | 592px | 640px | 732px |
|---|---|---|---|
| Email collapsed (default) | visible, 156px clear | visible, 180px clear | visible, 226px clear |
| Email expanded (worst case) | visible, 36px clear | visible, 63px clear | visible, 109px clear |

**NCC clears the fold in every state on every device class, so it needs no ACT-4
change.** The reason is that NCC v1.1 already ships exactly the progressive
disclosure this plan recommends for StudyDesk — email/password collapsed behind
a "Use email instead" button (`src/screens/auth/Login.tsx`). **NCC is the
reference implementation for the StudyDesk fix**; copy the pattern, not a shared
component.

**Nuance from ACT-5 that resizes this item.** 43 of 88 confirmed devices run
Android 16 and are current-generation budget/mid hardware — Redmi 13C-class
phones are 360×800 CSS, so most real users sit near ~730px, not the 592–640px
rows in the table above. The defect is real and cheap to fix, but it likely
affects fewer users than "32 budget devices" suggests. Fix it; don't headline
the milestone with it.

**Constraints.**
- Per standing rules, this is a UI change → run `/frontend-design` first.
- StudyDesk's cream-paper aesthetic is non-negotiable; NCC and LimeLog keep
  their own systems. Three separate passes, not one shared component.
- Re-measure all three gates at 592 / 640 / 732px after the change. Task
  includes taking the NCC + LimeLog baseline measurements, which were not
  captured in the ACT-1 investigation.

---

## ACT-5 — ✅ RESOLVED 2026-07-26 — these are real end users on real phones

> **The "developers running cloned repos" hypothesis is DISPROVEN.** Resolved by
> a remote agent session, 2026-07-26. Everything below the "Original framing"
> divider is the pre-resolution text, kept for provenance.

### What the earlier pass missed

The investigation concluded no client/IP data existed because
`auth.audit_log_entries` is empty (retention window elapsed). It is — but
**`auth.sessions` is not.** That table retained **91 sessions covering 88 of the
103 accounts**, spanning the entire surge window (2026-06-27 → 07-25), each with
`user_agent` *and* `ip`.

### Evidence

| Check | Result |
|---|---|
| Client type | **91/91 Android WebView — the native Capacitor app** |
| Desktop / laptop browser sessions | **0** |
| Distinct IPs | 88 across 88 users — no clustering, not one person |
| Emulators | **1** (`sdk_gphone64_x86_64`) |
| Device tier | 32 budget · 46 mid · 10 flagship |
| Android version | 43/88 on Android 16; 2 on 17 — current-generation devices |

Budget tier is Infinix, itel, TECNO, Redmi 7 / Note 8, Galaxy A02/A12, Realme.

### Why this kills the developer hypothesis

A developer running `npm run dev` against a cloned repo signs in from a **desktop
browser**. Zero of 88 did. Exactly one emulator appears in the whole dataset. The
accounts were created from the **shipped Android app** on a wide spread of real
consumer hardware.

### Geographic distribution

Inferred from device model market codes (Samsung region suffixes, Xiaomi model
codes, brand footprint). **No user IPs were sent to any third party.**

| Cluster | Users | Evidence |
|---|---|---|
| India | ~12–15 | Xiaomi `PI`/`I`/`II` codes, Samsung M-series, OPPO CPH, Realme |
| LATAM | ~10 | Motorola g-series (8), Samsung `M`/`E` suffixes |
| Africa | 6 | Transsion — Infinix 4, itel 1, TECNO 1 |
| China | ~6 | Xiaomi `C`, vivo `A`, Huawei `AN` (matches the 3 qq.com accounts) |
| US / Canada | 5 | Samsung `U` (3), `W` (2) |
| Europe | ~8 | Samsung `B`/`F` |

A genuinely global long tail with no single hotspot — the shape APK-mirror
redistribution produces. **Confidence: device-market inference, not confirmed
geography.** Geolocating the 88 session IPs would confirm it but means disclosing
real users' IPs to a third-party service — deliberately not done.

### Consequences — these change the milestone

1. **P3's denominator is real after all.** ~98 real people signed up on real
   phones and entered nothing. Activation *is* broken, and ACT-2/3/4 may be
   sized and justified against the 5% figure. The registry's "second correction"
   is itself wrong and should be reverted at the next update.
2. **ACT-4 outranks ACT-2 on evidence** — 32 confirmed budget devices is exactly
   the class the fold defect hits. But see the nuance in ACT-4 below: these are
   *current-generation* budget devices, so most sit near ~730px, not 592–640px.
3. **The acquisition channel is still not positively identified.** 52 lifetime
   GitHub APK downloads cannot produce 88 native installs, and F-Droid
   distributed nothing during the surge. **APK mirror sites are the leading
   candidate** — they scrape GitHub Releases automatically, and that is precisely
   how apps reach India/Africa/LATAM audiences. Worth confirming; it is the real
   channel and nobody is managing it.
4. **SEC-1 confirmed concretely** — the committed fallback resolves to production
   in all three repos: `nexus-command-center/src/lib/supabase.ts:15`,
   `limelog/src/lib/supabase.ts:18`, `studydesk/src/lib/supabase.js:11`.

### Still worth doing

The instrumentation item from the registry (write `platform` + `app_version` into
a profile row at signup) remains the cheapest way to make this self-answering
going forward, and would have made this investigation unnecessary.

---

<details><summary><strong>Original framing (pre-resolution, kept for provenance)</strong></summary>

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

</details>

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

1. **Life/Fitness composite score reads artificially low mid-week (bug).** ✅ **FIXED 2026-07-26.** The source the plan couldn't locate is `src/lib/crossDomainSignals.ts:409` — it was literally `Math.min(100, (fit.sessionsCount / 3) * 100)`. Now divides by `WEEKLY_WORKOUT_TARGET * weekElapsedFraction()`, so the denominator is what you'd expect to have done by today. Wednesday 2-of-3 goes **67 → 100**; hitting the full target early still caps at 100. Only week 0 is pace-adjusted — closed weeks pass `paceFraction: 1` and keep scoring against the full target, so the 8-week history does not drift (follows the existing `i === 0` convention in the orchestrator). The magic `3` is now the named `WEEKLY_WORKOUT_TARGET`.

   **Related, deliberately not fixed:** the *study* sub-score has the identical shape (`totalMinutes / 240`, line 410) and the same mid-week problem. The braindump named only Fitness, so it was left alone — worth a decision.
2. **Fitness weekly target (currently hardcoded at 3 workouts) needs to flex for sick/injured weeks.** The braindump's framing — fewer required when sick, still fewer but achievable when injured, more baseline than 3 for someone training 4+×/week — describes per-week variability, not just a different fixed number. **Open design question, genuinely undecided, decide before building:** (a) a static per-user baseline in Life Profile settings (simple, but can't flex week-to-week for sickness/injury), or (b) an ad-hoc per-week override on top of a baseline default (matches the braindump's actual framing, but is a bigger feature — needs its own small schema + UI). **Note the overlap:** this is the same "flexible weekly target" problem as the Habits backlog note in the Active Milestone's carried-over Growth-hub plan (`habits.ts` weekly-aggregate targets). Worth deciding the general mechanism once rather than solving it twice across two different domains (Fitness score, Habits).

> ### Overlap confirmed 2026-07-26 — still Emil's decision, not built
>
> `HabitFrequencyKind` is still `'daily' | 'specific_days'` (`src/types/habits.ts:32`)
> — no weekly-aggregate kind exists, exactly as the backlog note said. So the
> same problem is genuinely live in both domains.
>
> **Recommendation (not acted on): option (b), baseline + per-week override,
> built as one shared target resolver both Fitness and Habits call.** Reasoning:
> the braindump's actual framing is sick/injured *weeks*, which is inherently
> per-week — a static baseline cannot express it, so users would set it once and
> never touch it again. The pacing fix above also already collapsed the target to
> a single named constant behind one call site, so the seam for a
> `weeklyTargetFor(domain, weekStart)` resolver now exists and (b) is cheaper
> than when the plan was written.
>
> **Deliberately not built past this point** — the mechanism choice is Emil's.

### LimeLog — develop only, no tag (rides the next release once !41548 merges)

**Loggable "other" workout types** (basketball, cycling, running, swimming, custom/other) so non-gym training counts toward NCC's fitness score via the shared `workout_sessions`/`workout_sets` tables.

> ### ✅ ANSWERED 2026-07-26 — no schema change, stop condition NOT triggered
>
> **NCC does not filter by session type.** Verified in three places:
>
> | Check | Finding |
> |---|---|
> | DB column | `workout_sessions.session_type` is `text NOT NULL` — no enum, no CHECK constraint |
> | NCC type | `WorkoutType = string` (`src/types/fitness.ts:5`), commented as accepting "push/pull/legs, upper/lower, full body, cardio, **or anything custom the user enters**" |
> | NCC scoring | `bucketFitnessByWeek` (`src/lib/crossDomainSignals.ts:109`) filters on **date only** — zero type filtering anywhere in the path |
>
> Basketball, cycling, running and swimming sessions would already count toward
> NCC's fitness score today if LimeLog wrote them. **This is LimeLog-side UI work
> only** — no migration, no DDL, no consuming-app updates, no §3 confirmation
> needed. Cheaper than the plan assumed.
>
> One behavioural note: the fitness sub-score counts `sessionsCount`, not sets,
> so a cardio session logged with zero sets still counts as a full session —
> which is the desired outcome. `totalSetCount` is computed but is not read
> anywhere, so it has no effect either way.

---

*File: `D:\emilh\Projects\limecore\NEXUS_V18_BUILD_PLAN.md`*

---

## ACT-6 — Language coverage does not match the real audience

**Added 2026-07-26, downstream of the ACT-5 resolution.** ACT-2 translates the
gate into the six languages the suite ships: `fi / en / fr / de / es / zh`. Once
ACT-5 established who the users actually are, those six stop looking like the
right six.

Against the ACT-5 geography: Ecuador and the wider LATAM cluster are served by
`es`, China by `zh`, and the African cluster is largely Nigeria/Ghana/Kenya where
English is the official app language — so `en` already covers it. The gap is
**India (~12–15 users, the single largest cluster) and Brazil**, neither of which
has a language in the suite. Meanwhile `fi` serves a user base of essentially one.

**Decision (Emil, 2026-07-26): add all four — `hi`, `pt-BR`, `id`, `ar`.**
Evidence strength differs and should be recorded honestly:

| Lang | Evidence | Note |
|---|---|---|
| `hi` Hindi | **Strong** — largest device cluster | |
| `pt-BR` Portuguese (Brazil) | **Strong** — Motorola + Samsung `M`/`E` | |
| `id` Indonesian | **Weak** — no direct device evidence | Added on CTO call |
| `ar` Arabic | **Weak** — some Samsung `E` Middle East variants | **Requires RTL** |

**Arabic is not just a locale file.** It needs RTL layout support across all
three apps — `dir="rtl"` on the document, logical CSS properties in place of
`left`/`right`, and mirrored icons/chevrons. This is substantially larger than
adding the other three and should be tracked as its own chunk. Flagged before
the decision was taken; the CTO accepted the cost.

**Scope of the translation work: 1,502 keys per language across the suite**
(NCC 901, StudyDesk 356, LimeLog 245) → **~6,008 new strings for four
languages.** Machine-produced translations of that volume should get native
review before they ship, particularly for domain vocabulary (finance, training,
academic grading). Treat any bulk-generated locale file as *draft* until
reviewed.

### Language picker must be relaid out first

**Decision (Emil, 2026-07-26): scrollable capped grid.** Keep each app's existing
two-column boxes, cap the container at ~3.5 rows with `overflow-y: auto`; the
partial row is the scroll affordance. Height stays ~175px at any language count.

Six picker instances need it — measured at 380px, a 2-column grid costs 154px at
6 languages and **262px at 10** (+108px, +70%):

| App | Location | Current layout |
|---|---|---|
| NCC | Onboarding step 0 | `grid grid-cols-2 gap-2`, glass boxes |
| NCC | Settings | same grid |
| StudyDesk | Onboarding | `.ob-langs` — `grid-template-columns: 1fr 1fr` |
| StudyDesk | Settings | `.sv2-lang-grid` — same |
| LimeLog | Onboarding | `.onb-goal` boxes (shared with goal picker) |
| LimeLog | Profile → Settings | `.settings-toggle` — **flex segmented control** |

**LimeLog's Profile picker is the worst case** and is the reason this can't be a
pure CSS tweak: it's a flex segmented control, which does not wrap gracefully and
is already tight at six. It needs converting to the grid form, not just capping.

**Second-order risk:** StudyDesk's onboarding step 0 at a 592px viewport would
push its Continue button below the fold at 10 languages — the same defect class
as ACT-4, reintroduced by the fix for ACT-2. Re-measure step 0 after the picker
change, not just the gate.

---

## Incidental findings (2026-07-26 session) — flagged, not fixed

Per the working agreement: named here rather than fixed unasked.

1. **🔴 NCC has a live write path to LimeLog-owned tables.** `useFitnessStore`
   enqueues `workout_session` / `workout_set` mutations
   (`src/store/useFitnessStore.ts:237,251,260,266,274`) and `cloudSync.ts:549`
   dispatches them straight to Supabase. This contradicts the binding data
   contract ("NEVER write `workout_sessions` / `workout_sets`") and NCC's own
   `CLAUDE.md`. **Currently dormant** — no UI calls those actions, since v1.5.2
   removed Quick Log's Session/Set entries — but the machinery is fully wired, so
   any future caller silently starts writing to LimeLog's tables in production.
   Recommend deleting the store actions and push handlers outright.

2. **The build gate is fragile against toolchain float.** `package.json` pins
   `"typescript": "^5.6.2"`, and with an empty `node_modules` the caret resolves
   to **6.0.2**, which hard-errors on the deprecated `baseUrl` in `tsconfig.json`
   before compiling a single file. `npm ci` first gives 5.9.3 and a clean build.
   Worth pinning exactly, given two releases have already shipped broken because
   this gate was skipped.

3. **Study sub-score shares the fitness pacing bug** — see the CTO additions
   section above.
