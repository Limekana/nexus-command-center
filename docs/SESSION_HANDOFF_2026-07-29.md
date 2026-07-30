# Session handoff — 29 July 2026

Everything below is committed and pushed. Branches:

| Repo | Branch |
|---|---|
| nexus-command-center | `claude/ncc-repos-setup-3kvqoj` |
| limelog | `feature/v1.8-act2-auth-i18n` |
| StudyDesk | `feature/v1.8-act2-act4-auth-gate` |

All three build. LimeLog and StudyDesk lint at `--max-warnings 0`.

---

## 🔴 Read this first — one thing that looks done but is not

**GitHub Pages is serving the 27 July copy of the privacy policy.**

O-1 is genuinely done — Pages is enabled and all three URLs return 200. But
`gh-pages` carries a *built copy* of `docs/`, and it was never re-published after
today's edits. Verified against the live page:

| | Live now | In the repo |
|---|---|---|
| Dated | 27 July 2026 | 29 July 2026 |
| Free-tier training disclosure | **missing** | present, in 2 places |
| 90-day retention window | missing | present |
| Market-data processors named | missing | present |
| Export/delete correction | missing | present |
| Size | 11,924 bytes | 16,453 bytes |

This matters more now that **O-2 is done**: Google's OAuth consent screen points
at that URL, and the disclosure you asked for — that enabling AI means the text
may train Google's models — is not on the page anyone can read.

Not pushed by me, because deploying user-facing legal text is on the
stop-and-confirm list. To publish:

```bash
git fetch origin gh-pages && git worktree add /tmp/ghp gh-pages
cp docs/index.html /tmp/ghp/index.html
cp docs/legal/privacy.html docs/legal/terms.html /tmp/ghp/legal/
cd /tmp/ghp && git add -A && git commit -m "Publish 29 July policy" && git push origin gh-pages
cd - && git worktree remove /tmp/ghp
```

Then re-check: the page should say *"Last updated 29 July 2026"*.

---

## What changed, and why it mattered

### The AI question that started it

You asked what the AI features run on and whether they were free. Answering it
properly turned up that **all three apps have AI**, not just StudyDesk, and that
the privacy policy described none of it accurately.

All three route through one Supabase Edge Function (`ai-generate`) to
`gemini-2.5-flash`, key held server-side.

**The policy said AI "runs only when you write a note and press the button."**
True for StudyDesk and LimeLog. **False for NCC** — `LifeNarrativeCard`
generated itself on arrival at the Life tab whenever the cached score had drifted
≥5 points. The feature was not mentioned in the policy at all.

Fixed by making the promise true rather than rewording it: a real opt-in switch
in all three apps, **default off**, gated at the network call and not only at
the render site.

**Cost:** ~$0.0003/call — the whole user base is roughly $1–2/month. Cost was
never the issue. The free tier's training clause was, and you chose to stay on
it and disclose. That disclosure is in the policy twice and **under the switch
in each app**, which is where consent is actually given.

### Four more policy claims that did not match the code

| Claim | Reality |
|---|---|
| "Two processors, and nobody else" | NCC calls **ten** third-party hosts for market data |
| "Export / Delete my account are in Settings" | Only StudyDesk had them |
| Guest mode: "nowhere else" | True of entered data, but NCC fetches prices as a guest |
| LimeLog data table listed no AI fields | `ai_debrief_raw` + 4 more sync to Supabase |

All corrected, and **L-8 closed the export/delete gap** rather than leaving the
policy describing a limitation.

### Two production migrations, applied with your sign-off

**L-10 — `audit_log` erasure.** The recorded diagnosis understated it. The FK
was `SET NULL` as described, but the audit trigger snapshots *whole rows*, so
**138 of 140 rows carried `user_id` inside the JSONB**. Deleting an account
removed one of two pointers; the row stayed fully attributable. Fixed with
`CASCADE` plus a `BEFORE DELETE` trigger covering the payload path.

The advisor then caught something my plan missed — creating the trigger function
in `public` exposed it as a PostgREST RPC. Revoked; advisor back to one
pre-existing warning.

**L-7 — 90-day retention purge.** Two findings changed the design:

- **The blast radius is not the tombstone row.** `grades.subject_id → subjects`
  is `ON DELETE CASCADE` and four more FKs are `SET NULL`. Purging one
  soft-deleted subject would cascade-delete its grades — *live ones included*.
  Currently 0 live children sit under a tombstoned parent, but that is client
  behaviour, not a guarantee. **Every parent delete is guarded by `NOT EXISTS`
  over its live children.**
- **90 days, not 30.** The tombstone *is* the deletion signal — remove it before
  a second device syncs and the item comes back. It also made install a no-op:
  90 days purges **0 rows** today; 30 days would have purged **13**.

`archived_at` is never touched — that is "keep but hide", not a deletion.

### Everything else

| Item | Outcome |
|---|---|
| **SD-F1** | "Maybe later" on onboarding genuinely declines now. The migration was the risk: absent-key-but-onboarded reads **on**, so existing users keep reminders |
| **SD-F4** | Custom grade scale. Two of three pickers were *index*-based and could not express a custom value at all; the input had **no bounds** (9999 was valid on the IB scale) |
| **SD-5** | Custom course colour, three pickers merged into one |
| **SD-F2** | Tab glyphs dropped. Longest label is Spanish "Temporizador" (12 chars), fits; tap target held at 52px |
| **SD-F3** | Guest avatar — also a duplication fix, `avatarInitials` existed verbatim in two files |
| **SD-6** | `App.jsx` **2,216 → 1,376 lines**. CSS verified identical: 370 rules against 370 |
| **SD-7 / LL-7 / NC-9** | All `confirm()` replaced; **all three apps at zero unused exports**; 23 dead symbols deleted |
| **NC-8** | `growth.*` deleted, 290 strings |
| **L-9** | Art. 30 record, kept internal |
| **L-11** | Age statement in NCC and LimeLog |

### Findings that were not on any list

- **`formatShortDate` still hardcoded `'fi-FI'` and was live in three screens.**
  NC-1 routed ~30 sites through `formatLocale()` and missed it, so the exact bug
  NC-1 existed to fix was still shipping. No `'fi-FI'` remains in `src/`.
- **Three hardcoded English strings in LimeLog**, including a stall banner
  pluralised with `length > 1 ? 's' : ''` — wrong even in English at 0.
- **Dead functions carrying comments claiming they were live.**
  `computeAllAccountBalances` documented itself as *"Used by Net Worth + the
  account list view"*. Neither calls it.
- **The user base is 172 accounts, not 144** — 138 (80%) via Google, 7 still
  unconfirmed, which is O-3 visible in the data.

---

## Still open

### Yours

| Ref | Item |
|---|---|
| 🔴 | **Re-publish `gh-pages`** — see the top of this document |
| O-3 | Custom SMTP — 7 of 172 signups unconfirmed |
| O-4 | Accept the Supabase DPA (Art. 28 needs a written processor agreement) |
| O-5 | Backups off the free plan |
| O-6 | Leaked-password protection — the one remaining security advisor |
| O-7 | Gemini tier — decided: stay free, disclosed. Revisit if the apps earn |
| C-1 | **Back up the release keystore off-machine.** Lose it and StudyDesk can never be updated |
| C-2 | Supabase Site URL + redirect allowlist |
| C-3/C-4 | GitHub secret scanning; branch-protect `main` |
| X-3 | Screenshots per locale — needs a device |

### Code

- **LL-7 A8** — non-gym workout types. Blocked on `SessionLog` requiring
  `sessionTemplateId` + `programId`; no ad-hoc logging path exists.
- **SD-F4 sync** — the custom grade scale is device-local. Syncing it needs a
  new `user_preferences` column, so it is a schema change, not a code change.
- **NCC has no lint in its build gate**, unlike the other two. That is why
  `react-refresh/only-export-components` never fired there and did four times
  elsewhere. Worth aligning.

---

## Conventions worth keeping

- **In a component file, export nothing else.**
  `react-refresh/only-export-components` forced a split four times today.
- **Lint is the type checker in the JS repos.** During SD-6, Vite happily built
  an `App.jsx` referencing five identifiers that had moved out from under it.
  Only `no-undef` at `--max-warnings 0` caught it.
- **Revoke `EXECUTE` on any `SECURITY DEFINER` function in `public`** — the
  advisor will otherwise tell you, as it did during L-10.
