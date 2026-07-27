# v1.8 Work Queue — consolidated

**Assembled 2026-07-27.** Sources: the three QoL audits
(`docs/NCC_QOL_AUDIT.md`, `limelog/docs/LIMELOG_QOL_AUDIT.md`,
`studydesk/docs/STUDYDESK_QOL_AUDIT.md`) plus the automated reports on
fdroiddata MRs !41550 (NCC) and !41548 (LimeLog).

Execution order: **StudyDesk → LimeLog → NCC.**

---

## 0. What the fdroiddata MR reports actually said

Read-only via the GitLab API (`codequality_reports.json`). **No comments were
posted and nothing was pushed to the fork branches**, per the standing
constraint on those MRs.

Both reports come back `status: failed`, but **every one of the 35 entries is
`severity: info`**. fdroiddata's CI uses the code-quality channel to emit build
facts — declared permissions, signing key, APK size, detected fastlane
metadata, reproducible-build artifact link — not lint findings. There is no
list of code defects to work through.

Two real problems fall out of reading them against the repos, though:

### R1. 🔴 The version under review has no changelog

| App | versionCode built | changelogs present | missing |
|---|---|---|---|
| NCC | **26** | `23.txt`, `25.txt` | **`26.txt`** |
| LimeLog | **19** | `15.txt`, `17.txt`, `18.txt` | **`19.txt`** |

F-Droid renders "What's New" from `fastlane/metadata/android/<locale>/changelogs/<versionCode>.txt`.
Both apps ship the reviewed build with **no release notes at all**. Silent
failure — nothing errors, the section is just empty.

### R2. 🟠 Store metadata covers 6 locales; the apps ship 10 **[ACT-5]**

Both apps carry `de-DE, en-US, es-ES, fi-FI, fr-FR, zh-CN`. The v1.8 work added
**hi, pt, id, ar** in-app — and those are precisely the ACT-5 clusters (India
~12–15 users, LATAM ~10, Indonesia, Arabic-speaking). A Hindi user finds the
app fully translated *after* install, and an English store page *before* it.

Also: `phoneScreenshots` exist only in `en-US` and `zh-CN` (3 each). The other
four locales fall back to en-US images.

### R3. ℹ️ Permission notes — checked, no action

- NCC's report lists `USE_FINGERPRINT` and `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
  neither of which is in `android/app/src/main/AndroidManifest.xml`. They are
  merged in from Capacitor plugin manifests. `USE_FINGERPRINT` is deprecated
  (API 28+, superseded by `USE_BIOMETRIC`, which is also declared) but it comes
  from the biometric plugin, not our source. Nothing to fix here.
- LimeLog's `CAMERA` is genuine and justified — progress photos
  (`lib/progressPhotos.ts`, `components/BodyMetricsPanel.tsx`), and it is
  correctly paired with `<uses-feature android:required="false">`.
- LimeLog ships native libs across 4 ABIs (9.5M each, 11M APK) against NCC's
  "No native lib, 8.6M". Worth knowing; not a defect.

---

## 1. StudyDesk — in progress

| # | Item | Value |
|---|---|---|
| SD-1 | **A2** `fmtDate` hardcoded `"No date"` → `av.noDate` (exists, translated ×10) | 🟠 |
| SD-2 | **A1** six hardcoded `en-GB` date sites | 🔴 |
| SD-3 | **C1** secret scanner + pre-commit hook + CI | 🔴 |
| SD-4 | **A4** clear 6 lint warnings, add `--max-warnings 0` | 🟠 |
| SD-5 | **A5** custom course colour (closed set of 8) | 🟡 |
| SD-6 | **A3** extract modals from 2,112-line `App.jsx` | 🟠 |
| SD-7 | **A6/B1/B2** one native `confirm()`, unnecessary exports, `postcss.config.cjs` | 🟡 |

SD-2 is the headline: the Arabic RTL screenshot from earlier this session shows
**"Sunday 26 July" in English** across the top of an otherwise fully-Arabic
screen. Four sites in this codebase already thread `lang` correctly; six do not.

## 2. LimeLog — next

| # | Item | Value |
|---|---|---|
| LL-1 | **A2** PR detection fires above the 1RM chart's rep cap | 🔴 correctness |
| LL-2 | **A3** Today e1RM chip hardcodes `kg`, ignores `unitPreference` | 🟠 |
| LL-3 | **C1** secret scanner + CI (repo has none) | 🔴 |
| LL-4 | **A4** `en-GB` dates, English `DAY_NAMES`, English `DAY_LABELS` | 🟠 |
| LL-5 | **B1+B2+A5** delete `ExerciseBlock` (~13 KB), drop `clsx`/`date-fns`/`@capacitor/assets`, unify the two kg↔lb converters | 🟡 |
| LL-6 | **A1** translate the workout logger — 11 components, ~59 strings ×10 locales | 🔴 biggest win |
| LL-7 | **A6/A7/B3** 5 native `confirm()`, closed pattern/equipment enums, unnecessary exports | 🟡 |

LL-6 is the one that undercuts the whole v1.8 translation effort: the earlier
"100% coverage" claim was true locale-against-locale but **not**
UI-against-locale — `en.json` never had keys for the logging flow, so the screen
a user spends 95% of their time in was never translatable.

## 3. NCC — after the other two

| # | Item | Value |
|---|---|---|
| NC-1 | **A2** hardcoded English `DAY_LABEL` / `MONTH_LABELS` (`days.short.*` already translated) | 🔴 cheapest |
| NC-2 | **A1+A4** currency list: 8 Western currencies duplicated ×4, no INR/BRL/IDR/NGN/CNY; hardcoded `€` in 2 keys ×10 locales | 🔴 **[ACT-5]** |
| NC-3 | **C1** CI backstop for the secret scanner | ✅ done this session |
| NC-4 | **B1–B6** dead code: `src/theme/`, `bodyMetricsAnalysis.ts`, `Glass.tsx`, `utils/constants.ts`, `Claude Design resources/`, `growth.*` (280 strings) | 🟡 |
| NC-5 | **B8** NCC→LimeLog write path — contract violation one caller from live | 🔴 |
| NC-6 | **A3** `ConfirmDialog` replacing 9 native `confirm()` | 🟠 |
| NC-7 | **A5/A6/A7/B7/C3** euro-scale milestones, closed icon set, study pacing bug, exports, pin TypeScript | 🟡 |

## 4. Cross-app, from the MR reports

| # | Item | Value |
|---|---|---|
| X-1 | **R1** add `26.txt` (NCC) / `19.txt` (LimeLog) changelogs across all 6 locales | 🔴 |
| X-2 | **R2** add `hi`, `pt`, `id`, `ar` store metadata to both apps **[ACT-5]** | 🟠 |
| X-3 | **R2** screenshots for the four locales that fall back to en-US | 🟡 |

**X-1/X-2/X-3 touch `fastlane/metadata/` in the app repos, not fdroiddata.**
The fdroiddata MRs themselves stay untouched — F-Droid pulls metadata from the
app repo at the build tag.

---

## Standing constraints (unchanged)

- Never read, print or commit `.env`, secrets, the release keystore or
  `key.properties`.
- Work on `feature/*` cut from `develop`; PRs against `develop`, do not merge.
  `main` is sacred.
- Stop and confirm before: any commit/merge to `main`, history rewrite,
  `git push --force*`, `git reset --hard`, deleting an unmerged branch,
  release tags, deploys, store submissions, **any Supabase schema change**.
- SEC-1: the shared Supabase project is **production, ~103 real accounts**. No
  account creation, no row writes, no seeded test data.
- fdroiddata MRs !41550 / !41548: **read-only**. No comments, no pushes.
- Data contract: NCC never writes `workout_sessions`, `workout_sets` or
  `study_sessions`.
- Build gate is mandatory: NCC `npm run build`; LimeLog/StudyDesk
  `npm run build && npm run lint`.
- Do not update `NEXUS_VERSION_STATUS.md`.
