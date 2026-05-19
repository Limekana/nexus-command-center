import { useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader';
import ListRow from '../components/ListRow';
import { useAuthStore } from '../store/useAuthStore';
import { useSyncStore } from '../store/useSyncStore';
import { useSessionStore, userDisplayName } from '../store/useSessionStore';
import { useSettingsStore, SUPPORTED_CURRENCIES, BaseCurrency } from '../store/useSettingsStore';
import { clearAllLocalData } from '../db/database';
import { getApiKey, setApiKey, clearApiKey, maskKey } from '../api/keys';
import { allBudgetStats, type BudgetStats } from '../api/cache';
import { biometricCapability } from '../utils/biometric';
import {
  notificationsAvailable,
  requestNotificationPermission,
  scheduleWeeklyReview,
  cancelWeeklyReview,
} from '../lib/weeklyNotification';
import { supabase } from '../lib/supabase';

// Auto-lock intervals. The "Never" option was removed deliberately — leaving
// a phone permanently unlocked defeats the purpose of the PIN/biometric gate.
// 60-min cap is the longest sane idle window for an app holding financial,
// academic, and health data.
const autoLockOptions = [1, 5, 15, 30, 60];

export default function Settings() {
  const biometricEnabled = useAuthStore((s) => s.biometricEnabled);
  const setBiometric = useAuthStore((s) => s.setBiometric);
  const autoLock = useAuthStore((s) => s.autoLockMinutes);
  const setAutoLock = useAuthStore((s) => s.setAutoLock);
  const lock = useAuthStore((s) => s.lock);
  const verifyPin = useAuthStore((s) => s.verifyPin);
  const hasPin = useAuthStore((s) => s.hasPin);

  const user = useSessionStore((s) => s.user);
  const signOut = useSessionStore((s) => s.signOut);

  const baseCurrency = useSettingsStore((s) => s.baseCurrency);
  const setBaseCurrency = useSettingsStore((s) => s.setBaseCurrency);
  const weeklyReminder = useSettingsStore((s) => s.weeklyReminder);
  const setWeeklyReminder = useSettingsStore((s) => s.setWeeklyReminder);
  const [notifAvailable, setNotifAvailable] = useState(false);
  const [notifMsg, setNotifMsg] = useState<string | null>(null);

  const isOnline = useSyncStore((s) => s.isOnline);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const pendingCount = useSyncStore((s) => s.pendingCount);
  const syncNow = useSyncStore((s) => s.syncNow);
  const syncing = useSyncStore((s) => s.syncing);

  const lastError = useSyncStore((s) => s.lastError);
  const itemErrors = useSyncStore((s) => s.itemErrors);
  const refreshPending = useSyncStore((s) => s.refreshPending);
  const [finnhubKey, setFinnhubKey] = useState('');
  const [finnhubKey2, setFinnhubKey2] = useState('');
  // Which slot the user is currently editing — null means no editor open.
  const [editingSlot, setEditingSlot] = useState<null | 'finnhub' | 'finnhub2'>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [budgets, setBudgets] = useState<BudgetStats[]>([]);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioReason, setBioReason] = useState('');
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);

  useEffect(() => {
    // Read both slots separately (getApiKey('finnhub') without the slot name
    // would round-robin and obscure which one is empty in the UI).
    void (async () => {
      const { Preferences } = await import('@capacitor/preferences');
      try {
        const k1 = await Preferences.get({ key: 'apikey_finnhub' });
        const k2 = await Preferences.get({ key: 'apikey_finnhub2' });
        setFinnhubKey(k1.value ?? '');
        setFinnhubKey2(k2.value ?? '');
      } catch {
        setFinnhubKey(localStorage.getItem('apikey_finnhub') ?? '');
        setFinnhubKey2(localStorage.getItem('apikey_finnhub2') ?? '');
      }
    })();
    biometricCapability().then((c) => {
      setBioAvailable(c.available);
      setBioReason(c.reason);
    });
    notificationsAvailable().then(setNotifAvailable);
    setBudgets(allBudgetStats());
    void refreshPending();
    // Refresh budget meters every 5s while the screen is open so the user
    // sees usage tick up as the app fires background refreshes.
    const id = setInterval(() => setBudgets(allBudgetStats()), 5000);
    return () => clearInterval(id);
  }, []);

  const onSaveKey = async () => {
    if (!editingSlot || !keyDraft.trim()) return;
    await setApiKey(editingSlot, keyDraft.trim());
    if (editingSlot === 'finnhub') setFinnhubKey(keyDraft.trim());
    else setFinnhubKey2(keyDraft.trim());
    setEditingSlot(null);
    setKeyDraft('');
  };

  const onClearKey = async (slot: 'finnhub' | 'finnhub2') => {
    if (!confirm(`Remove this API key? You'll need to paste it again to use Finnhub.`)) return;
    await clearApiKey(slot);
    if (slot === 'finnhub') setFinnhubKey('');
    else setFinnhubKey2('');
  };

  const onClearAll = async () => {
    if (!confirm('Wipe ALL local data? This cannot be undone.')) return;
    // PIN re-entry gate. Without this, briefly-unlocked devices left in
    // someone else's hands could be nuked by a single tap. We require the PIN
    // even though the user has already unlocked the app in this session.
    if (hasPin) {
      const entered = window.prompt('Re-enter your 6-digit PIN to confirm wipe:');
      if (!entered) return;
      const result = await verifyPin(entered);
      if (!result.ok) {
        if (result.locked) {
          alert(
            `Too many wrong attempts — locked for ${result.locked.remainingSeconds}s. Wipe cancelled.`,
          );
        } else {
          alert('Wrong PIN — wipe cancelled.');
        }
        return;
      }
    }
    await clearAllLocalData();
    localStorage.clear();
    location.reload();
  };

  // Two sign-out modes. Keeping local data is faster on next sign-in (no
  // re-pull); wiping is the right choice on shared/borrowed devices.
  const doSignOut = async (wipe: boolean) => {
    setSignOutBusy(true);
    try {
      await signOut();
      if (wipe) {
        await clearAllLocalData();
        localStorage.clear();
      }
      location.reload();
    } finally {
      setSignOutBusy(false);
    }
  };

  const onChangePassword = async () => {
    if (!user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(user.email);
    if (error) {
      alert(`Could not send reset email: ${error.message}`);
    } else {
      alert('Password reset email sent. Check your inbox.');
    }
  };

  const onForceResync = async () => {
    if (!user) return;
    if (!confirm('Re-queue ALL local data for upload to your cloud account? Useful if sync got stuck.')) return;
    const { adoptLocalData } = await import('../lib/cloudSync');
    await adoptLocalData(user.id);
    await refreshPending();
    await syncNow();
  };

  const lastSyncDisplay = lastSyncedAt
    ? new Intl.DateTimeFormat('fi-FI', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }).format(new Date(lastSyncedAt))
    : '—';

  return (
    <>
      <AppHeader title="Settings" showAvatar={false} />
      <div className="space-y-3">
        <Section title="Account">
          <ListRow label="Name" value={userDisplayName(user) || '—'} />
          <ListRow label="Email" value={user?.email ?? '—'} />
          <button
            className="btn-ghost w-full mt-2"
            onClick={onChangePassword}
            disabled={!user?.email}
          >
            Send Password Reset Email
          </button>
          <button
            className="btn-ghost w-full mt-2 text-danger border-danger/40"
            onClick={() => setSignOutOpen(true)}
          >
            Sign Out
          </button>
        </Section>

        <Section title="Security">
          <Toggle
            label="Biometric Unlock"
            sub={bioAvailable ? 'Fingerprint / Face' : bioReason || 'Unavailable on this device'}
            value={biometricEnabled && bioAvailable}
            onChange={setBiometric}
            locked={!bioAvailable}
          />
          <Toggle
            label="PIN Fallback"
            sub="6-digit passphrase (always on)"
            value={true}
            onChange={() => {}}
            locked
          />
          <div className="py-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm">Auto-lock</div>
              <div className="text-[10px] text-text-muted">After idle</div>
            </div>
            <select
              className="input max-w-[120px] py-2"
              value={autoLock}
              onChange={(e) => setAutoLock(Number(e.target.value))}
            >
              {autoLockOptions.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? 'Never' : `${m} min`}
                </option>
              ))}
            </select>
          </div>
          <Toggle
            label="Encryption"
            sub="Device-encrypted at rest (Android FBE) · TLS 1.3 in transit"
            value={true}
            onChange={() => {}}
            locked
          />
          <button
            className="btn-ghost w-full mt-2 text-warning border-warning/40"
            onClick={lock}
          >
            Lock Now
          </button>
        </Section>

        <Section title="Data & Sync">
          <ListRow
            label="Cloud Sync"
            value={user ? (isOnline ? 'Active' : 'Offline') : 'Not signed in'}
            tag={{ text: 'Supabase', tone: 'green' }}
          />
          <Toggle
            label="Offline Mode"
            sub="Always-on · local first"
            value={true}
            onChange={() => {}}
            locked
          />
          <ListRow label="Last sync" value={lastSyncDisplay} />
          <ListRow
            label="Pending writes"
            value={pendingCount === 0 ? 'Up to date' : `${pendingCount} queued`}
          />
          {lastError && (
            <div className="alert alert-warn text-xs mt-2">
              <span className="w-2 h-2 rounded-full bg-danger" />
              <span className="flex-1">{lastError}</span>
            </div>
          )}
          {itemErrors.length > 0 && (
            <div className="text-[10px] text-text-muted mt-1 space-y-0.5 font-mono">
              {itemErrors.map((e, i) => (
                <div key={i} className="truncate">
                  · {e.entityType}: {e.message}
                </div>
              ))}
            </div>
          )}
          <button
            className="btn-ghost w-full mt-2"
            onClick={syncNow}
            disabled={!isOnline || syncing}
          >
            {syncing ? 'Syncing…' : isOnline ? 'Sync Now' : 'Offline'}
          </button>
          <button
            className="btn-ghost w-full mt-2 text-warning border-warning/40"
            onClick={onForceResync}
            disabled={!user || !isOnline || syncing}
          >
            Force Re-sync All Local Data
          </button>
        </Section>

        <Section title="Preferences">
          <div className="py-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm">Base Currency</div>
              <div className="text-[10px] text-text-muted">Portfolio totals · FX rates daily</div>
            </div>
            <select
              className="input max-w-[120px] py-2"
              value={baseCurrency}
              onChange={(e) => setBaseCurrency(e.target.value as BaseCurrency)}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </Section>

        <Section title="Notifications">
          <Toggle
            label="Weekly Review"
            sub={
              notifAvailable
                ? 'Sunday 18:00 · summary of finance, study, fitness, tasks'
                : 'Native push only — install the Android build to enable'
            }
            value={weeklyReminder}
            onChange={async (on) => {
              if (!notifAvailable) {
                setNotifMsg('Notifications require the native Android build.');
                return;
              }
              setNotifMsg(null);
              if (on) {
                const perm = await requestNotificationPermission();
                if (!perm.ok) {
                  setNotifMsg(perm.reason ?? 'Permission denied.');
                  return;
                }
                const sched = await scheduleWeeklyReview();
                if (!sched.ok) {
                  setNotifMsg(sched.reason ?? 'Failed to schedule.');
                  return;
                }
                await setWeeklyReminder(true);
              } else {
                await cancelWeeklyReview();
                await setWeeklyReminder(false);
              }
            }}
          />
          {notifMsg && (
            <div className="text-[10px] text-warning mt-1">{notifMsg}</div>
          )}
        </Section>

        <Section title="API Keys">
          {editingSlot ? (
            <div className="space-y-2 py-2">
              <div className="text-[10px] uppercase tracking-wider text-text-muted">
                {editingSlot === 'finnhub' ? 'Finnhub Key (slot 1)' : 'Finnhub Key (slot 2)'}
              </div>
              <input
                className="input"
                placeholder="Paste your Finnhub API key"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                autoFocus
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="flex gap-2">
                <button className="btn flex-1" onClick={onSaveKey}>
                  Save
                </button>
                <button
                  className="btn-ghost flex-1"
                  onClick={() => setEditingSlot(null)}
                >
                  Cancel
                </button>
              </div>
              <div className="text-[10px] text-text-muted">
                Get a free key at finnhub.io · 60 calls/min per key
              </div>
            </div>
          ) : (
            <>
              {!finnhubKey && !finnhubKey2 && (
                <div className="alert alert-warn text-xs mb-2">
                  <span className="w-2 h-2 rounded-full bg-warning" />
                  <span className="flex-1">
                    No Finnhub key configured — US stock fundamentals, news and
                    earnings will fall back to Yahoo. Add a key for richer data.
                  </span>
                </div>
              )}
              <FinnhubKeyRow
                label="Finnhub Key 1"
                value={finnhubKey}
                onEdit={() => {
                  setKeyDraft('');
                  setEditingSlot('finnhub');
                }}
                onClear={() => onClearKey('finnhub')}
              />
              <FinnhubKeyRow
                label="Finnhub Key 2 (optional)"
                value={finnhubKey2}
                onEdit={() => {
                  setKeyDraft('');
                  setEditingSlot('finnhub2');
                }}
                onClear={() => onClearKey('finnhub2')}
              />
              <div className="text-[10px] text-text-muted py-1 px-1">
                Two slots round-robin per call — doubles your 60/min headroom.
              </div>
              <ListRow label="CoinGecko" tag={{ text: 'Free', tone: 'green' }} />
              <ListRow label="Yahoo Finance" tag={{ text: 'Free · fallback', tone: 'green' }} />
              <ListRow label="Health Connect" tag={{ text: 'Samsung Android', tone: 'muted' }} />
            </>
          )}
        </Section>

        <Section title="API Usage Today">
          {budgets.map((b) => {
            const pct = b.max > 0 ? Math.min(100, (b.used / b.max) * 100) : 0;
            const exhausted = b.used >= b.max;
            return (
              <div key={b.provider} className="py-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="capitalize">{b.provider}</span>
                  <span className={exhausted ? 'text-danger' : 'text-text-muted'}>
                    {b.used} / {b.max}
                  </span>
                </div>
                <div className="h-1 bg-surface2 rounded-sm mt-1 overflow-hidden">
                  <div
                    className={`h-full ${exhausted ? 'bg-danger' : pct > 75 ? 'bg-warning' : 'bg-primary'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          <div className="text-[10px] text-text-muted">
            Resets at local midnight. Cached responses don't count against the budget.
          </div>
        </Section>

        <Section title="About">
          <ListRow label="Version" value="3.0 (MVP)" />
          <ListRow label="Studio" value="Limecore" />
          <ListRow label="Build" value="Capacitor · Web → Android" />
          <button
            className="btn-ghost w-full mt-2 text-danger border-danger/40"
            onClick={onClearAll}
          >
            Clear All Local Data
          </button>
        </Section>
      </div>
      {signOutOpen && (
        <div className="fixed inset-0 bg-bg/90 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="card-elevated max-w-sm w-full">
            <h2 className="font-heading font-bold text-base mb-1">Sign out?</h2>
            <p className="text-xs text-text-muted mb-4">
              Choose what happens to data already saved on this device. Cloud data is untouched either way.
            </p>
            <div className="space-y-2">
              <button
                className="btn w-full"
                disabled={signOutBusy}
                onClick={() => doSignOut(false)}
              >
                {signOutBusy ? 'Working…' : 'Keep local data'}
              </button>
              <p className="text-[10px] text-text-muted -mt-1 px-1">
                Faster next sign-in. Choose this on your own phone.
              </p>
              <button
                className="btn-ghost w-full text-danger border-danger/40"
                disabled={signOutBusy}
                onClick={() => doSignOut(true)}
              >
                Sign out &amp; wipe local data
              </button>
              <p className="text-[10px] text-text-muted -mt-1 px-1">
                Recommended on shared or borrowed devices.
              </p>
              <button
                className="btn-ghost w-full"
                disabled={signOutBusy}
                onClick={() => setSignOutOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Row for one Finnhub key slot. Shows masked value + "Set" button when empty,
// or masked value + edit/remove actions when populated. Keeps the visual
// uniform between filled and empty so users see the slot exists.
function FinnhubKeyRow({
  label,
  value,
  onEdit,
  onClear,
}: {
  label: string;
  value: string;
  onEdit: () => void;
  onClear: () => void;
}) {
  return (
    <div className="py-2 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        <div className={`text-[10px] ${value ? 'text-text-muted' : 'text-warning'}`}>
          {value ? maskKey(value) : 'Not set'}
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={onEdit}
          className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm border border-primary/40 text-primary active:bg-primary/10"
        >
          {value ? 'Edit' : 'Set'}
        </button>
        {value && (
          <button
            onClick={onClear}
            className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm border border-border text-text-muted active:text-danger active:border-danger"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="sec mb-2">{title}</div>
      <div className="card space-y-1">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  sub,
  value,
  onChange,
  locked,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  locked?: boolean;
}) {
  return (
    <div className="py-2 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {sub && <div className="text-[10px] text-text-muted">{sub}</div>}
      </div>
      <button
        onClick={() => !locked && onChange(!value)}
        className={`w-11 h-6 rounded-full p-0.5 transition-colors flex-shrink-0 ${
          value ? 'bg-primary' : 'bg-surface2 border border-border'
        } ${locked ? 'opacity-60' : ''}`}
        disabled={locked}
        aria-pressed={value}
      >
        <div
          className={`w-5 h-5 rounded-full bg-bg shadow transition-transform ${
            value ? 'translate-x-5' : ''
          }`}
        />
      </button>
    </div>
  );
}
