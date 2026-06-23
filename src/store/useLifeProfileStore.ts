// ─── v1.5 Life Profile store ─────────────────────────────────────────────
//
// Holds the active LifeProfile (which domains feed the Life Score + their
// weights). Offline-first, mirroring the app's other prefs:
//   - localStorage is the instant local cache (works in guest mode / offline)
//   - user_preferences.life_profile (JSONB) is the cross-device source of truth
//     when signed in. On load we read the local cache first (instant), then
//     override from the cloud if a signed-in value exists. On write we persist
//     locally AND upsert to the cloud when signed in.
//
// Validation/auto-balance live in lib/lifeProfile.ts — this store just owns
// persistence + the in-memory copy the UI subscribes to.

import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useSessionStore } from './useSessionStore';
import {
  type LifeProfile,
  STUDENT_PROFILE,
  presetProfile,
  sanitiseLifeProfile,
  validateLifeProfile,
} from '../lib/lifeProfile';

const LOCAL_KEY = 'ncc.lifeProfile';

function readLocal(): LifeProfile {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return { ...STUDENT_PROFILE, domains: { ...STUDENT_PROFILE.domains } };
    return sanitiseLifeProfile(JSON.parse(raw));
  } catch {
    return { ...STUDENT_PROFILE, domains: { ...STUDENT_PROFILE.domains } };
  }
}

function writeLocal(profile: LifeProfile): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(profile));
  } catch {
    /* localStorage unavailable — in-memory copy still drives the UI */
  }
}

function currentUserId(): string | null {
  return useSessionStore.getState().user?.id ?? null;
}

interface LifeProfileStore {
  profile: LifeProfile;
  loaded: boolean;

  /** Read the local cache, then override from the cloud if signed in. */
  load: () => Promise<void>;
  /** Validate, persist (local + cloud), and update the in-memory copy.
   *  Returns false (and does NOT persist) if the profile is invalid. */
  setProfile: (profile: LifeProfile) => Promise<boolean>;
  /** Reset to a built-in preset and persist. */
  resetToPreset: (preset: 'student' | 'professional') => Promise<void>;
}

export const useLifeProfileStore = create<LifeProfileStore>((set, get) => ({
  profile: readLocal(),
  loaded: false,

  async load() {
    // Instant: local cache.
    const local = readLocal();
    set({ profile: local });

    // Cloud override when signed in.
    const userId = currentUserId();
    if (userId) {
      try {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('life_profile')
          .eq('user_id', userId)
          .maybeSingle();
        if (!error && data?.life_profile) {
          const cloud = sanitiseLifeProfile(data.life_profile);
          writeLocal(cloud);
          set({ profile: cloud });
        }
      } catch (e) {
        console.warn('[life-profile] cloud load failed:', (e as Error).message);
      }
    }
    set({ loaded: true });
  },

  async setProfile(profile) {
    if (!validateLifeProfile(profile).valid) return false;
    writeLocal(profile);
    set({ profile });

    const userId = currentUserId();
    if (userId) {
      try {
        const { error } = await supabase.from('user_preferences').upsert(
          {
            user_id: userId,
            life_profile: profile,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        );
        if (error) console.warn('[life-profile] cloud write failed:', error.message);
      } catch (e) {
        console.warn('[life-profile] cloud write threw:', (e as Error).message);
      }
    }
    return true;
  },

  async resetToPreset(preset) {
    await get().setProfile(presetProfile(preset));
  },
}));
