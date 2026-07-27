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

## 1. StudyDesk — ✅ top four done

Branch `feature/v1.8-act2-act4-auth-gate`, pushed.

| # | Item | Status |
|---|---|---|
| SD-1 | **A2** `fmtDate` hardcoded `"No date"` → `av.noDate` | ✅ `93c0f76` |
| SD-2 | **A1** six hardcoded `en-GB` date sites | ✅ `93c0f76` |
| SD-3 | **C1** secret scanner + pre-commit hook + CI | ✅ `44071f5` |
| SD-4 | **A4** clear 6 lint warnings, add `--max-warnings 0` | ✅ `236d201` |
| SD-5 | **A5** custom course colour (closed set of 8) | ⬜ open |
| SD-6 | **A3** extract modals from 2,112-line `App.jsx` | ⬜ open |
| SD-7 | **A6/B1/B2** one native `confirm()`, unnecessary exports, `postcss.config.cjs` | ⬜ open |

SD-2 was the headline: the Arabic RTL screenshot from earlier in the session
shows "Sunday 26 July" in English across an otherwise fully-Arabic screen. All
six sites now route through one `src/lib/dates.js`, which also de-duplicated a
time formatter that had been copy-pasted into three files.

SD-4 turned up more than lint noise: `OnboardingView` declared its `Shell`
wrapper inside the render body, so React replaced the step-2 course-name
`<input>` DOM node on **every keystroke** (measured with Playwright before and
after). `autoFocus` re-fired each time, which masked it — the typed value came
out correct either way, which is why nobody noticed.

## 2. LimeLog — ✅ all six done

Branch `feature/v1.8-act2-auth-i18n`, pushed.

| # | Item | Status |
|---|---|---|
| LL-1 | **A2** PR detection fires above the 1RM chart's rep cap | ✅ `b85bb38` |
| LL-2 | **A3** Today e1RM chip hardcodes `kg` | ✅ `91009d2` |
| LL-3 | **C1** secret scanner + CI | ✅ `fe14832` |
| LL-4 | **A4** `en-GB` dates, English `DAY_NAMES`/`DAY_LABELS` | ✅ `a555416` |
| LL-5 | **B1+B2+A5** delete `ExerciseBlock`, drop 3 deps, unify converters | ✅ `0841e5f` |
| LL-6 | **A1** translate the workout logger | ✅ `9e1d6cd` |
| LL-7 | **A6/A7/B3** 5 native `confirm()`, closed enums, unnecessary exports | ⬜ open |

**LL-1 was worse than the audit recorded.** The audit said the two estimators
shared the same formula and differed only on the rep cap. They also use
*different formulas* below 11 reps — PR detection was plain Epley, the chart
blends Brzycki. At 100 kg × 5 that is 116.67 against 112.50, so the two
surfaces reported different numbers for the same set. Fixed by making
`oneRepMax.ts` the single estimator, plus a migration that re-values stored PRs
— without it every user's existing PRs would have become ~4 kg per 100 kg
harder to beat and frozen.

**LL-2 was also bigger than recorded.** The audit said `helpers.formatWeight`
was reachable only through the dead `ExerciseBlock`. It is live in four places.
The `2.2046` constant turned out to be inlined in five further files against
the precise value in `types/bodyMetrics.ts`; all now share one converter.

**LL-6** ended at 351 keys (from 273). Smaller than the ~59-string estimate
because 15 keys already existed fully translated and were simply never wired
up, and NexusSyncCard reuses `auth.*`. A follow-up sweep found 19 more
hardcoded strings in files that *did* already call `useTranslation`.

## 3. NCC — ✅ done

Branch `claude/ncc-repos-setup-3kvqoj`, pushed.

| # | Item | Status |
|---|---|---|
| NC-1 | **A2** hardcoded day/month labels | ✅ `a0f8f1f` |
| NC-2 | **A1+A4** currency list + hardcoded `€` **[ACT-5]** | ✅ `9e7e181` |
| NC-3 | **C1** CI backstop for the secret scanner | ✅ earlier |
| NC-4 | **B1–B5** dead code (128 KB) | ✅ `1fc045e` |
| NC-5 | **B8** write path into LimeLog- and StudyDesk-owned tables | ✅ `784a13b` |
| NC-6 | **A3** `ConfirmDialog` replacing 11 native `confirm()` | ✅ `767a630` |
| NC-7 | **A5/A6/A7/C3** milestones, custom icons, study pacing, pin TS | ✅ `7cce0ce` |
| NC-8 | **B6** `growth.*` namespace (280 strings) | ⬜ **your call** |
| NC-9 | **B7** ~33 unnecessary `export` keywords | ⬜ open — cosmetic |

Three of these were materially larger than the audit recorded:

**NC-1 was not two English arrays.** ~30 sites hardcoded **`fi-FI`**, so every
user in every language got Finnish number and date conventions — "1 234 567,89"
with a space thousands separator, "26.7.2026" dates. Now routed through one
`formatLocale()` that prefers the device's regional tag, which is what actually
produces lakh grouping (`₹12,34,567.50`) for an Indian user rather than Western
grouping. Three `en-CA`/`en-US` tags in `lib/portfolioEod.ts` are deliberately
left: they feed string comparisons against `'EDT'`/`'Sat'` for US market hours,
so they are machine idioms, not display.

**NC-2 had more duplication than four lists.** There were also **eight** copies
of a currency-symbol map and **nine** near-identical money formatters, all
deciding symbol placement with `['kr','Fr'].includes(symbol)` — which breaks
the moment the list widens, since złoty, koruna, forint, leu, hryvnia and đồng
all trail the number. Symbols and names now come from `Intl`, so the picker
reads naturally in all ten languages for zero translation cost.

**NC-5 covered two contract violations, not one.** The audit flagged the
workout write path; `useStudiesStore` had the identical defect against
`study_sessions`. Both are gone, with the dispatch entries kept as explicit
drops so a mutation already sitting in an upgrading user's outbox is discarded
rather than retried against a table NCC must not write.

**NC-8 is a decision, not a task.** `growth.*` (28 keys × 10 locales) plus
`nav.growth` are dead by the same test as everything in NC-4 — no Growth
screen, route or tab exists. But 112 of those strings were translated into
hi/pt/id/ar earlier in this session and the registry lists the Growth hub as
open rather than abandoned. Deleting code is reversible in a way that deleting
translation work is not, so it needs your call. One line either way.

## 4. Cross-app, from the MR reports

| # | Item | Status |
|---|---|---|
| X-1 | **R1** `26.txt` (NCC) / `19.txt` (LimeLog) changelogs, all 10 locales | ✅ `401a3da` / `f3fb4f6` |
| X-2 | **R2** `hi`, `pt-BR`, `id`, `ar` store metadata, both apps **[ACT-5]** | ✅ `401a3da` / `f3fb4f6` |
| X-3 | **R2** screenshots for locales that fall back to en-US | ⬜ open — needs a device |
| X-4 | pt locale normalised to Brazilian Portuguese (LimeLog had drifted) | ✅ `f3fb4f6` |
| X-5 | plural `many` forms missing in `fr`/`es` — **all three apps** | ✅ `435a75a` / `bcf247b` / `9e1d6cd` |

**X-1/X-2 touch `fastlane/metadata/` in the app repos, not fdroiddata.** The
fdroiddata MRs themselves stay untouched — F-Droid pulls metadata from the app
repo at the build tag.

**X-5 is a correction to earlier work in this session.** I found and fixed the
Portuguese `_many` plural leak (a missing form falls back to *English*, not to
`_other`) but did not check whether other locales had the same exposure. French
and Spanish both carry a CLDR `many` category and both were missing forms — 6
keys in NCC, 5 in StudyDesk, 5 in LimeLog. All three are now verified complete
against `Intl.PluralRules`, and Arabic's six forms resolve correctly.

**X-3 is the one item left open here**, because it needs screenshots taken on a
device in each language rather than anything editable from the repo.

---

## 5. Legal & compliance (added 2026-07-27)

Background and sources in `studydesk/docs/LEGAL_REVIEW.md`. The suite shares
**one Google Cloud project, one Supabase database and one account system across
all three apps**, so legal surfaces are suite-wide, not per-app.

### Done

| # | Item | Status |
|---|---|---|
| L-1 | Suite privacy policy + ToS + home page (`docs/legal/`, `docs/index.html`) | ✅ built, needs Pages enabled |
| L-2 | StudyDesk data export (Art. 20) | ✅ shipped |
| L-3 | StudyDesk account deletion (Art. 17) + `delete-account` Edge Function | ✅ deployed |
| L-4 | Age statement at signup (Art. 8) | ✅ shipped |
| L-5 | Activation funnel columns + triggers + backfill | ✅ applied |
| L-6 | fdroiddata `AuthorName` → Limecore Studio | ✅ MR !44072 open |

### 🔴 Owner actions — nobody else can do these

| # | Item | Why it matters |
|---|---|---|
| O-1 | **Enable GitHub Pages** on `nexus-command-center`: Settings → Pages → Source = `main`, folder `/docs` | Turns the built pages into live URLs. Everything below depends on it. |
| O-2 | **Set the three OAuth consent screen URLs** (see below) | Google's User Data Policy *requires* a privacy policy URL for public apps. 82% of sign-ins are Google. This is the only item that can switch the apps off. |
| O-3 | **Configure custom SMTP** | 5 of 26 email signups unconfirmed after 2+ days. Supabase's built-in sender is rate-limited and documented as not for production. |
| O-4 | **Accept the Supabase DPA** (Organisation settings) | Art. 28 requires a written processor agreement. Minutes of work. |
| O-5 | **Backups off the free plan** — Pro (~$25/mo) for PITR, or a scheduled `pg_dump` | Free plan is 7-day retention, no PITR, now covering 144 people's data. |
| O-6 | **Enable leaked-password protection** (Auth → Passwords) | The only remaining security advisor on the project. One toggle. |

Once Pages is on, paste these into the OAuth consent screen:

```
Application home page  https://limekana.github.io/nexus-command-center/
Privacy policy         https://limekana.github.io/nexus-command-center/legal/privacy.html
Terms of service       https://limekana.github.io/nexus-command-center/legal/terms.html
```

If the landing page comes online later, repoint the home page field at it and
move the two legal pages across — they are self-contained static HTML with no
build step, no assets and no JS.

### ⬜ Still to build

| # | Item | Notes |
|---|---|---|
| L-7 | **Retention purge for soft-deleted rows** | 10 subjects + 8 grades sit soft-deleted indefinitely. Needs a scheduled hard-delete (pg_cron) past a fixed window. **The policy was written to describe today's behaviour rather than promise a window that nothing enforces** — tighten the wording once this ships. |
| L-8 | **Export + deletion in NCC and LimeLog** | Only StudyDesk has them. The Edge Function is app-agnostic and cascades across the whole database, so both apps need the two buttons, not new backend work. |
| L-9 | **Record of processing (Art. 30)** | The <250-employee exemption falls away for non-occasional processing, which continuous sync is. One internal page; also keeps the policy honest. |
| L-10 | **`audit_log` erasure gap (NCC)** | 132 rows of `budget_categories` / `tasks` snapshots with `changed_by ON DELETE SET NULL` — content survives account deletion, merely un-attributed. Real Art. 17 gap **for NCC only**; StudyDesk tables are not audited. |
| L-11 | **Age statement in NCC and LimeLog** | Same one-liner as StudyDesk. Lower urgency — neither is aimed at schoolchildren the way a study planner is. |
| L-12 | **In-app privacy links in NCC and LimeLog** | Point at the suite policy from Settings, as StudyDesk now does. |

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
