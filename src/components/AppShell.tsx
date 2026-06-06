import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import BottomTabBar from './BottomTabBar';
import OfflineBanner from './OfflineBanner';
import QuickLogFAB from './QuickLogFAB';
import QuickLogBottomSheet from './QuickLogBottomSheet';
import PageTransition from './ui/PageTransition';
import { useFinanceStore } from '../store/useFinanceStore';
import { useStudiesStore } from '../store/useStudiesStore';
import { useFitnessStore } from '../store/useFitnessStore';
import { useTaskStore } from '../store/useTaskStore';
import { useGoalsStore } from '../store/useGoalsStore';
import { useSyncStore } from '../store/useSyncStore';
import { useAuthStore } from '../store/useAuthStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTemplatesStore } from '../store/useTemplatesStore';
import { useInsightsStore } from '../store/useInsightsStore';
import { useSavingsGoalsStore } from '../store/useSavingsGoalsStore';
import { useHabitsStore } from '../store/useHabitsStore';
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
  const loadSavingsGoals = useSavingsGoalsStore((s) => s.load);
  // v1.2 follow-up — BUG-5. Run once after savings + settings have loaded
  // to migrate the legacy `useSettingsStore.savingsBufferAmount` into the
  // new pinned Emergency Buffer goal. Idempotent — short-circuits if the
  // buffer goal already exists.
  const ensureBufferGoal = useSavingsGoalsStore((s) => s.ensureBufferGoal);
  const loadHabits = useHabitsStore((s) => s.load);
  const loadSettings = useSettingsStore((s) => s.load);
  const refreshPending = useSyncStore((s) => s.refreshPending);
  const refreshTemplates = useTemplatesStore((s) => s.refresh);
  const refreshPortfolio = useFinanceStore((s) => s.refreshPortfolio);
  const holdingsCount = useFinanceStore((s) => s.holdings.length);
  const watchlistCount = useFinanceStore((s) => s.watchlist.length);
  const recomputeInsights = useInsightsStore((s) => s.recomputeAll);
  // v1.2 — Fundamental sweep runs on a weekly cadence; we kick it from the
  // same cold-start path the technical sweep uses. The store's own tier
  // guard short-circuits when the weekly window hasn't elapsed.
  const recomputeFundamentals = useInsightsStore((s) => s.recomputeFundamentalsAll);
  // v1.2 follow-up — BUG-9. Hydrate persisted Insights ratings from disk
  // BEFORE the cold-start refresh effect kicks the recompute pipelines.
  // Without this, the tier-sweep guard correctly short-circuits "still
  // fresh, skip" but the in-memory ratings map is empty → blank pills
  // until the daily/weekly window opens or the user manually refreshes.
  const hydrateInsights = useInsightsStore((s) => s.hydrate);
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
        // v1.2 — pre-load savings goals so the Finance overview entry chip
        // can show counts (or future "you have N goals on track" widget)
        // without waiting for the user to visit the Savings screen.
        loadSavingsGoals(),
        // v1.2 — pre-load habits so the Dashboard's completion-rings strip
        // renders synchronously on first paint. load() also re-arms all
        // active habits' reminders on cold start.
        loadHabits(),
        // v1.2 follow-up — BUG-9. Hydrate persisted Insights ratings before
        // the cold-start refresh effect runs. By the time the second
        // useEffect (gated on holdingsCount becoming non-zero from
        // loadFinance) fires, the maps will already carry the last
        // successful per-ticker scores so RatingPill renders immediately
        // even when the sweep guard short-circuits as "still fresh".
        hydrateInsights(),
        refreshPending(),
      ]);
      // v1.2 follow-up — BUG-5. Migrate the legacy savingsBufferAmount into
      // the unified Emergency Buffer goal. Reads the setting after settings +
      // savings goals both loaded. Idempotent across cold starts — the
      // store's ensureBufferGoal() short-circuits when a buffer already
      // exists, so we only ever migrate the legacy value once.
      const { savingsBufferAmount, baseCurrency } = useSettingsStore.getState();
      void ensureBufferGoal({ migrateAmount: savingsBufferAmount, currency: baseCurrency });
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
    void refreshPortfolio({ force: false }).then(() => {
      // v1.2 — kick BOTH Insights tiers after the portfolio refresh. The
      // technical pass is gated daily by lib/insightsCache.ts; the
      // fundamental pass is gated weekly. Inputs are read from Dexie caches
      // (24h technicals, 7d fundamentals) so neither hits the network on a
      // warm-cache cold start. Both run sequentially per ticker and
      // fire-and-forget so navigation isn't blocked.
      void recomputeInsights();
      void recomputeFundamentals();
    });
  }, [holdingsCount, watchlistCount, refreshPortfolio, recomputeInsights, recomputeFundamentals]);

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
          void refreshPortfolio({ force: false }).then(() => {
            // v1.2 — re-tick Insights on the same long-resume path. The
            // technical-tier guard means this only actually iterates once
            // per calendar day; the fundamental-tier guard once per week.
            // Both calls are still cheap on subsequent resumes because the
            // sweep timestamps short-circuit before any signal math runs.
            void recomputeInsights();
            void recomputeFundamentals();
          });
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
  }, [refreshPortfolio, recomputeInsights, recomputeFundamentals]);

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
      {/* v1.2 follow-up — pb-32 → pb-44. The floating glass tab bar sits
          ~80px above the safe-area inset; pb-32 (128px) left only ~16px of
          clearance, so the last row of any screen got clipped or hidden
          behind the bar. pb-44 (176px) gives generous breathing room so
          the last item, FAB sheets, and bottom-pinned controls sit clear. */}
      <main className="flex-1 overflow-y-auto pb-44 safe-top">
        <div className="max-w-md mx-auto w-full px-4 pt-3">
          {/* v1.2 — PageTransition keyed on route's first segment cross-fades
              + lifts page content on inter-section navigation. Deep nav
              within a section (Finance overview → Add Transaction) doesn't
              re-trigger; only Finance → Studies-style jumps animate. Keeps
              motion meaningful per the v1.2 design brief. */}
          <PageTransition>
            <Outlet />
          </PageTransition>
        </div>
      </main>
      {showFAB && <QuickLogFAB onClick={() => setQuickLogOpen(true)} />}
      <BottomTabBar />
      <QuickLogBottomSheet open={quickLogOpen} onClose={() => setQuickLogOpen(false)} />
    </div>
  );
}
