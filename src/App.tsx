import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { useAuthStore } from './store/useAuthStore';
import { useSessionStore } from './store/useSessionStore';
import { useSyncStore } from './store/useSyncStore';
import { seedIfEmpty } from './db/seed';
import { clearAllLocalData } from './db/database';
import { supabase } from './lib/supabase';
import { startRealtime, stopRealtime } from './lib/realtime';
import { hydrateStudiesFromCloud, hydrateHabitsFromCloud } from './lib/cloudSync';
import { useStudiesStore } from './store/useStudiesStore';
import { isGuestMode } from './lib/guestMode';
import AdoptionPrompt from './components/AdoptionPrompt';
import NotificationsExplainerModal from './components/NotificationsExplainerModal';
import LockScreen from './screens/LockScreen';
import Login from './screens/auth/Login';
import Signup from './screens/auth/Signup';
import AppShell from './components/AppShell';
import Dashboard from './screens/Dashboard';
import FinanceOverview from './screens/finance/FinanceOverview';
import AddTransaction from './screens/finance/AddTransaction';
import Portfolio from './screens/finance/Portfolio';
import ManageBudgets from './screens/finance/ManageBudgets';
import ManageHoldings from './screens/finance/ManageHoldings';
import ManageLots from './screens/finance/ManageLots';
import NetWorth from './screens/finance/NetWorth';
import AccountDetail from './screens/finance/AccountDetail';
import WhatIf from './screens/finance/WhatIf';
import Watchlist from './screens/finance/Watchlist';
import News from './screens/finance/News';
import Insights from './screens/finance/Insights';
import SavingsGoals from './screens/finance/SavingsGoals';
import StudiesOverview from './screens/studies/StudiesOverview';
import StudySessions from './screens/studies/StudySessions';
import Library from './screens/studies/Library';
import AddReading from './screens/studies/AddReading';
import FitnessOverview from './screens/fitness/FitnessOverview';
import LogWorkout from './screens/fitness/LogWorkout';
import TasksOverview from './screens/tasks/TasksOverview';
import AddTask from './screens/tasks/AddTask';
import HabitsOverview from './screens/habits/HabitsOverview';
import AddHabit from './screens/habits/AddHabit';
import Life from './screens/Life';
import WeeklyReview from './screens/WeeklyReview';
import YearReview from './screens/YearReview';
import Goals from './screens/Goals';
import Settings from './screens/Settings';
import { onNotificationTap, scheduleWeeklyReview } from './lib/weeklyNotification';
import { onNotificationAction } from './lib/notifications';
import { installRatingHistory } from './lib/ratingHistory';
import { useTaskStore } from './store/useTaskStore';
import { useSettingsStore } from './store/useSettingsStore';
import { useHabitsStore } from './store/useHabitsStore';

export default function App() {
  const unlocked = useAuthStore((s) => s.unlocked);
  const initAuth = useAuthStore((s) => s.init);
  const initSync = useSyncStore((s) => s.init);
  const session = useSessionStore((s) => s.session);
  const sessionLoading = useSessionStore((s) => s.loading);
  const initSession = useSessionStore((s) => s.init);
  const syncNow = useSyncStore((s) => s.syncNow);

  // Guest-mode flag — when true, App.tsx skips the auth gate even with no
  // Supabase session. Loaded once on mount, then re-evaluated whenever the
  // Login screen dispatches `nexus:guest-mode-changed` (after tap on
  // "Continue as guest"). Settings clears the flag when the user signs in.
  // `null` while the initial read is in flight — render the splash same as
  // the session-loading branch so we don't flash the Login screen for
  // returning guest-mode users.
  const [guestMode, setGuestModeState] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      // Init session first — we need to know auth state before anything else.
      await initSession();

      // Read guest flag in parallel with session restore. Both inform the
      // gate logic below; we resolve to a final state once both are known.
      const guest = await isGuestMode();
      setGuestModeState(guest);

      // One-time wipe of prior seeded sample data.
      if (localStorage.getItem('nexus.seeded.v1') && !localStorage.getItem('nexus.wiped.v1')) {
        await clearAllLocalData();
        localStorage.removeItem('nexus.seeded.v1');
        localStorage.setItem('nexus.wiped.v1', '1');
      }
      await seedIfEmpty();
      await initAuth();
      initSync();
      // v1.2 — install the Insights rating-history observer. Runs once;
      // subsequent installs replace the same singleton observer. Must be
      // installed BEFORE any recomputeAll call so the very first batch
      // populates the history table + fires tier-change pushes correctly.
      installRatingHistory();
    })();
  }, []);

  // Listen for guest-mode toggle events fired by Login.tsx and Settings.tsx.
  // The Preferences plugin doesn't emit changes natively, so we use a
  // CustomEvent contract on `window` to keep the gate reactive.
  useEffect(() => {
    const onGuestChange = () => {
      void (async () => {
        const guest = await isGuestMode();
        setGuestModeState(guest);
      })();
    };
    window.addEventListener('nexus:guest-mode-changed', onGuestChange);
    return () => window.removeEventListener('nexus:guest-mode-changed', onGuestChange);
  }, []);

  // Auto-sync when a session becomes available (sign-in or app reopen with
  // valid session). Adoption prompt — if shown — runs its own sync after the
  // user makes a choice, so this won't double-fire problematically.
  //
  // Critical ordering for StudyDesk hydration:
  //   1. Run an explicit fetch on subjects/grades/study_sessions (StudyDesk
  //      owns these tables in the shared Supabase project) and write the
  //      results to Dexie. Realtime ONLY delivers deltas from the moment you
  //      subscribe — any pre-existing rows would otherwise be invisible to
  //      NCC until the user edited them in StudyDesk.
  //   2. Reload the studies store so the UI reflects the hydrated rows.
  //   3. THEN open the Realtime subscription so future deltas merge cleanly.
  //   4. Kick the full background syncNow() afterward for the other tables
  //      (transactions, portfolio, etc.) — non-blocking.
  useEffect(() => {
    if (!session) {
      stopRealtime();
      return;
    }
    const userId = session.user.id;
    (async () => {
      try {
        const result = await hydrateStudiesFromCloud(userId);
        console.log(
          `[app-init] studies hydrated: subjects=${result.subjects}, grades=${result.grades}, study_sessions=${result.studySessions}, errors=${result.errors.length}`,
        );
        if (result.errors.length > 0) {
          console.warn('[app-init] hydration errors:', result.errors);
        }
        // Refresh the studies store from Dexie so the just-written rows
        // surface immediately. Other stores get refreshed by syncNow() below.
        await useStudiesStore.getState().load();
      } catch (e) {
        console.warn('[app-init] studies hydration threw:', e);
      }
      // v1.2 — habits hydration runs as a sibling of studies. Same shape:
      // pull all rows for the user into Dexie, refresh the store, then let
      // the realtime channel handle subsequent deltas. Fire-and-forget; a
      // failure here doesn't block the rest of app-init.
      try {
        const habitsResult = await hydrateHabitsFromCloud(userId);
        console.log(
          `[app-init] habits hydrated: habits=${habitsResult.habits}, completions=${habitsResult.completions}, errors=${habitsResult.errors.length}`,
        );
        if (habitsResult.errors.length > 0) {
          console.warn('[app-init] habits hydration errors:', habitsResult.errors);
        }
        await useHabitsStore.getState().load();
      } catch (e) {
        console.warn('[app-init] habits hydration threw:', e);
      }
      // Now open the realtime channel for future deltas.
      // v1.2.1 — AUDIT-FSG-5: pass userId so per-table subscriptions can
      // scope to `user_id=eq.<uid>` on tables without a sharing surface.
      startRealtime(userId);
      // Fire-and-forget the full sync for everything else (push pending
      // queue + pull transactions/portfolio/tasks/etc.).
      void syncNow();
    })();
  }, [session?.user?.id]);

  // OAuth deep-link handler: when Supabase redirects back via
  // com.limecore.nexus://login-callback?code=... after Google sign-in,
  // exchange the code for a session.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const sub = CapacitorApp.addListener('appUrlOpen', async (event) => {
      try {
        const url = event.url;
        if (!url.startsWith('com.limecore.nexus://login-callback')) return;
        // Extract the auth code from the URL.
        const qs = url.split('?')[1] ?? '';
        const params = new URLSearchParams(qs);
        const code = params.get('code');
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        }
      } finally {
        // Close the in-app browser (Chrome Custom Tab) once we're back.
        try {
          await Browser.close();
        } catch {
          /* not always open */
        }
      }
    });
    return () => {
      sub.then((s) => s.remove());
    };
  }, []);

  // 1. Wait for session restoration AND guest flag read before deciding.
  // guestMode === null means the Preferences read hasn't resolved yet —
  // render the splash same as session-loading to avoid flashing the Login
  // screen for returning guest-mode users on cold start.
  if (sessionLoading || guestMode === null) {
    return (
      <div className="min-h-full bg-bg text-text flex items-center justify-center">
        <div className="text-text-muted text-xs uppercase tracking-wider">Loading</div>
      </div>
    );
  }

  // 2. No Supabase session AND not in guest mode → show auth screens.
  // Guest-mode users skip this gate and land directly in the app; their
  // Supabase-backed features (sync, SSO publishing, adoption prompt cloud
  // flag) all no-op gracefully when `session` is null.
  if (!session && !guestMode) {
    return (
      <Routes>
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
    );
  }

  // 3. Session OK (or guest mode active) but device not unlocked → LockScreen.
  // PIN/biometric still gates a guest-mode session if the user has set one,
  // so the lock UX stays consistent regardless of cloud auth state.
  if (!unlocked) {
    return <LockScreen />;
  }

  // 4. Fully authenticated. Render the app.
  return (
    <>
      <AdoptionPrompt />
      {/* First-launch (post-upgrade) explainer for notifications. Renders
          nothing once the user has dismissed it once via either path
          ("Enable Notifications" or "Not Now"). Native-only — see the
          component for the rationale. */}
      <NotificationsExplainerModal />
      <NotificationBridge />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/finance" element={<FinanceOverview />} />
          <Route path="/finance/add" element={<AddTransaction />} />
          <Route path="/finance/portfolio" element={<Portfolio />} />
          <Route path="/finance/portfolio/manage" element={<ManageHoldings />} />
          <Route path="/finance/portfolio/lots/:id" element={<ManageLots />} />
          <Route path="/finance/portfolio/watchlist" element={<Watchlist />} />
          <Route path="/finance/news" element={<News />} />
          <Route path="/finance/insights" element={<Insights />} />
          <Route path="/finance/savings" element={<SavingsGoals />} />
          <Route path="/finance/networth" element={<NetWorth />} />
          {/* v1.2 follow-up — CTO Account refactor. Per-account statement
              view: derived running balance + transaction history. */}
          <Route path="/finance/account/:id" element={<AccountDetail />} />
          <Route path="/finance/whatif" element={<WhatIf />} />
          <Route path="/finance/budgets" element={<ManageBudgets />} />
          <Route path="/studies" element={<StudiesOverview />} />
          <Route path="/studies/sessions" element={<StudySessions />} />
          <Route path="/studies/library" element={<Library />} />
          <Route path="/studies/library/add" element={<AddReading />} />
          <Route path="/fitness" element={<FitnessOverview />} />
          <Route path="/fitness/log" element={<LogWorkout />} />
          <Route path="/tasks" element={<TasksOverview />} />
          <Route path="/tasks/add" element={<AddTask />} />
          <Route path="/habits" element={<HabitsOverview />} />
          <Route path="/habits/add" element={<AddHabit />} />
          <Route path="/life" element={<Life />} />
          <Route path="/review" element={<WeeklyReview />} />
          <Route path="/review/year" element={<YearReview />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

/**
 * Mounts inside the Router so it can `useNavigate()` to route on notification
 * taps. Also re-schedules the Sunday Weekly Review push on every app start
 * if the user has the toggle enabled — Android may drop alarms after reboot
 * or doze, so re-issuing the schedule each session is cheap insurance.
 */
function NotificationBridge() {
  const navigate = useNavigate();
  const weeklyReminder = useSettingsStore((s) => s.weeklyReminder);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const loadSettings = useSettingsStore((s) => s.load);

  // Settings need to be loaded before we can decide whether to schedule.
  useEffect(() => {
    if (!settingsLoaded) void loadSettings();
  }, [settingsLoaded, loadSettings]);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (weeklyReminder) {
      void scheduleWeeklyReview();
    }
  }, [settingsLoaded, weeklyReminder]);

  useEffect(() => {
    let unsub: () => void = () => {};
    onNotificationTap((route) => navigate(route)).then((u) => {
      unsub = u;
    });
    return () => unsub();
  }, [navigate]);

  // Action-button taps. Each action ID maps to a different side-effect:
  //   'done'  → mark a task complete (extra.taskId)
  //   'view'  → open a target route (e.g. /finance/budgets with cat id)
  //   future actions add a case here. Unknown IDs are silently dropped.
  // The notification is auto-dismissed by NotificationActionReceiver
  // before this fires, so no manual cancel is needed.
  useEffect(() => {
    let unsub: () => void = () => {};
    onNotificationAction((payload) => {
      const { actionId, route, extra } = payload;
      if (actionId === 'done' && extra && typeof extra.taskId === 'string') {
        // Fire-and-forget — toggleComplete handles its own persistence.
        void useTaskStore.getState().toggleComplete(extra.taskId);
        return;
      }
      if (actionId === 'view' && route) {
        navigate(route);
        return;
      }
      // Unknown actionId — log so we notice if a new scheduler ships an
      // action ID without a corresponding handler.
      console.warn('[notifications] unhandled action', actionId);
    }).then((u) => { unsub = u; });
    return () => unsub();
  }, [navigate]);

  return null;
}
