# NCC — QoL & Dead Code Audit

**Deep pass, 2026-07-26.** Findings only — nothing here is implemented. Ordered
by value, not by effort. Each item says what it is, where, why it matters, and
roughly what it costs.

Codebase: 169 TS/TSX files, ~34,000 lines.

> Cross-app note: several findings land on the audience ACT-5 identified (India,
> LATAM, Africa, SE Asia). Those are marked **[ACT-5]** — they are not
> hypothetical polish, they block the users who are actually installing this.

---

## A. QoL — high value

### A1. 🔴 The currency list excludes almost every real user **[ACT-5]**

`['EUR','USD','GBP','SEK','NOK','DKK','CHF','JPY']` — eight Western/Nordic
currencies, and that is the entire set a user can pick from.

Missing: **INR** (India — the largest confirmed cluster), **BRL** (Brazil),
**IDR** (Indonesia), **NGN/GHS/KES** (the Transsion cluster), **MXN/ARS/COP**,
**CNY** (~6 confirmed users), **AED/SAR**, PKR, PHP, ZAR, TRY, VND, EGP.

A user in India cannot record a transaction in rupees, set a budget in rupees,
or pick a base currency. There is no "Other" escape hatch. **This is the same
defect class as StudyDesk's assignment-type dead end, with far higher impact.**

**It is not a data constraint.** The FX source is
`open.er-api.com/v6/latest/USD` (`src/api/fxRates.ts:14`), which returns ~160
currencies free and keyless. The 8-item list is purely a UI decision.

Worse, the list is **duplicated four times**, three of them verbatim copies:

| Location | Role |
|---|---|
| `src/store/useSettingsStore.ts:7` | `SUPPORTED_CURRENCIES` — base currency (canonical) |
| `src/screens/finance/NetWorth.tsx:34` | `CURRENCIES` — account currency |
| `src/screens/finance/ManageLots.tsx:17` | `CURRENCIES` — purchase currency |
| `src/screens/finance/ManageHoldings.tsx:11` | `CURRENCIES` — holding currency |

**Fix:** delete the three copies, import the canonical one, and widen it.
Cheapest useful version is a curated ~30 covering the ACT-5 geography; the
better version is a searchable picker over whatever `open.er-api.com` returns,
since the rates endpoint already tells you the valid set. **Small change, large
unlock.**

### A2. 🔴 Hardcoded English day and month names in a ten-language app

Two components render English regardless of locale:

- `src/components/WorkRatingCard.tsx:20` — `DAY_LABEL = ['Sun','Mon',…]`
- `src/components/HeatmapCalendar.tsx:52` — `MONTH_LABELS = ['Jan','Feb',…]`

The day fix is nearly free: **`days.short.*` keys already exist and are already
translated into all ten languages** — the component just doesn't use them. This
is an oversight, not missing work.

Months have no keys, but need none —
`new Intl.DateTimeFormat(lang, { month: 'short' })` gives correctly localised
abbreviations for every locale including Arabic and Hindi, and it is already
how the platform expects this to be done.

**Fix:** two small edits. Highest ratio of value to effort in this report.

### A3. 🟠 Destructive actions use native `confirm()` — 9 sites

`window.confirm()` / bare `confirm()` guards deletes across
`Settings`, `AddTransaction`, `AddTask`, `HabitsOverview`, `AddHabit`,
`SavingsGoals`, `ManageLots`, `ShareModal`.

On Android WebView this renders the **OS** dialog, which means:

- Buttons are OS-language, not app-language. A user running the app in Hindi
  gets English "OK / Cancel". The message is translated; the buttons are not.
- **The dialog is LTR even in Arabic** — it does not respect `dir="rtl"`.
- It shows the package name as the title.
- It blocks the JS thread, and Capacitor WebViews occasionally swallow it.
- It cannot carry the app's visual language at all.

There is no shared confirm component today (`ShareModal` and
`NotificationsExplainerModal` are the only modals). **Fix:** one
`ConfirmDialog` reusing the existing modal/portal pattern, then replace the 9
call sites. Medium effort, and it closes the last place where the ten-language
work visibly leaks.

### A4. 🟠 Hardcoded `€` inside translated strings **[ACT-5]**

- `fin.budg.monthlyLimit` = `"Monthly limit (€)"`
- `fin.budg.perMonth` = `"€{{amount}} / month"`

These are baked into **all ten locale files**, so a user whose base currency is
INR sees a euro sign on their budget screen in every language. The currency
symbol should come from the user's base currency, not the string.

**Fix:** interpolate the symbol (`{{symbol}}`) or drop it from the copy and let
the existing formatter supply it. Small, but it touches all ten locales — worth
bundling with A1.

### A5. 🟡 What-If milestones are hardcoded at euro scale **[ACT-5]**

`src/screens/finance/WhatIf.tsx:25` —
`MILESTONES = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]`.

Sensible in EUR/USD. In IDR, 1,000,000 is about €60 — so every milestone is
already passed and the feature renders as noise. In INR the spacing is wrong
too.

**Fix:** derive milestones from the user's starting balance and base currency
(e.g. next powers-of-ten above current net worth) rather than a fixed ladder.

### A6. 🟡 Budget category icons are a closed set of 12

`src/screens/finance/ManageBudgets.tsx:15` — twelve fixed emoji, no custom
option. Exactly the pattern the StudyDesk assignment-type fix addressed: a
preset list with no escape hatch. A user wanting a category the twelve don't
cover has to settle for a wrong icon.

**Fix:** allow a free-text emoji/character alongside the presets. Small.

### A7. 🟡 Study sub-score has the fitness pacing bug (carried over)

`src/lib/crossDomainSignals.ts:410` — `study.totalMinutes / 240` scores the
in-progress week against the full weekly target, so it reads artificially low
until Sunday. Identical shape to the fitness bug fixed in v1.8; the braindump
only named Fitness so it was deliberately left. The fix is now one line, since
`weekElapsedFraction()` and the `paceFraction` plumbing already exist.

---

## B. Dead code — safe to remove

**~218 lines of source, 9 committed design files, 280 locale strings.**

### B1. `src/theme/` — the entire directory (4 files, 68 lines)

`colors.ts`, `typography.ts`, `spacing.ts`, and an `index.ts` barrel that
re-exports all three. **Nothing imports any of them.** An abandoned design-token
system, superseded by the Tailwind config plus CSS custom properties in
`index.css`. Its continued existence is actively misleading — it looks like the
source of truth for design tokens and is not.

### B2. `src/lib/bodyMetricsAnalysis.ts` (80 lines)

Header says it was ported from LimeLog so both apps compute identical weight
trends "for the Fitness screen's body section". **That section was never built**
— nothing imports the file. Note this is also NCC holding a copy of logic for
data LimeLog owns.

### B3. `src/components/ui/Glass.tsx` (59 lines)

Never imported, and not exported from the `ui` barrel. The glass treatment is
done with CSS classes (`glass`, `glass-soft`, `glass-strong`) instead.

### B4. `src/utils/constants.ts` (11 lines) — never imported.

### B5. `Claude Design resources/` — 9 files, 116 KB

A design handoff bundle (`design_handoff_vault_unlock/`) committed to the repo
root: reference `.jsx` mockups, a `.html` file, and an unused `VaultUnlock.tsx`
/ `.css` / hook. Not referenced by the build. Design handoffs don't belong in
the shipped repo — this is the same category as `docs/handoff-v1.8/`, which was
already deleted.

### B6. The `growth.*` namespace — 28 keys × 10 locales = **280 dead strings**

Plus `nav.growth`. **There is no Growth screen, no route, and no Reading
feature** — the bottom tab bar has four tabs (home / finance / life / tasks) and
`grep` finds no Growth component. The keys were written ahead of a feature the
registry still lists as "still open, not started".

Worth being blunt about the cost: **112 of those strings are ones I just
translated into hi/pt/id/ar this session.** If the Growth hub is genuinely
next, keep them; if it is not, deleting them removes 280 strings of maintenance
from every future locale change.

### B7. ~33 unnecessary `export`s

Symbols exported but imported by nothing — used only inside their own module.
Concentrated in `crossDomainSignals.ts` (11), `cloudSync.ts` (4),
`weeklyReview.ts` (6), `gpa.ts` (5), `fundamentalsScore.ts` (4). Dropping the
keyword narrows the public surface without changing behaviour.

Includes three I added this session — `RTL_LANGS`, `isRtl`, `applyDirection` in
`src/i18n/index.ts`. `applyDirection` is called internally so its export is
redundant; `isRtl` and `RTL_LANGS` are genuinely unused and should either be
consumed or dropped.

### B8. 🔴 NCC's write path into LimeLog-owned tables (previously flagged)

`useFitnessStore` still enqueues `workout_session` / `workout_set` mutations
(`src/store/useFitnessStore.ts:237,251,260,266,274`) and `cloudSync.ts:549`
dispatches them to Supabase. No UI reaches it since v1.5.2, but it contradicts
the binding data contract and stays one caller away from writing to LimeLog's
tables in production. **This is the dead code most worth deleting outright.**

---

## C. Process findings

### C1. 🔴 The secret scanner is opt-in per clone, with no CI backstop

`scripts/check-secrets.mjs` (210 lines) is a genuine pre-commit secret detector,
and `.githooks/pre-commit` wires it up — but only after a **manual, per-clone**
`git config core.hooksPath .githooks`. That setting is not committed and cannot
be.

Verified: **this clone has `core.hooksPath` unset**, so the scanner has been
silently inactive for every commit made here. There is **no `.github/workflows`
directory at all**, so nothing catches it server-side either.

For a public repo that already ships production Supabase credentials (SEC-1),
a secret scanner that only runs if each developer remembers to enable it is
close to no scanner. **Fix:** a CI workflow running the same script — the script
already exists and takes no arguments.

### C2. 🟠 No CI and no tests

No `.github/workflows`, no test script, no test framework. The working agreement
calls the build gate mandatory and notes two releases shipped broken because it
was skipped — a five-line workflow running `npm ci && npm run build` would make
that structural rather than a matter of discipline.

### C3. 🟡 The build gate is fragile against toolchain float (carried over)

`"typescript": "^5.6.2"` resolves to 6.0.2 on a clean install, which hard-errors
on the deprecated `baseUrl` in `tsconfig.json` before compiling anything. Pin it.

---

## Suggested order

1. **A2** (day/month i18n) — smallest change, most visible, keys already exist.
2. **A1 + A4** (currencies) — the one item that unblocks a whole audience.
3. **C1** (secrets in CI) — security, and the script is already written.
4. **B1–B6** (dead code) — mechanical, no behaviour change.
5. **B8** (LimeLog write path) — contract violation waiting for a caller.
6. **A3** (ConfirmDialog) — the last visible gap in the i18n/RTL work.
7. **A5, A6, A7, B7** — polish.
