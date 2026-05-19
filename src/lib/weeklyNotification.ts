// Sunday 18:00 local push reminder for the Weekly Review. Uses Capacitor
// LocalNotifications — no server, no Firebase, no token rotation. The plugin
// schedules a one-shot notification; on tap we navigate to /review.
//
// Why one-shot instead of `repeats: true` + schedule.on:
//   - The on/at/every API in this plugin doesn't reliably support "next
//     Sunday at 18:00, then every 7 days". `every: 'week'` repeats from the
//     scheduled moment, which works fine — but Android may drop alarms after
//     reboot or doze. To be safe we re-schedule on every app start as long
//     as the user has the toggle enabled. Cheap insurance.
//
// Permission flow:
//   - First time the user enables the toggle we request permission.
//   - If denied, the toggle flips back off and we surface the reason.

import { Capacitor } from '@capacitor/core';

const NOTIFICATION_ID = 1001; // fixed so re-scheduling overwrites the prior one
const CHANNEL_ID = 'weekly-review';

type LocalNotificationsModule = typeof import('@capacitor/local-notifications').LocalNotifications;

let cached: LocalNotificationsModule | null | undefined;

async function getPlugin(): Promise<LocalNotificationsModule | null> {
  if (cached !== undefined) return cached;
  if (!Capacitor.isNativePlatform()) {
    cached = null;
    return cached;
  }
  try {
    const mod = await import('@capacitor/local-notifications');
    cached = mod.LocalNotifications;
    return cached;
  } catch {
    cached = null;
    return cached;
  }
}

export interface NotificationResult {
  ok: boolean;
  reason?: string;
}

export async function notificationsAvailable(): Promise<boolean> {
  return (await getPlugin()) != null;
}

async function ensureChannel(): Promise<void> {
  // Android 8+ requires a notification channel. Plugin creates a default
  // one but we explicitly create ours so the user can disable just this
  // type in system settings without nuking other notifications later.
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.createChannel({
      id: CHANNEL_ID,
      name: 'Weekly Review',
      description: 'Sunday evening summary of your week across all modules',
      importance: 3, // DEFAULT — visible but no heads-up popup
      visibility: 1,
    });
  } catch {
    /* Channels are best-effort; missing means we fall back to default. */
  }
}

/** Returns the next Sunday at the given hour in local time. If today is
 *  Sunday and the time hasn't passed yet, today qualifies. */
function nextSundayAt(hour: number, minute: number = 0): Date {
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  // Sun=0, Mon=1, …, Sat=6. Days until next Sunday inclusive of today
  // (if time hasn't passed).
  const daysAhead = (7 - now.getDay()) % 7;
  if (daysAhead === 0 && target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 7);
  } else {
    target.setDate(target.getDate() + daysAhead);
  }
  return target;
}

export async function requestNotificationPermission(): Promise<NotificationResult> {
  const plugin = await getPlugin();
  if (!plugin) return { ok: false, reason: 'Notifications not available on this platform.' };
  try {
    const check = await plugin.checkPermissions();
    if (check.display === 'granted') return { ok: true };
    const req = await plugin.requestPermissions();
    if (req.display === 'granted') return { ok: true };
    return { ok: false, reason: 'Notification permission denied.' };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/**
 * Schedule the Sunday 18:00 reminder. Overwrites any existing schedule
 * with the same ID. Returns ok=false if the platform doesn't support it
 * or permission is denied. Caller is responsible for storing the user's
 * preference; this function only touches the schedule.
 */
export async function scheduleWeeklyReview(): Promise<NotificationResult> {
  const plugin = await getPlugin();
  if (!plugin) return { ok: false, reason: 'Notifications not available on this platform.' };

  // Make sure we have permission. We don't re-prompt aggressively — if
  // already denied, the caller flips the toggle back.
  const check = await plugin.checkPermissions();
  if (check.display !== 'granted') {
    return { ok: false, reason: 'Notification permission not granted.' };
  }

  await ensureChannel();
  const at = nextSundayAt(18, 0);
  try {
    await plugin.schedule({
      notifications: [
        {
          id: NOTIFICATION_ID,
          title: 'Your week is ready',
          body: 'Tap to see how your finances, study, fitness and tasks moved this week.',
          channelId: CHANNEL_ID,
          schedule: {
            at,
            // Repeat every 7 days. Plugin handles this as a relative
            // recurrence from the initial trigger.
            every: 'week',
            allowWhileIdle: true,
          },
          extra: { route: '/review' },
        },
      ],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

export async function cancelWeeklyReview(): Promise<void> {
  const plugin = await getPlugin();
  if (!plugin) return;
  try {
    await plugin.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
  } catch {
    /* ignore */
  }
}

/**
 * Subscribe to notification taps. Calls `onOpen(route)` with the route
 * encoded in the notification's `extra` payload. Returns an unsubscriber.
 *
 * Safe to call on web — returns a no-op unsubscriber.
 */
export async function onNotificationTap(
  onOpen: (route: string) => void,
): Promise<() => void> {
  const plugin = await getPlugin();
  if (!plugin) return () => {};
  try {
    const handle = await plugin.addListener('localNotificationActionPerformed', (event) => {
      const extra = event.notification?.extra as { route?: string } | undefined;
      const route = extra?.route;
      if (route) onOpen(route);
    });
    return () => {
      handle.remove();
    };
  } catch {
    return () => {};
  }
}
