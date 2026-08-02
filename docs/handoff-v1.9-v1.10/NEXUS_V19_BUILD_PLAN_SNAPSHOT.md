# NEXUS v1.9 Build Plan — SEC-1 Decision

**Milestone:** `v1.9` — SEC-1 only
**Registry:** `Nexus_Version_Status.md`
**Prior:** v1.8 Activation complete (NCC v1.7.2 / LimeLog v1.8.3 held-unbumped; StudyDesk v1.6.2 shipped)
**Note on numbering:** the held-back braindump feature items (StudyDesk assignment-type, NCC score-pacing/fitness-target, LimeLog workout types, AUTH-2, housekeeping) were originally scoped as v1.9 on 2026-08-01, but SEC-1 took the v1.9 slot instead per CTO call the same day — that plan now lives at **`NEXUS_V110_BUILD_PLAN.md`** as v1.10.

---

## What SEC-1 actually is

From Open Blockers: the Supabase project URL + anon key must resolve at build
time for F-Droid's reproducible builds, so anyone who clones any of the three
public repos and runs a dev build gets a working client pointed at
**production** (`hkktorzhaqnfqsnlstda`). RLS is the only thing separating that
stranger's session from every real user's row.

## Attacking the framing before accepting it

Before scoping this as "fix the credential exposure," worth checking whether
that's the right problem statement. **Live security-advisor check run
2026-08-01** (`get_advisors(type: security)` against `hkktorzhaqnfqsnlstda`):
the only finding is `PRE-3` (leaked-password protection disabled, already
tracked, plan-gated). **Zero RLS-gap warnings.**

> **⚠️ Corrected 2026-08-01 — the advisor is not sufficient evidence for this
> claim.** This section originally described the advisor as one "which
> specifically flags missing or weak RLS policies." It does not flag *weak*
> ones. It checks whether RLS is **enabled** on a table; it does not evaluate
> whether a policy restricts anything. A table with RLS on and a policy of
> `USING (true)` passes it silently. Since the whole recommended path below
> rests on "RLS is correct," resting it on the advisor alone was resting it on
> nothing.
>
> **Verified directly instead, 2026-08-01,** by reading `pg_policies` rather
> than trusting the lint:
>
> - **30** public tables, not 27 — the older figure predates `assignments`,
>   `exams` and `study_actions`. All 30 have RLS enabled.
> - **66 policies**, every one resolving to `auth.uid() = user_id` or an
>   explicit ownership helper. **No `USING (true)` anywhere.**
> - The share tables route through `private.*` helpers — all `SECURITY
>   DEFINER` with `search_path` pinned to `''`.
> - `share_invite_rate_limits` is `deny_all_direct_access` (`using false`).
> - The mutating `SECURITY DEFINER` routines (`purge_soft_deleted`,
>   `soft_deleted_pending`, `erase_audit_log_for_user`) are still revoked from
>   `anon` and `authenticated` — the L-7/L-10 hygiene held.
>
> **The conclusion below was right. Its evidence now actually supports it.**

That matters because a Supabase anon key is **designed to be public** — it's
the same model as a Firebase web config or any client-embedded API key: it
identifies the project, not a secret credential, and RLS is the actual
authorization boundary by design, not a backstop. Under that model, "a
stranger's dev build can reach production" is not itself a vulnerability — every
legitimate user's phone already does exactly that. **The real question SEC-1
should resolve is "is RLS actually correct," and the clean advisor scan is
real evidence toward yes, not a reason to stop asking.**

So the residual risk is narrower than the original framing suggested: not
"credentials are exposed" (expected, unavoidable given F-Droid's
reproducible-build requirement — see below), but **volume and abuse** — a bad
actor now needs only `git clone` + a dev build instead of decompiling a
signed APK to start hammering the anon endpoint or probing for an RLS policy
gap at scale.

## Why the obvious fix (point the committed fallback at a demo project) doesn't work

The instinctive fix — commit a throwaway/demo Supabase project's credentials,
supply real production credentials only via CI secrets at release build time
— **breaks reproducible builds**, which took three rounds of real work to get
green (see `FD-CI-GREEN` in the archive). F-Droid's buildserver has no access
to CI secrets; it rebuilds from the exact committed source. If the published
release APK embeds production credentials injected at CI time, F-Droid's
from-source rebuild would embed the demo project's credentials instead —
byte-mismatch, and reproducibility fails again, undoing that work. Whatever
is committed **must** be what F-Droid builds, and F-Droid's build **must**
produce a working app against real production data for real users. There is
no way to hide the anon key from a source-available, reproducible-build app.
This option is not "harder than it looks," it's incompatible with a
commitment already made — flagging so it isn't re-proposed without this
context.

## Recommended path (CTO to confirm, not yet decided)

1. **Keep the production URL + anon key as the committed fallback.** Required
   by F-Droid reproducibility; consistent with how Supabase anon keys are
   meant to work. Nothing to build here.
2. **Treat RLS correctness as the actual security boundary and keep verifying
   it,** not as a one-time pass. Re-run `get_advisors(type: security)` after
   every schema change (already a `P2` standing rule) — this SEC-1 resolution
   leans on that rule actually being followed, not just written down.
3. **Add abuse/volume controls**, which is the part that's actually new work:
   - Check Supabase's built-in rate limiting / abuse protection settings for
     the anon key and the auth endpoints — confirm what's available on the
     free plan vs. what needs Pro (same plan-gating pattern as `PRE-3`).
   - Consider whether Postgres-level statement timeouts or connection limits
     need adjusting now that the client pool includes untrusted dev builds,
     not just the three known apps.
   - `O-5`'s weekly backup script and `O-7`'s soft-delete purge are already
     partial mitigations for "something got deleted or corrupted" — worth
     confirming they'd actually catch an RLS-bypass-driven bulk write, not
     just accidental app-level deletes.
4. **Do not attempt the demo-project split** — see above. If this ever needs
   revisiting, it's a candidate for a genuinely separate mobile-only backend
   (a bigger project, not a v1.9-sized decision).

### The concrete abuse vector item 3 was reaching for — `ai-generate`

Found 2026-08-01 while verifying the above. The abuse section named no
specific endpoint; there is exactly one that matters, and it was missing from
this plan.

`ai-generate` is the **only** endpoint with a marginal cost and a shared,
exhaustible quota — it proxies Gemini on a server-side key. Its limiter could
not bound either, for two compounding reasons:

- The per-user window keys on the JWT `sub`. **Signup is open**, so rotating
  free accounts resets the bucket at zero cost to an attacker.
- The global cap lived in an **in-memory `Map`**, so it was per-isolate, not
  per-deployment. Supabase spins up isolates on cold start, concurrent load
  and geographic routing. The function's own comment admitted this and named a
  Postgres-backed limiter as the fix.

Net: anyone able to `git clone` could exhaust the project's Gemini free-tier
**daily** quota and hand every real user a 429. Not a data breach — a cheap
denial-of-service on a shipped feature, plus uncapped billing exposure the
moment that tier stops being free.

The limiter's stated justification was *"personal suite, ~2 real users."*
There are 193 accounts. **That premise is what expired**, and it is why this
belongs in SEC-1 rather than a later milestone.

**Built and applied 2026-08-01** — `supabase/migrations/20260801_ai_rate_limits.sql`
plus the `ai-generate` rewiring. Mirrors the `share_invite_rate_limits`
pattern already in this database rather than inventing one. The in-memory
limiter is kept as a free first layer and as the fallback when the database
check fails, so an outage degrades rather than breaking an opt-in feature.
Advisor re-run after the DDL: unchanged, `PRE-3` alone.

## CTO decision — settled 2026-08-01

The open question was whether "RLS clean + abuse monitoring" was enough, or
whether this warranted something structural (Auth CAPTCHA, IP rate limiting).

**Answer: the lighter path, plus the `ai-generate` fix above. No CAPTCHA.**

That is now an evidence-based call rather than a lean:

- **The data boundary is verified**, at the policy level, not by lint (see the
  correction above). The anon key stays committed.
- **CAPTCHA was rejected on the signup data, not on effort.** The 2026-07-27
  cohort was sampled by hand: signups spread naturally across a full day
  (03:37→22:31), varied local-part lengths, and domains including seznam.cz,
  duck.com and tutanota.com. A bot farm does not sign up through Tutanota and
  Seznam. **There is no evidence of scripted signup abuse**, and CAPTCHA would
  put friction on the exact funnel step already losing ~76% of users.
- Revisit if the signup shape ever changes — clustered timing, uniform
  domains, or a burst that does not match a release.

---

## CTO additions

<!-- append further v1.9 scope below -->

---

*Snapshot taken 2026-08-01 from `D:\emilh\Projects\limecore\NEXUS_V19_BUILD_PLAN.md`.*
