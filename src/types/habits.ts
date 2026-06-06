// v1.2 — Habit Tracker domain types.
//
// Shape mirrors the Supabase tables in 1:1 fashion so cloud round-tripping is
// a no-op shape transform. Local Dexie holds the authoritative working set;
// the syncQueue + cloud realtime echo writes between devices.
//
// Two flavors of habit:
//   - binary     : "did the thing or didn't" — completion is presence-only.
//                  amount on a completion defaults to 1.
//   - quantified : "did N units of the thing" — completion stores an actual
//                  amount, and target_amount on the habit is the daily goal.
//                  A day counts as "complete" when amount >= target_amount.
//
// Frequency model:
//   - daily         : applies every day, no exceptions.
//   - specific_days : applies only on days listed in daysOfWeek
//                     (0 = Sunday, 6 = Saturday — same shape as JS getDay()).
//
// Streaks (computed, not persisted):
//   - currentStreak / longestStreak are derived on demand from
//     habitCompletions. We don't persist them — recomputing is cheap (≤1y of
//     days is 365 row-scans on an indexed table) and persisting opens a
//     synchronization-bug surface area (multiple devices completing
//     different days, then disagreeing on streak).
//   - "Grace": one missed eligible day per rolling 7-day window does NOT
//     break the streak. This is documented in habitStreaks.ts where the
//     logic lives — types here just expose the surface.

import type { SyncStatus } from './finance';

export type HabitType = 'binary' | 'quantified';
export type HabitFrequencyKind = 'daily' | 'specific_days';

export interface Habit {
  id: string;
  title: string;
  type: HabitType;
  /** Required when type='quantified'. The daily goal amount. */
  targetAmount?: number;
  /** Free-text unit label for quantified habits (e.g. "minutes", "pages",
   *  "glasses"). Display-only — not validated against any list. */
  unit?: string;
  frequencyKind: HabitFrequencyKind;
  /** Required when frequencyKind='specific_days'. Sun=0..Sat=6. */
  daysOfWeek?: number[];
  /** Optional "HH:MM" 24h time to fire a local reminder. Empty/undefined
   *  disables the reminder. Stored as a string instead of separate hour/min
   *  fields to keep the Supabase column flat. */
  reminderTime?: string;
  /** Optional hex color (#RRGGBB) for the ring stroke + chips. Defaults to
   *  the suite's primary cyan when unset. */
  color?: string;
  /** ISO timestamp when archived. Archived habits stay in Dexie + Supabase
   *  for history but get filtered out of the active habit list. */
  archivedAt?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}

export interface HabitCompletion {
  id: string;
  habitId: string;
  /** YYYY-MM-DD local-time date the completion was logged FOR (not the
   *  wall-clock moment of logging). Toggling repeats on the same date are
   *  idempotent via the UNIQUE (habit_id, date) constraint. */
  date: string;
  /** For binary: defaults to 1 (the row's presence is the signal).
   *  For quantified: the amount accumulated for that date. Multiple
   *  +N logs on the same day update this single row (not append-only). */
  amount: number;
  syncStatus: SyncStatus;
  createdAt: string;
}
