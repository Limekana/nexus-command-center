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

// Custom URL scheme for OAuth deep-link return. Registered in
// android/app/src/main/AndroidManifest.xml.
export const OAUTH_REDIRECT_URL = 'com.limecore.nexus://login-callback';
