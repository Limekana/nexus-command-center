import { SyncStatus } from './finance';

/**
 * v1.12 Item 10 — Braindump.
 *
 * A thought, timestamped. That is the entire model, and the shortness of this
 * interface is the feature rather than an omission: the value proposition is
 * being *faster than making a task*, and every field added closes that gap back
 * down. No folders, no tags, no course scoping, no title.
 *
 * Source: the owner's own friction report, 2026-08-24 — had ideas for the Suite
 * while at school, could not reach the Obsidian vault braindump, and ended up
 * making individual NCC tasks per idea. "It added a lot of friction."
 */
export interface BraindumpEntry {
  id: string;
  content: string;
  /**
   * Set when the entry has been promoted into a real Task.
   *
   * The entry is kept rather than deleted — this is a record of where the task
   * came from, and losing it would make "Convert to task" a destructive action
   * that silently eats the original wording. The server FK is ON DELETE SET
   * NULL, so deleting the task later clears the link and leaves the idea.
   */
  convertedTaskId?: string | null;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  /** Soft delete, matching the rest of the suite. */
  deletedAt?: string | null;
}

/**
 * Server-side CHECK. Mirrored here so the UI can stop a paste before it becomes
 * a failed round-trip that the outbox then retries forever.
 */
export const BRAINDUMP_MAX_CHARS = 10000;
