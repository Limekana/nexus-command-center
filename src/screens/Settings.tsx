import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLanguage, SUPPORTED_LANGS, LANGUAGE_NAMES, type Lang } from '../i18n';
import AppHeader from '../components/AppHeader';
import ListRow from '../components/ListRow';
import { useLifeProfileStore } from '../store/useLifeProfileStore';
import { enabledDomains } from '../lib/lifeProfile';
import pkg from '../../package.json';
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
import { setGuestMode } from '../lib/guestMode';

// Auto-lock intervals. The "Never" option was removed deliberately — leaving
// a phone permanently unlocked defeats the purpose of the PIN/biometric gate.
// 60-min cap is the longest sane idle window for an app holding financial,
// academic, and health data.
const autoLockOptions = [1, 5, 15, 30, 60];

export default function Settings() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language || 'en').split('-')[0] as Lang;
  const lifeProfile = useLifeProfileStore((s) => s.profile);
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
    if (!confirm(t('settings.clearKeyConfirm'))) return;
    await clearApiKey(slot);
    if (slot === 'finnhub') setFinnhubKey('');
    else setFinnhubKey2('');
  };

  const onClearAll = async () => {
    if (!confirm(t('settings.clearAllConfirm'))) return;
    // PIN re-entry gate. Without this, briefly-unlocked devices left in
    // someone else's hands could be nuked by a single tap. We require the PIN
    // even though the user has already unlocked the app in this session.
    if (hasPin) {
      const entered = window.prompt(t('settings.pinReentry'));
      if (!entered) return;
      const result = await verifyPin(entered);
      if (!result.ok) {
        if (result.locked) {
          alert(t('settings.wipeLocked', { n: result.locked.remainingSeconds }));
        } else {
          alert(t('settings.wrongPin'));
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
      alert(t('settings.pwResetFail', { msg: error.message }));
    } else {
      alert(t('settings.pwResetSent'));
    }
  };

  const onForceResync = async () => {
    if (!user) return;
    if (!confirm(t('settings.forceResyncConfirm'))) return;
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
      <AppHeader title={t('settings.title')} showAvatar={false} />
      <div className="space-y-3">
        <Section title={t('settings.account')}>
          {user ? (
            <>
              <ListRow label={t('settings.name')} value={userDisplayName(user) || '—'} />
              <ListRow label={t('settings.email')} value={user?.email ?? '—'} />
              <button
                className="btn-ghost w-full mt-2"
                onClick={onChangePassword}
                disabled={!user?.email}
              >
                {t('settings.sendPwReset')}
              </button>
              <button
                className="btn-ghost w-full mt-2 text-danger border-danger/40"
                onClick={() => setSignOutOpen(true)}
              >
                {t('settings.signOut')}
              </button>
            </>
          ) : (
            <>
              {/* Guest mode — surface an upgrade-to-cloud-sync affordance.
                  Tapping clears the guestMode flag and reloads; App.tsx
                  re-routes to the Login screen since `session` is still
                  null. Local Dexie data is preserved (the AdoptionPrompt
                  on Login → app re-entry handles the keep-or-discard
                  choice when the user signs in). */}
              <ListRow label={t('settings.status')} value={t('settings.guestStatus')} />
              <p className="text-xs text-text-muted mt-1 mb-3 leading-relaxed">
                {t('settings.guestBlurb')}
              </p>
              <button
                className="btn w-full"
                onClick={async () => {
                  await setGuestMode(false);
                  window.dispatchEvent(new CustomEvent('nexus:guest-mode-changed'));
                  // App.tsx's gate will re-evaluate and route to Login since
                  // !session && !guestMode is now true. No reload needed —
                  // the CustomEvent listener triggers a state update which
                  // causes the gate's conditional to flip.
                }}
              >
                {t('settings.signIn')}
              </button>
            </>
          )}
        </Section>

        <Section title={t('settings.security')}>
          <Toggle
            label={t('settings.biometricUnlock')}
            sub={bioAvailable ? t('settings.biometricSub') : bioReason || t('settings.biometricUnavail')}
            value={biometricEnabled && bioAvailable}
            onChange={setBiometric}
            locked={!bioAvailable}
          />
          <Toggle
            label={t('settings.pinFallback')}
            sub={t('settings.pinFallbackSub')}
            value={true}
            onChange={() => {}}
            locked
          />
          <div className="py-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm">{t('settings.autoLock')}</div>
              <div className="text-[10px] text-text-muted">{t('settings.autoLockSub')}</div>
            </div>
            <select
              className="input max-w-[120px] py-2"
              value={autoLock}
              onChange={(e) => setAutoLock(Number(e.target.value))}
            >
              {autoLockOptions.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? t('settings.never') : t('settings.minShort', { n: m })}
                </option>
              ))}
            </select>
          </div>
          <Toggle
            label={t('settings.encryption')}
            sub={t('settings.encryptionSub')}
            value={true}
            onChange={() => {}}
            locked
          />
          <button
            className="btn-ghost w-full mt-2 text-warning border-warning/40"
            onClick={lock}
          >
            {t('settings.lockNow')}
          </button>
        </Section>

        <Section title={t('settings.dataSync')}>
          <ListRow
            label={t('settings.cloudSync')}
            value={user ? (isOnline ? t('settings.active') : t('settings.offline')) : t('settings.notSignedIn')}
            tag={{ text: 'Supabase', tone: 'green' }}
          />
          <Toggle
            label={t('settings.offlineMode')}
            sub={t('settings.offlineModeSub')}
            value={true}
            onChange={() => {}}
            locked
          />
          <ListRow label={t('settings.lastSync')} value={lastSyncDisplay} />
          <ListRow
            label={t('settings.pendingWrites')}
            value={pendingCount === 0 ? t('settings.upToDate') : t('settings.queued', { n: pendingCount })}
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
            {syncing ? t('settings.syncing') : isOnline ? t('settings.syncNow') : t('settings.offline')}
          </button>
          <button
            className="btn-ghost w-full mt-2 text-warning border-warning/40"
            onClick={onForceResync}
            disabled={!user || !isOnline || syncing}
          >
            {t('settings.forceResync')}
          </button>
        </Section>

        <Section title={t('settings.preferences')}>
          <div className="py-2 flex items-center justify-between gap-2">
            <div>
              <div className="text-sm">{t('settings.baseCurrency')}</div>
              <div className="text-[10px] text-text-muted">{t('settings.baseCurrencySub')}</div>
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

        <Section title={t('settings.lifeProfile')}>
          <button
            className="w-full py-2 flex items-center justify-between gap-3 text-left active:opacity-80"
            onClick={() => navigate('/settings/life-profile')}
          >
            <div className="min-w-0">
              <div className="text-sm">{t(`lifeProfile.${lifeProfile.preset}`)}</div>
              <div className="text-[10px] text-text-muted truncate">
                {enabledDomains(lifeProfile)
                  .map((k) => `${t(`domains.${k}`)} ${lifeProfile.domains[k]}%`)
                  .join(' · ')}
              </div>
            </div>
            <span className="text-primary text-lg flex-shrink-0">›</span>
          </button>
          <div className="text-[10px] text-text-muted px-1 pb-1">
            {t('settings.lifeProfileBlurb')}
          </div>
        </Section>

        <Section title={t('settings.language')}>
          <div className="grid grid-cols-2 gap-2">
            {SUPPORTED_LANGS.map((code) => (
              <button
                key={code}
                onClick={() => setLanguage(code)}
                aria-pressed={currentLang === code}
                className={`rounded-lg p-2.5 text-sm border transition-colors text-left ${
                  currentLang === code
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-glass-border text-text'
                }`}
              >
                {LANGUAGE_NAMES[code]}
              </button>
            ))}
          </div>
        </Section>

        <Section title={t('settings.notifications')}>
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
              {t('settings.notifPluginUnavail')}
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
            label={t('settings.notifMaster')}
            sub={
              notifMasterEnabled
                ? t('settings.notifMasterOnSub')
                : t('settings.notifMasterOffSub')
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
                        (perm.reason ?? t('settings.permCheckFailed')) +
                          t('settings.permMasterTail'),
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
            label={t('settings.weeklyReviewLabel')}
            sub={t('settings.weeklyReviewSub')}
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
                        (perm.reason ?? t('settings.permCheckFailed')) +
                          t('settings.permWeeklyTail'),
                      );
                      return;
                    }
                    const sched = await scheduleWeeklyReview();
                    if (!sched.ok) {
                      setNotifMsg(sched.reason ?? t('settings.failedSchedule'));
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
            label={t('settings.taskReminders')}
            sub={t('settings.taskRemindersSub')}
            value={notifTasksEnabled}
            locked={!notifMasterEnabled}
            onChange={(on) => handleNotifToggle({
              on,
              category: 'tasks',
              setEnabled: setNotifTasksEnabled,
              requestPerm: requestNotificationPermission,
              setMsg: setNotifMsg,
              t,
              // On flip-on, schedule alarms for every existing incomplete
              // task — otherwise the user has to add a new task before any
              // notifications show up.
              onAfterEnable: rearmTaskReminders,
            })}
          />
          <Toggle
            label={t('settings.budgetAlerts')}
            sub={t('settings.budgetAlertsSub')}
            value={notifBudgetsEnabled}
            locked={!notifMasterEnabled}
            onChange={(on) => handleNotifToggle({
              on,
              category: 'budgets',
              setEnabled: setNotifBudgetsEnabled,
              requestPerm: requestNotificationPermission,
              setMsg: setNotifMsg,
              t,
            })}
          />
          <Toggle
            label={t('settings.portfolioEod')}
            sub={t('settings.portfolioEodSub')}
            value={notifPortfolioEodEnabled}
            locked={!notifMasterEnabled}
            onChange={(on) => handleNotifToggle({
              on,
              category: 'portfolio-eod',
              setEnabled: setNotifPortfolioEodEnabled,
              requestPerm: requestNotificationPermission,
              setMsg: setNotifMsg,
              t,
              // Prime today's 4:05pm + 4:35pm alarms immediately on flip-on
              // (if today is a trading day, etc.). Otherwise the user
              // wouldn't get any notification until the next portfolio
              // refresh or app cold-start.
              onAfterEnable: runPortfolioEodTick,
            })}
          />
          <Toggle
            label={t('settings.marketNews')}
            sub={t('settings.marketNewsSub')}
            value={notifNewsEnabled}
            locked={!notifMasterEnabled}
            onChange={(on) => handleNotifToggle({
              on,
              category: 'news',
              setEnabled: setNotifNewsEnabled,
              requestPerm: requestNotificationPermission,
              setMsg: setNotifMsg,
              t,
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
            label={t('settings.macroHeadlines')}
            sub={t('settings.macroHeadlinesSub')}
            value={notifMacroKeywordsEnabled}
            locked={!notifMasterEnabled || !notifNewsEnabled}
            onChange={setNotifMacroKeywordsEnabled}
          />
          {notifMsg && (
            <div className="text-[10px] text-warning mt-1">{notifMsg}</div>
          )}
        </Section>

        <Section title={t('settings.apiKeys')}>
          {editingSlot ? (
            <div className="space-y-2 py-2">
              <div className="text-[10px] uppercase tracking-wider text-text-muted">
                {editingSlot === 'finnhub' ? t('settings.finnhubSlot1') : t('settings.finnhubSlot2')}
              </div>
              <input
                className="input"
                placeholder={t('settings.finnhubPlaceholder')}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                autoFocus
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <div className="flex gap-2">
                <button className="btn flex-1" onClick={onSaveKey}>
                  {t('common.save')}
                </button>
                <button
                  className="btn-ghost flex-1"
                  onClick={() => setEditingSlot(null)}
                >
                  {t('common.cancel')}
                </button>
              </div>
              <div className="text-[10px] text-text-muted">
                {t('settings.finnhubHelp')}
              </div>
            </div>
          ) : (
            <>
              {!finnhubKey && !finnhubKey2 && (
                <div className="alert alert-warn text-xs mb-2">
                  <span className="w-2 h-2 rounded-full bg-warning" />
                  <span className="flex-1">
                    {t('settings.noFinnhubKey')}
                  </span>
                </div>
              )}
              <FinnhubKeyRow
                label={t('settings.finnhubKey1')}
                value={finnhubKey}
                onEdit={() => {
                  setKeyDraft('');
                  setEditingSlot('finnhub');
                }}
                onClear={() => onClearKey('finnhub')}
              />
              <FinnhubKeyRow
                label={t('settings.finnhubKey2')}
                value={finnhubKey2}
                onEdit={() => {
                  setKeyDraft('');
                  setEditingSlot('finnhub2');
                }}
                onClear={() => onClearKey('finnhub2')}
              />
              <div className="text-[10px] text-text-muted py-1 px-1">
                {t('settings.twoSlots')}
              </div>
              <ListRow label="CoinGecko" tag={{ text: t('settings.tagFree'), tone: 'green' }} />
              <ListRow label="Yahoo Finance" tag={{ text: t('settings.tagFreeFallback'), tone: 'green' }} />
              <ListRow label="Health Connect" tag={{ text: t('settings.tagSamsung'), tone: 'muted' }} />
            </>
          )}
        </Section>

        <Section title={t('settings.apiUsageToday')}>
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
            {t('settings.apiUsageResets')}
          </div>
        </Section>

        <Section title={t('settings.about')}>
          <ListRow label={t('settings.version')} value={pkg.version} />
          <ListRow label={t('settings.studio')} value="Limecore" />
          <ListRow label={t('settings.build')} value={t('settings.buildValue')} />
          <button
            className="btn-ghost w-full mt-2 text-danger border-danger/40"
            onClick={onClearAll}
          >
            {t('settings.clearAllData')}
          </button>
        </Section>
      </div>
      {signOutOpen && createPortal(
        <div className="fixed inset-0 bg-bg/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card-elevated max-w-sm w-full max-h-[90vh] overflow-y-auto">
            <h2 className="font-heading font-bold text-base mb-1">{t('settings.signOutTitle')}</h2>
            <p className="text-xs text-text-muted mb-4">
              {t('settings.signOutBlurb')}
            </p>
            <div className="space-y-2">
              <button
                className="btn w-full"
                disabled={signOutBusy}
                onClick={() => doSignOut(false)}
              >
                {signOutBusy ? t('settings.working') : t('settings.keepLocal')}
              </button>
              <p className="text-[10px] text-text-muted -mt-1 px-1">
                {t('settings.keepLocalSub')}
              </p>
              <button
                className="btn-ghost w-full text-danger border-danger/40"
                disabled={signOutBusy}
                onClick={() => doSignOut(true)}
              >
                {t('settings.wipeLocal')}
              </button>
              <p className="text-[10px] text-text-muted -mt-1 px-1">
                {t('settings.wipeLocalSub')}
              </p>
              <button
                className="btn-ghost w-full"
                disabled={signOutBusy}
                onClick={() => setSignOutOpen(false)}
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
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
  t: (key: string) => string;
  onAfterEnable?: () => Promise<void> | void;
}): Promise<void> {
  const { on, category, setEnabled, requestPerm, setMsg, t, onAfterEnable } = opts;
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
            (perm.reason ?? t('settings.permCheckFailed')) +
              t('settings.permToggleTail'),
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
  const { t } = useTranslation();
  return (
    <div className="py-2 flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        <div className={`text-[10px] ${value ? 'text-text-muted' : 'text-warning'}`}>
          {value ? maskKey(value) : t('settings.notSet')}
        </div>
      </div>
      <div className="flex gap-1 flex-shrink-0">
        <button
          onClick={onEdit}
          className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-sm border border-primary/40 text-primary active:bg-primary/10"
        >
          {value ? t('common.edit') : t('settings.set')}
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
