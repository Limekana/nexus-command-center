// ─── Habit reminders (v1.5.2 — Duolingo-style) ──────────────────────────
//
// Each habit with a reminderTime gets, on every app open (the store re-arms in
// load()), up to three recurring daily local notifications:
//
//   1. PRIMARY      at reminderTime — varied, streak-aware copy.
//   2. EVENING NUDGE ~3h later (daily habits only, streak > 0, capped ≤ 21:00)
//                   — soft "streak at risk" message.
//   3. MORNING CATCH-UP at 08:00 (daily habits only) — "did you do it last
//                   night? tap to log" → deep-links to the habit's catch-up
//                   strip. Built for habits done away from the phone (reading
//                   in bed, etc.). Copy is graceful whether or not it was done.
//
// Plus a one-off MILESTONE celebration fired immediately from the store when a
// completion crosses 7 / 30 / 100 / 365 days.
//
// Native constraint: scheduled alarms can't check "is it logged?" at fire time.
// We lean on (a) graceful copy and (b) re-arming on every app open + cancelling
// on in-app completion to keep nags honest. Worst case the user gets one soft,
// well-worded nudge they can ignore.
//
// ID allocation: 3 slots per habit inside the 8000-8999 habits range —
//   slot = hash(id) % 300; base = 8000 + slot*3 → {primary, evening, morning}.
// Milestones use a small shared sub-range (8990-8998), one-off so collisions
// are harmless.

import { scheduleNotification, cancelNotifications, ID_RANGES } from './notifications';
import { habitMessage } from './habitMessages';
import type { Habit } from '../types/habits';

function habitSlot(habitId: string): number {
  let h = 5381;
  for (let i = 0; i < habitId.length; i++) h = ((h << 5) + h + habitId.charCodeAt(i)) | 0;
  return Math.abs(h) % 300;
}

function habitIds(habitId: string): { primary: number; evening: number; morning: number; milestone: number } {
  const slot = habitSlot(habitId);
  const base = ID_RANGES.habits.base + slot * 3; // 8000 + slot*3
  return {
    primary: base,
    evening: base + 1,
    morning: base + 2,
    milestone: ID_RANGES.habits.base + 990 + (slot % 9), // 8990-8998
  };
}

function parseHHMM(s: string): { hour: number; minute: number } | null {
  const m = s.match(/^([0-2]?\d):([0-5]\d)$/);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23) return null;
  return { hour, minute };
}

function nextDailyFire(hour: number, minute: number, from: Date = new Date()): Date {
  const c = new Date(from);
  c.setSeconds(0, 0);
  c.setHours(hour, minute, 0, 0);
  if (c.getTime() <= from.getTime()) c.setDate(c.getDate() + 1);
  return c;
}

function nextSpecificDaysFire(hour: number, minute: number, daysOfWeek: number[], from: Date = new Date()): Date | null {
  if (daysOfWeek.length === 0) return null;
  const c = new Date(from);
  c.setSeconds(0, 0);
  c.setHours(hour, minute, 0, 0);
  for (let offset = 0; offset < 8; offset++) {
    const probe = new Date(c);
    probe.setDate(probe.getDate() + offset);
    if (probe.getTime() <= from.getTime()) continue;
    if (daysOfWeek.includes(probe.getDay())) return probe;
  }
  return null;
}

/** Schedule (or re-schedule) a habit's reminders. Pass the current streak so
 *  the copy + evening nudge are streak-aware. Idempotent by ID. */
export async function scheduleHabitReminder(habit: Habit, streak = 0): Promise<void> {
  const ids = habitIds(habit.id);

  // No reminder / archived / malformed → make sure nothing is left scheduled.
  if (!habit.reminderTime || habit.archivedAt) {
    await cancelNotifications([ids.primary, ids.evening, ids.morning]);
    return;
  }
  const parsed = parseHHMM(habit.reminderTime);
  if (!parsed) {
    await cancelNotifications([ids.primary, ids.evening, ids.morning]);
    return;
  }

  const isDaily = habit.frequencyKind === 'daily';

  // ── 1. Primary reminder ──────────────────────────────────────────────
  const primaryAt = isDaily
    ? nextDailyFire(parsed.hour, parsed.minute)
    : nextSpecificDaysFire(parsed.hour, parsed.minute, habit.daysOfWeek ?? []);
  if (primaryAt) {
    const m = habitMessage('primary', habit.title, streak);
    await scheduleNotification({
      id: ids.primary,
      category: 'habits',
      title: m.title,
      body: m.body,
      at: primaryAt,
      ...(isDaily ? { every: 'day' as const } : {}),
      extra: { route: '/habits', habitId: habit.id },
    });
  }

  // Evening nudge + morning catch-up are daily-habit only (the messaging
  // assumes "every day"; specific-days eligibility would make them misleading).
  if (!isDaily) {
    await cancelNotifications([ids.evening, ids.morning]);
    return;
  }

  // ── 2. Evening risk nudge — only when there's a streak to protect, and
  //       only if ~3h after the reminder still lands at a sane hour (≤ 21:00).
  const eveningHour = parsed.hour + 3;
  if (streak > 0 && eveningHour <= 21) {
    const m = habitMessage('evening', habit.title, streak);
    await scheduleNotification({
      id: ids.evening,
      category: 'habits',
      title: m.title,
      body: m.body,
      at: nextDailyFire(eveningHour, parsed.minute),
      every: 'day',
      extra: { route: `/habits?catchup=${habit.id}`, habitId: habit.id },
    });
  } else {
    await cancelNotifications([ids.evening]);
  }

  // ── 3. Morning catch-up at 08:00 — log last night's habit from bed-time.
  const mm = habitMessage('morning', habit.title, streak);
  await scheduleNotification({
    id: ids.morning,
    category: 'habits',
    title: mm.title,
    body: mm.body,
    at: nextDailyFire(8, 0),
    every: 'day',
    extra: { route: `/habits?catchup=${habit.id}`, habitId: habit.id },
  });
}

/** Cancel all of a habit's reminders. */
export async function cancelHabitReminder(habit: Pick<Habit, 'id'>): Promise<void> {
  const ids = habitIds(habit.id);
  await cancelNotifications([ids.primary, ids.evening, ids.morning]);
}

/** Fire a one-off streak-milestone celebration immediately. Called from the
 *  store when a completion pushes the streak onto a milestone. */
export async function fireHabitMilestone(habit: Pick<Habit, 'id' | 'title'>, streak: number): Promise<void> {
  const ids = habitIds(habit.id);
  const m = habitMessage('milestone', habit.title, streak);
  await scheduleNotification({
    id: ids.milestone,
    category: 'habits',
    title: m.title,
    body: m.body,
    at: new Date(Date.now() + 1500), // ~immediate
    extra: { route: '/habits', habitId: habit.id },
  });
}
