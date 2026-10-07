import { describe, it, expect, vi } from 'vitest';

// limecore#24 — recurrence guard. The Realtime server rejects the WHOLE
// channel when one bound table is missing from the `supabase_realtime`
// publication, which is how this channel stayed dead from v1.2.1 to v1.17
// (habits, habit_completions and body_metrics were bound, never published).
//
// The publication is set by StudyDesk's
// supabase/migrations/20261006_realtime_publish.sql, which covers both apps'
// channels. This repo cannot read that file, so the list is mirrored here.
// Binding a new table means adding it to that migration (or writing a new
// one) AND to this list; this test fails until both are done.

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('../store/useSyncStore', () => ({ useSyncStore: { getState: () => ({}) } }));

const { USER_SCOPED_TABLES, SHARING_AWARE_TABLES } = await import('./realtime');

const PUBLISHED = new Set([
  'subjects', 'grades', 'study_sessions', 'assignments', 'exams', 'study_actions',
  'planned_sessions', 'academic_terms', 'timetable_entries', 'assignment_attachments',
  'commitments', 'notebook_entries', 'notebook_attachments', 'lesson_attendance',
  'transactions', 'portfolio_holdings', 'workout_sessions', 'workout_sets',
  'portfolio_lots', 'manual_assets', 'watchlist_items', 'goals',
  'habits', 'habit_completions', 'body_metrics',
  'budget_categories', 'budget_category_shares', 'tasks', 'task_shares',
]);

describe('realtime channel (limecore#24)', () => {
  it('binds only published tables', () => {
    const bound = [...USER_SCOPED_TABLES, ...SHARING_AWARE_TABLES];
    expect(bound.filter((t) => !PUBLISHED.has(t))).toEqual([]);
  });
});
