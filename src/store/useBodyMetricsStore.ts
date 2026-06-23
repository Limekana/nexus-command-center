// ─── v1.3 Body metrics store (NCC, read-only) ─────────────────────────────
//
// NCC consumes LimeLog's body_metrics (push-only flow — LimeLog writes, NCC
// reads). This store is display-only: it loads the local Dexie bodyMetrics
// table into memory for the Fitness screen's body section. There are NO
// mutators — logging body metrics happens in LimeLog. The realtime channel
// (subscribed to body_metrics since v1.2.1) + pullAll keep Dexie fresh; the
// Fitness screen calls load() on mount and after the cold-start hydration.

import { create } from 'zustand';
import { db } from '../db/database';
import type { BodyMetric } from '../types/fitness';

interface BodyMetricsStore {
  /** All body-metric rows, sorted newest-date-first. Volume is tiny (one row
   *  per logged day), so keeping the full set in memory is free. */
  metrics: BodyMetric[];
  loaded: boolean;
  load: () => Promise<void>;
}

export const useBodyMetricsStore = create<BodyMetricsStore>((set) => ({
  metrics: [],
  loaded: false,

  async load() {
    const rows = await db.bodyMetrics.toArray();
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    set({ metrics: rows, loaded: true });
  },
}));
