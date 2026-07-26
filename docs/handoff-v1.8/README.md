# v1.8 Handoff — Working Agreement

**Bundled 2026-07-26.** Emil is away. This directory is a self-contained brief for a
remote agent picking up the v1.8 (Activation) batch. Everything you need to know
about how these projects are worked is in this file; the two documents beside it
are the *what*.

| File | What it is |
|---|---|
| `README.md` | This file — rules of engagement. Read first, in full. |
| `NEXUS_VERSION_STATUS.md` | Snapshot of the suite registry: versions, blockers, permanent priorities. |
| `NEXUS_V18_BUILD_PLAN.md` | The v1.8 scope — ACT-2..ACT-5 plus CTO feature additions. |

> These two are **snapshots** taken 2026-07-26. The living originals sit outside
> every repo, on Emil's machine at `limecore/`. Do not treat this copy as
> authoritative after the PR lands — it exists so you can work without that
> machine. Deleting this directory is part of merging the PR.

---

## 0. The one-paragraph version

Three Capacitor/React Android apps share one Supabase project. Work happens on
`feature/*` branches cut from `develop`. You implement, you build-verify, you open
a PR against `develop`, and you stop. You do not merge, do not touch `main`, do not
tag, do not release, do not run database migrations. There are ~100 real accounts
in the production database and one shared release keystore that is not on your
machine, so the parts of v1.8 that "ship" cannot be shipped by you — only prepared.

---

## 1. The suite

| Repo | App | Stack |
|---|---|---|
| `nexus-command-center` | NCC — suite hub/dashboard | React 18 · TS · Capacitor 7 · Zustand · Dexie |
| `limelog` | LimeLog — strength tracker | React 18 · TS · Capacitor 8 · Zustand · Health Connect |
| `studydesk` | StudyDesk — academic tracker | React 19 · **plain JSX, no TS** · Capacitor 8 |

All three are public GitHub repos under **Limekana**, all Vite, all sharing Supabase
project `hkktorzhaqnfqsnlstda`.

**Each repo has its own `CLAUDE.md` at its root — read it before touching that repo.**
It carries the per-app build commands, project structure, and the binding data
contract for the tables that app owns. This file does not repeat that content.

---

## 2. Git — branching and commits

```
main          ← production only. Tagged releases. NEVER commit or merge here.
├── develop   ← integration branch. All feature branches merge here.
│   └── feature/<name>   ← one per feature chunk, cut from develop
└── hotfix/<name>        ← emergency only, cut from main
```

- Cut `feature/<name>` from `develop`, one per meaningful chunk — not per bug fix.
  Suggested for this batch: `feature/v1.8-act2-i18n-auth-gates`, etc.
- **Open a PR against `develop`. Do not merge it.** Emil reviews on return.
- `main` is sacred. Nobody commits to it directly, and no `feature/*` goes to it.
- Commit messages use `feat:` / `fix:` / `chore:` prefixes. Include the version
  bump in the message when you bump `package.json`.

### Build gate — mandatory before any PR

Two releases have shipped truncated, non-compiling source because this gate was
skipped. Run it per app and paste the result in the PR:

| App | Command |
|---|---|
| NCC | `npm run build` (runs `tsc -b`) |
| LimeLog | `npm run build && npm run lint` |
| StudyDesk | `npm run build && npm run lint` — **no TypeScript here, lint is the only static gate** |

---

## 3. Hard stops — do not do these

Refuse outright, do not ask:

- **Never read, print, or commit `.env` files or secrets.**
- **Never commit the release keystore or `key.properties`.** They are gitignored;
  keep it that way. The signing key lives only on Emil's machine.

Stop and wait for Emil's explicit confirmation before:

- Any direct commit or merge to `main`; any history rewrite; `git push --force*`;
  `git reset --hard`; deleting an unmerged branch.
- **Any Supabase schema change** — `apply_migration`, or `execute_sql` containing
  DDL or destructive DML (`DROP`, `TRUNCATE`, `ALTER`, `DELETE` without a narrow
  `WHERE`). This holds even where those tools appear pre-approved in permissions.
- Release tags, deploys, store/F-Droid submissions, posting MR comments upstream.
- Deleting files or directories beyond the obvious scope of the task; any
  recursive delete.

**You cannot release anything.** Tagging + a GitHub Release with a signed APK
requires the keystore, which is not on your machine. The build plan says StudyDesk
v1.6.0 "ships alone" — your job is to make it *ready* to ship. Emil tags it.

---

## 4. Production database — read this before running anything

The Supabase project is **live production with ~100 real signup accounts**. It is
not a sandbox.

- **P1** — Migrations can destroy real people's data. Additive-only by default:
  new nullable columns, new tables. Never rename or drop a column a shipped app
  version still reads; old versions persist indefinitely on F-Droid because users
  update on their own schedule, or never.
- **P2** — RLS is load-bearing security, not a formality. It is the only thing
  separating one stranger's grades and workouts from another's. Any new table
  ships with RLS enabled and a policy *in the same migration*.
- **SEC-1 (open, unresolved)** — the committed Supabase URL + anon key resolve to
  **production** at build time, because F-Droid's reproducible builds require it.
  That means *your* dev build points at production too. **Do not create accounts,
  do not write rows, and do not seed test data against it.** If a task genuinely
  needs write testing, stop and flag it rather than improvising.

Full detail on all three in `NEXUS_VERSION_STATUS.md` under PERMANENT PRIORITIES.

### Shared data contract

| Table | Owner | NCC access |
|---|---|---|
| `subjects`, `grades` | StudyDesk | read + upsert (LWW on `updated_at`) |
| `study_sessions` | StudyDesk | read |
| `workout_sessions`, `workout_sets` | LimeLog | read (push-only from LimeLog) |

NCC is a **consumer** — never schema-authoritative for tables it doesn't own. A
schema change to any shared table means a migration file *plus* updates to every
app that touches it, and requires confirmation first. Two items in the v1.8 scope
may hit this — see §6.

---

## 5. How to work

- **Read before you edit.** Read the file, or the relevant section, before
  changing it. Never patch from memory.
- **Minimal footprint.** Touch only what the task requires. No unrequested
  refactors, renames, dependency bumps, or "while I'm here" cleanups. If you spot
  something worth fixing, name it in the PR description — don't fix it unasked.
- **No speculation.** Verify against the actual files before stating a fact about
  the project. If you haven't verified it, say so.
- **Grep first, read narrowly.** These are large repos. Don't dump whole files;
  don't scan `node_modules/`, `dist/`, `build/`, `.gradle/`.
- **Design work needs a design pass.** Any new UI or change to an existing screen
  → run `/frontend-design` first. This binds ACT-4, which restructures the auth
  gate. Each app has its own visual language and they do not get merged into a
  shared component: NCC is Cyber Slate Glass (dark, cyan), LimeLog is brutalist
  lime, and **StudyDesk's warm cream-paper notebook aesthetic is non-negotiable —
  never propose dark mode for it.**
- **Security pass before a version is called done.** Run `/fullstack-guardian`
  across the affected apps + shared Supabase surface before marking any version
  ready for review. Not needed for individual bug fixes.

---

## 6. This batch — what's actually being asked

Read `NEXUS_V18_BUILD_PLAN.md` for the full scope. Orientation:

**Do ACT-5 first, or at least before sizing anything else.** It's investigation,
not code. The activation numbers that motivated this milestone have a suspect
denominator — the leading hypothesis is that most of the ~100 accounts are
developers who cloned these public repos and ran them against production, not end
users who bounced. ACT-2/3/4 are real defects found by direct code inspection and
stand on their own merits, but **do not justify or size them against the "5%
activation" figure** until ACT-5 is settled.

**Held vs. shipping:**

| App | v1.8 status |
|---|---|
| StudyDesk | Work lands on `develop`, prepared for a v1.6.0 release Emil tags later |
| NCC | `develop` only — **no tag**, blocked until fdroiddata MR !41550 merges |
| LimeLog | `develop` only — **no tag**, blocked until fdroiddata MR !41548 merges |

The two MRs are upstream on gitlab.com/fdroid/fdroiddata and awaiting a maintainer.
**Do not interact with them.** No comments, no pushes to the fork branches.

**Two open design questions in the plan are genuinely undecided.** Do not resolve
them yourself and build past them — surface your recommendation in the PR and
leave the decision to Emil:

1. NCC's flexible weekly fitness target — static per-user baseline vs. per-week
   override. Overlaps a Habits backlog item; worth solving once, not twice.
2. LimeLog's non-gym workout types — **check first** whether NCC's fitness score
   filters by session type. If it does, this needs a shared-table schema change,
   which triggers the §3 stop condition. Determine which case it is before
   estimating.

---

## 7. When you're done

- One PR per repo, against `develop`, not merged.
- Build-gate output pasted in each PR description.
- Anything you deliberately left out, and why.
- Any assumption you had to make, called out explicitly.
- Note in the PR that `docs/handoff-v1.8/` should be deleted as part of merging.

Do not update `NEXUS_VERSION_STATUS.md` — the registry is updated on the dev
machine at version completion, following `limecore/BUILDER_UPDATE_PROMPT.md`,
which you don't have. Put what you'd have written into the PR description instead.
