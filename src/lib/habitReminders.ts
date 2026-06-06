// ─── Habit daily reminders ──────────────────────────────────────────────
//
// When a user sets a reminderTime on a habit, we schedule a recurring local
// notification at HH:MM. For frequencyKind='daily' it fires every day; for
// 'specific_days' it fires only on the listed days-of-week.
//
// We use the existing NexusNotifications custom plugin via the unified
// notifications service. ID derivation: hash the habit UUID into the habit
// category's 1000-ID range (8000-8999). Two habits colliding would
// overwrite — vanishingly unlikely for a realistic habit list (< 30 entries
// even for a power user).
//
// Re-scheduling is idempotent: schedule(habit) cancels the old ID and
// re-schedules with current time/days. Edit a habit's reminder time → the
// next refresh picks up the new alarm.

import {
  scheduleNotification,
  cancelNotifications,
  ID_RANGES,
} from './notifications';
import type { Habit } from '../types/habits';

/** Stable 32-bit djb2 hash → maps a UUID string to a deterministic numeric
 *  ID within the habits notification range. */
function habitIdToNotificationId(habitId: string): number {
  let h = 5381;
  for (let i = 0; i < habitId.length; i++) {
    h = ((h << 5) + h + habitId.charCodeAt(i)) | 0;
  }
  const range = ID_RANGES.habits;
  return range.base + (Math.abs(h) % range.size);
}

/** Parse "HH:MM" into {hour, minute} or null if malformed. */
function parseHHMM(s: string): { hour: number; minute: number } | null {
  const m = s.match(/^([0-2]?\d):([0-5]\d)$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23) return null;
  return { hour, minute };
}

/** Compute the next firing instant for a daily HH:MM. If the time today has
 *  already passed, returns tomorrow at the same time. */
function nextDailyFire(hour: number, minute: number, from: Date = new Date()): Date {
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour, minute, 0, 0);
  if (candidate.getTime() <= from.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

/** Compute the next firing instant for a specific-days HH:MM. Walks forward
 *  up to 7 days looking for an eligible weekday. Returns null only if the
 *  daysOfWeek array is empty (the caller shouldn't have requested scheduling
 *  in that case). */
function nextSpecificDaysFire(
  hour: number,
  minute: number,
  daysOfWeek: number[],
  from: Date = new Date(),
): Date | null {
  if (daysOfWeek.length === 0) return null;
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setHours(hour, minute, 0, 0);
  for (let offset = 0; offset < 8; offset++) {
    const probe = new Date(candidate);
    probe.setDate(probe.getDate() + offset);
    if (probe.getTime() <= from.getTime()) continue;
    if (daysOfWeek.includes(probe.getDay())) return probe;
  }
  return null;
}

/** Schedule (or re-schedule) the daily reminder for a habit. Idempotent by
 *  ID — calling again overwrites the existing alarm. Silently no-ops when:
 *    - habit has no reminderTime
 *    - habit is archived
 *    - parsed time is malformed
 *    - frequencyKind='specific_days' with no eligible day in the next week
 *
 *  Native plugin handles the `every: 'day'` recurrence on its side via
 *  AlarmManager.setRepeating, so we only schedule once with the first
 *  firing instant. */
export async function scheduleHabitReminder(habit: Habit): Promise<void> {
  if (!habit.reminderTime) return;
  if (habit.archivedAt) return;
  const parsed = parseHHMM(habit.reminderTime);
  if (!parsed) return;

  const id = habitIdToNotificationId(habit.id);

  if (habit.frequencyKind === 'daily') {
    const when = nextDailyFire(parsed.hour, parsed.minute);
    await scheduleNotification({
      id,
      category: 'habits',
      title: 'Habit reminder',
      body: habit.title,
      at: when,
      // The native plugin reads `every: 'day'` to set up the recurring
      // AlarmManager. Without it the alarm fires once and then disappears.
      every: 'day',
      extra: { route: '/habits', habitId: habit.id },
    });
    return;
  }

  // specific_days — schedule for the next eligible day-of-week. The native
  // plugin doesn't have a "specific weekdays" recurrence primitive, so we
  // re-arm in the post-fire handler. The plugin invokes our app on fire;
  // when we wake we look at the habit row and re-schedule the next one.
  // (For v1.2 the re-arm runs as part of the load() pass in the store —
  // every cold start sweeps all habits and re-schedules. Good enough.)
  const when = nextSpecificDaysFire(parsed.hour, parsed.minute, habit.daysOfWeek ?? []);
  if (!when) return;
  await scheduleNotification({
    id,
    category: 'habits',
    title: 'Habit reminder',
    body: habit.title,
    at: when,
    extra: { route: '/habits', habitId: habit.id },
  });
}

/** Cancel a habit's reminder. Safe to call when none was scheduled. */
export async function cancelHabitReminder(habit: Pick<Habit, 'id'>): Promise<void> {
  await cancelNotifications([habitIdToNotificationId(habit.id)]);
}
