// ─── Unified notification service ───────────────────────────────────────
//
// Single entry point for every notification the app schedules. Wraps our
// custom NexusNotifications Capacitor plugin (defined in
// android/app/src/main/java/com/limecore/nexus/NexusNotificationsPlugin.java)
// with:
//
//   • Native-platform guard (web dev calls become no-ops without crashing)
//   • Per-category Android notification channels so the user can mute one
//     category (e.g. "Budget alerts") from system settings without nuking
//     the rest
//   • A stable ID range allocator so each category owns a disjoint slice
//     of the int-32 ID space — re-scheduling and cancellation work without
//     having to track IDs across modules
//   • A single permission check that every category routes through
//
// All notifications fire on-device via AlarmManager + NotificationManager
// (in our own native plugin). No FCM, no Firebase, no Google Play
// Services — this is the F-Droid-clean path. The only OS-level requirement
// on Android 13+ is the runtime POST_NOTIFICATIONS permission, declared
// in AndroidManifest.xml.
//
// ─── ID allocation map ──────────────────────────────────────────────────
//   1000-1099  Reserved (legacy weekly-review used 1001)
//   2000-2999  Task due-date reminders (one ID per task, derived from task UUID)
//   3000-3099  Budget threshold alerts (one ID per category × threshold)
//   4000-4099  Portfolio end-of-day (4001 = 4:05pm primary, 4002 = 4:35pm backup)
//   5000-5999  News alerts (one ID per news item, derived from item ID)
// ────────────────────────────────────────────────────────────────────────

import { Capacitor } from '@capacitor/core';
import { NexusNotifications } from './nexusNotificationsPlugin';

export type NotificationCategory =
  | 'weekly-review'
  | 'tasks'
  | 'budgets'
  | 'portfolio-eod'
  | 'news';

export interface NotificationResult {
  ok: boolean;
  reason?: string;
}

interface ChannelSpec {
  id: string;
  name: string;
  description: string;
  // Importance per Android NotificationManager constants:
  //   2 = LOW (silent, no peek)
  //   3 = DEFAULT (sound, no heads-up)
  //   4 = HIGH (heads-up popup)
  // News + EoD use LOW so we don't startle the user during work hours;
  // tasks + budgets get DEFAULT (they're action items). Weekly review is
  // a soft nudge so it also goes LOW.
  importance: 2 | 3 | 4;
}

const CHANNEL_SPECS: Record<NotificationCategory, ChannelSpec> = {
  'weekly-review': {
    id: 'weekly-review',
    name: 'Weekly Review',
    description: 'Sunday evening summary across finance, study, fitness, tasks',
    importance: 2,
  },
  tasks: {
    id: 'tasks',
    name: 'Task Reminders',
    description: 'Pings when a task is due',
    importance: 3,
  },
  budgets: {
    id: 'budgets',
    name: 'Budget Alerts',
    description: 'Heads-up when a category approaches or exceeds its monthly cap',
    importance: 3,
  },
  'portfolio-eod': {
    id: 'portfolio-eod',
    name: 'Portfolio End of Day',
    description: "Recap of today's move on US market close",
    importance: 2,
  },
  news: {
    id: 'news',
    name: 'Market News',
    description: 'Stories about tickers you own plus major market moves',
    importance: 2,
  },
};

// ID range bases — see "ID allocation map" comment above.
export const ID_RANGES: Record<NotificationCategory, { base: number; size: number }> = {
  'weekly-review': { base: 1000, size: 100 },
  tasks: { base: 2000, size: 1000 },
  budgets: { base: 3000, size: 100 },
  'portfolio-eod': { base: 4000, size: 100 },
  news: { base: 5000, size: 1000 },
};

// ─── Platform / availability ────────────────────────────────────────────

/** Returns true if we can actually schedule notifications on this platform.
 *  Always false on web (dev) — our native plugin isn't registered there.
 *  Wrapped in try/catch since the plugin object itself might throw on
 *  property access in some web environments. */
export async function notificationsAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    // A successful checkPermission round-trip is the only way to verify
    // the native plugin is actually registered and responsive. We don't
    // care about the result here — just that the call returned.
    await NexusNotifications.checkPermission();
    return true;
  } catch (e) {
    console.warn('[notifications] availability check failed:', (e as Error).message);
    return false;
  }
}

// ─── Permission ─────────────────────────────────────────────────────────

/** Idempotent — calling this when permission is already granted is a cheap
 *  no-op. On native it triggers the OS permission prompt if not yet granted
 *  (only on Android 13+; below that the manifest grant is automatic).
 *  Returns ok=false with a `reason` if the user denied or the platform
 *  doesn't support notifications. */
export async function ensureNotificationPermission(): Promise<NotificationResult> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, reason: 'Notifications not available on this platform.' };
  }
  try {
    const check = await NexusNotifications.checkPermission();
    if (check.granted) return { ok: true };
    const req = await NexusNotifications.requestPermission();
    if (req.granted) return { ok: true };
    return { ok: false, reason: 'Notification permission denied.' };
  } catch (e) {
    return { ok: false, reason: (e as Error).message || String(e) };
  }
}

/** Returns true if permission has *already* been granted, without prompting.
 *  Used by per-feature schedulers to early-out when the user has the master
 *  notif toggle on but the OS-level permission was revoked from system
 *  settings since the last app session. Falls back to false on any error
 *  rather than blocking; the caller treats that as "not granted, prompt
 *  the user". */
export async function hasNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const check = await NexusNotifications.checkPermission();
    return check.granted;
  } catch (e) {
    console.warn('[notifications] hasNotificationPermission:', (e as Error).message);
    return false;
  }
}

// ─── Channels ───────────────────────────────────────────────────────────

const createdChannels = new Set<NotificationCategory>();

/** Create the Android notification channel for a category if not yet
 *  created in this session. Idempotent and best-effort — failures are
 *  logged. Pre-Oreo Androids ignore channels entirely (no-op on the
 *  native side) so this is safe to call there. */
export async function ensureChannel(category: NotificationCategory): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  if (createdChannels.has(category)) return;
  const spec = CHANNEL_SPECS[category];
  try {
    await NexusNotifications.createChannel({
      id: spec.id,
      name: spec.name,
      description: spec.description,
      importance: spec.importance,
    });
    createdChannels.add(category);
  } catch (e) {
    console.warn('[notifications] ensureChannel', category, (e as Error).message);
  }
}

// ─── Schedule / cancel ──────────────────────────────────────────────────

export interface ScheduleOptions {
  /** Stable numeric ID within the category's range. Re-scheduling with the
   *  same ID overwrites the prior notification. */
  id: number;
  category: NotificationCategory;
  title: string;
  body: string;
  /** When to fire. Omit for "immediately" (1 second from now — the native
   *  side won't accept past times, it floors them). */
  at?: Date;
  /** Repeat cadence. Currently unused by the native plugin (single-shot
   *  only); kept in the API surface for forward-compat. The Weekly Review
   *  flow handles its own re-arming on every app start. */
  every?: 'day' | 'week' | 'month' | 'year';
  /** Arbitrary payload — read in the tap handler. Keep small; this rides
   *  the AlarmManager intent. The `route` field is special: if present,
   *  the tap handler navigates there. */
  extra?: Record<string, unknown> & { route?: string };
}

/** Schedule (or overwrite) a notification. Verifies the ID falls in the
 *  category's allocated range — passing an out-of-range ID throws so we
 *  catch range collisions in dev rather than have notifications stomp on
 *  each other in prod. */
export async function scheduleNotification(opts: ScheduleOptions): Promise<NotificationResult> {
  const range = ID_RANGES[opts.category];
  if (opts.id < range.base || opts.id >= range.base + range.size) {
    throw new Error(
      `Notification ID ${opts.id} out of range for category "${opts.category}" ` +
        `(expected ${range.base}..${range.base + range.size - 1})`,
    );
  }
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, reason: 'Notifications not available on this platform.' };
  }
  if (!(await hasNotificationPermission())) {
    return { ok: false, reason: 'Notification permission not granted.' };
  }
  await ensureChannel(opts.category);
  const atMillis = opts.at ? opts.at.getTime() : Date.now() + 1000;
  try {
    await NexusNotifications.schedule({
      id: opts.id,
      title: opts.title,
      body: opts.body,
      channelId: CHANNEL_SPECS[opts.category].id,
      atMillis,
      extra: opts.extra,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/** Cancel one or more notifications by ID. Safe to call with IDs that were
 *  never scheduled — the native side silently ignores misses. */
export async function cancelNotifications(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  if (!Capacitor.isNativePlatform()) return;
  try {
    await NexusNotifications.cancel({ ids });
  } catch (e) {
    console.warn('[notifications] cancel', (e as Error).message);
  }
}

/** Cancel every pending notification in a category by enumerating the
 *  plugin's tracked-ID list and filtering by ID range. Used by the master
 *  Settings toggle and per-category off-switches. */
export async function cancelCategory(category: NotificationCategory): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const range = ID_RANGES[category];
  try {
    const pending = await NexusNotifications.getPending();
    const ids = pending.ids.filter(
      (id) => id >= range.base && id < range.base + range.size,
    );
    if (ids.length) await NexusNotifications.cancel({ ids });
  } catch (e) {
    console.warn('[notifications] cancelCategory', category, (e as Error).message);
  }
}

// ─── Tap routing ────────────────────────────────────────────────────────

/** Subscribe to notification taps. Calls `onOpen(route)` with the route
 *  encoded in the notification's `extra.route` payload. Returns an
 *  unsubscriber. Safe to call on web — returns a no-op unsubscriber.
 *
 *  Notifications without a `route` payload are silently dropped — the user
 *  tapping a "Budget exceeded" alert with no route attached just opens the
 *  app to its last-visible screen, which is the correct default. */
export async function onNotificationTap(
  onOpen: (route: string) => void,
): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  try {
    const handle = await NexusNotifications.addListener('notificationTap', (event) => {
      if (event.route) onOpen(event.route);
    });
    return () => {
      handle.remove();
    };
  } catch (e) {
    console.warn('[notifications] onNotificationTap', (e as Error).message);
    return () => {};
  }
}
