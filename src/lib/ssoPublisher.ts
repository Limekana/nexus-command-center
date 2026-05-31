// v1.4 cross-app SSO publisher.
//
// NCC is the canonical sign-in surface for the Limecore suite. Whenever the
// Supabase auth session changes, we serialize it to a known Preferences key
// that NCC's SessionContentProvider exposes to sibling apps (LimeLog,
// StudyDesk) over a signature-protected content:// URI.
//
// The provider reads SharedPreferences directly; we write via Capacitor
// Preferences (which on Android is backed by the same SharedPreferences
// file named "CapacitorStorage"). Both sides agree on the key name
// `suite.sso.session` — see SessionContentProvider.SESSION_KEY.
//
// Serialized shape — kept minimal so the cursor row stays small and so we
// don't accidentally publish PII the sister apps don't need:
//   { access_token, refresh_token, expires_at, user_id, email }
//
// On sign-out we publish an EMPTY STRING rather than removing the key, so a
// querying sibling reliably sees "no session" instead of getting a stale
// value from a race condition between provider read and key deletion.

import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import type { Session } from '@supabase/supabase-js';

const SESSION_KEY = 'suite.sso.session';
const PUBLISHED_AT_KEY = 'suite.sso.session.publishedAt';

/** Write the current Supabase session to the SSO bridge, or clear it if
 *  the session is null. No-op on web — sibling apps don't exist there. */
export async function publishSession(session: Session | null): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (!session) {
      // Empty string rather than remove() so the provider sees a
      // deterministic "no session" signal even mid-race with a sibling
      // that's querying at the same moment.
      await Preferences.set({ key: SESSION_KEY, value: '' });
      await Preferences.set({ key: PUBLISHED_AT_KEY, value: '0' });
      return;
    }
    const bundle = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      // Supabase Session has expires_at in seconds (unix). Pass through.
      expires_at: session.expires_at ?? 0,
      user_id: session.user.id,
      email: session.user.email ?? '',
    };
    await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(bundle) });
    await Preferences.set({ key: PUBLISHED_AT_KEY, value: String(Date.now()) });
  } catch (e) {
    // Failure here doesn't block sign-in — sibling apps just won't get
    // free auth this round. Log so we notice in dev.
    console.warn('[sso] publishSession failed:', (e as Error).message);
  }
}

/** Tear down the published session. Called from sign-out as a belt-and-
 *  suspenders pair with the empty-string write inside publishSession(null).
 *  Either alone is sufficient; both together close the read-race window. */
export async function clearPublishedSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await publishSession(null);
}
