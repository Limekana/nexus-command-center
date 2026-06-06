// Two-way sync between local Dexie and Supabase Postgres.
//
// Push: drain the local syncQueue, mapping each entry to the right
// Supabase table and stamping user_id from the current session.
//
// Pull: fetch all rows owned by (or shared with) the current user and
// upsert them into Dexie. RLS guarantees we only see what we're allowed to.
//
// Mapping is non-trivial — the local Dexie schema uses camelCase + some
// shape differences (e.g. local Course = one row containing both subject and
// grade info; Supabase splits subjects + grades). All conversions live here.
//
// Conflict policy: per-row LWW based on actual edit time.
//
// Every push payload includes `updated_at` derived from the syncQueue item's
// createdAt (i.e. when the user made the edit on this device, NOT when push
// happens). The server's `set_updated_at` trigger (see migration
// `stale_write_protection_lww`) compares incoming `updated_at` against the
// row on disk and silently drops writes that are older. Two devices editing
// offline are ordered by edit time when they sync.
//
// This is enough for our usage pattern (occasional cross-device edits, no
// real concurrent collaboration). Full CRDT is overkill.
import { supabase } from './supabase';
import { db, SyncQueueItem } from '../db/database';
import { listPending } from '../db/syncQueue';
import { generateId, legacyIdToUuid } from '../utils/uuid';
import type { Transaction, BudgetCategory, PortfolioHolding, PortfolioLot, ManualAsset, WatchlistItem } from '../types/finance';
import { legacyAssetTypeToAccountType } from '../types/finance';
import type { Course, Grade, StudySession, Reading } from '../types/studies';
import type { WorkoutSession, WorkoutSet } from '../types/fitness';
import type { Task, TaskPriority } from '../types/tasks';
import type { Goal, GoalType } from '../types/goals';
import type { Habit, HabitCompletion } from '../types/habits';

// ============================================================================
// Push mappers — local entity → remote upsert payload
// ============================================================================

function mapTaskPriority(p: TaskPriority): 'low' | 'normal' | 'high' | 'urgent' {
  if (p === 'medium') return 'normal';
  return p;
}

function mapTaskStatus(completed: boolean): 'open' | 'done' {
  return completed ? 'done' : 'open';
}

interface PushContext {
  userId: string;
}

async function pushTransaction(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: Transaction = JSON.parse(item.payload);
  const type = local.type === 'transfer' ? 'expense' : local.type;
  const description =
    local.type === 'transfer' && local.description
      ? `[transfer] ${local.description}`
      : local.description;
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    amount: local.amount,
    currency: 'EUR',
    type,
    category_id: local.categoryId ? legacyIdToUuid(local.categoryId) : null,
    description,
    date: local.date,
    updated_at: item.createdAt,
  };
  const { error } = await supabase.from('transactions').upsert(row);
  if (error) throw error;
}

async function pushBudgetCategory(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('budget_categories')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: BudgetCategory = JSON.parse(item.payload);
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    name: local.name,
    monthly_limit: local.monthlyLimit,
    currency: 'EUR',
    color: local.icon ?? null,
    updated_at: item.createdAt,
  };
  const { error } = await supabase.from('budget_categories').upsert(row);
  if (error) throw error;
}

async function pushPortfolioHolding(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('portfolio_holdings')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: PortfolioHolding = JSON.parse(item.payload);
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    asset_type: local.assetType,
    ticker: local.ticker,
    name: local.name ?? null,
    quantity: local.quantity,
    avg_cost_native: local.avgCostNative ?? null,
    cost_currency: local.costCurrency ?? null,
    sector_override: local.sectorOverride ?? null,
    updated_at: item.createdAt,
  };
  const { error } = await supabase.from('portfolio_holdings').upsert(row);
  if (error) throw error;
}

async function pushPortfolioLot(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('portfolio_lots')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: PortfolioLot = JSON.parse(item.payload);
  const updatedAt = local.updatedAt || item.createdAt;
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    holding_id: legacyIdToUuid(local.holdingId),
    quantity: local.quantity,
    cost_per_unit: local.costPerUnit,
    cost_currency: local.costCurrency,
    purchase_date: local.purchaseDate ?? null,
    notes: local.notes ?? null,
    updated_at: updatedAt,
  };
  const { error } = await supabase.from('portfolio_lots').upsert(row);
  if (error) throw error;
}

async function pushManualAsset(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('manual_assets')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: ManualAsset = JSON.parse(item.payload);
  const updatedAt = local.updatedAt || item.createdAt;
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    name: local.name,
    asset_type: local.assetType,
    value: local.value,
    currency: local.currency,
    notes: local.notes ?? null,
    updated_at: updatedAt,
  };
  const { error } = await supabase.from('manual_assets').upsert(row);
  if (error) throw error;
}

async function pushWatchlistItem(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('watchlist_items')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: WatchlistItem = JSON.parse(item.payload);
  const updatedAt = local.updatedAt || item.createdAt;
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    ticker: local.ticker,
    name: local.name,
    asset_type: local.assetType,
    notes: local.notes ?? null,
    target_above: local.targetAbove ?? null,
    target_below: local.targetBelow ?? null,
    updated_at: updatedAt,
  };
  const { error } = await supabase.from('watchlist_items').upsert(row);
  if (error) throw error;
}

async function pushGoal(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    // Soft-delete: write a tombstone row so other devices learn about it.
    const { error } = await supabase
      .from('goals')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: Goal = JSON.parse(item.payload);
  const updatedAt = local.updatedAt || item.createdAt;
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    title: local.title,
    goal_type: local.goalType,
    target_value: local.targetValue,
    target_date: local.targetDate ?? null,
    start_date: local.startDate,
    exercise_name: local.exerciseName ?? null,
    currency: local.currency ?? null,
    completed: local.completed,
    completed_at: local.completedAt ?? null,
    deleted_at: local.deletedAt ?? null,
    updated_at: updatedAt,
  };
  const { error } = await supabase.from('goals').upsert(row);
  if (error) throw error;
}

async function pushWorkoutSession(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('workout_sessions')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: WorkoutSession = JSON.parse(item.payload);
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    session_type: local.sessionType,
    date: local.date,
    notes: local.notes ?? null,
    updated_at: item.createdAt,
  };
  const { error } = await supabase.from('workout_sessions').upsert(row);
  if (error) throw error;
}

async function pushWorkoutSet(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('workout_sets')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: WorkoutSet = JSON.parse(item.payload);
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    session_id: legacyIdToUuid(local.sessionId),
    exercise: local.exercise,
    weight_kg: local.weightKg ?? null,
    reps: local.reps ?? null,
    rpe: local.rpe ?? null,
  };
  const { error } = await supabase.from('workout_sets').upsert(row);
  if (error) throw error;
}

async function pushTask(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: Task = JSON.parse(item.payload);
  // Prefer the entity's own updatedAt if set (captures the actual edit moment),
  // fall back to the queue createdAt.
  const updatedAt = local.updatedAt || item.createdAt;
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    title: local.title,
    description: local.notes ?? null,
    status: mapTaskStatus(local.completed),
    priority: mapTaskPriority(local.priority),
    due_date: local.dueDate ?? null,
    updated_at: updatedAt,
  };
  const { error } = await supabase.from('tasks').upsert(row);
  if (error) throw error;
}

async function pushStudySession(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('study_sessions')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: StudySession = JSON.parse(item.payload);
  const updatedAt = local.updatedAt || item.createdAt;
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    subject_id: local.subjectId ? legacyIdToUuid(local.subjectId) : null,
    started_at: local.startedAt,
    duration_minutes: local.durationMinutes,
    notes: local.notes ?? null,
    updated_at: updatedAt,
  };
  const { error } = await supabase.from('study_sessions').upsert(row);
  if (error) throw error;
}

async function pushReading(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('readings')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: Reading = JSON.parse(item.payload);
  const updatedAt = local.updatedAt || item.createdAt;
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    title: local.title,
    author: local.author ?? null,
    status: local.status,
    total_pages: local.totalPages ?? null,
    pages_read: local.pagesRead ?? null,
    rating: local.rating ?? null,
    subject_id: local.subjectId ? legacyIdToUuid(local.subjectId) : null,
    started_at: local.startedAt ?? null,
    finished_at: local.finishedAt ?? null,
    notes: local.notes ?? null,
    updated_at: updatedAt,
  };
  const { error } = await supabase.from('readings').upsert(row);
  if (error) throw error;
}

async function pushCourse(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  // Local Course = subject only. Grades live in their own table now (since
  // v1.0.3), pushed via pushGrade below. On delete, cascade-soft-delete the
  // subject's grades server-side; StudyDesk's RLS does the same.
  if (item.operation === 'delete') {
    const uuid = legacyIdToUuid(item.entityId);
    await supabase.from('grades').delete().eq('subject_id', uuid);
    const { error } = await supabase.from('subjects').delete().eq('id', uuid);
    if (error) throw error;
    return;
  }
  const local: Course = JSON.parse(item.payload);
  const uuid = legacyIdToUuid(local.id);
  const subjectRow = {
    id: uuid,
    user_id: ctx.userId,
    name: local.name,
    credits: local.credits,
    semester: local.semester ?? null,
    color: local.color ?? null,
    // v1.2 — bidirectional archive sync. If NCC ever exposes an archive
    // toggle for subjects locally, this carries it upstream; for now NCC
    // is purely a consumer of StudyDesk's archive state but the push
    // shape stays symmetric so the LWW merge isn't lopsided.
    archived_at: local.archivedAt ?? null,
    updated_at: item.createdAt,
  };
  const { error } = await supabase.from('subjects').upsert(subjectRow);
  if (error) throw error;
}

async function pushGrade(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('grades')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: Grade = JSON.parse(item.payload);
  const updatedAt = local.updatedAt || item.createdAt;
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    subject_id: legacyIdToUuid(local.subjectId),
    grade: local.grade,
    weight: local.weight,
    date: local.date ?? null,
    updated_at: updatedAt,
  };
  const { error } = await supabase.from('grades').upsert(row);
  if (error) throw error;
}

// v1.2 — habits + habit_completions push handlers. Mirror the StudyDesk
// course/grade pair: habit is the parent, habit_completion the child with
// FK habit_id. ON DELETE CASCADE at the DB cleans the children when the
// parent goes; we still push the children's local tombstones via the queue
// for completeness so a partial outage doesn't leave them orphaned in our
// view (the DB cascade just makes it idempotent).
async function pushHabit(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const uuid = legacyIdToUuid(item.entityId);
    // Cascade-delete completions first (the DB cascade does this too, but
    // doing it here keeps the queue tidy if the parent delete races).
    await supabase.from('habit_completions').delete().eq('habit_id', uuid);
    const { error } = await supabase.from('habits').delete().eq('id', uuid);
    if (error) throw error;
    return;
  }
  const local: Habit = JSON.parse(item.payload);
  const updatedAt = local.updatedAt || item.createdAt;
  const row = {
    id: legacyIdToUuid(local.id),
    user_id: ctx.userId,
    title: local.title,
    type: local.type,
    target_amount: local.targetAmount ?? null,
    unit: local.unit ?? null,
    frequency_kind: local.frequencyKind,
    days_of_week: local.daysOfWeek ?? null,
    reminder_time: local.reminderTime ?? null,
    color: local.color ?? null,
    archived_at: local.archivedAt ?? null,
    updated_at: updatedAt,
  };
  const { error } = await supabase.from('habits').upsert(row);
  if (error) throw error;
}

async function pushHabitCompletion(item: SyncQueueItem, ctx: PushContext): Promise<void> {
  if (item.operation === 'delete') {
    const { error } = await supabase
      .from('habit_completions')
      .delete()
      .eq('id', legacyIdToUuid(item.entityId));
    if (error) throw error;
    return;
  }
  const local: HabitCompletion = JSON.parse(item.payload);
  const row = {
    id: legacyIdToUuid(local.id),
    habit_id: legacyIdToUuid(local.habitId),
    user_id: ctx.userId,
    date: local.date,
    amount: local.amount,
  };
  const { error } = await supabase.from('habit_completions').upsert(row);
  if (error) throw error;
}

const pushHandlers: Record<SyncQueueItem['entityType'], (item: SyncQueueItem, ctx: PushContext) => Promise<void>> = {
  transaction: pushTransaction,
  budget_category: pushBudgetCategory,
  portfolio_holding: pushPortfolioHolding,
  portfolio_lot: pushPortfolioLot,
  manual_asset: pushManualAsset,
  watchlist_item: pushWatchlistItem,
  goal: pushGoal,
  workout_session: pushWorkoutSession,
  workout_set: pushWorkoutSet,
  task: pushTask,
  course: pushCourse,
  grade: pushGrade,
  study_session: pushStudySession,
  reading: pushReading,
  habit: pushHabit,
  habit_completion: pushHabitCompletion,
  // grade_import is a local-only snapshot concept — courses sync individually.
  grade_import: async () => {
    /* no-op */
  },
};

// ============================================================================
// Push: drain queue to Supabase
// ============================================================================
export interface PushResult {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: { entityType: string; entityId: string; message: string }[];
}

// FK dependency order: lower numbers push first.
// budget_categories must exist before transactions reference them; workout_sessions
// before workout_sets; subjects before grades (subjects+grades both come from
// 'course' entity in our local model, handled together in pushCourse).
// study_session.subject_id and reading.subject_id are nullable FKs to subjects,
// so courses (which push subjects) need to land first.
const ENTITY_PRIORITY: Record<SyncQueueItem['entityType'], number> = {
  budget_category: 1,
  portfolio_holding: 1,
  workout_session: 1,
  task: 1,
  course: 1,
  grade_import: 1,
  grade: 2, // FK → subjects (course)
  workout_set: 2, // FK → workout_sessions
  transaction: 2, // FK → budget_categories (nullable, but order anyway)
  study_session: 2, // FK → subjects (nullable)
  reading: 2, // FK → subjects (nullable)
  portfolio_lot: 2, // FK → portfolio_holdings
  manual_asset: 1, // no FK dependencies
  watchlist_item: 1, // no FK dependencies
  goal: 1, // no FK dependencies
  habit: 1, // parent — no FK dependencies
  habit_completion: 2, // FK → habits
};

export async function pushQueue(userId: string): Promise<PushResult> {
  const pending = await listPending();
  pending.sort((a, b) => {
    const pa = ENTITY_PRIORITY[a.entityType] ?? 99;
    const pb = ENTITY_PRIORITY[b.entityType] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.createdAt.localeCompare(b.createdAt);
  });

  const result: PushResult = { attempted: 0, succeeded: 0, failed: 0, errors: [] };
  const now = new Date().toISOString();

  for (const item of pending) {
    result.attempted++;
    const handler = pushHandlers[item.entityType];
    if (!handler) {
      result.failed++;
      continue;
    }
    try {
      await handler(item, { userId });
      await db.syncQueue.update(item.id, { syncedAt: now, lastError: undefined });
      result.succeeded++;
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      await db.syncQueue.update(item.id, { lastError: msg });
      result.errors.push({ entityType: item.entityType, entityId: item.entityId, message: msg });
      result.failed++;
    }
  }
  return result;
}

// ============================================================================
// Pull: fetch user-owned + shared rows, upsert into Dexie
// ============================================================================
export interface PullResult {
  transactions: number;
  budgetCategories: number;
  portfolioHoldings: number;
  portfolioLots: number;
  manualAssets: number;
  watchlistItems: number;
  subjects: number;
  grades: number;
  workoutSessions: number;
  workoutSets: number;
  tasks: number;
  studySessions: number;
  readings: number;
  goals: number;
  errors: string[];
}

// ============================================================================
// Studies hydration — explicit fetch-then-write for the three StudyDesk tables
// ============================================================================
// Background: NCC and StudyDesk share a Supabase project. StudyDesk owns the
// `subjects`, `grades`, and `study_sessions` schemas. When NCC opens and the
// user is signed in, we need to hydrate Dexie from the cloud BEFORE the
// Realtime subscription opens — otherwise rows that exist pre-subscribe are
// invisible to NCC (Realtime only delivers deltas from the moment you
// subscribe, not snapshots).
//
// Defense-in-depth choices:
//   - Explicit `user_id` filter on every SELECT instead of relying purely on
//     RLS. StudyDesk's RLS should scope these anyway, but if the policy is
//     ever wrong or missing the explicit filter limits blast radius.
//   - Each of the three tables is fetched in its own try/catch so one
//     table's failure doesn't lose the others.
//   - The `deleted_at IS NULL` filter is attempted first; on column-missing
//     (StudyDesk schema doesn't carry that column), we retry without it and
//     post-filter client-side. That way a column mismatch never silently
//     produces an empty hydration.
//   - Diagnostic console logs survive into release builds so `adb logcat`
//     can confirm row counts on device.

export interface StudiesHydrationResult {
  subjects: number;
  grades: number;
  studySessions: number;
  errors: string[];
}

async function fetchWithSoftDeleteFallback(
  table: string,
  userId: string,
): Promise<{ data: any[] | null; error: string | null }> {
  // Try with `deleted_at IS NULL` first. If the column doesn't exist on
  // StudyDesk's side, retry without that filter and post-filter in JS.
  let { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null);
  if (error) {
    const msg = error.message ?? '';
    // PostgREST returns "column does not exist" / 42703. Be generous in the
    // match since wording can vary across versions.
    const looksLikeMissingColumn =
      /deleted_at/i.test(msg) &&
      (/does not exist/i.test(msg) || /column/i.test(msg));
    if (looksLikeMissingColumn) {
      console.warn(
        `[studies-hydrate] ${table}: deleted_at column missing — retrying without filter`,
      );
      const retry = await supabase.from(table).select('*').eq('user_id', userId);
      if (retry.error) {
        return { data: null, error: retry.error.message };
      }
      // Drop rows that look soft-deleted if they happen to carry the field
      // anyway (mixed-schema deployments).
      data = (retry.data ?? []).filter((r: any) => !r.deleted_at);
    } else {
      return { data: null, error: msg };
    }
  }
  return { data: data ?? [], error: null };
}

async function hydrateStudiesTables(userId: string): Promise<StudiesHydrationResult> {
  const errors: string[] = [];
  let subjectCount = 0;
  let gradeCount = 0;
  let sessionCount = 0;

  // --- subjects ---
  try {
    const { data, error } = await fetchWithSoftDeleteFallback('subjects', userId);
    if (error) {
      errors.push(`subjects: ${error}`);
      console.warn('[studies-hydrate] subjects failed:', error);
    } else if (data) {
      const courses: Course[] = data.map((s: any) => ({
        id: s.id,
        importId: 'cloud',
        name: s.name,
        credits: Number(s.credits ?? 1),
        color: s.color ?? undefined,
        semester: s.semester ?? undefined,
        // v1.2 — archived_at column. Null/undefined = active. The studies
        // store filters this out of the active list + GPA but keeps the
        // row hydrated so a "Show archived" toggle can surface it.
        archivedAt: s.archived_at ?? undefined,
        createdAt: s.created_at,
      }));
      await db.courses.bulkPut(courses);
      subjectCount = courses.length;
      console.log(`[studies-hydrate] subjects=${subjectCount}`);
    }
  } catch (e) {
    errors.push(`subjects: ${(e as Error).message}`);
    console.warn('[studies-hydrate] subjects threw:', e);
  }

  // --- grades ---
  try {
    const { data, error } = await fetchWithSoftDeleteFallback('grades', userId);
    if (error) {
      errors.push(`grades: ${error}`);
      console.warn('[studies-hydrate] grades failed:', error);
    } else if (data) {
      const grades: Grade[] = data.map((g: any) => ({
        id: g.id,
        subjectId: g.subject_id,
        grade: Number(g.grade),
        weight: Number(g.weight ?? 1),
        date: g.date ?? undefined,
        syncStatus: 'synced' as const,
        createdAt: g.created_at,
        updatedAt: g.updated_at,
      }));
      await db.grades.bulkPut(grades);
      gradeCount = grades.length;
      console.log(`[studies-hydrate] grades=${gradeCount}`);
    }
  } catch (e) {
    errors.push(`grades: ${(e as Error).message}`);
    console.warn('[studies-hydrate] grades threw:', e);
  }

  // --- study_sessions ---
  try {
    const { data, error } = await fetchWithSoftDeleteFallback(
      'study_sessions',
      userId,
    );
    if (error) {
      errors.push(`study_sessions: ${error}`);
      console.warn('[studies-hydrate] study_sessions failed:', error);
    } else if (data) {
      const sessions: StudySession[] = data.map((r: any) => ({
        id: r.id,
        startedAt: r.started_at,
        durationMinutes: Number(r.duration_minutes),
        subjectId: r.subject_id ?? undefined,
        notes: r.notes ?? undefined,
        syncStatus: 'synced' as const,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
      await db.studySessions.bulkPut(sessions);
      sessionCount = sessions.length;
      console.log(`[studies-hydrate] study_sessions=${sessionCount}`);
    }
  } catch (e) {
    errors.push(`study_sessions: ${(e as Error).message}`);
    console.warn('[studies-hydrate] study_sessions threw:', e);
  }

  return {
    subjects: subjectCount,
    grades: gradeCount,
    studySessions: sessionCount,
    errors,
  };
}

/**
 * Public entry point used by App.tsx on sign-in. Hydrates Dexie with every
 * StudyDesk row owned by `userId`, then returns the counts. Caller is
 * expected to refresh the studies store after this resolves and only THEN
 * open the Realtime subscription so subsequent deltas merge cleanly.
 */
export async function hydrateStudiesFromCloud(
  userId: string,
): Promise<StudiesHydrationResult> {
  return hydrateStudiesTables(userId);
}

// v1.2 — habits hydration. Same pattern as studies: pull everything for the
// user into Dexie before opening realtime so the local working set is
// authoritative from the first paint. The user's habit count is small (we
// can comfortably grab all completions) — for power users with multi-year
// history we may need a date-window filter later.
export interface HabitsHydrationResult {
  habits: number;
  completions: number;
  errors: string[];
}

export async function hydrateHabitsFromCloud(
  userId: string,
): Promise<HabitsHydrationResult> {
  const errors: string[] = [];
  let habitCount = 0;
  let completionCount = 0;

  try {
    const { data, error } = await supabase
      .from('habits')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    if (data) {
      const habits: Habit[] = data.map((h: any) => ({
        id: h.id,
        title: h.title,
        type: h.type,
        targetAmount: h.target_amount != null ? Number(h.target_amount) : undefined,
        unit: h.unit ?? undefined,
        frequencyKind: h.frequency_kind,
        daysOfWeek: h.days_of_week ?? undefined,
        reminderTime: h.reminder_time ?? undefined,
        color: h.color ?? undefined,
        archivedAt: h.archived_at ?? undefined,
        syncStatus: 'synced' as const,
        createdAt: h.created_at,
        updatedAt: h.updated_at,
      }));
      await db.habits.bulkPut(habits);
      habitCount = habits.length;
    }
  } catch (e) {
    const msg = (e as Error).message;
    errors.push(`habits: ${msg}`);
    console.warn('[habits-hydrate] habits failed:', msg);
  }

  try {
    const { data, error } = await supabase
      .from('habit_completions')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    if (data) {
      const completions: HabitCompletion[] = data.map((c: any) => ({
        id: c.id,
        habitId: c.habit_id,
        date: c.date,
        amount: Number(c.amount),
        syncStatus: 'synced' as const,
        createdAt: c.created_at,
      }));
      await db.habitCompletions.bulkPut(completions);
      completionCount = completions.length;
    }
  } catch (e) {
    const msg = (e as Error).message;
    errors.push(`habit_completions: ${msg}`);
    console.warn('[habits-hydrate] completions failed:', msg);
  }

  return { habits: habitCount, completions: completionCount, errors };
}

export async function pullAll(_userId: string): Promise<PullResult> {
  const errors: string[] = [];
  const result: PullResult = {
    transactions: 0,
    budgetCategories: 0,
    portfolioHoldings: 0,
    portfolioLots: 0,
    manualAssets: 0,
    watchlistItems: 0,
    subjects: 0,
    grades: 0,
    workoutSessions: 0,
    workoutSets: 0,
    tasks: 0,
    studySessions: 0,
    readings: 0,
    goals: 0,
    errors,
  };

  // Helper: pull a Supabase table, filter deleted, map back to local shape, write to Dexie.
  async function pullTable<R, L>(
    table: string,
    extraFilters: { column: string; op: 'is' | 'eq'; value: unknown }[],
    mapRowToLocal: (r: R) => L | null,
    writeToDexie: (rows: L[]) => Promise<void>
  ): Promise<number> {
    let q = supabase.from(table).select('*');
    for (const f of extraFilters) {
      if (f.op === 'is') q = q.is(f.column, f.value as null);
      else q = q.eq(f.column, f.value as string | number);
    }
    const { data, error } = await q;
    if (error) {
      errors.push(`${table}: ${error.message}`);
      return 0;
    }
    const mapped = (data as R[]).map(mapRowToLocal).filter((x): x is L => x !== null);
    await writeToDexie(mapped);
    return mapped.length;
  }

  result.transactions = await pullTable<any, Transaction>(
    'transactions',
    [{ column: 'deleted_at', op: 'is', value: null }],
    (r) => ({
      id: r.id,
      amount: Number(r.amount),
      description: r.description ?? '',
      categoryId: r.category_id ?? undefined,
      date: r.date,
      type: r.type as Transaction['type'],
      syncStatus: 'synced',
      createdAt: r.created_at,
    }),
    async (rows) => {
      await db.transactions.bulkPut(rows);
    }
  );

  result.budgetCategories = await pullTable<any, BudgetCategory>(
    'budget_categories',
    [{ column: 'deleted_at', op: 'is', value: null }],
    (r) => ({
      id: r.id,
      name: r.name,
      monthlyLimit: Number(r.monthly_limit ?? 0),
      icon: r.color ?? undefined,
      createdAt: r.created_at,
      ownerId: r.user_id,
    }),
    async (rows) => {
      await db.budgetCategories.bulkPut(rows);
    }
  );

  result.portfolioHoldings = await pullTable<any, PortfolioHolding>(
    'portfolio_holdings',
    [],
    (r) => ({
      id: r.id,
      ticker: r.ticker,
      name: r.name ?? r.ticker,
      assetType: r.asset_type as PortfolioHolding['assetType'],
      quantity: Number(r.quantity),
      avgCostNative: r.avg_cost_native != null ? Number(r.avg_cost_native) : undefined,
      costCurrency: r.cost_currency ?? undefined,
      sectorOverride: r.sector_override ?? undefined,
      createdAt: r.created_at,
    }),
    async (rows) => {
      await db.portfolioHoldings.bulkPut(rows);
    }
  );

  // Studies: pull subjects → courses (no embedded grade) AND grades → grades
  // table separately. Each subject can have many grades, each with its own
  // weight + date — Nexus mirrors StudyDesk's full shape now.
  //
  // Important: subjects and grades are pulled INDEPENDENTLY so one failure
  // doesn't poison the other. StudyDesk owns these tables — if either lacks
  // a `deleted_at` column the filter falls back to "no filter" so we don't
  // silently drop everything on a schema mismatch.
  const studiesHydration = await hydrateStudiesTables(_userId);
  result.subjects = studiesHydration.subjects;
  result.grades = studiesHydration.grades;
  for (const e of studiesHydration.errors) errors.push(e);

  result.workoutSessions = await pullTable<any, WorkoutSession>(
    'workout_sessions',
    [{ column: 'deleted_at', op: 'is', value: null }],
    (r) => ({
      id: r.id,
      sessionType: r.session_type,
      date: r.date,
      sets: [],
      notes: r.notes ?? undefined,
      syncStatus: 'synced',
      createdAt: r.created_at,
    }),
    async (rows) => {
      await db.workoutSessions.bulkPut(rows);
    }
  );

  result.workoutSets = await pullTable<any, WorkoutSet>(
    'workout_sets',
    [],
    (r) => ({
      id: r.id,
      sessionId: r.session_id,
      exercise: r.exercise,
      weightKg: r.weight_kg != null ? Number(r.weight_kg) : undefined,
      reps: r.reps ?? undefined,
      rpe: r.rpe != null ? Number(r.rpe) : undefined,
      createdAt: r.created_at,
    }),
    async (rows) => {
      await db.workoutSets.bulkPut(rows);
    }
  );

  result.tasks = await pullTable<any, Task>(
    'tasks',
    [{ column: 'deleted_at', op: 'is', value: null }],
    (r) => ({
      id: r.id,
      title: r.title,
      dueDate: r.due_date ?? undefined,
      priority: (r.priority === 'normal' ? 'medium' : r.priority) as Task['priority'],
      category: undefined,
      completed: r.status === 'done',
      notes: r.description ?? undefined,
      syncStatus: 'synced',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ownerId: r.user_id,
    }),
    async (rows) => {
      await db.tasks.bulkPut(rows);
    }
  );

  // study_sessions: resilient fetch — drop the deleted_at filter on schema
  // mismatch rather than dropping every row. See hydrateStudiesTables for
  // the same pattern on subjects + grades.
  result.studySessions = studiesHydration.studySessions;

  result.manualAssets = await pullTable<any, ManualAsset>(
    'manual_assets',
    [{ column: 'deleted_at', op: 'is', value: null }],
    (r) => {
      // v1.2 follow-up — CTO Account refactor. Server rows still carry the
      // legacy `asset_type` / `value` field names; we mirror them onto the
      // canonical `accountType` / `startingBalance` fields at hydration so
      // the in-memory shape matches Account. legacyAssetTypeToAccountType
      // also fixes the 'credit' → 'credit_card' rename for any rows that
      // synced in pre-refactor.
      const accountType = legacyAssetTypeToAccountType(r.asset_type);
      const startingBalance = Number(r.value);
      return {
        id: r.id,
        name: r.name,
        accountType,
        startingBalance,
        assetType: accountType,
        value: startingBalance,
        currency: r.currency,
        notes: r.notes ?? undefined,
        syncStatus: 'synced',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      } as ManualAsset;
    },
    async (rows) => {
      await db.manualAssets.bulkPut(rows);
    }
  );

  result.watchlistItems = await pullTable<any, WatchlistItem>(
    'watchlist_items',
    [{ column: 'deleted_at', op: 'is', value: null }],
    (r) => ({
      id: r.id,
      ticker: r.ticker,
      name: r.name,
      assetType: r.asset_type as WatchlistItem['assetType'],
      notes: r.notes ?? undefined,
      targetAbove: r.target_above != null ? Number(r.target_above) : undefined,
      targetBelow: r.target_below != null ? Number(r.target_below) : undefined,
      syncStatus: 'synced',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
    async (rows) => {
      await db.watchlistItems.bulkPut(rows);
    }
  );

  result.goals = await pullTable<any, Goal>(
    'goals',
    [{ column: 'deleted_at', op: 'is', value: null }],
    (r) => ({
      id: r.id,
      title: r.title,
      goalType: r.goal_type as GoalType,
      targetValue: Number(r.target_value),
      targetDate: r.target_date ?? undefined,
      startDate: r.start_date,
      exerciseName: r.exercise_name ?? undefined,
      currency: r.currency ?? undefined,
      completed: !!r.completed,
      completedAt: r.completed_at ?? undefined,
      syncStatus: 'synced',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
    async (rows) => {
      await db.goals.bulkPut(rows);
    }
  );

  result.portfolioLots = await pullTable<any, PortfolioLot>(
    'portfolio_lots',
    [{ column: 'deleted_at', op: 'is', value: null }],
    (r) => ({
      id: r.id,
      holdingId: r.holding_id,
      quantity: Number(r.quantity),
      costPerUnit: Number(r.cost_per_unit),
      costCurrency: r.cost_currency,
      purchaseDate: r.purchase_date ?? undefined,
      notes: r.notes ?? undefined,
      syncStatus: 'synced',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
    async (rows) => {
      await db.portfolioLots.bulkPut(rows);
    }
  );

  result.readings = await pullTable<any, Reading>(
    'readings',
    [{ column: 'deleted_at', op: 'is', value: null }],
    (r) => ({
      id: r.id,
      title: r.title,
      author: r.author ?? undefined,
      status: r.status as Reading['status'],
      totalPages: r.total_pages != null ? Number(r.total_pages) : undefined,
      pagesRead: r.pages_read != null ? Number(r.pages_read) : undefined,
      rating: r.rating != null ? Number(r.rating) : undefined,
      subjectId: r.subject_id ?? undefined,
      startedAt: r.started_at ?? undefined,
      finishedAt: r.finished_at ?? undefined,
      notes: r.notes ?? undefined,
      syncStatus: 'synced',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
    async (rows) => {
      await db.readings.bulkPut(rows);
    }
  );

  return result;
}

// ============================================================================
// Adoption: enqueue every existing local row as an insert for the new user.
// ============================================================================
export async function adoptLocalData(userId: string): Promise<number> {
  const now = new Date().toISOString();
  let count = 0;

  const enqueueAll = async (
    entityType: SyncQueueItem['entityType'],
    rows: { id: string }[]
  ) => {
    for (const row of rows) {
      await db.syncQueue.add({
        id: generateId(),
        entityType,
        entityId: row.id,
        operation: 'insert',
        payload: JSON.stringify(row),
        createdAt: now,
      });
      count++;
    }
  };

  const [txs, budgets, holdings, lots, manualAssets, watchlistItems, sessions, sets, tasks, courses, grades, studySessions, readings, goals] =
    await Promise.all([
      db.transactions.toArray(),
      db.budgetCategories.toArray(),
      db.portfolioHoldings.toArray(),
      db.portfolioLots.toArray(),
      db.manualAssets.toArray(),
      db.watchlistItems.toArray(),
      db.workoutSessions.toArray(),
      db.workoutSets.toArray(),
      db.tasks.toArray(),
      db.courses.toArray(),
      db.grades.toArray(),
      db.studySessions.toArray(),
      db.readings.toArray(),
      db.goals.toArray(),
    ]);

  await enqueueAll('transaction', txs);
  await enqueueAll('budget_category', budgets);
  await enqueueAll('portfolio_holding', holdings);
  await enqueueAll('portfolio_lot', lots);
  await enqueueAll('manual_asset', manualAssets);
  await enqueueAll('watchlist_item', watchlistItems);
  await enqueueAll('workout_session', sessions);
  await enqueueAll('workout_set', sets);
  await enqueueAll('task', tasks);
  await enqueueAll('course', courses);
  await enqueueAll('grade', grades);
  await enqueueAll('study_session', studySessions);
  await enqueueAll('reading', readings);
  await enqueueAll('goal', goals);

  // Stamp user_id for later use isn't needed since the push handler reads
  // userId from the current session.
  void userId;
  return count;
}

// ============================================================================
// Full sync: push then pull. Returns combined stats.
// ============================================================================
export async function fullSync(userId: string): Promise<{ push: PushResult; pull: PullResult }> {
  const push = await pushQueue(userId);
  const pull = await pullAll(userId);
  return { push, pull };
}

// ============================================================================
// Heuristic: does local data exist? Used to gate the adoption prompt.
// ============================================================================
export async function hasLocalData(): Promise<boolean> {
  const counts = await Promise.all([
    db.transactions.count(),
    db.budgetCategories.count(),
    db.portfolioHoldings.count(),
    db.workoutSessions.count(),
    db.tasks.count(),
    db.courses.count(),
    db.grades.count(),
    db.studySessions.count(),
    db.readings.count(),
  ]);
  return counts.some((c) => c > 0);
}
