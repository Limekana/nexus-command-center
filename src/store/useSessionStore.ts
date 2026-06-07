// Wraps Supabase's auth state in a zustand store so React components can
// subscribe naturally.
//
// `loading` is true until the first getSession() call resolves — render a
// splash while it's true to avoid flashing the login screen for users with
// a valid session.
import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { publishSession, clearPublishedSession } from '../lib/ssoPublisher';
import { setGuestMode } from '../lib/guestMode';
import { db } from '../db/database';

interface SessionState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  init: () => Promise<void>;
  signOut: () => Promise<void>;
}

// Derive display name + initials from user metadata.
export function userDisplayName(user: User | null): string {
  if (!user) return '';
  const meta = user.user_metadata ?? {};
  return (
    (meta.full_name as string) ??
    (meta.name as string) ??
    user.email?.split('@')[0] ??
    ''
  );
}

export function userInitials(user: User | null): string {
  const name = userDisplayName(user);
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,

  async init() {
    if (useSessionStore.getState().initialized) return;
    const { data } = await supabase.auth.getSession();
    set({
      session: data.session,
      user: data.session?.user ?? null,
      loading: false,
      initialized: true,
    });
    // v1.1.1 — BUG-1 fix: await the initial publish so the SSO bridge is
    // populated BEFORE init() returns. Eliminates the race where a sibling
    // app querying mid-init would see an empty cursor even though the user
    // has a valid restored session. The await adds a few ms to cold start
    // — acceptable trade for SSO reliability. Failures still swallowed
    // inside publishSession so the auth flow continues regardless.
    await publishSession(data.session);
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null });
      // Republish on every auth change — token refreshes, sign-in,
      // sign-out (null clears the bridge for siblings). Fire-and-forget
      // here is fine — onAuthStateChange callbacks aren't awaited by
      // any caller, and the next event will republish if this one drops.
      void publishSession(session);
    });
  },

  async signOut() {
    // v1.4 — clear the SSO bridge BEFORE the auth round-trip so a
    // concurrent sibling query can't grab a token that's about to be
    // invalidated. onAuthStateChange's null fire will also clear, but
    // this closes the race window cleanly.
    await clearPublishedSession();
    // v1.2.1 — security audit finding FSG-2/FSG-6.
    //
    // Drain the unsynced syncQueue BEFORE clearing the session.
    //
    // Threat: A signs in, edits offline (queued in Dexie). A signs out
    // without first reconnecting. B signs in on the same device. App.tsx's
    // user-change useEffect kicks `syncNow()`, which calls
    // `pushQueue(B.userId)` — and every push handler stamps
    // `user_id: ctx.userId` from the LIVE session. A's queued edits would
    // land in B's cloud account under B's user_id. RLS doesn't help here
    // because B is genuinely the inserting user; the violation is one
    // semantic level above the database.
    //
    // Fix: delete every unsynced queue entry on sign-out. Synced entries
    // (rows with syncedAt set) are kept as harmless audit trail. The
    // user accepts that signing out abandons any unsynced offline edits —
    // a sharper trade-off than silently rewriting them to another account.
    //
    // Already-synced rows in Dexie (transactions, holdings, etc.) are
    // NOT cleared here. The AdoptionPrompt path (BUG-2) is the right UX
    // surface for "I see local data — adopt or discard?" on next sign-in.
    // The Medium follow-up (FSG-2b) is to re-fire that prompt when the
    // signed-in user_id changes across sessions, since the cloud
    // dismissed-flag is per-user and currently lets a returning B skip
    // adoption while A's data sits there.
    try {
      await db.syncQueue.filter((q) => !q.syncedAt).delete();
    } catch (e) {
      console.warn('[auth] signOut: syncQueue drain failed:', (e as Error).message);
    }
    await supabase.auth.signOut();
    // v1.1 auth UX — clear the guest-mode flag so the next render lands
    // on the Login screen rather than back into a half-authenticated guest
    // state. App.tsx listens for the change event below.
    await setGuestMode(false);
    window.dispatchEvent(new CustomEvent('nexus:guest-mode-changed'));
    // onAuthStateChange will fire with null and update state. Also set here
    // to avoid a one-frame flash of stale user data.
    set({ session: null, user: null });
  },
}));
