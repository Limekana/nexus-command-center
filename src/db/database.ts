import Dexie, { Table } from 'dexie';
import { Transaction, BudgetCategory, PortfolioHolding, PortfolioLot, ApiCacheEntry, PortfolioSnapshot, ManualAsset, WatchlistItem } from '../types/finance';
import { Course, GradeImport, StudySession, Reading } from '../types/studies';
import { WorkoutSession, WorkoutSet } from '../types/fitness';
import { Task } from '../types/tasks';
import { Goal } from '../types/goals';

export interface SyncQueueItem {
  id: string;
  entityType:
    | 'transaction'
    | 'budget_category'
    | 'portfolio_holding'
    | 'course'
    | 'grade_import'
    | 'workout_session'
    | 'workout_set'
    | 'task'
    | 'study_session'
    | 'reading'
    | 'portfolio_lot'
    | 'manual_asset'
    | 'watchlist_item'
    | 'goal';
  entityId: string;
  operation: 'insert' | 'update' | 'delete';
  payload: string;
  createdAt: string;
  syncedAt?: string;
  lastError?: string;
}

class NexusDB extends Dexie {
  transactions!: Table<Transaction, string>;
  budgetCategories!: Table<BudgetCategory, string>;
  portfolioHoldings!: Table<PortfolioHolding, string>;
  apiCache!: Table<ApiCacheEntry, string>;

  gradeImports!: Table<GradeImport, string>;
  courses!: Table<Course, string>;

  workoutSessions!: Table<WorkoutSession, string>;
  workoutSets!: Table<WorkoutSet, string>;

  tasks!: Table<Task, string>;

  // v2-B
  studySessions!: Table<StudySession, string>;
  readings!: Table<Reading, string>;

  // v2-C — local-only series of total portfolio value sampled once per day
  // on refresh. Keyed by YYYY-MM-DD so a same-day refresh upserts cleanly.
  portfolioSnapshots!: Table<PortfolioSnapshot, string>;

  // v2-D — purchase lots. Each row is one buy event for one holding.
  portfolioLots!: Table<PortfolioLot, string>;

  // v3 — net worth + watchlist
  manualAssets!: Table<ManualAsset, string>;
  watchlistItems!: Table<WatchlistItem, string>;

  // v3-Phase5 — goals (cross-module targets derived from existing data)
  goals!: Table<Goal, string>;

  syncQueue!: Table<SyncQueueItem, string>;

  constructor() {
    super('nexus_dashboard');
    this.version(1).stores({
      transactions: 'id, date, type, syncStatus',
      budgetCategories: 'id, name',
      portfolioHoldings: 'id, ticker, assetType',
      apiCache: 'cacheKey, expiresAt',
      gradeImports: 'id, importedAt',
      courses: 'id, importId, name',
      workoutSessions: 'id, date, sessionType, syncStatus',
      workoutSets: 'id, sessionId, exercise',
      tasks: 'id, dueDate, completed, priority, syncStatus',
      syncQueue: 'id, entityType, syncedAt',
    });
    // v2 — Dexie migrates additively; existing tables are untouched and the
    // two new tables come up empty for current users. The pull-from-cloud
    // path populates them on next sync.
    this.version(2).stores({
      transactions: 'id, date, type, syncStatus',
      budgetCategories: 'id, name',
      portfolioHoldings: 'id, ticker, assetType',
      apiCache: 'cacheKey, expiresAt',
      gradeImports: 'id, importedAt',
      courses: 'id, importId, name',
      workoutSessions: 'id, date, sessionType, syncStatus',
      workoutSets: 'id, sessionId, exercise',
      tasks: 'id, dueDate, completed, priority, syncStatus',
      studySessions: 'id, startedAt, subjectId, syncStatus',
      readings: 'id, status, subjectId, updatedAt',
      syncQueue: 'id, entityType, syncedAt',
    });
    // v3 — additive: adds portfolioSnapshots (local-only). Existing tables
    // are untouched, the new table comes up empty for current users.
    this.version(3).stores({
      transactions: 'id, date, type, syncStatus',
      budgetCategories: 'id, name',
      portfolioHoldings: 'id, ticker, assetType',
      apiCache: 'cacheKey, expiresAt',
      gradeImports: 'id, importedAt',
      courses: 'id, importId, name',
      workoutSessions: 'id, date, sessionType, syncStatus',
      workoutSets: 'id, sessionId, exercise',
      tasks: 'id, dueDate, completed, priority, syncStatus',
      studySessions: 'id, startedAt, subjectId, syncStatus',
      readings: 'id, status, subjectId, updatedAt',
      portfolioSnapshots: 'date',
      syncQueue: 'id, entityType, syncedAt',
    });
    // v4 — adds portfolioLots (purchase lots). Existing single-avg-cost
    // holdings continue to work; on first load we synthesize a lot for any
    // holding that has avgCostNative + quantity set, so P/L keeps rendering.
    this.version(4).stores({
      transactions: 'id, date, type, syncStatus',
      budgetCategories: 'id, name',
      portfolioHoldings: 'id, ticker, assetType',
      apiCache: 'cacheKey, expiresAt',
      gradeImports: 'id, importedAt',
      courses: 'id, importId, name',
      workoutSessions: 'id, date, sessionType, syncStatus',
      workoutSets: 'id, sessionId, exercise',
      tasks: 'id, dueDate, completed, priority, syncStatus',
      studySessions: 'id, startedAt, subjectId, syncStatus',
      readings: 'id, status, subjectId, updatedAt',
      portfolioSnapshots: 'date',
      portfolioLots: 'id, holdingId, purchaseDate, syncStatus',
      syncQueue: 'id, entityType, syncedAt',
    });
    // v5 — adds manualAssets + watchlistItems. Existing tables untouched.
    this.version(5).stores({
      transactions: 'id, date, type, syncStatus',
      budgetCategories: 'id, name',
      portfolioHoldings: 'id, ticker, assetType',
      apiCache: 'cacheKey, expiresAt',
      gradeImports: 'id, importedAt',
      courses: 'id, importId, name',
      workoutSessions: 'id, date, sessionType, syncStatus',
      workoutSets: 'id, sessionId, exercise',
      tasks: 'id, dueDate, completed, priority, syncStatus',
      studySessions: 'id, startedAt, subjectId, syncStatus',
      readings: 'id, status, subjectId, updatedAt',
      portfolioSnapshots: 'date',
      portfolioLots: 'id, holdingId, purchaseDate, syncStatus',
      manualAssets: 'id, assetType, syncStatus',
      watchlistItems: 'id, ticker, assetType, syncStatus',
      syncQueue: 'id, entityType, syncedAt',
    });
    // v6 — adds goals. Cross-module targets, derived from existing data.
    this.version(6).stores({
      transactions: 'id, date, type, syncStatus',
      budgetCategories: 'id, name',
      portfolioHoldings: 'id, ticker, assetType',
      apiCache: 'cacheKey, expiresAt',
      gradeImports: 'id, importedAt',
      courses: 'id, importId, name',
      workoutSessions: 'id, date, sessionType, syncStatus',
      workoutSets: 'id, sessionId, exercise',
      tasks: 'id, dueDate, completed, priority, syncStatus',
      studySessions: 'id, startedAt, subjectId, syncStatus',
      readings: 'id, status, subjectId, updatedAt',
      portfolioSnapshots: 'date',
      portfolioLots: 'id, holdingId, purchaseDate, syncStatus',
      manualAssets: 'id, assetType, syncStatus',
      watchlistItems: 'id, ticker, assetType, syncStatus',
      goals: 'id, goalType, completed, targetDate, syncStatus',
      syncQueue: 'id, entityType, syncedAt',
    });
  }
}

export const db = new NexusDB();

export async function clearAllLocalData(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.transactions,
      db.budgetCategories,
      db.portfolioHoldings,
      db.apiCache,
      db.gradeImports,
      db.courses,
      db.workoutSessions,
      db.workoutSets,
      db.tasks,
      db.studySessions,
      db.readings,
      db.portfolioSnapshots,
      db.portfolioLots,
      db.manualAssets,
      db.watchlistItems,
      db.goals,
      db.syncQueue,
    ],
    async () => {
      await Promise.all([
        db.transactions.clear(),
        db.budgetCategories.clear(),
        db.portfolioHoldings.clear(),
        db.apiCache.clear(),
        db.gradeImports.clear(),
        db.courses.clear(),
        db.workoutSessions.clear(),
        db.workoutSets.clear(),
        db.tasks.clear(),
        db.studySessions.clear(),
        db.readings.clear(),
        db.portfolioSnapshots.clear(),
        db.portfolioLots.clear(),
        db.manualAssets.clear(),
        db.watchlistItems.clear(),
        db.goals.clear(),
        db.syncQueue.clear(),
      ]);
    }
  );
}
