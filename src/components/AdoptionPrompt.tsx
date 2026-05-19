import { useEffect, useState } from 'react';
import { Preferences } from '@capacitor/preferences';
import { adoptLocalData, hasLocalData } from '../lib/cloudSync';
import { clearAllLocalData } from '../db/database';
import { useSessionStore } from '../store/useSessionStore';
import { useSyncStore } from '../store/useSyncStore';

// Keyed by user id so the prompt re-shows on a different account but never
// twice on the same one. Stored in Preferences (SharedPreferences on Android).
const FLAG_KEY = (userId: string) => `adoption.handled.${userId}`;

async function getFlag(userId: string): Promise<boolean> {
  try {
    const { value } = await Preferences.get({ key: FLAG_KEY(userId) });
    return value === '1';
  } catch {
    return localStorage.getItem(FLAG_KEY(userId)) === '1';
  }
}

async function setFlag(userId: string): Promise<void> {
  try {
    await Preferences.set({ key: FLAG_KEY(userId), value: '1' });
  } catch {
    localStorage.setItem(FLAG_KEY(userId), '1');
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
      const handled = await getFlag(user.id);
      if (handled) {
        if (!cancelled) setShow(false);
        return;
      }
      const hasData = await hasLocalData();
      if (!hasData) {
        // No local data → silently mark handled so we don't keep checking.
        await setFlag(user.id);
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
      await setFlag(user.id);
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
      await setFlag(user.id);
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
        <p className="text-[10px] text-text-muted mt-3 text-center">
          You won't be asked again on this account.
        </p>
      </div>
    </div>
  );
}
