package com.limecore.nexus;

// Receives broadcasts from action-button taps on notifications posted by
// NotificationAlarmReceiver. Responsibilities:
//
//   1. Dismiss the source notification (action buttons don't auto-dismiss
//      by default — the user expects the alert to clear once acted on).
//   2. Forward the action to the JS side as a `notificationAction` event
//      so the app can do whatever the action ID maps to (mark task done,
//      navigate to a category page, etc.).
//   3. If the plugin instance isn't ready yet (cold start from an action
//      tap), buffer the event so the first listener registration replays
//      it — same pattern as deliverTap.
//
// All work is synchronous in onReceive — broadcast receivers have ~10s
// before the system kills them. Forwarding an event is far under that.

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class NotificationActionReceiver extends BroadcastReceiver {

    // Intent-extra keys written by NotificationAlarmReceiver when it builds
    // the action's PendingIntent. We mirror them in NexusNotificationsPlugin
    // as public constants so the receiver chain stays type-aligned.
    public static final String EXTRA_NOTIF_ID = "nexus_action_notif_id";
    public static final String EXTRA_ACTION_ID = "nexus_action_id";
    public static final String EXTRA_ACTION_ROUTE = "nexus_action_route";
    public static final String EXTRA_ACTION_EXTRA_JSON = "nexus_action_extra_json";

    @Override
    public void onReceive(Context context, Intent intent) {
        int notifId = intent.getIntExtra(EXTRA_NOTIF_ID, 0);
        String actionId = intent.getStringExtra(EXTRA_ACTION_ID);
        String route = intent.getStringExtra(EXTRA_ACTION_ROUTE);
        String extraJson = intent.getStringExtra(EXTRA_ACTION_EXTRA_JSON);
        if (actionId == null) actionId = "";

        // Dismiss the notification immediately — Android does NOT auto-cancel
        // on action-button tap (only on content-area tap when autoCancel=true).
        // Leaving it in the tray after "Mark done" would be confusing UX.
        NotificationManager nm = (NotificationManager)
            context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(notifId);

        // Forward to JS. Plugin instance may be null if this is a cold-start
        // (the app process wasn't alive when the user tapped the action) —
        // the buffer in the plugin handles that.
        NexusNotificationsPlugin.deliverAction(
            NexusNotificationsPlugin.getInstance(),
            actionId,
            route,
            extraJson
        );
    }
}
