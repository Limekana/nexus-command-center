// How a failed push is classified: retry, or stop retrying and hold the item.
//
// This module is deliberately dependency-free — no Supabase, no Dexie, no
// imports at all. It is the decision half of pushQueue, split out so that
// `scripts/check-sync.mjs` can execute it directly and assert the one rule
// that matters:
//
//   **A queued write is only ever marked `syncedAt` when the row actually
//   landed in Postgres.** Nothing in here returns a `syncedAt`.
//
// ── Why this exists (v1.13.1) ───────────────────────────────────────────────
//
// `42501` (insufficient_privilege — an RLS denial) used to sit in the
// permanent-failure set, alongside the integrity-constraint codes, with the
// comment "the policy isn't going to change on the next retry". For a genuine
// policy denial that is true. For the common case it is false, and the common
// case is the one that hurt:
//
//   The `feedback` insert policy is `with check (user_id = auth.uid())`, and
//   `authenticated` holds INSERT on the table. So a 42501 on that insert
//   cannot mean "this row is forbidden" — it can only mean the request
//   carried a JWT whose `auth.uid()` was not the user's: expired, missing, or
//   not yet refreshed. That resolves on the very next attempt after a token
//   refresh.
//
// The old handling marked such an item `syncedAt` with a `[dropped]` note, so
// it left the pending set and was never retried — while the UI had already
// told the user their feedback was sent. Silent loss of something a person
// typed.
//
// ── Why not just make 42501 retryable ───────────────────────────────────────
//
// Unbounded retry is the other failure mode: an item that can never succeed
// spins on every drain forever and the queue never empties. StudyDesk had to
// fix exactly that in this milestone (see its `src/lib/outbox.js`). So 42501
// is retryable but *counted*, and on reaching the ceiling the item is
// **quarantined** — held in the queue, not retried, and surfaced — rather
// than marked synced.
//
// Payload faults quarantine too, for the same reason: they were the original
// justification for the drop path, but "mark it synced" was always a lie
// about content the user authored. Quarantine gives the same bounded
// behaviour (no further retries, so no spinning queue) without the lie.

/** Postgres SQLSTATEs whose cause is the payload itself, not the connection.
 *
 * 23502 not-null · 23503 foreign-key · 23514 check · 22P02 invalid-text ·
 * 22003 numeric-out-of-range · 23505 unique-violation.
 *
 * Retrying these can never succeed — the same bytes will violate the same
 * constraint every time — so they go straight to quarantine without burning
 * attempts. (23505 on the append-only `feedback` table is handled earlier, in
 * pushFeedback: a duplicate insert there means the row already landed, which
 * is success, not failure.)
 *
 * 42501 is deliberately NOT in this set. See the header. */
export const PAYLOAD_FAULT_PG_CODES: ReadonlySet<string> = new Set([
  '23502',
  '23503',
  '23514',
  '22P02',
  '22003',
  '23505',
]);

/** Postgres SQLSTATEs that indicate the request was not authorised *as sent*.
 *
 * With our RLS policies (`user_id = auth.uid()`) and table grants, this means
 * the JWT, not the row — a condition a token refresh clears. Retryable, but
 * bounded by MAX_AUTH_ATTEMPTS so a genuine policy denial cannot spin. */
export const AUTH_DENIAL_PG_CODES: ReadonlySet<string> = new Set(['42501']);

/** How many auth-denied attempts an item gets before it is quarantined.
 *
 * Only 42501 responses count toward this. A network failure or an offline
 * device must never consume an attempt, or a week on a train would quarantine
 * a user's whole queue. */
export const MAX_AUTH_ATTEMPTS = 5;

export type QuarantineReason = 'auth' | 'payload';

/** The subset of a SyncQueueItem this module needs. Structural on purpose —
 * it keeps the module free of a Dexie import. */
export interface RetryState {
  /** 42501 responses seen for this item so far. Undefined = none yet. */
  authAttempts?: number;
}

/** The Dexie patch to apply to the queue row, plus what the caller should do.
 *
 * Note what is absent from `patch`: `syncedAt`. There is no code path in this
 * module that produces one — a failed write is never recorded as written. */
export interface SyncFailurePlan {
  action: 'retry' | 'quarantine';
  /** True on the first auth denial for an item: refresh the session and try
   * this item again immediately, so the retry runs against a fresh token
   * rather than the one Postgres just rejected. */
  refreshSession: boolean;
  reason?: QuarantineReason;
  patch: {
    lastError: string;
    authAttempts?: number;
    quarantinedAt?: string;
    quarantineReason?: QuarantineReason;
  };
}

/** Pull the SQLSTATE off a Supabase/PostgREST error, if it has one. */
export function pgErrorCode(e: unknown): string | undefined {
  const code = (e as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

export function isAuthDenial(e: unknown): boolean {
  const code = pgErrorCode(e);
  return code !== undefined && AUTH_DENIAL_PG_CODES.has(code);
}

export function isPayloadFault(e: unknown): boolean {
  const code = pgErrorCode(e);
  return code !== undefined && PAYLOAD_FAULT_PG_CODES.has(code);
}

/**
 * Decide what happens to a queue item whose push just threw.
 *
 * @param e         the thrown error (a PostgrestError, a network error, …)
 * @param state     the item's current retry counters
 * @param message   the human-readable error to record on the row
 * @param now       ISO timestamp to stamp a quarantine with
 * @param refreshed whether the session has already been refreshed during this
 *                  drain — if so, an auth denial does not ask for another one
 */
export function planSyncFailure(
  e: unknown,
  state: RetryState,
  message: string,
  now: string,
  refreshed = false,
): SyncFailurePlan {
  if (isPayloadFault(e)) {
    // Unretryable, but still the user's content: hold it where it can be seen
    // and exported, never mark it synced.
    return {
      action: 'quarantine',
      refreshSession: false,
      reason: 'payload',
      patch: {
        lastError: `[quarantined] ${message}`,
        quarantinedAt: now,
        quarantineReason: 'payload',
      },
    };
  }

  if (isAuthDenial(e)) {
    const authAttempts = (state.authAttempts ?? 0) + 1;
    if (authAttempts >= MAX_AUTH_ATTEMPTS) {
      return {
        action: 'quarantine',
        refreshSession: false,
        reason: 'auth',
        patch: {
          lastError: `[quarantined] ${message}`,
          authAttempts,
          quarantinedAt: now,
          quarantineReason: 'auth',
        },
      };
    }
    return {
      action: 'retry',
      // Only worth a round-trip the first time we see a denial in this drain;
      // after that the token in hand is already the fresh one.
      refreshSession: !refreshed,
      patch: { lastError: message, authAttempts },
    };
  }

  // Everything else — offline, DNS, 5xx, a timeout — is transient and retries
  // indefinitely without consuming an attempt. This is the pre-existing
  // behaviour and the reason the queue survives a flight.
  return { action: 'retry', refreshSession: false, patch: { lastError: message } };
}
