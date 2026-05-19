import { Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
  const bumpActivity = useAuthStore((s) => s.bumpActivity);
  const lock = useAuthStore((s) => s.lock);
  const autoLockMin = useAuthStore((s) => s.autoLockMinutes);
  const lastActivity = useAuthStore((s) => s.lastActivity);

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
    })();
  }, []);

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
