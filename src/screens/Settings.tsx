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
import { cancelCategory, type NotificationCategory } from '../lib/notifications';
import { rearmTaskReminders } from '../lib/taskReminders';
import { runPortfolioEodTick } from '../lib/portfolioEod';
import { runNewsAlertsTick } from '../lib/newsAlerts';
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
  const notifMasterEnabled = useSettingsStore((s) => s.notifMasterEnabled);
  const setNotifMasterEnabled = useSettingsStore((s) => s.setNotifMasterEnabled);
  const notifTasksEnabled = useSettingsStore((s) => s.notifTasksEnabled);
  const setNotifTasksEnabled = useSettingsStore((s) => s.setNotifTasksEnabled);
  const notifBudgetsEnabled = useSettingsStore((s) => s.notifBudgetsEnabled);
  const setNotifBudgetsEnabled = useSettingsStore((s) => s.setNotifBudgetsEnabled);
  const notifPortfolioEodEnabled = useSettingsStore((s) => s.notifPortfolioEodEnabled);
  const setNotifPortfolioEodEnabled = useSettingsStore((s) => s.setNotifPortfolioEodEnabled);
  const notifNewsEnabled = useSettingsStore((s) => s.notifNewsEnabled);
  const setNotifNewsEnabled = useSettingsStore((s) => s.setNotifNewsEnabled);
  const notifMacroKeywordsEnabled = useSettingsStore((s) => s.notifMacroKeywordsEnabled);
  const setNotifMacroKeywordsEnabled = useSettingsStore((s) => s.setNotifMacroKeywordsEnabled);
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
          {/* Informational warning when the plugin reports unavailable. Toggles
              below are NOT locked anymore — the previous behavior gated them
              behind `notifAvailable`, but on devices where the Capacitor
              LocalNotifications bridge is wedged, notificationsAvailable()
              returns false and ALL clicks were silently ignored. Now the user
              can always toggle; downstream alert modules check their own
              permission state before scheduling, so a misleading "off" state
              never produces unwanted alerts. */}
          {!notifAvailable && (
            <div className="text-[10px] text-warning px-1 py-1">
              Notifications plugin unavailable. Toggles still record your
              choice, but actual notifications need a working native build +
              OS-level permission to fire.
            </div>
          )}
          {/* Master kill-switch. Off = nothing fires regardless of sub-toggle
              state. Flipping ON triggers the OS permission prompt (same flow
              the first-launch modal uses), so this works as the fallback if
              the modal didn't show. Flipping OFF cancels every pending
              notification across all 5 categories. Sub-toggles retain their
              individual state so the user can toggle the master back on
              without losing prior preferences. */}
          <Toggle
            label="Notifications"
            sub={
              notifMasterEnabled
                ? 'Master switch · individual types below'
                : 'All notifications off — turn on to enable categories below'
            }
            value={notifMasterEnabled}
            onChange={async (on) => {
              setNotifMsg(null);
              if (on) {
                // OPTIMISTIC FLIP — same rationale as handleNotifToggle:
                // flip first so the UI is responsive, request perm in the
                // background, never block. If the plugin bridge hangs we
                // still have a working toggle; downstream scheduling will
                // succeed once perm is actually granted at the OS level
                // (and silently no-op until then).
                await setNotifMasterEnabled(true);
                // Default the 4 main categories ON the FIRST time master
                // is enabled (matches the explainer modal's behavior). If
                // the user has flipped these before, leave their picks alone.
                const anySubOn =
                  notifTasksEnabled || notifBudgetsEnabled ||
                  notifPortfolioEodEnabled || notifNewsEnabled || weeklyReminder;
                if (!anySubOn) {
                  await Promise.all([
                    setNotifTasksEnabled(true),
                    setNotifBudgetsEnabled(true),
                    setNotifPortfolioEodEnabled(true),
                    setNotifNewsEnabled(true),
                  ]);
                  void rearmTaskReminders();
                  void runPortfolioEodTick();
                  void runNewsAlertsTick();
                }
                // Background perm check. If it fails (most likely the
                // plugin bridge is wedged), warn the user but leave the
                // toggle on — they may have already granted at the OS
                // level, in which case downstream scheduling works fine
                // even though our perm-check call hangs/fails.
                void (async () => {
                  try {
                    const perm = await requestNotificationPermission();
                    if (!perm.ok) {
                      setNotifMsg(
                        (perm.reason ?? 'Permission check failed.') +
                          ' If notifications already work at the OS level you can ignore this.',
                      );
                    }
                  } catch (e) {
                    setNotifMsg((e as Error).message);
                  }
                })();
              } else {
                await setNotifMasterEnabled(false);
                // Wipe every pending alarm across all five categories so
                // nothing fires after the user has explicitly turned the
                // master switch off. Sub-toggles keep their bool state.
                await Promise.all([
                  cancelCategory('weekly-review'),
                  cancelCategory('tasks'),
                  cancelCategory('budgets'),
                  cancelCategory('portfolio-eod'),
                  cancelCategory('news'),
                ]);
              }
            }}
          />
          <Toggle
            label="Weekly Review"
            sub="Sunday 18:00 · summary of finance, study, fitness, tasks"
            value={weeklyReminder}
            locked={!notifMasterEnabled}
            onChange={async (on) => {
              setNotifMsg(null);
              if (on) {
                // Optimistic — flip the toggle, then schedule + check perm
                // in the background. Same rationale as the master toggle:
                // if the plugin bridge hangs, the UI shouldn't.
                await setWeeklyReminder(true);
                void (async () => {
                  try {
                    const perm = await requestNotificationPermission();
                    if (!perm.ok) {
                      setNotifMsg(
                        (perm.reason ?? 'Permission check failed.') +
                          ' Toggle is on but reminder won’t fire until permission is granted.',
                      );
                      return;
                    }
                    const sched = await scheduleWeeklyReview();
                    if (!sched.ok) {
                      setNotifMsg(sched.reason ?? 'Failed to schedule.');
                    }
                  } catch (e) {
                    setNotifMsg((e as Error).message);
                  }
                })();
              } else {
                await setWeeklyReminder(false);
                await cancelWeeklyReview();
              }
            }}
          />
          <Toggle
            label="Task Reminders"
            sub="Heads-up when a task is due"
            value={notifTasksEnabled}
            locked={!notifMasterEnabled}
            onChange={(on) => handleNotifToggle({
              on,
              category: 'tasks',
              setEnabled: setNotifTasksEnabled,
              requestPerm: requestNotificationPermission,
              setMsg: setNotifMsg,
              // On flip-on, schedule alarms for every existing incomplete
              // task — otherwise the user has to add a new task before any
              // notifications show up.
              onAfterEnable: rearmTaskReminders,
            })}
          />
          <Toggle
            label="Budget Alerts"
            sub="When a category nears or exceeds its monthly cap"
            value={notifBudgetsEnabled}
            locked={!notifMasterEnabled}
            onChange={(on) => handleNotifToggle({
              on,
              category: 'budgets',
              setEnabled: setNotifBudgetsEnabled,
              requestPerm: requestNotificationPermission,
              setMsg: setNotifMsg,
            })}
          />
          <Toggle
            label="Portfolio End of Day"
            sub="Recap of today's move on US market close"
            value={notifPortfolioEodEnabled}
            locked={!notifMasterEnabled}
            onChange={(on) => handleNotifToggle({
              on,
              category: 'portfolio-eod',
              setEnabled: setNotifPortfolioEodEnabled,
              requestPerm: requestNotificationPermission,
              setMsg: setNotifMsg,
              // Prime today's 4:05pm + 4:35pm alarms immediately on flip-on
              // (if today is a trading day, etc.). Otherwise the user
              // wouldn't get any notification until the next portfolio
              // refresh or app cold-start.
              onAfterEnable: runPortfolioEodTick,
            })}
          />
          <Toggle
            label="Market News"
            sub="Stories about tickers you own + major market moves"
            value={notifNewsEnabled}
            locked={!notifMasterEnabled}
            onChange={(on) => handleNotifToggle({
              on,
              category: 'news',
              setEnabled: setNotifNewsEnabled,
              requestPerm: requestNotificationPermission,
              setMsg: setNotifMsg,
              // Scan whatever news is already in store. If the portfolio
              // hasn't refreshed yet this is a no-op; the next refresh
              // will populate news and fire then.
              onAfterEnable: runNewsAlertsTick,
            })}
          />
          {/* Macro-headline classifier is noisier (Fed/CPI/jobs keywords on
              general headlines), so it's off by default and gated under News.
              When News is off this toggle does nothing — we lock it visually
              to make that clear. */}
          <Toggle
            label="Include Macro Headlines"
            sub="Fed, CPI, jobs, FOMC, inflation, recession"
            value={notifMacroKeywordsEnabled}
            locked={!notifMasterEnabled || !notifNewsEnabled}
            onChange={setNotifMacroKeywordsEnabled}
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
          <ListRow label="Version" value="1.0.1" />
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

// Shared turn-on/turn-off flow for every per-category notification toggle.
//
// Turn ON:
//   1. Request OS permission (no-op if already granted)
//   2. If denied, surface the reason via setMsg and bail — toggle stays off
//   3. Save the enabled flag
//   4. Optional `onAfterEnable` hook — used by categories that maintain
//      per-row schedules (Task Reminders re-arms every existing task,
//      Portfolio EoD primes its 4:05pm + 4:35pm alarms, etc.). Without this
//      hook the user would have to add a new task / wait for the next
//      portfolio refresh before any notifications actually appeared.
//
// Turn OFF:
//   1. Save the disabled flag immediately so any racing scheduler bails
//   2. Cancel every pending notification in the category — without this,
//      already-scheduled alarms would still fire after the user turned the
//      category off
// Optimistic toggle flow. The OLD version awaited requestPerm() before
// flipping the toggle — fine when the plugin works, but a hard hang for
// users where the Capacitor LocalNotifications bridge gets wedged
// (checkPermissions/requestPermissions never resolve, even with OS perm
// granted). Symptom: the toggle visually doesn't move because the await
// in onChange never returns.
//
// New flow:
//   1. Flip the toggle state immediately so the UI is responsive.
//   2. Kick the perm request in the background (don't await).
//   3. If perm comes back NOT ok, show a warning — but leave the toggle ON.
//      The downstream schedulers (budgetAlerts, taskReminders, etc.) all
//      do their own permission check before scheduling, so if perm really
//      is denied nothing fires. The toggle being "on" is just the user's
//      stated intent; whether notifs actually appear depends on OS perm.
//   4. If perm comes back ok, no message — silent success.
//
// Turn-off path stays synchronous because cancelling is fast and the user
// expects "off" to mean "stop scheduling" immediately.
async function handleNotifToggle(opts: {
  on: boolean;
  category: NotificationCategory;
  setEnabled: (on: boolean) => Promise<void>;
  requestPerm: () => Promise<{ ok: boolean; reason?: string }>;
  setMsg: (msg: string | null) => void;
  onAfterEnable?: () => Promise<void> | void;
}): Promise<void> {
  const { on, category, setEnabled, requestPerm, setMsg, onAfterEnable } = opts;
  setMsg(null);
  if (on) {
    // Step 1 — flip immediately. UI is responsive even if perm hangs.
    await setEnabled(true);
    // Step 2 — kick perm request in background. NOT awaited.
    void (async () => {
      try {
        const perm = await requestPerm();
        if (!perm.ok) {
          setMsg(
            (perm.reason ?? 'Permission check failed.') +
              ' Toggle is on but notifications may not fire until permission is granted in Android Settings.',
          );
        }
      } catch (e) {
        setMsg((e as Error).message);
      }
    })();
    // Step 3 — run the per-category re-arm hook (also non-blocking from
    // the toggle's perspective; schedulers handle their own errors).
    if (onAfterEnable) {
      void (async () => {
        try {
          await onAfterEnable();
        } catch (e) {
          setMsg((e as Error).message);
        }
      })();
    }
  } else {
    await setEnabled(false);
    await cancelCategory(category);
  }
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
