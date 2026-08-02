# Open items — read this first

**Written 2026-08-01 by the remote agent. This is the only document I added; everything you need is here.**

Status confirmed with the owner on 2026-08-01. Everything not listed below is
done: `O-3` (SMTP), `O-4` (DPA), `O-7` (purge job), `C-1` (keystore backed up),
`C-2` (Site URL allowlist), `C-3` (secret scanning), `C-4` (branch protection).

---

## 1. Top priority — still open

| Ref | What | Notes |
|---|---|---|
| **X-3** | `phoneScreenshots` exist only for `en-US` and `zh-CN` in all three apps; the other eight store locales fall back | Needs device time. Store *text* is already done in all ten locales — this is screenshots only. |
| **Suite home** | Legal pages are served from `gh-pages` on this repo. Owner leans toward moving them to `limecore.dev/*`, which is probably right | ⚠️ **Whatever URL is in the Google console must keep working** — changing it means re-verifying with Google. Move by adding the new URL first, verifying, then redirecting the old one. `gh-pages` is a *built copy* of `docs/` — editing `docs/` on a branch changes nothing users can read. |
| **O-5** | Weekly `pg_dump` backups — script written and preflight-verified, still needs the `.db-url` credential file and a Task Scheduler entry | Owner: "probably partial". Interacts with `O-7`: the purge job hard-deletes on a 90-day window against a 7-day-retention, no-PITR backup posture. Get the dump running before the purge has anything to delete. |
| **O-6 / PRE-3** | Leaked-password protection | Blocked — needs Supabase Pro. Not actionable. |
| **FD-META** | F-Droid `WebSite` field unset on all three recipes; `www.limecore.dev` redirect worth a final check | Owner unsure of status. I could not verify — fdroiddata isn't attached to this session. NCC/LimeLog can add it in their open MRs; StudyDesk needs its own small MR. |
| **HYG-1** | The `CLAUDE.md` one-line consolidation, uncommitted across repos | Owner unsure. I checked: **NCC, LimeLog and StudyDesk working trees are all clean**, so this looks done for those three. `limecore-site` is the fourth repo and isn't attached here — worth a `git status` there. |

### Also open, from this session's work

| What | Why it matters |
|---|---|
| **Confirm the Gemini free-tier RPD in Google AI Studio** | `AI_GLOBAL_DAY_LIMIT` in the `ai-generate` Edge Function defaults to **200/day**, which is a guess. If Google's real daily cap is lower, that default is not conservative — it is useless. Env-tunable, no redeploy of code needed to change it. |
| **Build the widgets on a real machine** | StudyDesk PR #10 was never compiled — this container has no Android SDK. See §4. |
| **`feature/v1.8-limelog` remote branch is stale** | I created it, then found it redundant (zero commits over `develop`). Local delete succeeded, remote delete was blocked by the git proxy. Delete it from the GitHub UI. Harmless meanwhile. |
| **NCC has no ESLint config** | `npm run build` (tsc + vite) is its only gate, unlike LimeLog and StudyDesk which lint at `--max-warnings 0`. This is why `react-refresh/only-export-components` fired four times in those repos and never here. Worth aligning. |

---

## 2. PR stacks — merge bottom-up

Each PR is based on the one above it. GitHub retargets each automatically as the
one below it lands, so merge in order and the diffs stay clean.

**NCC** (`Limekana/nexus-command-center`) → base `develop`

1. **#2** — SEC-1 durable rate limiting
2. **#3** — lucide tab icons + Ko-fi row
3. **#4** — AUTH-2 code-entry screen
4. **#5** — per-user weekly workout target

**LimeLog** (`Limekana/limelog`) → base `develop`

1. **#3** — Ko-fi row
2. **#4** — AUTH-2 code-entry screen
3. **#5** — cardio logging + three UI bug fixes

**StudyDesk** (`Limekana/StudyDesk`) → base `develop`

1. **#9** — lucide tab icons + Ko-fi row
2. **#10** — Android home-screen widgets

Plus this document, on `docs/handoff-open-items`, which is independent of all of
the above and can merge first.

### Release constraints, unchanged

- NCC stays **1.7.2** and LimeLog **1.8.3** — unbumped until fdroiddata !41550
  and !41548 merge. Code lands on `develop` regardless.
- StudyDesk ships standalone: tag + GitHub Release carrying the signed APK, no
  MR. Section A of `fdroid/FDROID_RELEASE_CHECKLIST.md` must be re-verified
  before each build — auto-update clones the previous recipe verbatim, so a
  regression there silently breaks the next build with no review to catch it.

---

## 3. Already applied to production — do not re-apply

Three changes are **live on `hkktorzhaqnfqsnlstda` right now**. The PRs are the
version-controlled record catching up, not work waiting to happen.

| What | State |
|---|---|
| `public.ai_rate_limits` + `check_ai_rate_limit()` | Applied. Advisor re-run: unchanged, `PRE-3` only. Verified unreachable from `anon`/`authenticated`; `service_role` grant intact. |
| `ai-generate` Edge Function **v7** | Deployed, `verify_jwt` preserved. Verified live: calls 1–10 pass, call 11 returns `429` with `Retry-After: 60`. No Gemini quota spent — rejections happen before the upstream call. Test rows removed. |
| `workout_sessions` — `activity_type`, `duration_seconds`, `distance_meters` + two non-negative checks | Applied, additive only. All 22 existing rows untouched. Constraint verified to reject a negative duration. Test rows removed. |

**A correction worth carrying forward:** SEC-1's original reasoning rested on
`get_advisors` reporting zero RLS gaps, and described it as flagging "missing or
weak RLS policies". **It does not flag weak ones** — it checks whether RLS is
*enabled*, so a policy of `USING (true)` passes silently. RLS was re-verified by
reading `pg_policies` directly: **30 public tables** (not 27 — that count
predates `assignments`/`exams`/`study_actions`), **66 policies**, every one
`auth.uid() = user_id` or an ownership helper, no `USING (true)` anywhere. The
conclusion held; the evidence now supports it. Treat the advisor as necessary
but **not sufficient** after any policy change.

---

## 4. StudyDesk widgets (PR #10) — never compiled

This container has no Android SDK. **Yours is the first real build.**

What I verified statically: all 21 `R.id` references resolve against the
layouts, both `R.layout` references exist, every `@string`/`@drawable`/`@layout`/
`@xml` reference resolves, all XML parses, no unused imports.

**The important part: `android/app/build.gradle` and `android/build.gradle` are
byte-identical to before.** The v1.10 plan called for Jetpack Glance, which
needs the Kotlin Gradle plugin plus the Compose compiler. I used `RemoteViews`
in Java instead — two widgets showing a few lines of text do not need a Compose
runtime, and adding that toolchain to an F-Droid reproducible build that took
three rounds to get green, while two MRs sit in review, was the single largest
risk in the item. It is now zero.

On device, check: place both widgets; edit an assignment and confirm they
redraw; tap each and confirm it opens without stacking a second task; confirm
the empty state with nothing due. **Then rebuild against the F-Droid recipe and
diff before any tag.**

---

## 5. Decided but not started — large-screen work

Owner decisions, 2026-08-01. Nothing is built yet.

- **Scope:** large-screen and tablet redesign of **StudyDesk and NCC**, both.
  LimeLog is excluded — no desktop use case (a watch version was floated as the
  interesting direction there instead).
- **Plus** a packaged desktop app, **released solely on GitHub**. Not a public
  web app — that option was explicitly not taken, which keeps the SEC-1 posture
  and the privacy policy's "no web version" statement intact.
- **Calendar:** rebuild the existing month grid properly so one component serves
  both sizes — denser and more legible on phone, genuinely large on tablet and
  desktop with room for item titles rather than dots. Not a separate desktop-only
  view.

**Useful starting facts.** StudyDesk is not starting from zero: it already
renders a 240px sidebar above 769px with the mobile tab bar hidden, and
`.content` capped at `max-width: 900px`. There is exactly **one** breakpoint
(768/769) and no tablet handling, so a tablet currently gets either the phone
layout or a desktop layout stranded at 900px on a much wider screen. The month
grid already exists, hand-built, in `PlanView` (`src/App.jsx`, around the
`calMonth` state).

---

## 6. Conventions worth keeping

- **In a component file, export nothing else.** `react-refresh/only-export-components`
  forced a split four times during v1.8.
- **Lint is the type checker in the JS repos.** Vite will happily build an
  `App.jsx` referencing identifiers that no longer exist; only `no-undef` at
  `--max-warnings 0` catches it.
- **Revoke `EXECUTE` on any `SECURITY DEFINER` function in `public`** — anything
  created there is exposed by PostgREST as an RPC.
- **Verify against the remote, not a local ref.** I twice reported a branch
  problem that did not exist because a filtered fetch had left `origin/develop`
  stale. `git ls-remote` is the authority.
