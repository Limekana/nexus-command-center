// v1.6 — first-run onboarding flag.
//
// NCC's Life Profile store always holds a value (defaults to the Student
// preset), so there's no natural "null profile" to detect first run. We gate
// the onboarding wizard on an explicit localStorage flag instead, treating two
// signals as "already set up":
//   - `ncc.onboarded`  — the wizard was completed or skipped
//   - `ncc.lifeProfile` — a profile was saved before v1.6 (returning user who
//                          predates onboarding shouldn't be re-prompted)
//
// Local-only flag (matches the app's other client flags). Cloud life_profile
// presence is also honoured by the gate caller via the loaded store.

import { supabase } from './supabase';

const ONBOARDED_KEY = 'ncc.onboarded';
const PROFILE_KEY = 'ncc.lifeProfile';

export function isOnboarded(): boolean {
  try {
    return (
      localStorage.getItem(ONBOARDED_KEY) === '1' ||
      localStorage.getItem(PROFILE_KEY) != null
    );
  } catch {
    return false;
  }
}

export function setOnboarded(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* best-effort flag */
  }
}

// -- v1.10: the flag belongs to the ACCOUNT, not the device ----------------
// It was localStorage and nothing else, which is per-origin and per-device, so
// a returning user on a new phone, browser or reinstall - or, until today's
// Electron origin fix, just the next launch of the desktop build - looked
// brand new and was made to redo the wizard.
//
// localStorage stays the fast path and the only path for guests: it answers
// synchronously on first render. The cloud read is a correction layer that can
// only ever turn the wizard OFF. A failed network call therefore falls back to
// the local answer - showing the wizard to someone who has seen it is annoying,
// but hiding first-run setup from someone who needs it would be worse.

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

/** Record completion against the account. Best-effort: the local flag is
 *  already set by the caller, so a failure costs a repeat wizard on the NEXT
 *  device, not a broken finish on this one. */
export async function markOnboardedCloud(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  try {
    const { error } = await supabase.from('user_preferences').upsert(
      { user_id: userId, ncc_onboarded: true, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) console.warn('[onboarding] cloud write failed:', error.message);
  } catch (e) {
    console.warn('[onboarding] cloud write threw:', (e as Error).message);
  }
}

/** Has this user onboarded anywhere? True only on a definite yes. Also
 *  back-fills a device that says done while the account does not know yet, so
 *  the first run of this version is the last time the wizard ever appears. */
export async function hydrateOnboardedFromCloud(): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId) return false;
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('ncc_onboarded')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return false;
    if (data?.ncc_onboarded) {
      setOnboarded();
      return true;
    }
    if (isOnboarded()) await markOnboardedCloud();
    return false;
  } catch {
    return false;
  }
}
