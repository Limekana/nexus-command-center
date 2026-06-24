// ─── v1.2 Habits overview ───────────────────────────────────────────────
//
// Three-section layout:
//   1. TODAY — eligible-today, not-yet-done habits as a 2-column ring-card
//      grid. Rings are the hero; tap or use the action pills to log progress.
//   2. DONE TODAY — eligible-today, completed habits as compact rows. Visual
//      weight drops (small ring + name + streak) since these are settled.
//   3. REST — habits whose schedule says "not today" (specific_days off-day).
//      Rendered as dashed-ghost rings so the user sees the row but knows it
//      isn't asking for anything.
//
// Edit/archive flow lives in a per-row BottomSheet — keeps the card surfaces
// uncluttered.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import BottomSheet from '../../components/BottomSheet';
import HabitRing from '../../components/HabitRing';
import { useHabitsStore } from '../../store/useHabitsStore';
import { isEligibleOn, dateKey } from '../../lib/habitStreaks';
import type { Habit } from '../../types/habits';

export default function HabitsOverview() {
  const navigate = useNavigate();
  const habits = useHabitsStore((s) => s.habits);
  const completions = useHabitsStore((s) => s.completions);
  const toggle = useHabitsStore((s) => s.toggleCompletion);
  const addToCompletion = useHabitsStore((s) => s.addToCompletion);
  const setCompletionAmount = useHabitsStore((s) => s.setCompletionAmount);
  const archiveHabit = useHabitsStore((s) => s.archiveHabit);
  const restoreHabit = useHabitsStore((s) => s.restoreHabit);
  const deleteHabit = useHabitsStore((s) => s.deleteHabit);
  const streakFor = useHabitsStore((s) => s.streakFor);

  const [showArchived, setShowArchived] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // v1.5.2 — morning catch-up / evening nudge notifications deep-link here with
  // ?catchup=<habitId>; open that habit's menu (which holds the 7-day catch-up
  // strip) so logging last night's habit is one tap from the notification.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const cid = searchParams.get('catchup');
    if (cid && habits.some((h) => h.id === cid)) {
      setActiveMenu(cid);
      // Clear the param so re-renders / back-nav don't re-trigger.
      const next = new URLSearchParams(searchParams);
      next.delete('catchup');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, habits, setSearchParams]);

  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);

  const active = useMemo(() => habits.filter((h) => !h.archivedAt), [habits]);
  const archived = useMemo(() => habits.filter((h) => h.archivedAt), [habits]);

  function isHit(h: Habit): boolean {
    const c = completions.find((c) => c.habitId === h.id && c.date === todayKey);
    if (!c) return false;
    if (h.type === 'binary') return c.amount > 0;
    const target = h.targetAmount && h.targetAmount > 0 ? h.targetAmount : 1;
    return c.amount >= target;
  }
  function amountToday(h: Habit): number {
    const c = completions.find((c) => c.habitId === h.id && c.date === todayKey);
    return c?.amount ?? 0;
  }

  // Bucket habits into Today / Done / Rest.
  const todayLeft: Habit[] = [];
  const doneToday: Habit[] = [];
  const rest: Habit[] = [];
  for (const h of active) {
    const eligible = isEligibleOn(h, today);
    if (!eligible) {
      rest.push(h);
      continue;
    }
    if (isHit(h)) doneToday.push(h);
    else todayLeft.push(h);
  }

  const totalEligible = todayLeft.length + doneToday.length;

  // Quick-step amounts for quantified habits, scaled to target. Mirrors the
  // savings-goal pattern (€10 for <€500, etc.) so the user gets sensible
  // chunk sizes without having to think.
  function stepFor(h: Habit): number {
    if (h.type === 'binary') return 1;
    const target = h.targetAmount ?? 1;
    if (target <= 5) return 1;
    if (target <= 30) return 5;
    if (target <= 120) return 10;
    if (target <= 600) return 30;
    return Math.round(target / 20);
  }

  const menuHabit = activeMenu ? habits.find((h) => h.id === activeMenu) ?? null : null;

  return (
    <>
      <AppHeader
        title="Habits"
        back="/"
        backLabel="Home"
        showAvatar={false}
        action={
          <button
            onClick={() => navigate('/habits/add')}
            className="pill pill-on pill-lg press-spring"
            type="button"
          >
            + Habit
          </button>
        }
      />
      <div className="space-y-5">
        {active.length === 0 ? (
          <div className="glass rounded-xl p-8 text-center stagger-children">
            <div className="font-heading text-base font-semibold mb-1">
              No habits yet
            </div>
            <div className="text-xs text-text-muted mb-4">
              Start with one small daily action.
            </div>
            <button
              onClick={() => navigate('/habits/add')}
              className="pill pill-on pill-lg press-spring"
              type="button"
            >
              + First habit
            </button>
          </div>
        ) : (
          <>
            {/* ─── TODAY section ──────────────────────────────────────── */}
            <section className="space-y-2">
              <div className="flex items-baseline justify-between px-1">
                <div className="font-heading font-semibold text-xs uppercase tracking-wider text-text-muted">
                  Today
                </div>
                {totalEligible > 0 && (
                  <div className="text-[10px] text-text-muted uppercase tracking-wider">
                    {doneToday.length} of {totalEligible}
                  </div>
                )}
              </div>
              {todayLeft.length === 0 && doneToday.length === 0 && (
                <div className="glass-soft rounded-xl p-4 text-center text-xs text-text-muted">
                  Nothing scheduled today. Tomorrow's habits will surface here.
                </div>
              )}
              {todayLeft.length === 0 && doneToday.length > 0 && (
                <div className="glass-soft rounded-xl p-4 text-center text-xs text-success">
                  Cleared. Streaks intact.
                </div>
              )}
              {todayLeft.length > 0 && (
                <div className="grid grid-cols-2 gap-2 stagger-children">
                  {todayLeft.map((h) => {
                    const amt = amountToday(h);
                    const target = h.type === 'binary' ? 1 : Math.max(1, h.targetAmount ?? 1);
                    const progress = h.type === 'binary' ? 0 : amt / target;
                    const state = progress > 0 ? 'partial' : 'idle';
                    const streak = streakFor(h.id);
                    const step = stepFor(h);
                    return (
                      <div
                        key={h.id}
                        className="glass rounded-xl p-3 flex flex-col items-center text-center"
                      >
                        {/* v1.2 hotfix — ring tap behaviour by type:
                              binary    → toggle done/undone (an amount=1 row).
                              quantified → add one step (same as +N button).
                            The previous code called toggle() for both, which
                            for "Read 30 min" recorded a meaningless 1-min
                            entry. Single-tap-adds-step is more discoverable
                            than tap-does-nothing while keeping the ring as
                            the obvious primary affordance. */}
                        <button
                          onClick={() =>
                            h.type === 'binary'
                              ? toggle(h.id)
                              : addToCompletion(h.id, step)
                          }
                          type="button"
                          aria-label={
                            h.type === 'binary'
                              ? `Mark ${h.title} done`
                              : `Add ${step}${h.unit ? ` ${h.unit}` : ''} to ${h.title}`
                          }
                          className="press-spring"
                        >
                          <HabitRing
                            progress={progress}
                            state={state}
                            size={88}
                            color={h.color}
                          >
                            <div className="flex flex-col items-center leading-none">
                              {h.type === 'binary' ? (
                                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                                  Tap
                                </span>
                              ) : (
                                <>
                                  <span className="font-heading text-base font-bold">
                                    {amt}
                                  </span>
                                  {/* v1.2 hotfix — unit moved INTO the ring
                                      so it's visible somewhere on the card.
                                      Previously only the +N button carried
                                      it, and the button overflowed when the
                                      unit was longer than ~5 chars. */}
                                  <span className="text-[9px] text-text-muted">
                                    of {h.targetAmount}{h.unit ? ` ${h.unit}` : ''}
                                  </span>
                                </>
                              )}
                            </div>
                          </HabitRing>
                        </button>
                        <div className="mt-2 font-heading font-semibold text-sm truncate w-full">
                          {h.title}
                        </div>
                        <div className="text-[10px] text-text-muted mb-2">
                          {streak.current > 0 ? (
                            <>🔥 {streak.current}d</>
                          ) : (
                            <>No streak</>
                          )}
                        </div>
                        {/* v1.2 hotfix — all three action buttons now share
                            a min-h-11 floor so they sit on the same baseline.
                            The ⋯ button keeps its dedicated min-w-11 to stay
                            square + uses flex centring to fix the off-centre
                            glyph (Unicode ⋯ has its own baseline that drifts
                            without explicit centring). `items-stretch` on
                            the row ensures any height variance from button
                            content propagates equally instead of jagging. */}
                        {h.type === 'binary' ? (
                          <div className="flex gap-1.5 w-full items-stretch">
                            <button
                              onClick={() => toggle(h.id)}
                              className="pill pill-on flex-1 press-spring min-h-11"
                              type="button"
                            >
                              Mark done
                            </button>
                            <button
                              onClick={() => setActiveMenu(h.id)}
                              className="pill press-spring min-w-11 min-h-11 inline-flex items-center justify-center leading-none flex-shrink-0"
                              type="button"
                              aria-label="More"
                            >
                              ⋯
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1.5 w-full items-stretch">
                            <button
                              onClick={() => addToCompletion(h.id, -step)}
                              className="pill press-spring min-h-11 min-w-11 inline-flex items-center justify-center flex-shrink-0"
                              type="button"
                              aria-label={`Subtract ${step}${h.unit ? ` ${h.unit}` : ''}`}
                            >
                              −{step}
                            </button>
                            {/* +N pill — unit dropped from the visible label
                                (it now lives in the ring centre, e.g.
                                "of 30 min"), so the button stays a single
                                line on any unit length. aria-label still
                                carries the unit for screen readers. */}
                            <button
                              onClick={() => addToCompletion(h.id, step)}
                              className="pill pill-on flex-1 press-spring min-h-11 inline-flex items-center justify-center whitespace-nowrap"
                              type="button"
                              aria-label={`Add ${step}${h.unit ? ` ${h.unit}` : ''}`}
                            >
                              +{step}
                            </button>
                            <button
                              onClick={() => setActiveMenu(h.id)}
                              className="pill press-spring min-w-11 min-h-11 inline-flex items-center justify-center leading-none flex-shrink-0"
                              type="button"
                              aria-label="More"
                            >
                              ⋯
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ─── DONE TODAY section ─────────────────────────────────── */}
            {doneToday.length > 0 && (
              <section className="space-y-2">
                <div className="font-heading font-semibold text-xs uppercase tracking-wider text-text-muted px-1">
                  Done today
                </div>
                <div className="space-y-2 stagger-children">
                  {doneToday.map((h) => {
                    const streak = streakFor(h.id);
                    return (
                      <div
                        key={h.id}
                        className="glass-soft rounded-xl p-2.5 flex items-center gap-3"
                      >
                        <HabitRing
                          progress={1}
                          state="done"
                          size={36}
                          strokeWidth={3}
                          color={h.color}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-heading font-semibold text-sm truncate">
                            {h.title}
                          </div>
                          <div className="text-[10px] text-text-muted">
                            🔥 {streak.current}d streak
                          </div>
                        </div>
                        <button
                          onClick={() => toggle(h.id)}
                          className="pill press-spring min-h-11"
                          type="button"
                          title="Undo"
                        >
                          Undo
                        </button>
                        <button
                          onClick={() => setActiveMenu(h.id)}
                          className="pill press-spring min-w-11 min-h-11"
                          type="button"
                          aria-label="More"
                        >
                          ⋯
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ─── REST section ───────────────────────────────────────── */}
            {rest.length > 0 && (
              <section className="space-y-2">
                <div className="font-heading font-semibold text-xs uppercase tracking-wider text-text-muted px-1">
                  Rest
                </div>
                <div className="space-y-2">
                  {rest.map((h) => {
                    const streak = streakFor(h.id);
                    const days = h.daysOfWeek ?? [];
                    const dayLabels = days
                      .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
                      .join(', ');
                    return (
                      <div
                        key={h.id}
                        className="glass-soft rounded-xl p-2.5 flex items-center gap-3 opacity-75"
                      >
                        <HabitRing
                          progress={0}
                          state="rest"
                          size={36}
                          strokeWidth={3}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-heading font-semibold text-sm truncate">
                            {h.title}
                          </div>
                          <div className="text-[10px] text-text-muted truncate">
                            {dayLabels || 'Specific days'} · 🔥 {streak.current}d
                          </div>
                        </div>
                        <button
                          onClick={() => setActiveMenu(h.id)}
                          className="pill press-spring min-w-11 min-h-11"
                          type="button"
                          aria-label="More"
                        >
                          ⋯
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}

        {/* ─── Archived toggle ───────────────────────────────────────── */}
        {archived.length > 0 && (
          <section className="space-y-2 pt-2">
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="w-full glass-soft rounded-xl p-3 flex items-center justify-between press-spring"
              type="button"
            >
              <span className="font-heading font-semibold text-sm">
                📦 Archived ({archived.length})
              </span>
              <span className="text-text-muted">{showArchived ? '▲' : '▼'}</span>
            </button>
            {showArchived && (
              <div className="space-y-2 stagger-children">
                {archived.map((h) => (
                  <div
                    key={h.id}
                    className="glass-soft rounded-xl p-2.5 flex items-center gap-3 opacity-60"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-semibold text-sm truncate">
                        {h.title}
                      </div>
                      <div className="text-[10px] text-text-muted">
                        Archived {h.archivedAt?.slice(0, 10)}
                      </div>
                    </div>
                    <button
                      onClick={() => restoreHabit(h.id)}
                      className="pill press-spring min-h-11"
                      type="button"
                    >
                      Restore
                    </button>
                    <button
                      onClick={() => setActiveMenu(h.id)}
                      className="pill press-spring min-w-11 min-h-11"
                      type="button"
                      aria-label="More"
                    >
                      ⋯
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="text-[10px] text-text-muted text-center">
          Synced across devices when online
        </div>
      </div>

      {/* ─── Row menu sheet ──────────────────────────────────────────── */}
      <BottomSheet
        open={!!activeMenu}
        onClose={() => setActiveMenu(null)}
        title={menuHabit?.title ?? 'Habit'}
      >
        {menuHabit && (
          <div className="space-y-2">
            <div className="glass-soft rounded-lg p-3 text-xs text-text-muted space-y-1">
              <div>
                Type: <span className="text-text">{menuHabit.type}</span>
                {menuHabit.type === 'quantified' && menuHabit.targetAmount && (
                  <> · Target: <span className="text-text">{menuHabit.targetAmount}{menuHabit.unit ? ` ${menuHabit.unit}` : ''}</span></>
                )}
              </div>
              <div>
                Frequency: <span className="text-text">
                  {menuHabit.frequencyKind === 'daily'
                    ? 'Daily'
                    : (menuHabit.daysOfWeek ?? [])
                        .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
                        .join(', ') || 'No days set'}
                </span>
              </div>
              {menuHabit.reminderTime && (
                <div>Reminder: <span className="text-text">{menuHabit.reminderTime}</span></div>
              )}
              {(() => {
                const s = streakFor(menuHabit.id);
                return (
                  <div>
                    🔥 Current {s.current}d · Longest {s.longest}d
                  </div>
                );
              })()}
            </div>
            {/* v1.5.2 — Catch up: log (or un-log) any of the last 7 days.
                Solves "I did it but my phone wasn't with me" — e.g. reading in
                bed at night, logged the next morning. Eligible days only. */}
            {!menuHabit.archivedAt && (
              <div className="glass-soft rounded-lg p-3">
                <div className="sec mb-2">Catch up — tap a day</div>
                <div className="flex justify-between gap-1">
                  {Array.from({ length: 7 }).map((_, i) => {
                    const d = new Date(today);
                    d.setDate(d.getDate() - (6 - i));
                    const dayK = dateKey(d);
                    const eligible = isEligibleOn(menuHabit, d);
                    const target = menuHabit.type === 'binary'
                      ? 1
                      : (menuHabit.targetAmount && menuHabit.targetAmount > 0 ? menuHabit.targetAmount : 1);
                    const comp = completions.find((c) => c.habitId === menuHabit.id && c.date === dayK);
                    const done = comp ? comp.amount >= target : false;
                    const isToday = dayK === todayKey;
                    return (
                      <button
                        key={dayK}
                        type="button"
                        disabled={!eligible}
                        onClick={() => {
                          if (menuHabit.type === 'binary') toggle(menuHabit.id, dayK);
                          else setCompletionAmount(menuHabit.id, done ? 0 : target, dayK);
                        }}
                        className={`flex-1 flex flex-col items-center gap-1 py-1.5 rounded-lg border transition-colors ${
                          done
                            ? 'border-primary/60 bg-primary/12 text-primary'
                            : eligible
                              ? 'border-glass-border text-text-muted active:border-primary/40'
                              : 'border-transparent text-text-muted/30'
                        }`}
                        aria-label={`${done ? 'Logged' : 'Not logged'} ${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}`}
                      >
                        <span className="text-[9px] uppercase tracking-wider">
                          {isToday ? 'TODAY' : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()]}
                        </span>
                        <span className="text-sm font-heading font-semibold leading-none">
                          {done ? '✓' : d.getDate()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <button
              onClick={() => {
                navigate(`/habits/add?id=${menuHabit.id}`);
                setActiveMenu(null);
              }}
              className="w-full pill pill-lg press-spring"
              type="button"
            >
              Edit
            </button>
            {menuHabit.archivedAt ? (
              <button
                onClick={() => {
                  restoreHabit(menuHabit.id);
                  setActiveMenu(null);
                }}
                className="w-full pill pill-lg press-spring"
                type="button"
              >
                Restore
              </button>
            ) : (
              <button
                onClick={() => {
                  archiveHabit(menuHabit.id);
                  setActiveMenu(null);
                }}
                className="w-full pill pill-lg press-spring"
                type="button"
              >
                Archive
              </button>
            )}
            <button
              onClick={() => {
                if (confirm(`Delete "${menuHabit.title}" and its history?`)) {
                  deleteHabit(menuHabit.id);
                  setActiveMenu(null);
                }
              }}
              className="w-full pill pill-lg press-spring text-danger border-danger/40"
              type="button"
            >
              Delete
            </button>
          </div>
        )}
      </BottomSheet>

    </>
  );
}
