import { create } from 'zustand';
import { db } from '../db/database';
import { listPending } from '../db/syncQueue';
import { fullSync, PushResult, PullResult } from '../lib/cloudSync';
import { useSessionStore } from './useSessionStore';
import { useFinanceStore } from './useFinanceStore';
import { useStudiesStore } from './useStudiesStore';
import { useFitnessStore } from './useFitnessStore';
import { useTaskStore } from './useTaskStore';
import { useGoalsStore } from './useGoalsStore';
import { useBodyMetricsStore } from './useBodyMetricsStore';
import { useWorkQualityStore } from './useWorkQualityStore';

// Reload every cloud-synced data store from Dexie. Called after each pull so
// that rows newly merged into Dexie (from other devices, Realtime triggers,
// or external apps like the workout tracker / StudyDesk pushing into the
// shared Supabase project) actually surface in the UI without requiring a
// manual navigation or app restart.
//
// Each store's `load()` re-reads its tables and replaces its in-memory state.
// They run in parallel because none depend on each other for read-time data.
async function reloadDataStores(): Promise<void> {
  try {
    await Promise.all([
      useFinanceStore.getState().load(),
      useStudiesStore.getState().load(),
      useFitnessStore.getState().load(),
      useTaskStore.getState().load(),
      useGoalsStore.getState().load(),
      // v1.3 — body metrics surface on the Fitness screen; refresh after a
      // realtime-triggered pull so a cross-device LimeLog body-metric edit
      // shows up without a navigation. (AUDIT-FSG-5b: this is the in-memory
      // half of the fix — the Dexie half is hydrateBodyMetricsFromCloud in
      // pullAll.)
      useBodyMetricsStore.getState().load(),
      // v1.5 — Work domain self-assessment. Refresh after a pull so a rating
      // made on another device shows on the Home card + Life Work score.
      useWorkQualityStore.getState().load(),
    ]);
  } catch (e) {
    // Reload failures shouldn't surface as sync errors — the data IS in Dexie,
    // we just couldn't refresh in-memory state. Log for diagnostics; next
    // navigation / app restart will pick it up.
    console.warn('[sync] data-store reload after pull failed:', e);
  }
}

interface SyncStore {
  isOnline: boolean;
  lastSyncedAt: string | null;
  pendingCount: number;
  syncing: boolean;
  lastError: string | null;
  lastPush: PushResult | null;
  lastPull: PullResult | null;
  // Most recent error messages from individual queue items, for diagnostics UI.
  itemErrors: { entityType: string; entityId: string; message: string }[];

  init: () => void;
  refreshPending: () => Promise<void>;
  syncNow: () => Promise<void>;
}

// Promise-chain pattern: concurrent syncNow calls don't no-op, they queue up
// behind the in-flight call. This was the silent-fail bug — adoption's
// syncNow was being skipped because App.tsx's auto-sync was already running.
let inflight: Promise<void> | null = null;

export const useSyncStore = create<SyncStore>((set, get) => ({
  isOnline: navigator.onLine,
  lastSyncedAt: localStorage.getItem('sync.lastSyncedAt'),
  pendingCount: 0,
  syncing: false,
  lastError: null,
  lastPush: null,
  lastPull: null,
  itemErrors: [],

  init() {
    const update = () => {
      const wasOnline = get().isOnline;
      const nowOnline = navigator.onLine;
      set({ isOnline: nowOnline });
      if (!wasOnline && nowOnline && get().pendingCount > 0) {
        void get().syncNow();
      }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    get().refreshPending();

    // Background flusher: every 30s, if online + signed in + pending > 0 and
    // not currently syncing, try to flush. Catches the case where the user
    // adds data, leaves the app, comes back — we want their changes uploaded
    // without them ever thinking about it.
    setInterval(() => {
      const s = get();
      if (s.isOnline && s.pendingCount > 0 && !s.syncing) {
        void s.syncNow();
      }
    }, 30_000);
  },

  async refreshPending() {
    const pending = await listPending();
    set({ pendingCount: pending.length });
  },

  async syncNow() {
    // Wait for any in-flight sync to finish before starting a new one.
    if (inflight) {
      try {
        await inflight;
      } catch {
        /* swallow — we'll do our own attempt */
      }
    }

    if (!navigator.onLine) return;
    const user = useSessionStore.getState().user;
    if (!user) {
      set({ lastError: 'Not signed in.' });
      return;
    }

    set({ syncing: true, lastError: null });
    inflight = (async () => {
      try {
        const { push, pull } = await fullSync(user.id);
        // After a successful pull, refresh in-memory state in every data
        // store so the UI reflects rows that just landed in Dexie (whether
        // from another device, Realtime, or an external app writing into
        // the shared Supabase project). Skip the reload if the pull failed
        // hard — nothing new would be there to surface anyway.
        if (pull.errors.length === 0) {
          await reloadDataStores();
        }
        const pending = await listPending();
        // Surface up to 5 of the most recent item errors for diagnostics.
        const itemErrors = pending
          .filter((p) => p.lastError)
          .slice(-5)
          .map((p) => ({
            entityType: p.entityType,
            entityId: p.entityId,
            message: p.lastError ?? 'unknown',
          }));
        const now = new Date().toISOString();
        localStorage.setItem('sync.lastSyncedAt', now);
        set({
          lastSyncedAt: now,
          pendingCount: pending.length,
          lastPush: push,
          lastPull: pull,
          syncing: false,
          itemErrors,
          lastError:
            push.errors.length > 0
              ? `${push.errors.length} item(s) failed to upload.`
              : pull.errors.length > 0
                ? `Pull error: ${pull.errors[0]}`
                : null,
        });
      } catch (e) {
        set({ syncing: false, lastError: (e as Error).message });
      }
    })();
    await inflight;
    inflight = null;
  },
}));

// Utility for the diagnostics UI: load the current syncQueue with errors.
export async fu