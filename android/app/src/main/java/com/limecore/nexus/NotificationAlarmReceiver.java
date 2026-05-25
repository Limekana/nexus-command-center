package com.limecore.nexus;

// Triggered by AlarmManager when a scheduled notification's fire time
// arrives. Builds + posts the notification via NotificationCompat, and
// wires the contentIntent to open MainActivity with the route extra so
// the JS-side tap handler can navigate.
//
// All work happens synchronously inside onReceive — broadcast receivers
// have ~10s before the system kills them. Posting a notification is far
// under that budget.

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;

public class NotificationAlarmReceiver extends BroadcastReceiver {

    private static final String TAG = "NexusNotifications";

    // Intent extra used by MainActivity to identify a tap-launched intent
    // and pull out the route. Lives here (not in MainActivity) because the
    // receiver is the one that writes it into the contentIntent.
    public static final String EXTRA_TAP_ROUTE = "nexus_tap_route";

    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra(NexusNotificationsPlugin.EXTRA_ID, 0);
        String title = intent.getStringExtra(NexusNotificationsPlugin.EXTRA_TITLE);
        String body = intent.getStringExtra(NexusNotificationsPlugin.EXTRA_BODY);
        String channelId = intent.getStringExtra(NexusNotificationsPlugin.EXTRA_CHANNEL_ID);
        String route = intent.getStringExtra(NexusNotificationsPlugin.EXTRA_ROUTE);
        if (channelId == null || channelId.isEmpty()) channelId = "default";
        if (title == null) title = "";
        if (body == null) body = "";

        // Build the tap intent: open MainActivity with the route packed as
        // an extra. SINGLE_TOP so we don't stack duplicate activities when
        // the user taps multiple notifications in succession.
        Intent tapIntent = new Intent(context, MainActivity.class);
        tapIntent.setFlags(
            Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        if (route != null) tapIntent.putExtra(EXTRA_TAP_ROUTE, route);

        // Unique request code per notification so each tap intent is its own
        // PendingIntent and one doesn't overwrite another. Use the notif id —
        // they're already unique within our 1000-5999 range.
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            piFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent contentPi = PendingIntent.getActivity(
            context, id, tapIntent, piFlags
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, channelId)
            // android.R.drawable.ic_dialog_info is a generic system icon —
            // always available, never crashes if our own icon resource is
            // missing/mis-named. Swap to R.mipmap.ic_launcher once we're
            // confident the launcher icon name is stable.
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(contentPi)
            .setAutoCancel(true) // dismiss on tap
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);

        NotificationManager nm = (NotificationManager)
            context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) {
            Log.w(TAG, "NotificationManager unavailable; cannot post id=" + id);
            return;
        }
        try {
            nm.notify(id, builder.build());
        } catch (SecurityException se) {
            // Android 13+: posting without POST_NOTIFICATIONS throws here.
            // Log and bail — the JS-side scheduler should have checked perm
            // before scheduling, but defensively we don't crash the receiver.
            Log.w(TAG, "POST_NOTIFICATIONS not granted: " + se.getMessage());
        }
    }
}
