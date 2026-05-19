import { useEffect } from 'react';
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
import AdoptionPrompt from './components/AdoptionPrompt';
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
import WhatIf from './screens/finance/WhatIf';
import Watchlist from './screens/finance/Watchlist';
import StudiesOverview from './screens/studies/StudiesOverview';
import CSVImport from './screens/studies/CSVImport';
import ImportPreview from './screens/studies/ImportPreview';
import StudySessions from './screens/studies/StudySessions';
import Library from './screens/studies/Library';
import AddReading from './screens/studies/AddReading';
import FitnessOverview from './screens/fitness/FitnessOverview';
import LogWorkout from './screens/fitness/LogWorkout';
import TasksOverview from './screens/tasks/TasksOverview';
import AddTask from './screens/tasks/AddTask';
import WeeklyReview from './screens/WeeklyReview';
import YearReview from './screens/YearReview';
import Goals from './screens/Goals';
import Settings from './screens/Settings';
import { onNotificationTap, scheduleWeeklyReview } from './lib/weeklyNotification';
import { useSettingsStore } from './store/useSettingsStore';

export default function App() {
  const unlocked = useAuthStore((s) => s.unlocked);
  const initAuth = useAuthStore((s) => s.init);
  const initSync = useSyncStore((s) => s.init);
  const session = useSessionStore((s) => s.session);
  const sessionLoading = useSessionStore((s) => s.loading);
  const initSession = useSessionStore((s) => s.init);
  const syncNow = useSyncStore((s) => s.syncNow);

  useEffect(() => {
    (async () => {
      // Init session first — we need to know auth state before anything else.
      await initSession();

      // One-time wipe of prior seeded sample data.
      if (localStorage.getItem('nexus.seeded.v1') && !localStorage.getItem('nexus.wiped.v1')) {
        await clearAllLocalData();
        localStorage.removeItem('nexus.seeded.v1');
        localStorage.setItem('nexus.wiped.v1', '1');
      }
      await seedIfEmpty();
      await initAuth();
      initSync();
    })();
  }, []);

  // Auto-sync when a session becomes available (sign-in or app reopen with
  // valid session). Adoption prompt — if shown — runs its own sync after the
  // user makes a choice, so this won't double-fire problematically.
  //
  // Also start/stop Realtime here: while signed in, subscribe to WAL change
  // events; on sign-out, tear it down so we don't leak the channel.
  useEffect(() => {
    if (session) {
      void syncNow();
      startRealtime();
    } else {
      stopRealtime();
    }
    return () => {
      // No-op on cleanup of the effect itself — stop is driven by sign-out
      // (next render with !session), not by component unmount.
    };
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

  // 1. Wait for session restoration before deciding what to show.
  if (sessionLoading) {
    return (
      <div className="min-h-full bg-bg text-text flex items-center justify-center">
        <div className="text-text-muted text-xs uppercase tracking-wider">Loading</div>
      </div>
    );
  }

  // 2. No Supabase session → show auth screens.
  if (!session) {
    return (
      <Routes>
        <Route path="/auth/login" element={<Login />} />
        <Route path="/auth/signup" element={<Signup />} />
        <Route path="*" element={<Navigate to="/auth/login" replace />} />
      </Routes>
    );
  }

  // 3. Session OK but device not unlocked → show LockScreen.
  if (!unlocked) {
    return <LockScreen />;
  }

  // 4. Fully authenticated. Render the app.
  return (
    <>
      <AdoptionPrompt />
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
          <Route path="/finance/networth" element={<NetWorth />} />
          <Route path="/finance/whatif" element={<WhatIf />} />
          <Route path="/finance/budgets" element={<ManageBudgets />} />
          <Route path="/studies" element={<StudiesOverview />} />
          <Route path="/studies/import" element={<CSVImport />} />
          <Route path="/studies/import/preview" element={<ImportPreview />} />
          <Route path="/studies/sessions" element={<StudySessions />} />
          <Route path="/studies/library" element={<Library />} />
          <Route path="/studies/library/add" element={<AddReading />} />
          <Route path="/fitness" element={<FitnessOverview />} />
          <Route path="/fitness/log" element={<LogWorkout />} />
          <Route path="/tasks" element={<TasksOverview />} />
          <Route path="/tasks/add" element={<AddTask />} />
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

  return null;
}
