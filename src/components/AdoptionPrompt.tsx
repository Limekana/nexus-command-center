import { useEffect, useState } from 'react';
import { adoptLocalData, hasLocalData } from '../lib/cloudSync';
import { clearAllLocalData } from '../db/database';
import { useSessionStore } from '../store/useSessionStore';
import { useSyncStore } from '../store/useSyncStore';
import { supabase } from '../lib/supabase';

// v1.1.1 — BUG-2 fix: dismiss flag now lives in Supabase, not Capacitor
// Preferences. Android wipes SharedPreferences on app uninstall, so the
// pre-1.1.1 flag never survived reinstalls — the user was re-prompted on
// every fresh install despite the "won't ask again on this account"
// language. Supabase is the only storage that survives reinstalls.
//
// Storage: public.user_preferences keyed on auth.uid(), column
// `ncc_local_data_prompt_dismissed BOOLEAN`. Migration:
// `create_user_preferences_for_local_data_prompt` (2026-05-27).
//
// Migration path for v1.1.0 users: anyone who already dismissed in 1.1.0
// will see the prompt ONE more time on upgrade (the old local flag is
// no longer consulted). After they dismiss in 1.1.1, the Supabase row
// lands and they're never asked again — across any number of reinstalls.
//
// v1.2.1 — AUDIT-FSG-2b fix: shared-device user-change re-fire. The cloud
// flag is per-user, so a returning B who previously dismissed under their
// own auth.uid() never sees the prompt — and User A's Dexie data sits
// invisibly on the device. The FSG-2 fix closes the cloud REPLAY path
// (syncQueue drains on sign-out so A's writes can't push under B), but
// the local data is still rendered through B's views once they sign in.
// Tracking `nexus.lastSignedInUserId` in localStorage gives us a second
// gate: when the current user_id differs from the previous one AND there
// IS local data present, force-show the prompt regardless of the cloud
// dismiss flag. Once B picks Keep&Sync or Discard, the marker advances
// so the same B-session doesn't re-prompt on subsequent mounts.
const LAST_USER_KEY = 'nexus.lastSignedInUserId';
function readLastUserId(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}
function writeLastUserId(userId: string): void {
  try {
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    /* quota / private-mode — best-effort */
  }
}

async function getDismissedFromCloud(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('ncc_local_data_prompt_dismissed')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('[adoption] read user_preferences failed:', error.message);
      // Best-effort: if we can't read the flag we show the prompt rather
      // than risk hiding it incorrectly. Better to over-prompt once than
      // silently lose user-visible data behind a missing query.
      return false;
    }
    return !!data?.ncc_local_data_prompt_dismissed;
  } catch (e) {
    console.warn('[adoption] read user_preferences threw:', (e as Error).message);
    return false;
  }
}

async function setDismissedInCloud(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        ncc_local_data_prompt_dismissed: true,
        updated_at: new Date().toISOString(),
      });
    if (error) {
      // Failure here just means the next reinstall will re-prompt — annoying
      // but not data-loss. Log so we notice if this becomes systemic.
      console.warn('[adoption] write user_preferences failed:', error.message);
    }
  } catch (e) {
    console.warn('[adoption] write user_preferences threw:', (e as Error).message);
  }
}

export default function AdoptionPrompt() {
  const user = useSessionStore((s) => s.user);
  const syncNow = useSyncStore((s) => s.syncNow);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  // Decide whether to show on mount + when user changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) setShow(false);
        return;
      }
      // v1.2.1 — AUDIT-FSG-2b: force-show on user transition (shared device).
      // If a different signed-in user was previously seen on this install
      // AND there is local data present, prompt regardless of the cloud
      // dismiss flag. This is the only path that catches the "User B signs
      // in after User A signed out on the same device" case, since B's
      // cloud-stored dismiss flag is keyed to B's auth.uid() and doesn't
      // know A ever existed here.
      const previousUserId = readLastUserId();
      const hasData = await hasLocalData();
      const isUserChange =
        previousUserId !== null && previousUserId !== user.id && hasData;
      if (isUserChange) {
        if (!cancelled) setShow(true);
        return;
      }
      const dismissed = await getDismissedFromCloud(user.id);
      if (dismissed) {
        // Already dismissed by THIS user previously — advance the marker
        // so we don't re-evaluate the user-change branch next mount.
        writeLastUserId(user.id);
        if (!cancelled) setShow(false);
        return;
      }
      if (!hasData) {
        // No local data → silently mark dismissed in the cloud so we
        // don't re-check on every launch. Fire-and-forget; if the write
        // fails the next launch will re-evaluate hasLocalData() which
        // will still be false, so we'll write again. Idempotent.
        void setDismissedInCloud(user.id);
        writeLastUserId(user.id);
        if (!cancelled) setShow(false);
        return;
      }
      if (!cancelled) setShow(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!show || !user) return null;

  const onKeep = async () => {
    setBusy(true);
    try {
      await adoptLocalData(user.id);
      await syncNow();
      // Dismiss BEFORE hiding the UI so a misfired re-mount during the
      // sync round-trip doesn't re-prompt. Fire-and-forget upsert —
      // failure is logged, not surfaced (don't block UX on a pref write).
      void setDismissedInCloud(user.id);
      // v1.2.1 — AUDIT-FSG-2b: advance the user-change marker so the next
      // mount in this session doesn't trip the user-transition branch.
      writeLastUserId(user.id);
      setShow(false);
    } finally {
      setBusy(false);
    }
  };

  const onDiscard = async () => {
    if (!confirm('Wipe all local test data? This cannot be undone.')) return;
    setBusy(true);
    try {
      await clearAllLocalData();
      // Same pattern as onKeep — mark dismissed before the reload so the
      // post-reload mount sees the flag. The reload will trigger another
      // session restore + AdoptionPrompt mount; if the upsert hasn't
      // completed by then we'd re-prompt, but hasLocalData() will return
      // false (we just wiped) and the inner branch sets the flag again.
      void setDismissedInCloud(user.id);
      // v1.2.1 — AUDIT-FSG-2b: advance the user-change marker. Both
      // adoption outcomes (Keep + Discard) count as "user has acted",
      // so subsequent mounts under the same user_id should follow the
      // cloud-dismiss branch only.
      writeLastUserId(user.id);
      setShow(false);
      // Force a reload so all stores re-init with the empty DB.
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-bg/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card-elevated max-w-sm w-full">
        <h2 className="font-heading font-bold text-lg mb-2">Existing data found</h2>
        <p className="text-sm text-text-muted mb-4">
          You have data stored locally on this device from before signing in. Should we adopt
          it into your account and sync it to the cloud, or discard it?
        </p>
        <div className="space-y-2">
          <button
            onClick={onKeep}
            disabled={busy}
            className="btn w-full"
          >
            {busy ? 'Working…' : 'Keep & sync to cloud'}
          </button>
          <button
            onClick={onDiscard}
            disabled={busy}
            className="btn-ghost w-full text-danger border-danger/40"
          >
            Discard local data
          </button>
        </div>
        {/* v1.1 — UI/UX review #6: 10px → 11px on a legal-flavored disclosure. */}
        <p className="text-[11px] text-text-muted mt-3 text-center">
          You won't be asked again on this account.
        </p>
      </div>
    </div>
  );
}
