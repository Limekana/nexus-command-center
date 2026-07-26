# v1.8 — Remote Session Update

**Session date:** 2026-07-26 · **Agent:** remote (Claude Code on the web)
**For:** the dev-machine agent, to fold into `limecore/Nexus_Version_Status.md`
following `limecore/BUILDER_UPDATE_PROMPT.md`.

`docs/handoff-v1.8/` was deleted in this branch, as its README instructed. This
file replaces it and is the complete record of what changed.

> **Registry edits are deliberately NOT made here.** The remote session has no
> access to `limecore/`. Everything the registry needs is in §1 and §7.

---

## 0. Branches — all pushed, none merged, no tags

| Repo | Branch | Head | Base |
|---|---|---|---|
| `nexus-command-center` | `claude/ncc-repos-setup-3kvqoj` | `6d39df6` | `develop` |
| `studydesk` | `feature/v1.8-act2-act4-auth-gate` | `d38c0c9` | `develop` |
| `limelog` | `feature/v1.8-act2-auth-i18n` | `222b129` | `develop` |

No PRs opened. No merges to `main`. No tags. No Supabase migrations, DDL, or
writes of any kind — the only database access this session was read-only
`SELECT`s during the ACT-5 investigation.

**NCC branch name note:** the session was pinned to `claude/ncc-repos-setup-3kvqoj`
rather than a `feature/*` branch, so it does not follow the repo's convention.
Rename on merge if that matters.

---

## 1. 🔴 ACT-5 is RESOLVED and it reverses a registry conclusion

**The "most of the 103 accounts are developers running cloned repos" hypothesis
is disproven.** The registry's *second correction* (2026-07-26) is itself wrong
and should be reverted.

### How

The earlier pass concluded no client/IP data existed because
`auth.audit_log_entries` is empty. It is — but **`auth.sessions` is not.** It
retained **91 sessions covering 88 of the 103 accounts**, spanning the whole
surge window (2026-06-27 → 07-25), each with `user_agent` *and* `ip`.

| Check | Result |
|---|---|
| Client type | **91/91 Android WebView — the native Capacitor app** |
| Desktop / laptop browser sessions | **0** |
| Distinct IPs | 88 across 88 users — no clustering |
| Emulators | **1** (`sdk_gphone64_x86_64`) |
| Device tier | 32 budget · 46 mid · 10 flagship |
| Android version | 43/88 on Android 16, 2 on 17 — current-generation |

A developer running a cloned repo signs in from a desktop browser. Zero of 88
did. These are real people on real phones — Infinix, itel, TECNO, Redmi 7 /
Note 8, Galaxy A02/A12, Realme.

### Geography (device market codes; no user IPs sent anywhere)

| Cluster | Users | Evidence |
|---|---|---|
| India | ~12–15 | Xiaomi `PI`/`I`/`II`, Samsung M-series, OPPO CPH, Realme |
| LATAM | ~10 | Motorola g-series (8), Samsung `M`/`E` |
| Africa | 6 | Transsion — Infinix 4, itel 1, TECNO 1 |
| China | ~6 | Xiaomi `C`, vivo `A`, Huawei `AN` (matches 3 qq.com accounts) |
| US / Canada | 5 | Samsung `U` (3), `W` (2) |
| Europe | ~8 | Samsung `B`/`F` |

Global long tail, no single hotspot. **Confidence: device-market inference, not
confirmed geography.** Geolocating the 88 IPs would confirm it but means
disclosing real users' IPs to a third party — deliberately not done, flag for a
decision.

### Consequences for the registry

1. **P3's denominator is real.** ~98 real people signed up and entered nothing.
   Activation *is* broken; ACT-2/3/4 may be justified against the 5% figure.
2. **The acquisition channel is still not positively identified.** 52 lifetime
   GitHub APK downloads cannot produce 88 native installs, and F-Droid
   distributed nothing during the surge. **APK mirror sites are the leading
   candidate** — they scrape GitHub Releases, which is how apps reach these
   markets. Nobody is managing that channel.
3. **SEC-1 confirmed concretely** — committed fallback resolves to production in
   all three repos: `nexus-command-center/src/lib/supabase.ts:15`,
   `limelog/src/lib/supabase.ts:18`, `studydesk/src/lib/supabase.js:11`.
4. The `platform` + `app_version`-at-signup instrumentation would have made this
   investigation unnecessary. Still the cheapest fix.

---

## 2. ACT-2 — auth gates translated (all three apps) ✅

Every gate had **zero `t()` calls**. All literals are now wrapped, with an
`auth.*` block in each app's six existing locales.

| App | Files | Keys |
|---|---|---|
| NCC | `screens/auth/Login.tsx`, `Signup.tsx` | 40 |
| StudyDesk | `features/auth/AuthGate.jsx` | 36 |
| LimeLog | `components/FirstLaunchAuth.tsx` | 28 |

Each app also gained an `authErrors` mapper (`lib/authErrors.{ts,js}`).
`error.message` from `signInWithPassword` / `signUp` / `exchangeCodeForSession`
is server-supplied English, so translating the screens alone would still have
left the string shown *when something breaks* in English. Maps by `error.code`
with a message-substring fallback, and **falls through to the raw message when
unmapped** rather than swallowing it behind a generic failure.

Verified in all six locales against each built app: no English remains.

Brand nouns ("Nexus", "Nexus Command Center", "LimeLog", "StudyDesk") stay
literals by design.

---

## 3. ACT-3 — first-run framing

| App | Verdict |
|---|---|
| **StudyDesk** | **Defect fixed.** `mode` was a hardcoded `'signin'`, greeting first-timers with "Welcome back" / "Pick up where you left off." Now initialises from the existing `studydesk-onboarded` flag (written at the end of onboarding, i.e. behind the gate — a sound first-run signal). First run leads with the local-first promise. |
| **NCC** | **Defect fixed.** Same pattern via `isOnboarded()`. Was "Command Center · Sign in" for everyone. |
| **LimeLog** | **No defect — audited, no change.** Already leads with "Get started" and a subtitle offering the local path. |

---

## 4. ACT-4 — guest link below the fold

Baselines for NCC and LimeLog had never been captured. They are now, measured at
380px against each built app.

| App | State | 592px | 640px | 732px |
|---|---|---|---|---|
| **StudyDesk (before)** | — | **91px below** | **43px below** | visible |
| **StudyDesk (after)** | collapsed | 138 clear | 162 clear | 186 clear |
| | expanded | 14 clear | 56 clear | 72 clear |
| **NCC** | collapsed | 156 clear | 180 clear | 226 clear |
| | expanded | 36 clear | 63 clear | 109 clear |
| **LimeLog** | collapsed | 130 clear | 154 clear | 200 clear |
| | expanded | 42 clear | 80 clear | 126 clear |

**StudyDesk was the only app with the defect.** NCC and LimeLog already ship the
progressive-disclosure pattern the plan recommended (email collapsed behind a
disclosure) — NCC since v1.1. StudyDesk now matches, plus a `max-height` media
query that tightens chrome on short viewports so the *expanded* state clears the
fold too.

**Sizing nuance:** 43 of 88 confirmed devices run Android 16 and are
current-generation budget/mid hardware (Redmi 13C-class = 360×800 CSS), so most
real users sit near ~730px, not 592–640px. The defect was real and worth fixing;
it likely affected fewer users than "32 budget devices" implies. Don't headline
the milestone with it.

---

## 5. ACT-6 (new) — language coverage + picker relayout

Raised because the ACT-5 geography showed the six shipped languages miss the
largest cluster (India) and Brazil entirely.

### Languages added: `hi`, `pt`, `id`, `ar`

Evidence strength differs and should be recorded honestly:

| Lang | Evidence |
|---|---|
| `hi` Hindi | **Strong** — largest device cluster |
| `pt` Portuguese | **Strong** — Motorola + Samsung `M`/`E` |
| `id` Indonesian | **Weak** — no direct device evidence; added on CTO call |
| `ar` Arabic | **Weak** — some Samsung `E` Middle East variants; **needs RTL** |

Arabic sets `dir="rtl"` on `<html>` via a new `applyDirection()` in each app's
`i18n/index.*`, applied at boot and on every manual switch. `lang` is set for all
ten so font fallback resolves for Devanagari and Arabic script. Verified:
`dir=rtl` for `ar` only, across all three apps.

> ⚠️ **RTL is wired, not audited.** Setting `dir` is the first step; individual
> screens using physical `left`/`right` CSS or directional icons have **not**
> been swept. Treat Arabic as unreleased until that pass happens.

### ✅ Translation scope — COMPLETE

**All four new locales are fully translated across all three apps.** Every key
in every app now has hi/pt/id/ar copy; nothing falls back to English.

| App | Keys | en | hi | pt | id | ar |
|---|---|---|---|---|---|---|
| NCC | 901 | 901 | 901 | 907 | 895 | 925 |
| StudyDesk | 393 | 393 | 393 | 398 | 388 | 413 |
| LimeLog | 273 | 273 | 273 | 278 | 268 | 293 |

Counts differ by design — plural categories are derived per language from CLDR,
not copied from English:

- **`id`** has no grammatical plural → one form (`_other`) only, so it is *below*
  the English count.
- **`hi`** matches English (`one`/`other`).
- **`pt`** needs `_many`. CLDR assigns Portuguese a `many` category at ≥ 1e6;
  with no form supplied, i18next falls through to **English**, not to `_other`.
  This was caught in testing (`gv.courses` at 1,000,000 rendered
  "1000000 courses") and fixed in all three apps.
- **`ar`** needs all six: `zero`/`one`/`two`/`few`/`many`/`other`.

**Terminology was researched, not glossed**, and the research found three real
errors in StudyDesk that are now fixed:

1. **Indonesian** used `mata kuliah` (university-only). IB and upper-secondary
   schools use **`mata pelajaran`**. Same class of error in `IPK` (tertiary GPA →
   plain `GPA`) and `SKS` (university credit unit → `kredit`).
2. **Arabic** used `مقرّر` (the *syllabus*) where the app means `مادة` (the
   *subject*). Because `مادة` is feminine and `مقرّر` masculine, numerals, the
   dual, the broken plural and the demonstrative all had to change with it — a
   plain noun swap would have produced ungrammatical Arabic.
3. **Hindi** used the transliteration `कोर्स`; **`विषय`** is the standard school
   term.

Domain vocabulary deliberately kept as English loanwords, because that is how
each community actually writes it: **deload, RPE, 1RM** (lifting); **FIFO, RSI,
SMA, P/E, P/B, P/S, PEG** (finance); ticker symbols and vendor/index names
(Finnhub, Yahoo, CoinGecko, ETF, VIX, Fear & Greed).

**Verification applied to all three apps:** 100% coverage against `en.json` for
all nine non-English locales, and every plural key confirmed to define every
CLDR category its language requires — checked against each locale's own resource
bundle, not by comparing rendered strings. (String comparison cannot distinguish
a deliberate loanword from a fallback; it produced a false positive on NCC's
`fin.wl.tickers`, where "ticker" is legitimately verbatim in pt and id.)

> ⚠️ **None of it has had native review.** The research narrowed the
> highest-risk gap; it did not close it. The likeliest places a reviewer will
> want changes are the finance vocabulary in NCC, the lifting vocabulary in
> LimeLog, and the grading-system terms in StudyDesk (IB/GPA scales, credits,
> period/jakso).

### Picker relayout — 7 instances, all capped

The pickers were one box per language in a 2-column grid: 154px at six
languages, **262px at ten** (+70%). At 592px that pushed onboarding's Continue
button below the fold — the ACT-4 defect class, reintroduced by the ACT-2 fix.

All are now capped at ~3.5 rows (`max-height: 184px`) with overflow scroll. **The
cap only bites once the list outgrows it, so the six-language layout is
unchanged.**

| App | Instance | Container |
|---|---|---|
| NCC | Onboarding step 0 | new `components/LanguageGrid.tsx` |
| NCC | Settings | same component, `variant="settings"` |
| StudyDesk | Onboarding step 0 | `.ob-langs` |
| StudyDesk | Settings | `.sv2-lang-grid` |
| StudyDesk | Adoption prompt | inline flex-wrap chip row |
| LimeLog | Onboarding step 0 | `.onb-langs` |
| LimeLog | Profile → Settings | `.settings-lang-grid` |

Verified at 380×592 with ten languages: grid holds at 184px against 267px of
content, and Continue stays above the fold at 592/640/732.

**Correction to an earlier claim:** LimeLog's Profile picker was described
mid-session as a flex segmented control that "breaks worst". That was wrong —
it is `.settings-lang-grid`, a proper 2-column grid added in v1.7.1, which only
borrows `.settings-toggle__btn` for button styling. All seven instances were
grids or wrapping flex; none broke outright.

Each app also gained a scroll-into-view helper (`LanguageGrid.tsx` in NCC,
`utils/useScrollSelectedIntoView.ts` in LimeLog, `lib/useScrollSelectedIntoView.js`
in StudyDesk). Without it, a user whose device resolved to Arabic opens the
picker, sees English/Suomi/Français, and concludes their language is missing —
exactly the audience ACT-6 exists for. **Deliberately not
`scrollIntoView({block:'nearest'})`**: measured leaving the last row 10px short,
because the effect runs before the display font swaps in and rows then grow. It
does the math against live rects and re-applies on the next frame and on
`document.fonts.ready`. Re-verified: selected item fully visible.

---

## 6. CTO braindump additions

### NCC — mid-week fitness score ✅ FIXED

Source file the plan couldn't locate: **`src/lib/crossDomainSignals.ts:409`**,
literally `Math.min(100, (fit.sessionsCount / 3) * 100)`.

Now divides by `WEEKLY_WORKOUT_TARGET * weekElapsedFraction()`. Wednesday 2-of-3
goes **67 → 100**; meeting the full target early still caps at 100. **Only the
in-progress week is pace-adjusted** — closed weeks pass `paceFraction: 1`, so an
old 2-of-3 week stays 67 and the 8-week history does not drift. Follows the
existing `i === 0` convention in the orchestrator. Magic `3` is now the named
`WEEKLY_WORKOUT_TARGET`.

Verified with a temporary vitest run (removed before commit — the project has no
test infrastructure and adding one was out of scope): 5 cases covering the
reported bug, the early-completion cap, behind-pace, and all four closed-week
values unchanged.

**Related, deliberately not fixed:** the *study* sub-score has the identical
shape (`totalMinutes / 240`, line 410) and the same mid-week problem. The
braindump named only Fitness. **Needs a decision.**

### NCC — flexible weekly target ⏸ NOT BUILT (decision required)

Overlap confirmed: `HabitFrequencyKind` is still `'daily' | 'specific_days'`
(`src/types/habits.ts:32`) — no weekly-aggregate kind. The same problem is live
in both Fitness and Habits.

**Recommendation:** option (b), baseline + per-week override, built as one shared
`weeklyTargetFor(domain, weekStart)` resolver both domains call. The braindump's
framing is sick/injured *weeks*, which is inherently per-week — a static baseline
can't express it. The pacing fix above already collapsed the target to one named
constant behind a single call site, so (b) is cheaper than when the plan was
written. **Mechanism choice is yours; not built past this point.**

### StudyDesk — assignment type as free text ✅ DONE

"Other" was a dead end: it stored the literal string `"Other"`. Selecting it now
reveals a label field and the user's own text is stored, so `type` stays a plain
string and no existing assignment changes shape.

Verified functionally, not just built: custom field hidden until "Other" is
selected, submit blocked while the label is empty, and the stored value is
`"Presentation"` rather than `"Other"`.

**Cross-app check (the plan asked for it before treating as trivial):** there is
**no `assignments` table in Supabase at all**, and NCC contains zero references
to assignments. No sync or cross-app surface.

### LimeLog — non-gym workout types ⏸ NOT BUILT (re-estimate)

**Schema question answered: no change needed, §3 stop condition NOT triggered.**

| Check | Finding |
|---|---|
| DB column | `workout_sessions.session_type` is `text NOT NULL` — no enum, no CHECK |
| NCC type | `WorkoutType = string`, commented as accepting "anything custom the user enters" |
| NCC scoring | `bucketFitnessByWeek` (`crossDomainSignals.ts:109`) filters on **date only** |
| LimeLog side | `nexusSync.ts:64` already pushes `sessionType: session?.name ?? 'workout'` |

Cardio sessions would count toward NCC's fitness score today, since the sub-score
uses `sessionsCount` not sets.

**But the LimeLog-side work is not small, contrary to the plan's assumption:**

- `SessionLog.sessionTemplateId` and `.programId` are both **required**
- Sessions start as `startSession(sessionTemplateId, programId)`
- Templates live inside program phases, carrying `targetSets`/`targetReps`/`targetRpe`
- **No ad-hoc / freestyle / cardio logging path exists anywhere in `src/`**

Logging "Basketball" today means building a Program → Phase → SessionTemplate for
it. Real support needs a program-independent session path plus a
duration/intensity surface. **Undecided and unspecified in the braindump:** does
an ad-hoc session belong to a program at all? What fields does a cardio log
carry? Does it feed deload/fatigue logic or only the Nexus score?

**Treat as its own chunk.** No release pressure — LimeLog can't tag until !41548
merges regardless.

---

## 7. Incidental findings — flagged, not fixed

1. **🔴 NCC has a live write path to LimeLog-owned tables.** `useFitnessStore`
   enqueues `workout_session` / `workout_set` mutations
   (`src/store/useFitnessStore.ts:237,251,260,266,274`) and `cloudSync.ts:549`
   dispatches them to Supabase. This contradicts the binding data contract
   ("NEVER write `workout_sessions` / `workout_sets`") and NCC's own `CLAUDE.md`.
   **Currently dormant** — no UI calls those actions since v1.5.2 removed Quick
   Log's Session/Set entries — but the machinery is fully wired, so any future
   caller silently starts writing to LimeLog's tables in production.
   **Recommend deleting the store actions and push handlers outright.**

2. **The build gate is fragile against toolchain float.** NCC pins
   `"typescript": "^5.6.2"`; with an empty `node_modules` the caret resolves to
   **6.0.2**, which hard-errors on the deprecated `baseUrl` in `tsconfig.json`
   before compiling a file. `npm ci` first gives 5.9.3 and a clean build. Worth
   pinning exactly, given two releases have shipped broken because this gate was
   skipped.

3. **Study sub-score shares the fitness pacing bug** — see §6.

---

## 8. Build gate — run per the working agreement

| App | Command | Result |
|---|---|---|
| NCC | `npm run build` (`tsc -b`) | ✅ clean |
| StudyDesk | `npm run build && npm run lint` | ✅ build clean; lint **0 errors, 6 warnings** — unchanged from the pre-existing `develop` baseline |
| LimeLog | `npm run build && npm run lint` | ✅ build clean; lint **0 warnings** under `--max-warnings 0` |

One warning was introduced in StudyDesk mid-session (a `t` dependency in the
deep-link `useEffect`) and fixed rather than left.

---

## 9. Deviations from the working agreement

- **`/frontend-design` was not run** before the UI changes (ACT-3 copy, ACT-4
  disclosure, ACT-6 picker), which §5 of the handoff requires. Judgment call:
  changes stayed inside each app's existing design language and tokens, with no
  new visual vocabulary. Flagging because the rule is written without that
  exception.
- **`/fullstack-guardian` was not run.** It's required before marking a version
  ready for review; no version is being marked ready here.
- **The NCC branch is not a `feature/*` branch** — see §0.
- **`docs/handoff-v1.8/` deleted** in the NCC branch, as its README instructed.

---

## 10. Suggested registry edits

1. **Revert the "second correction" under P3** — the developer hypothesis is
   disproven (§1). Restore the 5% activation figure as a real number.
2. **Close ACT-5**, replacing the "leading hypothesis" text with §1.
3. **Add a new open blocker** for the unidentified redistribution channel (APK
   mirrors) — it's the real acquisition channel and is unmanaged.
4. **Close ACT-2 and ACT-3.** Close **ACT-4** for StudyDesk; record NCC and
   LimeLog as "no defect, baseline captured".
5. **Add ACT-6** (language coverage) with the outstanding ~5,800-string
   translation scope and the RTL audit as open items.
6. **Add the NCC → LimeLog-tables write path** (§7.1) as an open blocker.
7. **Version bumps remain unconfirmed** — no tags were created.
