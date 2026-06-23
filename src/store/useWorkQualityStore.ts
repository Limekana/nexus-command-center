// ─── v1.5 Work domain store ──────────────────────────────────────────────
//
// NCC-native daily self-assessment ("how was work today?"). One row per
// calendar day; re-rating the same day updates the SAME row (stable id) so the
// cloud upsert collapses cleanly and the DB's UNIQUE (user_id, log_date) is
// never tripped. Cloud-synced via the `work_quality_log` outbox kind; the
// store holds the authoritative in-memory working set loaded from Dexie.
//
// Read by the Work score (lib/workScore.ts) and the Home WorkRatingCard.

import { create } from 'zustand';
import { db } from '../db/database';
import { generateId } from '../utils/uuid';
import { enqueue } from '../db/syncQueue';
import type { WorkQualityLog } from '../types/work';

/** YYYY-MM-DD in local time. */
export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const NOTE_MAX = 120;

interface WorkQualityStore {
  logs: WorkQualityLog[];
  loaded: boolean;

  load: () => Promise<void>;
  /** Upsert the rating (1–5) + optional note for a date (default today).
   *  Reuses the existing row's id for that date so it stays one row. The note
   *  is trimmed to NOTE_MAX chars; an empty/whitespace note is stored as null. */
  setRating: (rating: number, note?: string | null, date?: string) => Promise<void>;
  /** Update only the note for an already-rated date (note saves on blur). */
  setNote: (note: string | null, date?: string) => Promise<void>;

  // ─── Selectors ───
  logForDate: (date: string) => WorkQualityLog | undefined;
  todayLog: () => WorkQualityLog | undefined;
}

function clampRating(r: number): number {
  const n = Math.round(r);
  if (!Number.isFinite(n)) return 1;
  return Math.min(5, Math.max(1, n));
}

function normaliseNote(note: string | null | undefined): string | null {
  if (note == null) return null;
  const trimmed = note.trim();
  if (trimmed === '') return null;
  return trimmed.slice(0, NOTE_MAX);
}

export const useWorkQualityStore = create<WorkQualityStore>((set, get) => ({
  logs: [],
  loaded: false,

  async load() {
    const logs = await db.workQualityLogs.toArray();
    set({ logs, loaded: true });
  },

  async setRating(rating, note, date) {
    const day = date ?? todayKey();
    const cleanRating = clampRating(rating);
    const existing = get().logs.find((l) => l.date === day);
    const now = new Date().toISOString();

    if (existing) {
      // When setRating is called without a note arg, preserve the existing
      // note rather than wiping it (the rating row is tapped independently of
      // the note field on the card).
      const nextNote = note === undefined ? existing.note : normaliseNote(note);
      const merged: WorkQualityLog = {
        ...existing,
        rating: cleanRating,
        note: nextNote,
        syncStatus: 'pending',
        updatedAt: now,
      };
      await db.workQualityLogs.put(merged);
      await enqueue('work_quality_log', merged.id, 'update', merged);
      set({ logs: get().logs.map((l) => (l.id === merged.id ? merged : l)) });
      return;
    }

    const row: WorkQualityLog = {
      id: generateId(),
      date: day,
      rating: cleanRating,
      note: normaliseNote(note),
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await db.workQualityLogs.add(row);
    await enqueue('work_quality_log', row.id, 'insert', row);
    set({ logs: [...get().logs, row] });
  },

  async setNote(note, date) {
    const day = date ?? todayKey();
    const existing = get().logs.find((l) => l.date === day);
    // A note only makes sense once the day has a rating — no-op otherwise.
    if (!existing) return;
    const nextNote = normaliseNote(note);
    if (nextNote === existing.note) return;
    const merged: WorkQualityLog = {
      ...existing,
      note: nextNote,
      syncStatus: 'pending',
      updatedAt: new Date().toISOString(),
    };
    await db.workQualityLogs.put(merged);
    await enqueue('work_quality_log', merged.id, 'update', merged);
    set({ logs: get().logs.map((l) => (l.id === merged.id ? merged : l)) });
  },

  logForDate(date) {
    return get().logs.find((l) => l.date === date);
  },

  todayLog() {
    return get().logs.find((l) => l.date === todayKey());
  },
}));
