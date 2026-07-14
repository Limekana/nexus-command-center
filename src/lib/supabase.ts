// Supabase client.
// - PKCE flow (required for mobile — never use implicit on Capacitor).
// - Sessions persisted via Capacitor Preferences (SharedPreferences on Android,
//   more durable than WebView localStorage which can be evicted under pressure).
// - detectSessionInUrl off — we handle OAuth callbacks manually via the deep-link
//   listener in App.tsx so we control when exchangeCodeForSession fires.
//
// The publishable key is safe to ship in client code (it's gated by RLS — the
// real authority is the user's signed JWT, not this key).
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const SUPABASE_URL = 'https://hkktorzhaqnfqsnlstda.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ykHLJ4QuFm2HKXACygwezw_c_cvR_yf';

const capacitorStorage: SupportedStorage = {
  async getItem(key) {
    try {
      const { value } = await Preferences.get({ key });
      return value;
    } catch {
      return localStorage.getItem(key);
    }
  },
  async setItem(key, value) {
    try {
      await Preferences.set({ key, value });
    } catch {
      localStorage.setItem(key, value);
    }
  },
  async removeItem(key) {
    try {
      await Preferences.remove({ key });
    } catch {
      localStorage.removeItem(key);
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: capacitorStorage,
    storageKey: 'nexus-supabase-session',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

// ── Mobile session durability (v1.7 — forced-logout bug) ────────────────
// supabase-js drives its token auto-refresh loop off browser visibility /
// `online` events. In a Capacitor Android WebView those fire unreliably once
// the app is paused, so a backgrounded app can sail past the access-token
// expiry without refreshing; by the time it's reopened the rotating refresh
// token has lapsed, supabase-js emits SIGNED_OUT, and the user is bounced to
// the login screen — the spontaneous "logged out again" every day or two.
//
// Supabase's documented mobile fix is to drive the refresh loop off the
// native app lifecycle instead of browser events: stop it on background,
// (re)start it on foreground. startAutoRefresh() also runs an immediate tick,
// so a token that expired while backgrounded is refreshed from the still-valid
// refresh token the moment the app returns — keeping the session alive
// indefinitely. Cold start is already covered by getSession() in
// useSessionStore.init(); this closes the warm-foreground gap.
if (Capacitor.isNativePlatform()) {
  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}

// Custom URL scheme for OAuth deep-link return. Registered in
// android/app/src/main/AndroidManifest.xml.
export const OAUTH_REDIRECT_URL = 'com.limecore.nexus://login-callback';
