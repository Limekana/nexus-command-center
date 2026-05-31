package com.limecore.nexus;

// Cross-app SSO publisher. NCC is the canonical sign-in surface; LimeLog and
// StudyDesk query this ContentProvider on launch (or via a Settings button)
// to inherit NCC's Supabase session without a separate sign-in round-trip.
//
// SECURITY MODEL (v1.1 — BUG-1 fix)
// ───────────────────────────────────────────────────────────────────────────
// Original v1.1.0 design used a custom signature-level permission. Device
// testing exposed that debug builds across three separate Android Studio
// projects don't always share the default debug.keystore in practice (Gradle
// signing caches, fresh installs, different `~/.android` setups), so the OS
// rejected the permission and SSO silently failed.
//
// v1.1 replaces the OS-level guard with an application-layer allowlist:
// query() checks getCallingPackage() against a hardcoded set of known
// suite package names and returns an empty cursor for any other caller.
// Less defensible-in-theory than signature-perm — a malicious app that
// somehow installs under a spoofed package name would bypass — but Android
// enforces package-name uniqueness on the Play Store / F-Droid / sideload,
// so the practical attack surface is narrow. The token bundle also expires
// (Supabase refresh) so the blast radius of any misconfiguration is bounded.
//
// STORAGE BACKING + CRITICAL TYPE NOTE
// ───────────────────────────────────────────────────────────────────────────
// The session bundle is published by NCC's JS layer via Capacitor Preferences,
// which stores values in SharedPreferences named "CapacitorStorage" with
// MODE_PRIVATE. PRIVATE means only NCC can read those prefs directly —
// this ContentProvider is the only legitimate cross-process bridge.
//
// **IMPORTANT:** @capacitor/preferences stores EVERY value as a String via
// `editor.putString(key, value)` — there is no putLong / putBoolean / etc.
// (see node_modules/@capacitor/preferences/.../Preferences.java#set). That
// means reading a key with the typed accessors (getLong, getBoolean) throws
// ClassCastException at the SharedPreferencesImpl layer because the in-memory
// map holds a String, not a Long. This was the silent failure mode behind the
// 2026-05-28 BUG-1 reopen — the prior fix landed the application-layer
// allowlist correctly but query() was still crashing on `getLong(... + ".publishedAt", 0L)`,
// surfacing to consumers as a null cursor and "available: false". The fix:
// read publishedAt with getString() and parseLong() it. Any future numeric
// or boolean field MUST follow the same pattern.
//
// The published bundle is a JSON string under the key suite.sso.session:
//   { "access_token": "...", "refresh_token": "...", "expires_at": 1234567890,
//     "user_id": "...", "email": "..." }
//
// Cleared on sign-out (set to empty string) so a stale token can't haunt
// the sister apps after the user explicitly signed out of NCC.

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.util.Log;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

public class SessionContentProvider extends ContentProvider {

    private static final String TAG = "SessionProvider";

    // Backing SharedPreferences — must match the name Capacitor Preferences
    // uses internally. This is a public Capacitor convention and stable
    // across the v6/v7/v8 series we target.
    private static final String CAP_PREFS_NAME = "CapacitorStorage";
    public static final String SESSION_KEY = "suite.sso.session";

    // Returned cursor column layout. Sister apps key off these column names.
    public static final String COL_BUNDLE = "session_bundle_json";
    public static final String COL_PUBLISHED_AT = "published_at";

    // v1.1 — package allowlist (replaces signature-level permission, see
    // class-level SECURITY MODEL comment). Add a new suite app here AND
    // ship it signed by the same publisher — Android's package-name
    // uniqueness on Play / F-Droid is the trust anchor.
    private static final Set<String> ALLOWED_CALLERS = new HashSet<>(Arrays.asList(
        "com.limecore.workouttracker",  // LimeLog
        "com.StudyDesk.app"              // StudyDesk — bundle ID is mixed-case
    ));

    @Override
    public boolean onCreate() {
        // No initialization needed — the provider opens SharedPreferences
        // lazily on each query so it sees the freshest published value.
        return true;
    }

    @Override
    public Cursor query(
        Uri uri,
        String[] projection,
        String selection,
        String[] selectionArgs,
        String sortOrder
    ) {
        // v1.1 — wrap the whole body in try/catch and return an empty cursor
        // on any exception. ContentProvider.query() exceptions cross-process
        // surface to consumers as null cursors / RemoteExceptions, and can
        // crash the provider's Binder thread. Degrading to an empty cursor
        // means "no session available" — exactly the right consumer-side
        // semantic for any unexpected failure.
        try {
            Context ctx = getContext();
            if (ctx == null) return emptyCursor();

            // v1.1 — application-layer allowlist. ContentProvider.getCallingPackage()
            // returns the package name of the app that initiated the query (Binder-
            // verified, set by the OS — not spoofable from the caller side without
            // OS compromise). Reject any package not in our suite list. Logged at
            // WARN level so a misconfigured / malicious caller leaves a trail.
            String caller = getCallingPackage();
            if (caller == null || !ALLOWED_CALLERS.contains(caller)) {
                Log.w(TAG, "Rejected SSO query from caller: " + caller);
                return emptyCursor();
            }

            SharedPreferences prefs = ctx.getSharedPreferences(
                CAP_PREFS_NAME, Context.MODE_PRIVATE
            );
            // Capacitor Preferences stores values as plain strings under
            // arbitrary keys. Missing or explicitly-cleared values surface as
            // null / empty — both treated as "no session published."
            String bundle = prefs.getString(SESSION_KEY, "");
            if (bundle == null || bundle.isEmpty()) return emptyCursor();

            // v1.1 BUG-1 fix: publishedAt is stored as a String (Capacitor
            // Preferences always uses putString — see class header). The
            // previous version called prefs.getLong(...), which threw
            // ClassCastException at SharedPreferencesImpl.getLong's hard
            // (Long) cast. The exception propagated out of query() and
            // surfaced to siblings as a null cursor → "available: false"
            // → no Continue-with-Nexus affordance. Reading as String and
            // parsing avoids the type mismatch.
            String publishedAtStr = prefs.getString(SESSION_KEY + ".publishedAt", "0");
            long publishedAt;
            try {
                publishedAt = Long.parseLong(publishedAtStr == null ? "0" : publishedAtStr);
            } catch (NumberFormatException nfe) {
                // Corrupted publishedAt shouldn't block the actual session
                // hand-off — siblings only use it for staleness logging.
                Log.w(TAG, "Malformed publishedAt: " + publishedAtStr + " — defaulting to 0");
                publishedAt = 0L;
            }

            MatrixCursor cursor = new MatrixCursor(
                new String[] { COL_BUNDLE, COL_PUBLISHED_AT }
            );
            cursor.addRow(new Object[] { bundle, publishedAt });
            return cursor;
        } catch (Exception e) {
            // Any unexpected failure (prefs file unreadable, OS quirks, etc.)
            // — degrade to empty cursor rather than letting the exception
            // cross the Binder boundary. Logged so the failure leaves a
            // trail in logcat for diagnosis.
            Log.e(TAG, "SSO query failed: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            return emptyCursor();
        }
    }

    private Cursor emptyCursor() {
        return new MatrixCursor(new String[] { COL_BUNDLE, COL_PUBLISHED_AT });
    }

    // ───────────────────────────────────────────────────────────────────────
    // Read-only provider. The sister apps MUST NOT be allowed to mutate
    // NCC's session state — that would be a privilege escalation. All write
    // methods return defensive defaults (no-op / unsupported).

    @Override public String getType(Uri uri) {
        return "vnd.android.cursor.item/com.limecore.nexus.session";
    }

    @Override public Uri insert(Uri uri, ContentValues values) { return null; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
}
