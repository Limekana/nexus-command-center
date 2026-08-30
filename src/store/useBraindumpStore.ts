import { create } from 'zustand';
import { db } from '../db/database';
import { BraindumpEntry, BRAINDUMP_MAX_CHARS } from '../types/braindump';
import { generateId } from '../utils/uuid';
import { enqueue } from '../db/syncQueue';
import { useTaskStore } from './useTaskStore';

/**
 * v1.12 Item 10 — Braindump.
 *
 * Capture goes through Dexie first and the sync queue second, so it works
 * offline exactly like every other store here. That is the acceptance
 * criterion: "capture works offline through the existing outbox."
 */
interface BraindumpStore {
  entries: BraindumpEntry[];
  load: () => Promise<void>;
  add: (content: string) => Promise<boolean>;
  remove: (id: string) => Promise<void>;
  convertToTask: (id: string) => Promise<boolean>;
}

export const useBraindumpStore = create<BraindumpStore>((set, get) => ({
  entries: [],

  async load() {
    const all = await db.braindumpEntries.toArray();
    // Newest first — a braindump is read from the top, and the most recent
    // thought is the one most likely to still be actionable.
    all.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    set({ entries: all.filter((e) => !e.deletedAt) });
  },

  /** Returns false when there was nothing worth saving. */
  async add(content) {
    const text = (content || '').trim();
    // Enforced client-side as well as by the server CHECK: an over-length row
    // would fail the push, and this outbox retries, so it would come back
    // forever. Better to refuse it while the user is still looking at it.
    if (!text || text.length > BRAINDUMP_MAX_CHARS) return false;

    const now = new Date().toISOString();
    const entry: BraindumpEntry = {
      id: generateId(),
      content: text,
      convertedTaskId: null,
      syncStatus: 'pending',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    await db.braindumpEntries.add(entry);
    await enqueue('braindump_entry', entry.id, 'insert', entry);
    await get().load();
    return true;
  },

  async remove(id) {
    await db.braindumpEntries.delete(id);
    await enqueue('braindump_entry', id, 'delete', { id });
    await get().load();
  },

  /**
   * Promote an entry into a real Task — the one action this feature has.
   *
   * The entry is KEPT and stamped with the task's id rather than deleted. It is
   * the record of where the task came from, and deleting it would make this a
   * destructive action that silently eats the original wording. The server FK
   * is ON DELETE SET NULL, so removing the task later clears the link and
   * leaves the idea intact.
   *
   * Returns false if the entry is missing or already converted — converting
   * twice would quietly produce duplicate tasks.
   */
  async convertToTask(id) {
    const entry = await db.braindumpEntries.get(id);
    if (!entry || entry.convertedTaskId) return false;

    // A task needs a one-line title; a braindump entry is free text that may be
    // a paragraph. Take the first non-empty line as the title and keep the full
    // text in the notes, so nothing the user wrote is lost in the promotion.
    const firstLine = entry.content.split('\n').map((l) => l.trim()).find(Boolean) || entry.content;
    const title = firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine;
    const notes = entry.content.trim() === title ? undefined : entry.content;

    const taskStore = useTaskStore.getState();
    await taskStore.addTask({ title, notes, priority: 'medium' });
    // addTask does not return the row, so recover it from the store it just
    // reloaded. Matching on title alone would pick the wrong row if two entries
    // share one, hence newest-first on createdAt.
    const created = [...useTaskStore.getState().tasks]
      .filter((t) => t.title === title)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];
    if (!created) return false;

    const updated: BraindumpEntry = {
      ...entry,
      convertedTaskId: created.id,
      syncStatus: 'pending',
      updatedAt: new Date().toISOString(),
    };
    await db.braindumpEntries.put(updated);
    await enqueue('braindump_entry', updated.id, 'update', updated);
    await get().load();
    return true;
  },
}));
