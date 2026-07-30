# Record of Processing Activities — GDPR Article 30

**Controller:** Limecore Studio (sole trader), Helsinki, Finland
**Contact:** l1m3core@gmail.com
**Last reviewed:** 29 July 2026
**Covers:** Nexus Command Center, LimeLog, StudyDesk — one controller, one
account system, one database.

> **Internal document.** Article 30 requires this to exist and to be made
> available to the supervisory authority on request. It does not require
> publication, and the security section below is a reason not to publish it. The
> public-facing description of the same processing is
> [`docs/legal/privacy.html`](./legal/privacy.html).
>
> **Why it exists at all:** the under-250-employee exemption in Art. 30(5) falls
> away when processing is not occasional. Continuous background sync across
> three apps is not occasional, so the exemption does not apply.

---

## 1. Purposes of processing

| # | Purpose | Lawful basis |
|---|---|---|
| P1 | Provide the apps — store and sync a user's finances, training, coursework, tasks and habits across their devices | Art. 6(1)(b), performance of a contract |
| P2 | Authenticate users and keep sessions alive | Art. 6(1)(b) |
| P3 | Optional AI features — the study debrief, the workout debrief, and NCC's weekly summary | Art. 6(1)(a), consent, given by the Settings switch and withdrawn by turning it off |
| P4 | Sharing a budget category or task with another user, when the user initiates it | Art. 6(1)(b) |
| P5 | Security and abuse prevention — share-invite rate limiting, change auditing on two NCC tables | Art. 6(1)(f), legitimate interest |

No processing for advertising, profiling, automated decision-making, or
analytics. **No analytics SDK is present in any of the three apps** — verified,
not assumed.

## 2. Categories of data subjects

Individual users of the three apps. **172 accounts** as of 29 July 2026, first
signup 11 May 2026.

StudyDesk is a study planner, so a meaningful share of its users are at school.
The minimum age to create an account is 16, or the local minimum where lower
(13 in some member states); the limit is stated at signup in all three apps and
in the policy. Guest mode requires no account and keeps everything on-device,
which is the route offered to anyone below the age.

## 3. Categories of personal data

Held in 27 tables. No special-category data under Art. 9 is *sought*; see the
note on body metrics below.

| App | Categories |
|---|---|
| **All** | Email address. Name and profile picture if the user signs in with Google. Preferences (language, units). |
| **Nexus Command Center** | Budget categories and limits, transactions, manual assets and account balances, investment holdings, purchase lots, sales, cash entries, watchlist symbols, savings goals, tasks and due dates, habits and daily completions, a daily 1–5 work self-rating with an optional note, share grants. |
| **LimeLog** | Programs and phases, sessions, every set with weight/reps/effort, personal records, session notes, bodyweight and body measurements, vertical-jump entries, AI debrief fields when enabled. Progress photos are **device-only** and never reach the database. |
| **StudyDesk** | Courses, grades with weight/date/note, study sessions with duration/focus/note, AI debrief fields when enabled. |

**Body metrics.** Bodyweight and measurements are not health data in the Art. 9
sense — they are self-recorded fitness numbers, not data concerning health
processed to infer a health condition. They are treated more carefully anyway:
recorded only if the user chooses, never used for anything but showing that user
their own trend, and never shared.

**Financial figures** are entered by the user. There is no bank connection and
no access to banking credentials — no such feature exists.

## 4. Categories of recipients

| Recipient | Role | What it receives |
|---|---|---|
| **Supabase** | Processor | Everything in §3. Database and Auth. |
| **Google (OAuth)** | Processor / independent controller for its own account | Only on "Continue with Google" — returns email, name, picture. 138 of 172 accounts (80%) use this route. |
| **Google (Gemini)** | Processor, with a caveat — see §5 | Only when the user switches AI on. The debriefs send the note the user typed; NCC's summary sends five 0–100 scores and on-screen headlines, no raw records. |
| **Market data providers** (NCC only) | Not processors of personal data | CoinGecko, Yahoo Finance, Finnhub, open.er-api.com, the ECB, the US Federal Reserve, NYSE, CNN's market-indicator feed. Each request carries a ticker symbol or currency pair — plus, unavoidably, the originating IP address. No account, name, holdings or amounts. |

No data is sold or shared for any other purpose.

## 5. Transfers to third countries

**Supabase** hosts in Stockholm, Sweden. No transfer.

**Google (Gemini)** may process outside the EEA, under the Standard Contractual
Clauses Google offers for international transfers.

> ⚠️ **Known and accepted:** the apps use Gemini's **free tier**, on which Google
> may use submitted content to improve its products, including training future
> models. That makes Google's role here closer to a controller than a processor
> for that content. The decision to stay on the free tier until the apps earn
> revenue was taken deliberately on 29 July 2026, and it is **disclosed to users
> in three places** — the short version at the top of the privacy policy, a
> dedicated box in its AI section, and a line directly under the Settings switch
> in each app. Moving to the paid tier excludes this use contractually and is
> the intended fix. Tracked as **O-7**.

**Market data providers** are outside the EEA in several cases and receive an IP
address with each request. No user-identifying data accompanies it.

## 6. Retention

| Data | Retention |
|---|---|
| Everything in §3 | Until the user deletes it. Accounts are never expired and old data is never quietly removed. |
| Deleted items | Marked deleted and hidden immediately; the marker is retained so the deletion propagates to the user's other devices, and is removed when the account is deleted. |
| On account deletion | Erased immediately and irreversibly across all three apps, by `ON DELETE CASCADE` from `auth.users`. No recovery window. |
| `audit_log` | Now cascades on account deletion, and a `BEFORE DELETE` trigger also removes rows attributable through the JSONB payload. Applied 29 July 2026 — before that, deletion nulled one of two pointers and the content survived. |
| Infrastructure backups | Roll off within 7 days. |

> ⚠️ **Known gap:** soft-deleted rows are retained indefinitely rather than
> hard-deleted past a fixed window. A scheduled purge is specified but not built.
> Tracked as **L-7**. The privacy policy was deliberately written to describe
> this behaviour rather than promise a window nothing enforces; tighten the
> wording when the purge ships.

## 7. Technical and organisational measures

- **Row-level security on all 27 tables**, enforced by the database rather than
  application code, so an application bug cannot expose one user's rows to
  another.
- **Authentication** via Supabase Auth. Passwords are never seen or stored by
  the application.
- **The service-role key never reaches a client bundle.** The only operation
  needing it — account deletion — runs in the `delete-account` Edge Function,
  which takes the user id from the caller's own verified JWT and has no
  parameter naming a user, so it cannot be aimed at another account.
- **The Gemini API key is server-side only**, held as a secret on the
  `ai-generate` Edge Function. That function is JWT-gated and rate-limited
  per-user and globally. It does not log prompts.
- **HTTPS throughout.**
- **Secret scanning** — a pre-commit hook plus a CI backstop in all three repos,
  so a leak is caught even from a clone that never installed the hook.
- **Device-level lock** in NCC: PIN with biometric unlock and a configurable
  auto-lock interval.
- **Open source.** All three apps are MIT-licensed with public source, so the
  claims above are checkable rather than merely asserted.

### Outstanding items affecting this section

| Ref | Item |
|---|---|
| O-3 | Custom SMTP not configured; 7 of 172 signups unconfirmed |
| O-4 | Supabase DPA not yet accepted — Art. 28 requires a written processor agreement |
| O-5 | Free-plan backups: 7-day retention, no point-in-time recovery |
| O-6 | Leaked-password protection disabled |
| C-1 | Release keystore backup off-machine unverified |
| C-2 | Supabase Site URL and redirect allowlist unreviewed |

## 8. Breach procedure

A personal-data breach is notifiable to the Finnish Data Protection Ombudsman
(*Tietosuojavaltuutetun toimisto*) within 72 hours of becoming aware, and to
affected users directly where the law requires it. Contact:
[tietosuoja.fi](https://tietosuoja.fi/en/home).

## 9. Data subject rights

Access, rectification, erasure, restriction, objection and portability. Two are
buttons in all three apps rather than requests, so they need no response time:

- **Export my data** — full JSON, works signed in or as a guest.
- **Delete my account** — erases the account and all its data across all three
  apps, immediately.

Everything else goes to l1m3core@gmail.com, answered within one calendar month.

---

## Revision history

| Date | Change |
|---|---|
| 2026-07-29 | First version. Written against the live schema and console rather than from memory: table list and RLS state read from `pg_class`, account figures from `auth.users`, processor list from the actual outbound hosts in the source. |
