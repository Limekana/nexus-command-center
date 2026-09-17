// v1.14 — goal pacing, WITHOUT a streak mechanic.
//
// ── THE NUMBERS THIS EXISTS FOR ──────────────────────────────────────────
//
// `goals` sees about 1.5 entries per user and a one-time completed flag:
// people set a goal once and never come back. `habits` sees ~15 completions
// per habit and is the highest-engagement feature in the suite. The obvious
// move is to let a goal borrow the habit loop.
//
// ── AND WHY THE OBVIOUS MOVE IS THE WRONG ONE ────────────────────────────
//
// A goal is a destination reached at an uneven pace — more some weeks, less
// others. A habit today is built around an unbroken cadence, with a streak
// that resets. Compose them naively and a quiet week does not just fail to
// help, it actively punishes: the streak hits zero, the flame greys out, and
// the user is told they have lost something at the exact moment they were
// still making progress toward the goal. That is a mechanic that discourages
// continuing, applied to the users who most need to continue.
//
// DESIGN CONSTRAINT, from the CTO and load-bearing here: goal-linked tracking
// uses NO streak. Nothing in this module resets, decays, or can be broken.
// The only quantity is a cumulative total and its distance from an evenly
// distributed reference line. A heavy week and a light week both simply move
// the line along.
//
// Strict daily habits — medication, say — keep their streak UI, because there
// a hard cadence genuinely is the point. That is why this is a second display
// mode over the same completion data rather than a replacement: see
// `pacing_kind` in the migration beside this file.
//
// ── WHAT "BEHIND" IS ALLOWED TO LOOK LIKE ────────────────────────────────
//
// Behind pace is a number of sessions, not a judgement. `remainingPerWeek`
// exists so the UI can say "3 more sessions this month closes the gap"
// instead of "behind" — a recoverable statement with an action in it. There
// is deliberately no failure state and no way to express one from this data.

export type PaceStatus = 'ahead' | 'on' | 'behind' | 'done' | 'unknown';

export interface Pacing {
  status: PaceStatus;
  /** 0..1 of the target actually accumulated. Can exceed 1; not clamped, so
   *  the UI can say "112% of target" rather than a silent 100%. */
  progress: number;
  /** 0..1 of the way from start to target date. Clamped to [0, 1]. */
  elapsed: number;
  /** Where an even pace would have you by now, in target units. */
  expected: number;
  /** target - current, floored at 0. */
  remaining: number;
  /** Whole weeks left, at least 0. */
  weeksLeft: number;
  /** What each remaining week needs to carry to finish on time. null when
   *  there is no time left to spread it over. */
  remainingPerWeek: number | null;
}

const DAY_MS = 86_400_000;

/** Inside this much of the reference line, call it on pace. A goal is not a
 *  train timetable, and a band narrow enough to flicker between "ahead" and
 *  "behind" on a single log would be noise dressed as feedback. */
export const ON_PACE_BAND = 0.05;

function midnightUTC(iso: string): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Where a goal stands against an evenly distributed reference trajectory.
 *
 * @param current  cumulative progress so far, in target units
 * @param goal     needs `targetValue`, `startDate`, and `targetDate`
 * @param today    defaults to now; injected for testing
 *
 * Returns `status: 'unknown'` rather than guessing when the goal has no
 * target date or no positive target — an undated goal has no pace to be
 * ahead or behind of, and inventing one would put a number on screen that
 * means nothing.
 */
export function pacingFor(
  current: number,
  goal: { targetValue?: number; startDate?: string; targetDate?: string },
  today: Date = new Date(),
): Pacing {
  const target = Number(goal?.targetValue);
  const start = midnightUTC(goal?.startDate ?? '');
  const end = midnightUTC(goal?.targetDate ?? '');
  const now = today.getTime();
  const done = Number.isFinite(current) ? Math.max(0, current) : 0;

  const blank: Pacing = {
    status: 'unknown',
    progress: 0,
    elapsed: 0,
    expected: 0,
    remaining: 0,
    weeksLeft: 0,
    remainingPerWeek: null,
  };

  if (!Number.isFinite(target) || target <= 0 || start === null || end === null || end <= start) {
    return blank;
  }

  const progress = done / target;
  const elapsed = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const expected = target * elapsed;
  const remaining = Math.max(0, target - done);
  const weeksLeft = Math.max(0, Math.ceil((end - now) / (7 * DAY_MS)));

  // Reached is reached. Checked before the pace comparison so a goal finished
  // early reads "done" rather than "ahead" — the trajectory has stopped being
  // the interesting fact about it.
  if (done >= target) {
    return { status: 'done', progress, elapsed, expected, remaining: 0, weeksLeft, remainingPerWeek: 0 };
  }

  const drift = progress - elapsed;
  const status: PaceStatus = Math.abs(drift) <= ON_PACE_BAND
    ? 'on'
    : drift > 0 ? 'ahead' : 'behind';

  return {
    status,
    progress,
    elapsed,
    expected,
    remaining,
    weeksLeft,
    // Null, not Infinity and not the whole remainder: on the last day there
    // are no weeks to spread this over, and "do 40 this week" would be a
    // sentence about a week that does not exist.
    remainingPerWeek: weeksLeft > 0 ? remaining / weeksLeft : null,
  };
}

/**
 * Cumulative total from dated entries, from `startDate` forward.
 *
 * Deliberately total and order-independent: entries arrive from Dexie, from a
 * cloud pull and from a realtime echo, in no guaranteed order, and a running
 * total that depended on arrival order would disagree with itself between
 * devices.
 */
export function cumulativeSince(
  entries: Array<{ date?: string; amount?: number; deletedAt?: string } | null | undefined>,
  startDate?: string,
): number {
  const from = startDate ? midnightUTC(startDate) : null;
  let sum = 0;
  for (const e of entries || []) {
    if (!e || e.deletedAt) continue;
    const when = midnightUTC(e.date ?? '');
    if (when === null) continue;
    if (from !== null && when < from) continue;
    const amt = Number(e.amount);
    sum += Number.isFinite(amt) ? amt : 1; // a bare completion counts as one
  }
  return sum;
}
