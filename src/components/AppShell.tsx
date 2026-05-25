import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import BottomTabBar from './BottomTabBar';
import OfflineBanner from './OfflineBanner';
import QuickLogFAB from './QuickLogFAB';
import QuickLogBottomSheet from './QuickLogBottomSheet';
import { useFinanceStore } from '../store/useFinanceStore';
import { useStudiesStore } from '../store/useStudiesStore';
import { useFitnessStore } from '../store/useFitnessStore';
import { useTaskStore } from '../store/useTaskStore';
import { useGoalsStore } from '../store/useGoalsStore';
import { useSyncStore } from '../store/useSyncStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTemplatesStore } from '../store/useTemplatesStore';
import { checkBudgetThresholds } from '../lib/budgetAlerts';
import { reconcileTaskReminders } from '../lib/taskReminders';
import { runPortfolioEodTick } from '../lib/portfolioEod';
import { runNewsAlertsTick } from '../lib/newsAlerts';

// How long the app needs to have been backgrounded before a foreground
// transition counts as a "resume" worth re-fetching live data for. 20 min
// is the user-configured value: short enough to keep numbers fresh after a
// real context switch, long enough that flipping between this and another
// app doesn't burn the Finnhub free-tier quota on every tab-out.
const RESUME_REFRESH_THRESHOLD_MS = 20 * 60 * 1000;

export default function AppShell() {
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const location = useLocation();
  const loadFinance = useFinanceStore((s) => s.load);
  const loadStudies = useStudiesStore((s) => s.load);
  const loadFitness = useFitnessStore((s) => s.load);
  const loadTasks = useTaskStore((s) => s.load);
  const loadGoals = useGoalsStore((s) => s.load);
  const loadSettings = useSettingsStore((s) => s.load);
  const refreshPending = useSyncStore((s) => s.refreshPending);
  const refreshTemplates = useTemplatesStore((s) => s.refresh);
  const refreshPortfolio = useFinanceStore((s) => s.refreshPortfolio);
  const holdingsCount = useFinanceStore((s) => s.holdings.length);
  const watchlistCount = useFinanceStore((s) => s.watchlist.length);
  const bumpActivity = useAuthStore((s) => s.bumpActivity);
  const lock = useAuthStore((s) => s.lock);
  const autoLockMin = useAuthStore((s) => s.autoLockMinutes);
  const lastActivity = useAuthStore((s) => s.lastActivity);
  const didColdStartRefreshRef = useRef(false);

  useEffect(() => {
    // Module stores load first; templates depend on their Dexie tables, so
    // we kick off templates AFTER the store loads resolve. The detection
    // reads tables directly (not via the stores), so technically it would
    // work without awaiting — but waiting avoids racing the seed routine
    // on first launch and gives detection consistent data to chew on.
    (async () => {
      await Promise.all([
        loadSettings(),
        loadFinance(),
        loadStudies(),
        loadFitness(),
        loadTasks(),
        loadGoals(),
        refreshPending(),
      ]);
      void refreshTemplates();
      // App-start budget check — surfaces any threshold that crossed while
      // the app was closed (e.g. user added a transaction on another device,
      // sync brought it in, current-month spend is now over 80%). The
      // localStorage tracker inside checkBudgetThresholds prevents re-firing
      // the same tier if the user already saw the alert before.
      void checkBudgetThresholds(
        useFinanceStore.getState().transactions,
        useFinanceStore.getState().budgetCategories,
      );
      // App-start task reminder reconcile. Cancels orphan alarms for tasks
      // that were deleted while the app was closed, then re-arms every
      // currently-incomplete task with a future due date. Idempotent.
      void reconcileTaskReminders(useTaskStore.getState().tasks);
      // Portfolio EoD tick — schedules (or cancels) today's 4:05pm + 4:35pm
      // ET alarms based on trading-day check + current holdings + Settings
      // toggle. Re-runs on every portfolio refresh too so the backup body
      // stays close to truth.
      void runPortfolioEodTick();
      // News alerts — fires for any unseen owned-ticker headlines or
      // index ±1.5% move detected since last run. On cold start there's
      // usually no fresh news yet (refresh hasn't run), so this is mostly
      // a safety net; the heavier work happens after refreshPortfolio.
      void runNewsAlertsTick();
    })();
  }, []);

  // ─── Portfolio auto-refresh on cold start ────────────────────────────
  //
  // Fires ONCE per AppShell mount, after holdings (or watchlist) have been
  // populated by the load() Promise.all above. We gate on `holdingsCount`
  // because the previous version of this lived in Dashboard.tsx and ran on
  // first mount when the store was still empty — it hit the early-return
  // in refreshPortfolio() and never updated net worth. Users had to open
  // the Portfolio tab manually for live numbers to populate.
  //
  // force:false here means we trust the cache layer's soft TTL (60s on
  // Finnhub, similar on others). Back-to-back app launches won't burn
  // through the free-tier rate budget. The user's manual ↻ button still
  // calls refreshPortfolio() with no args → force:true.
  useEffect(() => {
    if (didColdStartRefreshRef.current) return;
    if (holdingsCount === 0 && watchlistCount === 0) return;
    didColdStartRefreshRef.current = true;
    void refreshPortfolio({ force: false });
  }, [holdingsCount, watchlistCount, refreshPortfolio]);

  // ─── Portfolio auto-refresh on resume after long background ──────────
  //
  // @capacitor/app emits `appStateChange` with `isActive: true|false` when
  // the OS sends the app to background / foreground. We capture the
  // background timestamp on every deactivation and, on the next activation,
  // refresh if we've been away >20min. Shorter resumes (quick tab-outs)
  // are no-ops — relying on the cache layer here would still gate, but
  // we'd rather not even schedule the refresh round-trip.
  //
  // Listener only attaches on native platforms — on web (dev) there's no
  // appStateChange surface and we don't want to leak a dangling subscription
  // promise on hot-reload.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let lastBackgroundedAt = 0;
    const subPromise = CapacitorApp.addListener('appStateChange', (state) => {
      if (state.isActive) {
        if (
          lastBackgroundedAt > 0 &&
          Date.now() - lastBackgroundedAt > RESUME_REFRESH_THRESHOLD_MS
        ) {
          void refreshPortfolio({ force: false });
        }
        // Reset so we don't re-fire on a subsequent quick resume.
        lastBackgroundedAt = 0;
      } else {
        lastBackgroundedAt = Date.now();
      }
    });
    return () => {
      // Listener cleanup is best-effort — promise resolves asynchronously,
      // but the listener itself is idempotent so a late-arriving remove is
      // safe even if the component is unmounted in between.
      subPromise.then((s) => s.remove()).catch(() => {});
    };
  }, [refreshPortfolio]);

  // Auto-lock timer
  useEffect(() => {
    if (autoLockMin <= 0) return;
    const id = setInterval(() => {
      const idleMs = Date.now() - lastActivity;
      if (idleMs > autoLockMin * 60_000) lock();
    }, 30_000);
    return () => clearInterval(id);
  }, [autoLockMin, lastActivity, lock]);

  // Track activity
  useEffect(() => {
    bumpActivity();
  }, [location.pathname]);

  useEffect(() => {
    const onAct = () => bumpActivity();
    window.addEventListener('pointerdown', onAct);
    window.addEventListener('keydown', onAct);
    return () => {
      window.removeEventListener('pointerdown', onAct);
      window.removeEventListener('keydown', onAct);
    };
  }, []);

  const showFAB = location.pathname === '/' || location.pathname === '/tasks' ||
    location.pathname === '/finance' || location.pathname === '/fitness' || location.pathname === '/studies';

  return (
    <div className="min-h-full flex flex-col bg-bg text-text">
      <OfflineBanner />
      {/* pb-32 (128px) gives clear space below the last card so it isn't clipped
        * by the fixed BottomTabBar (which is ~80px + its own safe-bottom inset). */}
      <main className="flex-1 overflow-y-auto pb-32 safe-top">
        <div className="max-w-md mx-auto w-full px-4 pt-3">
          <Outlet />
        </div>
      </main>
      {showFAB && <QuickLogFAB onClick={() => setQuickLogOpen(true)} />}
      <BottomTabBar />
      <QuickLogBottomSheet open={quickLogOpen} onClose={() => setQuickLogOpen(false)} />
    </div>
  );
}
