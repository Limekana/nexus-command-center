// ─── Library borrow return reminders ────────────────────────────────────
//
// When a user marks a book as Borrowed (from a library / lender) and supplies
// an expectedReturnAt date, schedule a single notification at 09:00 local on
// that date saying e.g.
//   "Return to library: The Pragmatic Programmer (from Oslo Public Library)"
//
// Reminders cancel when the shelf flips off 'borrowed', when the book is
// returned, or when the book is deleted. We use the existing
// NexusNotifications custom plugin via the unified notifications service.
//
// ID derivation: hash the book UUID into the library category's 1000-ID range
// (6000-6999). Two books colliding would just mean one overwrite — vanishingly
// unlikely for any realistic library size, and not catastrophic anyway.
//
// v1.2.2 — Renamed from scheduleLentReturnReminder. The v1.2 ship modeled
// this as "lent OUT to a friend" which was the inverse of the v1.2 status-
// file intent ("Borrowed FROM a library, due back by X"). The notification
// copy + field semantics flipped accordingly. ID derivation + scheduling
// timing unchanged.

import {
  scheduleNotification,
  cancelNotifications,
  ID_RANGES,
} from './notifications';
import type { Reading } from '../types/studies';

/**
 * Stable 32-bit hash → maps a UUID string to a deterministic numeric ID
 * within the library category's allocated range. djb2-style.
 */
function readingIdToNotificationId(readingId: string): number {
  let h = 5381;
  for (let i = 0; i < readingId.length; i++) {
    h = ((h << 5) + h + readingId.charCodeAt(i)) | 0; // h * 33 + c
  }
  const range = ID_RANGES.library;
  // Force positive, mod size, offset by base.
  return range.base + (Math.abs(h) % range.size);
}

/** Parse an ISO date (YYYY-MM-DD) into a Date at 09:00 local time. */
function toMorningOf(isoDate: string): Date | null {
  // Accept full ISO datetimes too — strip to date portion first.
  const dateOnly = isoDate.slice(0, 10);
  const parts = dateOnly.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map((p) => parseInt(p, 10));
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 9, 0, 0, 0);
}

/**
 * Schedule (or re-schedule) the return-to-library reminder for a borrowed
 * book. Idempotent by ID — calling repeatedly with the same reading just
 * overwrites the existing alarm. Silently no-ops when:
 *   - shelf isn't 'borrowed'
 *   - no expectedReturnAt
 *   - the date already passed (no point scheduling a past notification —
 *     the user already knows the book is overdue if they're seeing this row)
 */
export async function scheduleBorrowReturnReminder(reading: Reading): Promise<void> {
  if (reading.shelf !== 'borrowed') return;
  if (!reading.expectedReturnAt) return;
  const when = toMorningOf(reading.expectedReturnAt);
  if (!when) return;
  if (when.getTime() < Date.now()) return;

  const from = reading.borrowedFrom?.trim();
  const titleSuffix = from ? ` (from ${from})` : '';
  await scheduleNotification({
    id: readingIdToNotificationId(reading.id),
    category: 'library',
    title: 'Return to library',
    body: `${reading.title}${titleSuffix}`,
    at: when,
    extra: { route: '/studies/library', readingId: reading.id },
  });
}

/** Cancel the return reminder for a book. Safe to call when no reminder was
 *  scheduled — the underlying plugin no-ops on unknown IDs. */
export async function cancelBorrowReturnReminder(reading: Pick<Reading, 'id'>): Promise<void> {
  await cancelNotifications([readingIdToNotificationId(reading.id)]);
}
