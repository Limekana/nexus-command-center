// v1.5 — Work domain types.
//
// The Work domain is NCC-native (unlike Fitness/Studies which are read from
// LimeLog/StudyDesk). A WorkQualityLog is a single daily self-assessment:
// "how was work today?" on a 1–5 scale, with an optional short note. One row
// per calendar day, enforced by UNIQUE (user_id, log_date) on the cloud table
// and a `date` primary-axis lookup in Dexie.
//
// Shape mirrors public.work_quality_logs 1:1 so cloud round-tripping is a flat
// snake_case↔camelCase transform — same pattern as the Habit types.

import type { SyncStatus } from './finance';

export interface WorkQualityLog {
  id: string;
  /** YYYY-MM-DD local-time calendar day this rating is FOR. Max one per day;
   *  re-rating the same day updates this row (not append-only). */
  date: string;
  /** 1–5 integer. 1 = rough day, 5 = great day. CHECK-constrained at the DB. */
  rating: number;
  /** Optional short note, ≤120 chars. Free text — rendered as React text only
   *  (never dangerouslySetInnerHTML). null when omitted. */
  note: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
}
