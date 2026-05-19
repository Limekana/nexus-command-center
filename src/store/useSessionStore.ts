// Wraps Supabase's auth state in a zustand store so React components can
// subscribe naturally.
//
// `loading` is true until the first getSession() call resolves — render a
// splash while it's true to avoid flashing the login screen for users with
// a valid session.
import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null });
    });
  },

  async signOut() {
    await supabase.auth.signOut();
    // onAuthStateChange will fire with null and update state. Also set here
    // to avoid a one-frame flash of stale user data.
    set({ session: null, user: null });
  },
}));
