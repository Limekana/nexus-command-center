// Typed JS-side binding for our custom NexusNotifications Capacitor plugin
// (defined in android/app/src/main/java/com/limecore/nexus/NexusNotificationsPlugin.java).
//
// We use Capacitor.registerPlugin directly rather than depending on
// @capacitor/local-notifications. The third-party plugin's bridge was
// hanging permanently on the target device (no resolution, no rejection
// — promises just never settled). This wrapper talks to OUR native code,
// which we've validated end-to-end:
//
//   • requestPermission → native uses ActivityCompat.checkSelfPermission
//     + the Capacitor permission framework
//   • schedule         → native uses AlarmManager.setAndAllowWhileIdle
//   • cancel/getPending → native tracks IDs in SharedPreferences since
//     AlarmManager has no enumeration API
//   • notificationTap  → native broadcasts via plugin.notifyListeners
//     after MainActivity extracts the route from the launch intent
//
// On web (dev preview) the native methods don't exist — Capacitor falls
// back to a default web plugin that throws "method not implemented".
// Callers must check Capacitor.isNativePlatform() before invoking. The
// outer notifications.ts handles this gracefully.

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface PermissionResult {
  granted: boolean;
}

export interface ChannelSpec {
  id: string;
  name?: string;
  description?: string;
  // Android NotificationManager.IMPORTANCE_* — LOW=2, DEFAULT=3, HIGH=4.
  importance?: number;
}

export interface ScheduleSpec {
  // Stable numeric ID. Re-scheduling with the same ID overwrites the
  // previous alarm (via PendingIntent.FLAG_UPDATE_CURRENT on the native
  // side).
  id: number;
  title: string;
  body: string;
  /** Notification channel id. Must have been created via createChannel
   *  first (or matched a system channel). */
  channelId: string;
  /** When to fire (ms epoch). Past values are floored to "1s from now"
   *  on the native side to avoid silently dropping the notification. */
  atMillis?: number;
  /** Arbitrary payload — only `route` is read on tap. Keep small; this
   *  rides through the AlarmManager intent extras. */
  extra?: Record<string, unknown> & { route?: string };
}

export interface ScheduleResult {
  id: number;
  /** Actual fire time after past-time flooring (ms epoch). */
  at: number;
}

export interface CancelSpec {
  ids: number[];
}

export interface PendingResult {
  ids: number[];
}

export interface NotificationTapEvent {
  route: string;
}

export interface NexusNotificationsPlugin {
  checkPermission(): Promise<PermissionResult>;
  requestPermission(): Promise<PermissionResult>;
  createChannel(spec: ChannelSpec): Promise<void>;
  schedule(spec: ScheduleSpec): Promise<ScheduleResult>;
  cancel(spec: CancelSpec): Promise<void>;
  getPending(): Promise<PendingResult>;
  addListener(
    eventName: 'notificationTap',
    listener: (event: NotificationTapEvent) => void,
  ): Promise<PluginListenerHandle>;
}

// The plugin name MUST match @CapacitorPlugin(name = "NexusNotifications")
// on the native side.
export const NexusNotifications =
  registerPlugin<NexusNotificationsPlugin>('NexusNotifications');
