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
| SD-7 | **A6/B1/B2** one native `confirm()`, unnecessary exports, `postcss.config.cjs` | ✅ done 2026-07-29 — `confirm()` (**three** sites, not one) · `postcss.config.cjs` deleted (`module.exports = {}`, no postcss/tailwind/autoprefixer in the tree) · 11 exports; StudyDesk is now at **zero** unused exports |
| SD-F1 | **Onboarding "Maybe later" still fired the permission prompt** | ✅ done 2026-07-29 — see §6 |

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
| LL-7 | **A6/A7/B3** 5 native `confirm()`, closed enums, unnecessary exports | ✅ **all done 2026-07-29** — `confirm()` (**six** sites, L-8 added two) · exports (17, plus 5 dead deleted) · A7 closed enums |

**LL-7 notes.** `ConfirmDialog` ported from NCC's NC-6. Two wrinkles worth
recording:

- The hook and context had to move to `confirmContext.ts`, because
  `react-refresh/only-export-components` fires on a module exporting both a
  component and a hook, and **LimeLog lints at `--max-warnings 0` while NCC's
  build gate does not run lint at all** — so NCC's copy never tripped it.
- Three hardcoded English strings turned up in the files being edited, none of
  them in the A1 sweep: TodayPage's stall-flag banner and deload suggestion, and
  OneRMChart's empty state. The stall banner pluralised with
  `length > 1 ? 's' : ''` — wrong even in English at 0. Now an i18next count
  plural with a form for **every CLDR category each locale actually has** (six
  for Arabic, plus the `many` that fr/es/pt carry), verified against
  `Intl.PluralRules` for all ten. Same exposure as X-5: a missing form falls back
  to English, not to `_other`.

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
| NC-8 | **B6** `growth.*` namespace (280 strings) | ✅ **deleted 2026-07-29 on your call** — 290 strings (28 × 10 locales + `nav.growth` × 10). Zero code references confirmed first. Recoverable from git if the Growth hub is ever revived. |
| NC-9 | **B7** ~33 unnecessary `export` keywords | ✅ done 2026-07-29 — **123** across 52 files, not ~33. And it stopped being cosmetic: see below. |

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

#### NC-9 turned out not to be cosmetic

The sweep found **`formatShortDate` still hardcoded to `'fi-FI'` and live in
three screens** — transaction dates on the Finance overview, task due-date
pills, and the cash-flow forecast. NC-1 routed ~30 sites through
`formatLocale()` and missed this one, so the exact defect NC-1 existed to fix
survived in those places. Fixed; **no `'fi-FI'` remains anywhere in `src/`
outside a comment**.

Its three neighbours had no callers at all — `formatDate`, `formatTime`,
`formatPercent` — and were **deleted rather than left un-exported**, because two
of them were also hardcoded to `'fi-FI'`. Leaving them would have been a loaded
trap: the next person needing a date formatter reaches for one and reintroduces
the whole thing.

**Method for the mass edit**, since 123 lines is a lot to eyeball: enumerate
every named export, then classify on two axes — referenced outside its file, and
referenced inside it. Only *zero external, ≥1 internal* symbols were touched,
which is provably nothing but a redundant keyword. No `export *` barrels exist
to hide a usage, namespace imports are covered (`outbox.subscribe` still
contains `subscribe` as a word), and NCC's build is `tsc + vite`, so a broken
import anywhere fails the gate. Final diff: 138 insertions, 138 deletions.

**Deliberately not touched — 18 NCC symbols with no references anywhere:**
`setDailyBudget`, `getCachedRates`, `finnhubKeyCount`, `markAllSynced`,
`computeAllAccountBalances`, `totalAccountNetWorthBase`, `isLiabilityAccount`,
`weekKey`, `lastSweepTimestamps`, `KEYSTORE_ALIAS_DEXIE`, `DOMAIN_LABELS`,
`readRatingHistory`, `DANGER`, `notificationBody`, `getSyncDiagnostics`,
`gradeToLetter`, `ibBand`, `gradeScaleLabel`. Plus five in LimeLog
(`getTrainingGoal`, `outbox.subscribe`, `todayIso`, `DAY_NAMES`,
`cancelWorkoutReminders`).

That is dead code, not over-exporting — a different decision. **NC-4's dead-code
pass already ran over this tree**, so these either escaped it or were kept on
purpose. ✅ **Deleted 2026-07-29 on your call** — 187 lines from NCC, 5
declarations from LimeLog, zero insertions. **All three apps are now at zero
unused exports.**

Two things worth keeping from that pass:

- Several dead functions carried comments asserting they were live.
  `computeAllAccountBalances` documented itself as *"Used by Net Worth + the
  account list view"* and neither calls it. A confident comment on unreachable
  code is worse than none — it sends the next reader hunting for a caller that
  does not exist.
- Deleting LimeLog's `outbox.subscribe` orphaned the machinery behind it:
  `CHANGE_EVENT` was still dispatched from two places with nothing listening, so
  the constant and both dispatches went too. That one was **not** dead by
  accident — it is a working pub/sub API that lost its last consumer. StudyDesk
  still drives a live outbox indicator through the same call in `SettingsView`;
  LimeLog just never wired one up. If that indicator is ever wanted here, the
  deletion commit is where to look.

#### A7 — the enum widening needed three fixes the audit did not mention

`patternLabel` called ``t(`library.pattern.${p}`)`` with no fallback, so a custom
value would have rendered as the raw key `library.pattern.sandbag`; the filter
dropdowns listed only the eight built-ins, making a custom-filed exercise
unreachable through them; and an empty free-text box needed to fall back to
`accessory`/`other` rather than store `''`, which renders as a bare separator
dot. Also: `string & {}` trips `ban-types` at `--max-warnings 0`, so the
widening is spelled `string & Record<never, never>`.

**NC-8 was a decision, not a task — decided 2026-07-29: delete.** `growth.*`
(28 keys × 10 locales) plus `nav.growth` were dead by the same test as
everything in NC-4: no Growth screen, route or tab exists. Re-confirmed zero
references before removing — nothing matched `'growth.`, `nav.growth` or a
`growth:` key anywhere in non-JSON source. The remaining hits were
`revenueGrowth` and `fin.wi.growthAbove`, different namespaces entirely.

**290 strings removed** (28 × 10 + `nav.growth` × 10). The reservation recorded
above was that deleting translation work is less reversible than deleting code.
That was overstated: it is all in git history, and reviving the Growth hub would
mean rewriting the English copy first, at which point the old translations would
be stale rather than useful.

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
| O-1 | **Enable GitHub Pages** on `nexus-command-center`: Settings → Pages → Source = **`gh-pages` branch, `/ (root)`** | Turns the built pages into live URLs. Everything below depends on it. |
| O-2 | **Set the three OAuth consent screen URLs** (see below) | Google's User Data Policy *requires* a privacy policy URL for public apps. 82% of sign-ins are Google. This is the only item that can switch the apps off. |
| O-3 | **Configure custom SMTP** | 5 of 26 email signups unconfirmed after 2+ days. Supabase's built-in sender is rate-limited and documented as not for production. |
| O-4 | **Accept the Supabase DPA** (Organisation settings) | Art. 28 requires a written processor agreement. Minutes of work. |
| O-5 | **Backups off the free plan** — Pro (~$25/mo) for PITR, or a scheduled `pg_dump` | Free plan is 7-day retention, no PITR, now covering 144 people's data. |
| O-6 | **Enable leaked-password protection** (Auth → Passwords) | The only remaining security advisor on the project. One toggle. |
| O-7 | ~~Check the Gemini API tier / enable billing~~ — **decided 2026-07-29: staying on the free tier until the apps earn something** | On the free tier **Google may use submitted content to improve its products, including training future models**. Disclosed rather than fixed: short version at the top of the policy, a dedicated box in the AI section, and a line under the switch in all three apps (`aiTrainingNote`, ten locales). Cost was never the issue — at ~$0.0003/call the whole user base is roughly **$1–2/month**. Revisit if the apps start earning: the paid tier excludes this use contractually, and the policy already promises we will say so if that changes. |

Once Pages is on, paste these into the OAuth consent screen:

```
Application home page  https://limekana.github.io/nexus-command-center/
Privacy policy         https://limekana.github.io/nexus-command-center/legal/privacy.html
Terms of service       https://limekana.github.io/nexus-command-center/legal/terms.html
```

**Why a `gh-pages` branch and not `main`/`docs`.** The pages are authored in
`docs/` on the development branch, which is not merged, so Pages pointed at
`main` would find nothing — that was the cause of the 404s. `gh-pages` carries
the built copy at its root and needs no merge to `main`, which stays sacred.
Re-publish after editing `docs/` by copying the three files onto that branch.

### Where these should eventually live

`limecore.vercel.app` is the personal/story site and stays as it is. A dedicated
suite home is the better long-term host for these pages — same content, nicer
URL, and it puts the three apps somewhere to point at.

Deploying it needs a Vercel project that does not exist yet; the MCP integration
returned `403 forbidden — you don't have permission to create a project`, so it
has to be created from the dashboard. Once a `limecore-suite` project exists,
the three files drop straight in (they are self-contained static HTML, no build
step, no assets, no JS) with a `vercel.json` setting `cleanUrls: true` so the
paths become `/legal/privacy` and `/legal/terms`.

GitHub Pages is a perfectly good permanent answer if you would rather not. The
only thing that matters is that whatever URL goes into the Google console keeps
working — changing it later means re-verifying with Google.

### Latent config — the "Testing vs Production" class

Things that are invisible until the day they matter, found by sweeping the
consoles rather than the code. Ordered by consequence.

| # | Item | Consequence if ignored |
|---|---|---|
| C-1 | 🔴 **Back up the release keystore, off-machine.** | fdroiddata pins `AllowedAPKSigningKeys` to one fingerprint (`27e17d1f…`). Lose the keystore and **StudyDesk can never be updated again** — users would have to uninstall and reinstall from a new key, losing all local data. Irreversible, and it will apply to NCC and LimeLog the moment their MRs merge. Config in all three repos is correct (gitignored, never committed); what cannot be verified from here is whether a copy exists anywhere else. |
| C-2 | 🔴 **Check Supabase Site URL and the Redirect URL allowlist.** | Two separate failure modes. A wrong Site URL sends email confirmation links to the wrong place — a second candidate cause for the 5-of-26 unconfirmed signups, independent of SMTP. An over-broad allowlist (wildcards) lets an attacker redirect an OAuth token to a host they control. |
| C-3 | 🟠 **Enable GitHub secret scanning + push protection** on all three repos. | Free on public repos, one toggle each. Complements the pre-commit scanner by working server-side, so it still catches a leak from a clone that never ran `npm install` and therefore never got the hook. |
| C-4 | 🟠 **Branch-protect `main`, require CI to pass.** | "`main` is sacred" is currently a convention in a document. Protection makes it structural, and requiring the CI check turns the mandatory build gate into something that cannot be skipped by hand — which is how two releases previously shipped broken. |
| C-5 | 🟡 **Review the Google OAuth authorised redirect URIs.** | Same class as C-2, worth an eyeball now the app is in Production. |
| C-6 | 🟡 **Free-tier projects pause after ~7 days of inactivity.** | Not a live risk while signups continue, but worth knowing the mechanism exists before it surprises you during a quiet spell. |

**On the Testing → Production toggle just flipped:** correct to do, but worth
being precise about what it did and did not change, so it does not get credited
with something else.

- **It did not fix a retention problem.** Testing-status projects issue
  refresh tokens that expire in 7 days — *unless the only scopes requested are a
  subset of name, email address and user profile*. None of the three apps passes
  a `scopes` parameter, so all of them use Supabase's default
  `email profile openid` and sat inside that exemption. The session data agrees:
  live sessions of 28, 27.6, 15.6 and 13.8 days, with no cluster at 7.
- **What it did remove** is the 100-test-user ceiling, which was a real future
  wall to walk into.
- **No Google verification is required**, precisely because the scopes are
  non-sensitive. Publishing is the whole step; there is no review queue to wait
  in.

### ⬜ Still to build

| # | Item | Notes |
|---|---|---|
| L-7 | **Retention purge for soft-deleted rows** | 10 subjects + 8 grades sit soft-deleted indefinitely. Needs a scheduled hard-delete (pg_cron) past a fixed window. **The policy was written to describe today's behaviour rather than promise a window that nothing enforces** — tighten the wording once this ships. |
| L-8 | **Export + deletion in NCC and LimeLog** | ✅ done 2026-07-29. Both apps now carry the two buttons in Settings → Your data, calling the same app-agnostic `delete-account` Edge Function, so deleting from any app erases all three (the second confirmation names the other two). Ported from StudyDesk's `lib/dataRights.js`. Two deliberate differences: **NCC enumerates `db.tables`** rather than listing them, so a table added later cannot silently drop out of an Art. 20 export (`apiCache` and `insightsScores` excluded, with the reason stated in the file itself); **LimeLog wipes by key prefix** (`wt_`, `limelog-`) rather than by name, because `nexusStore.signOut`'s explicit six-key list is right for sign-out but would leave data behind on an erasure request. LimeLog lists progress-photo *dates* but does not embed the images — thirty base64 JPEGs would make the file unopenable, and the user already has the photos. The two new confirmations use native `confirm()`; fold them into **LL-7**. |
| L-9 | **Record of processing (Art. 30)** | The <250-employee exemption falls away for non-occasional processing, which continuous sync is. One internal page; also keeps the policy honest. |
| L-10 | **`audit_log` erasure gap (NCC)** | ✅ **applied 2026-07-29 with sign-off** — `supabase/migrations/20260729_audit_log_erasure.sql`. FK now `CASCADE`, trigger live and enabled, 140 rows unchanged. See the analysis below. |

#### L-10 — the diagnosis was understated (checked against the live catalog)

Recorded as "content survives, merely un-attributed". Verified `confdeltype = 'n'`
on `audit_log_changed_by_fkey`, so the FK part is right — but the audit trigger
snapshots **whole rows**, so the payload carries its own copy of the owner:

| | |
|---|---|
| rows | **140** (97 task UPDATEs, 21 task INSERTs, 14+6+1 budget, 1 task DELETE) |
| with `new_values->>'user_id'` | **138** |
| with `old_values->>'user_id'` | 113 |
| containing a task title | **119** |
| containing a budget category name | 21 |
| currently orphaned | **0** — nobody has deleted an account yet |

So nulling `changed_by` removes **one of two** pointers. The row stays fully
attributable to the deleted user, and nothing is anonymised. The table's own RLS
policy proves it, because it already reads through the payload as a second path:
`changed_by = auth.uid() OR coalesce(new_values->>'user_id', old_values->>'user_id')::uuid = auth.uid()`.

**The gap is latent, not realised** — 0 orphaned rows means no user has been
harmed yet. It fires on the first account deletion, which the L-8 buttons
shipped today now make one tap away in all three apps. That moves this up the
list rather than down it.

**Fix shape, and why.** The `delete-account` function deliberately holds no list
of tables and says why: *"an explicit delete list is a thing you forget to
update, and the failure is silent."* That principle is right, and `audit_log` is
the proof of it — the gap exists precisely because this one table opted out of
the cascade the function trusts. So the fix goes in the database, not in a new
delete list in the function. Two statements, because there are two attribution
paths and an FK can only see one:

1. `changed_by` → `ON DELETE CASCADE`, so it works via any deletion route (Edge
   Function, dashboard, raw SQL).
2. A `BEFORE DELETE` trigger on `auth.users` for the payload path — needed
   because a **shared** budget or task can be edited by someone other than its
   owner (`changed_by` = editor, payload `user_id` = owner). **0 such rows
   today**, but sharing is shipped, so it is a hole waiting rather than a
   hypothesis.

The trigger condition is deliberately identical to the RLS policy, which buys a
property worth stating: *anything a user can read about themselves is exactly
what erasure removes.*

**Applied 2026-07-29.** Catalog verification all green: `confdeltype` `'n'` →
`'c'`, trigger `tgenabled = 'O'` as BEFORE ROW DELETE on `auth.users`, 140 rows
unchanged.

**One thing the plan missed, caught by the security advisor after applying.**
Creating the trigger function in `public` made PostgREST expose it at
`/rest/v1/rpc/erase_audit_log_for_user`, callable by `anon` and `authenticated`
as `SECURITY DEFINER` — two new WARN advisories. Calling it directly would fail
anyway (*"trigger functions can only be called as triggers"*), so it was hygiene
rather than a live hole, but a `SECURITY DEFINER` function has no business being
reachable from the public API. Fixed with a follow-up migration revoking
`EXECUTE` from `public`, `anon` and `authenticated`; safe for the trigger,
because PostgreSQL checks that privilege at `CREATE TRIGGER` time rather than on
each fire. The advisor is back to its single pre-existing warning (O-6).

⚠️ **Not verified behaviourally, deliberately.** Proving the trigger fires means
deleting an account, and every account here belongs to a real person (SEC-1). If
that proof is ever wanted, take it on a Supabase branch — never on this project.
| L-11 | **Age statement in NCC and LimeLog** | ✅ done 2026-07-29. `auth.ageNote` + `auth.privacyLink` copied from StudyDesk's existing ten translations rather than re-translated, so the wording is identical across the suite. NCC: below the signup form (`screens/auth/Signup.tsx`). LimeLog: under the guest button in `FirstLaunchAuth`, which puts it next to the no-account option it points at. |
| L-12 | **In-app privacy links in NCC and LimeLog** | ✅ done — Settings → Privacy & AI links to the suite policy in both. |

### L-13 ✅ The policy said things the software did not do (2026-07-29)

Triggered by asking a simple question — *what do the AI features run on, and is
it free* — which turned out to have a different answer than the docs implied.
**All three apps have an AI feature**, not just StudyDesk. All three route
through one Supabase Edge Function (`ai-generate`, project `hkktorzh…`) to
`gemini-2.5-flash` on the Gemini Developer API, with the key held server-side.

Auditing the policy against the code then found five more claims that did not
match, in rough order of seriousness:

| # | Claim | Reality | Fix |
|---|---|---|---|
| 1 | "AI features run only when you write a note and press the button" | NCC's Life narrative **generated itself** on arrival at the Life tab, whenever the cached score had drifted ≥5. No button anywhere in the path, and the feature was not mentioned in the policy at all. | Real opt-in switch in all three apps, **default off**, gated at the network choke point as well as the render site. Policy rewritten around the switch. |
| 2 | "Two processors, and nobody else" | NCC calls **ten** third-party hosts — CoinGecko, Yahoo Finance ×3, Finnhub, `open.er-api.com`, ECB, Federal Reserve, NYSE, CNN's market-indicator feed. | Named them all in a new processors subsection, stating what they do and do not see. |
| 3 | "Export my data / Delete my account — **both are in Settings**" | Only StudyDesk has them (L-8). A suite-wide policy promised Art. 17/20 buttons in two apps that do not have any. | Stated plainly which app has them, and that one account means StudyDesk's buttons cover all three. L-8 still open. |
| 4 | Guest mode: "written to your device and **nowhere else**" | True of everything the user enters, but NCC fetches prices and FX as a guest. | Kept the strong claim for user-entered data, added the caveat for public market requests. |
| 5 | LimeLog data table listed no AI fields | `ai_debrief_raw` and four more sync to Supabase (`nexusSync.ts:108`). | Added the row. |

Also worth knowing and **not** fixable in the policy: on the Gemini **free
tier Google may use submitted content to improve its products**. See O-7 — this
is a billing-console question, not a wording question, and the policy stays
silent on training rather than claiming something unverified.

**The opt-out defaults to off in all three apps**, including for existing users,
and StudyDesk deliberately does not preserve it across sign-out — carrying one
person's consent to the next person on the same device is not consent.

---

## 6. StudyDesk — user feedback (added 2026-07-27)

From Emil's brother, testing on a real device. Bottom of the queue by request.
Root causes traced so these are actionable rather than reports.

### SD-F1 ✅ "Skip" on the onboarding notification step still fires the permission prompt

**Fixed 2026-07-29.** The diagnosis below was exact and needed no revision. The
intent now travels with the completion — `onComplete(result(), { notifications:
bool })` → `state.notifEnabled` → the scheduling effect is gated on it — plus a
Settings → Reminders row, because declining was otherwise irreversible short of
a reinstall.

Two things the write-up did not anticipate:

- **Turning reminders off has to cancel what is already scheduled**, or alarms
  from a previous session keep arriving. That needed a second function:
  `cancelAllNotifications` deliberately does *not* share a path with
  `scheduleNotifications`, because the scheduling path calls
  `requestPermissions()` and the off path must never prompt. Reusing one
  function with a flag would have reintroduced the original bug in a new place.
- **The migration was the risky part.** The preference key is absent for every
  existing install, and those users have already been through the prompt, so
  absent-but-onboarded reads as ON and only an explicit "Maybe later" writes a
  `"0"`. A blanket `false` default would have silently stopped reminders for the
  entire existing user base — a worse regression than the bug being fixed.

Original diagnosis, kept for the record:

**This is a bug, not polish, and the cause is exact.** `src/App.jsx:1365-1370` —
the two buttons on onboarding step 3 are wired to the *identical* handler:

```jsx
<button …onClick={()=>onComplete(result())}>{t('sdob.enableReminders')}</button>
<button …onClick={()=>onComplete(result())}>{t('sdob.maybeLater')}</button>
```

Nothing distinguishes them. `handleOnboardingComplete` (`:892`) sets
`onboarded = true`, and the effect at `:813` fires on that flag and calls
`scheduleNotifications(...)`, which asks the OS for permission. So "Maybe later"
takes exactly the same path as "Enable reminders" — the user's choice is
discarded before it reaches anything.

**Fix:** pass the intent through — `onComplete(result(), { notifications: bool })`
— persist it, and gate the effect on it. Then add a Settings toggle so anyone who
declined can turn reminders on later, since right now declining is
irreversible without a reinstall.

Worth doing early despite sitting at the bottom of the queue: an unexpected
permission prompt during onboarding is exactly the kind of thing that makes
someone back out of an app, and the funnel says 80% of signups never create a
subject. This is a candidate explanation, and it is cheap to eliminate.

### SD-F2 🟡 Bottom tab icons look poor

`src/App.jsx:1090-1094` — the tabs use single glyphs (`◎`, `◈`, `⌗`) rendered at
`.mobile-tab-icon` (`:391`). They are geometric Unicode symbols rather than an
icon set, so they carry no meaning and render inconsistently across Android
font stacks.

Two directions to try, in this order:

1. **Drop the icons, enlarge the labels.** Cheapest, and the labels are already
   translated into ten languages. Also sidesteps the reason the glyphs look
   wrong, which is that they are not really icons.
2. **Use a real icon set.** Must be a bundled SVG set, not a webfont, and must
   ship in-repo — F-Droid builds have no network, and a CDN font would break the
   reproducible build.

Try (1) first and look at it before spending money on (2). Note the labels must
survive Finnish and German, which are the longest of the ten.

### SD-F4 ✅ Custom grade scale alongside US and IB

**Shipped 2026-07-29.** The write-up's groundwork all checked out: the weighted
mean was already correct, no migration was needed, and nothing hardcoded a
maximum. Gotcha 1 was the load-bearing one exactly as described.

Three things it did not anticipate:

- **Every other mode check was `mode === 'ib' ? … : …`**, in four files. Left
  alone, `'custom'` would have fallen through to the *US 4.0-points* branch —
  the one place the maths is genuinely wrong for it. All inverted to test for
  `'us'`, so anything that is not explicitly the US ladder gets the weighted
  mean. That is the safe default for a scale the app does not know.
- **The grade input had no bounds at all** — `step="0.01"` and nothing else, so
  `9999` was accepted on the IB scale. Every mode now supplies `min`/`max`,
  which is a real fix for IB and US too, not just custom.
- **`passMark` and `direction` would have been write-only.** Both are now shown
  in a summary line (`4–10 · pass 5 · 10 best`), so no stored field is
  invisible. A pass/fail marker per grade row is the obvious follow-up and the
  one place `direction` will change an outcome.

`normalizeScale` is deliberately total — callers are render paths, so a
half-typed value in Settings must not blank the Grades screen. It swaps a
backwards range rather than rejecting it, nudges a degenerate one, and falls
back field by field so clearing `max` does not also reset `min`. Settings keeps a
raw string draft for the same reason. Verified against backwards, degenerate,
out-of-range, string, garbage and empty input, plus German lower-is-better and
Finnish higher-is-better.

**Scoped deliberately:** the scale is device-local, like `gradeMode`. Gotcha 2
argued it belongs in the synced `user_preferences`, and that is right — but that
table has no column for it, so syncing needs a schema change. Left as a
follow-up rather than assumed; the Settings note says plainly that it does not
sync.

Original write-up:

Today `gradeMode` is `'us' | 'ib'` only. A student on the Finnish 4–10 scale has
no correct option — and the same is true across most of Europe.

**The good news, checked:** this is much smaller than it sounds.

- `calculateGPA(courses, 'ib')` is a **straight weighted mean** (`lib/gpa.js:29`).
  That maths is already correct for any "higher is better" numeric scale,
  Finnish 4–10 included. There is no new formula to write for the common case.
- `grades.grade` is `numeric` in Postgres and stores the raw value, so the scale
  is purely interpretation. **No database migration is needed.**
- Nothing in the grades or stats views hardcodes a maximum of 7 or 100 — checked.

**The gotchas, in order of how easy they are to miss:**

1. `App.jsx:309` — `case "SET_GRADE_MODE": return {...state, gradeMode: action.mode==="us"?"us":"ib"}`.
   That ternary **silently coerces any unrecognised mode to `'ib'`**. A third
   mode will vanish without error until this line changes. Start here.
2. `gradeMode` is persisted to `localStorage` only (`App.jsx:808`) and
   deliberately excluded from sync as a device-level display toggle. A *custom
   scale definition* is not a display toggle — it is configuration a user would
   expect on their other device. The `user_preferences` table already exists and
   is synced; that is where the scale belongs, with `gradeMode` itself possibly
   moving too.
3. `RESET_AFTER_SIGNOUT` (`:325`) preserves `gradeMode` deliberately. Whatever
   holds the custom scale needs the same treatment or a guest loses it at
   sign-out.

**What to store:** `{ min, max, passMark, direction }`. The first three are
obvious; `direction` is the one worth adding while you are in there, because
several European scales run the other way — German and Czech 1–5/1–6 have 1 as
best. Supporting it is one comparison, and skipping it means revisiting this
whole item the first time a German user asks.

Suggested default when "Custom" is picked: 4–10, pass at 5, higher-is-better —
it is the case that prompted this, and it makes the feature self-explanatory.

Worth noting for the disclaimer in the terms: the ToS already says the
institution's official calculation is the one that counts, which covers a
user configuring a scale that does not match their school's weighting rules.

### SD-F3 ✅ Guest avatar is a bare dot

**Fixed 2026-07-29.** Inline SVG silhouette in `lib/avatar.jsx`, sized in `em`
so one component serves both the 52px Settings avatar and the smaller topbar
button. Squared, slightly wide shoulders rather than the stock
circle-on-a-hump, so it reads as drawn rather than as a missing image.

Turned out to be a duplication fix too: `avatarInitials` existed **verbatim in
both `App.jsx` and `SettingsView.jsx`**, each with its own `"·"` fallback, so
the bare dot had to be fixed twice or unified. Unified — it now returns `null`
for guests and the caller renders the silhouette.

Original write-up:

`src/App.jsx:24-30` — `avatarInitials()` returns `"·"` when there is no session,
so guests get a single interpunct in the top-right circle.

Suggestion is an anonymous-profile silhouette with some character to it rather
than the Instagram default. Since StudyDesk's identity is the cream-paper
aesthetic, an inline SVG in the existing palette would fit and costs nothing at
runtime. Keep it inline — no asset fetch, no new dependency.

Small, but it is the first thing a guest sees on every screen, and roughly half
the user base never signs in.

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
