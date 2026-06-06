import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../../components/AppHeader';
import BottomSheet from '../../components/BottomSheet';
import { Pill } from '../../components/ui/Pill';
import { useSavingsGoalsStore } from '../../store/useSavingsGoalsStore';
import { useFinanceStore } from '../../store/useFinanceStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { computeAvailableCash } from '../../lib/savingsAvailableCash';
import { convertSync } from '../../api/fxRates';
import type { SavingsGoal, ManualAsset } from '../../types/finance';

/**
 * v1.2 — Savings Goals.
 *
 * Layout (top → bottom):
 *   1. Header card "Available cash" — big number, breakdown of liquid /
 *      buffer / allocated, soft warning when over-allocated.
 *   2. Buffer setting — emergency reserve excluded from goal allocations.
 *      Sits in a glass-soft strip below the header card to keep it
 *      adjacent to the available-cash context.
 *   3. Goal list — one row per goal with progress bar, allocate +/- pills,
 *      edit + delete via RowActions. Completed goals collapse to the bottom
 *      of the list at reduced opacity.
 *   4. + Goal action in header opens the add/edit sheet.
 *
 * Money model:
 *   - Goal currency is captured at creation (default = baseCurrency).
 *   - Allocations happen in the goal's own currency. Cross-currency math is
 *     only used for the available-cash banner.
 */

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: '€', USD: '$', GBP: '£', SEK: 'kr', NOK: 'kr', DKK: 'kr', CHF: 'Fr', JPY: '¥',
};

function fmt(amount: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? '';
  const isSuffix = ['kr', 'Fr'].includes(sym);
  const num = amount.toLocaleString('fi-FI', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return isSuffix ? `${num} ${sym}` : sym ? `${sym}${num}` : `${num} ${currency}`;
}

function fmtCompact(amount: number, currency: string): string {
  // Drop decimals on values ≥1000 so progress rows stay tight on narrow screens.
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? '';
  const isSuffix = ['kr', 'Fr'].includes(sym);
  const fractionDigits = Math.abs(amount) >= 1000 ? 0 : 2;
  const num = amount.toLocaleString('fi-FI', { maximumFractionDigits: fractionDigits, minimumFractionDigits: fractionDigits });
  return isSuffix ? `${num} ${sym}` : sym ? `${sym}${num}` : `${num} ${currency}`;
}

export default function SavingsGoals() {
  const navigate = useNavigate();
  const goals = useSavingsGoalsStore((s) => s.goals);
  const loaded = useSavingsGoalsStore((s) => s.loaded);
  const loadGoals = useSavingsGoalsStore((s) => s.load);
  const addGoal = useSavingsGoalsStore((s) => s.addGoal);
  const updateGoal = useSavingsGoalsStore((s) => s.updateGoal);
  const allocate = useSavingsGoalsStore((s) => s.allocate);
  const setAllocated = useSavingsGoalsStore((s) => s.setAllocated);
  const deleteGoal = useSavingsGoalsStore((s) => s.deleteGoal);

  const manualAssets = useFinanceStore((s) => s.manualAssets);
  const updateManualAsset = useFinanceStore((s) => s.updateManualAsset);
  const fxRates = useFinanceStore((s) => s.fxRates);
  const baseCurrency = useSettingsStore((s) => s.baseCurrency);
  // v1.2 follow-up — BUG-5. The legacy `settings.savingsBufferAmount` is
  // no longer read here; the buffer is now sourced from the pinned buffer
  // goal's `allocatedAmount` (single source of truth). AppShell migrates
  // the legacy value into the buffer goal once on first load via
  // `ensureBufferGoal({ migrateAmount })`.
  const ensureBufferGoal = useSavingsGoalsStore((s) => s.ensureBufferGoal);

  useEffect(() => {
    if (!loaded) void loadGoals();
  }, [loaded, loadGoals]);

  // Ensure the buffer goal exists once goals + baseCurrency are loaded.
  // Idempotent — the store short-circuits when a buffer is already present.
  useEffect(() => {
    if (loaded) void ensureBufferGoal({ currency: baseCurrency });
  }, [loaded, baseCurrency, ensureBufferGoal]);

  // ─── Available cash math ──────────────────────────────────────────────
  const available = useMemo(
    () => computeAvailableCash(manualAssets, goals, fxRates, baseCurrency),
    [manualAssets, goals, fxRates, baseCurrency],
  );
  const overAllocated = available.available < 0;
  const noLiquidAssets = available.liquidBase === 0;

  // ─── Add/edit goal sheet ──────────────────────────────────────────────
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [allocated, setAllocatedInput] = useState('');
  // SavingsGoal.currency is plain `string` (not narrowed to BaseCurrency) so
  // a goal can be denominated in any ISO code; the BaseCurrency union is
  // only the user's *display* currency. State is string-typed accordingly.
  const [currency, setCurrency] = useState<string>(baseCurrency);
  const [deadline, setDeadline] = useState('');
  const [notes, setNotes] = useState('');

  const openAdd = () => {
    setEditing(null);
    setTitle('');
    setTarget('');
    setAllocatedInput('0');
    setCurrency(baseCurrency);
    setDeadline('');
    setNotes('');
    setEditorOpen(true);
  };
  const openEdit = (g: SavingsGoal) => {
    setEditing(g);
    setTitle(g.title);
    setTarget(String(g.targetAmount));
    setAllocatedInput(String(g.allocatedAmount));
    setCurrency(g.currency);
    setDeadline(g.deadline ?? '');
    setNotes(g.notes ?? '');
    setEditorOpen(true);
  };
  // ─── v1.2 follow-up — "Move to investments" sheet ────────────────────
  //
  // The user wanted a way to commit cash to investments and have it
  // disappear from the allocatable pool. Implemented as a top-level action:
  //   1. User taps "→ Invest" in the header
  //   2. Sheet asks: amount + source ManualAsset (default = largest cash/savings)
  //      + optional "navigate to Portfolio after" toggle
  //   3. On submit: subtract amount from the source asset (clamped at 0).
  //      Available cash math re-runs automatically because manualAssets is
  //      a Zustand selector. If the navigate toggle is on, jump to
  //      /finance/portfolio/manage so the user records the actual holding.
  //
  // Liquid asset list — cash + savings ManualAssets sorted by value desc.
  // Used both for the source-selector default and the dropdown.
  const liquidAssets = useMemo<ManualAsset[]>(() => {
    return manualAssets
      .filter((a) => a.assetType === 'cash' || a.assetType === 'savings')
      .sort((a, b) => {
        const ab = convertSync(a.value, a.currency, baseCurrency, fxRates) ?? 0;
        const bb = convertSync(b.value, b.currency, baseCurrency, fxRates) ?? 0;
        return bb - ab;
      });
  }, [manualAssets, baseCurrency, fxRates]);

  const [investOpen, setInvestOpen] = useState(false);
  const [investAmount, setInvestAmount] = useState('');
  const [investSourceId, setInvestSourceId] = useState<string>('');
  const [investNavigateAfter, setInvestNavigateAfter] = useState(true);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  const openInvest = () => {
    setInvestAmount('');
    // Default to the largest liquid asset; user can switch.
    setInvestSourceId(liquidAssets[0]?.id ?? '');
    setInvestNavigateAfter(true);
    setInvestOpen(true);
  };

  const submitInvest = async () => {
    const amount = parseFloat(investAmount);
    if (!isFinite(amount) || amount <= 0) return;
    const source = liquidAssets.find((a) => a.id === investSourceId);
    if (!source) return;
    // Decrement amount in the source asset's native currency. If the user
    // typed in baseCurrency but the asset is denominated in something else,
    // convert. Falls through to "no conversion possible" → flash a warning
    // and bail rather than silently subtract the wrong number.
    const amountInSourceCurrency = source.currency === baseCurrency
      ? amount
      : convertSync(amount, baseCurrency, source.currency, fxRates);
    if (amountInSourceCurrency == null) {
      setFlashMessage(`Couldn't convert ${baseCurrency} → ${source.currency} (FX rate missing).`);
      window.setTimeout(() => setFlashMessage(null), 4000);
      return;
    }
    const nextValue = Math.max(0, source.value - amountInSourceCurrency);
    await updateManualAsset(source.id, { value: nextValue });
    setInvestOpen(false);
    setFlashMessage(`${fmtCompact(amount, baseCurrency)} moved from ${source.name} to investments.`);
    window.setTimeout(() => setFlashMessage(null), 5000);
    if (investNavigateAfter) {
      navigate('/finance/portfolio/manage');
    }
  };

  const submitEditor = async () => {
    const targetNum = parseFloat(target);
    if (!title.trim() || !isFinite(targetNum) || targetNum <= 0) return;
    const allocatedNum = Math.max(0, parseFloat(allocated) || 0);
    if (editing) {
      await updateGoal(editing.id, {
        title: title.trim(),
        targetAmount: targetNum,
        allocatedAmount: allocatedNum,
        currency,
        deadline: deadline || undefined,
        notes: notes.trim() || undefined,
      });
    } else {
      await addGoal({
        title: title.trim(),
        targetAmount: targetNum,
        allocatedAmount: allocatedNum,
        currency,
        deadline: deadline || undefined,
        notes: notes.trim() || undefined,
      });
    }
    setEditorOpen(false);
  };

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <>
      <AppHeader
        title="Savings"
        back="/finance"
        backLabel="Finance"
        showAvatar={false}
        action={
          <>
            {/* "→ Invest" — commits cash from a liquid ManualAsset to
                "investments." Reduces the source asset's value (and thus
                the available-to-allocate pool). Disabled when there are
                no cash/savings assets to draw from — no source = no-op. */}
            <Pill
              size="sm"
              onClick={openInvest}
              disabled={liquidAssets.length === 0}
              icon="→"
            >
              Invest
            </Pill>
            <Pill on size="sm" onClick={openAdd} icon="+">
              Goal
            </Pill>
          </>
        }
      />

      <div className="space-y-3">
        {/* Flash banner for invest-move confirmations / FX warnings. */}
        {flashMessage && (
          <div className="glass rounded-pill px-4 py-2 text-xs text-primary animate-fade-in-up border border-primary/45" style={{ background: 'rgba(0, 212, 255, 0.08)' }}>
            {flashMessage}
          </div>
        )}

        {/* ─── Available cash header ──────────────────────────────────── */}
        <div className={`glass rounded-xl p-4 ${overAllocated ? 'border-warning/45' : ''}`}>
          <div className="flex items-baseline justify-between">
            <span className="sec">Available to allocate</span>
            <span className="text-[10px] text-text-muted">in {baseCurrency}</span>
          </div>
          <div className={`font-heading font-bold text-3xl tracking-tight mt-1 ${overAllocated ? 'text-warning' : 'text-text'}`}>
            {fmt(available.available, baseCurrency)}
          </div>
          {overAllocated && (
            <div className="text-[11px] text-warning mt-1">
              Over-allocated — your goals + buffer exceed liquid cash by {fmt(Math.abs(available.available), baseCurrency)}.
            </div>
          )}
          {noLiquidAssets && (
            <div className="text-[11px] text-text-muted mt-1">
              No cash or savings assets logged yet. Add some under
              <span className="text-primary"> Finance → Net Worth</span> to start allocating.
            </div>
          )}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <Cell label="Liquid" value={fmtCompact(available.liquidBase, baseCurrency)} />
            <Cell label="Buffer" value={fmtCompact(available.bufferAmount, baseCurrency)} tone="muted" />
            <Cell label="Allocated" value={fmtCompact(available.allocatedBase, baseCurrency)} tone="muted" />
          </div>
          {available.unconvertable.length > 0 && (
            <div className="text-[10px] text-warning mt-2">
              {available.unconvertable.length} item{available.unconvertable.length === 1 ? '' : 's'} couldn't be converted to {baseCurrency} (FX rate missing).
            </div>
          )}
        </div>

        {/* v1.2 follow-up — BUG-5. The inline "Emergency buffer" editor that
            used to live here is gone. The buffer is now the pinned Emergency
            Buffer goal at the top of the goal list — same +/- allocate pills
            as every other goal, but non-deletable and orange-tinted to read
            as a reserve rather than a target. Single concept, single UI. */}

        {/* ─── Goal list ──────────────────────────────────────────────── */}
        {goals.length === 0 ? (
          <div className="glass rounded-xl p-6 text-center">
            <div className="font-heading font-semibold text-sm mb-1">No savings goals yet</div>
            <div className="text-[11px] text-text-muted">
              Tap + Goal to add one. Each goal is a named target with an
              optional deadline; allocate from your available cash above.
            </div>
          </div>
        ) : (
          <div className="space-y-2 stagger-children">
            {goals.map((g) => (
              <GoalRow
                key={g.id}
                goal={g}
                onAllocate={(delta) => void allocate(g.id, delta)}
                onSet={(amount) => void setAllocated(g.id, amount)}
                onEdit={() => openEdit(g)}
                onDelete={() => {
                  if (window.confirm(`Delete "${g.title}" and release the ${fmtCompact(g.allocatedAmount, g.currency)} allocation?`)) {
                    void deleteGoal(g.id);
                  }
                }}
              />
            ))}
          </div>
        )}

        <div className="text-[10px] text-text-muted text-center">
          Local only — savings goals don't sync across devices in v1.2.
        </div>
      </div>

      {/* ─── Add/edit sheet ───────────────────────────────────────────── */}
      <BottomSheet
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? 'Edit Goal' : 'New Goal'}
      >
        <div className="space-y-3">
          <div>
            <div className="sec mb-2">Title</div>
            <input
              className="input"
              placeholder="e.g. House down payment"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <div className="sec mb-2">Target</div>
              <input
                className="input"
                inputMode="decimal"
                placeholder="0"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <div className="w-24">
              <div className="sec mb-2">Currency</div>
              <select
                className="input"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'DKK', 'CHF', 'JPY'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="sec mb-2">Allocated so far (optional)</div>
            <input
              className="input"
              inputMode="decimal"
              placeholder="0"
              value={allocated}
              onChange={(e) => setAllocatedInput(e.target.value)}
            />
            <div className="text-[10px] text-text-muted mt-1">
              Stamp the initial allocation if you're tracking money already set aside. You can also leave this at 0 and use the +/- pills on the row to allocate over time.
            </div>
          </div>
          <div>
            <div className="sec mb-2">Deadline (optional)</div>
            <input
              type="date"
              className="input"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
          <div>
            <div className="sec mb-2">Notes</div>
            <textarea
              className="input min-h-[60px]"
              placeholder="What's this for?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              className="btn flex-1"
              onClick={submitEditor}
              disabled={!title.trim() || !target}
            >
              {editing ? 'Save Changes' : 'Add Goal'}
            </button>
            <button className="btn-ghost" onClick={() => setEditorOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ─── Invest sheet (v1.2 follow-up) ──────────────────────────── */}
      <BottomSheet
        open={investOpen}
        onClose={() => setInvestOpen(false)}
        title="Move to investments"
      >
        <div className="space-y-3">
          <div className="text-[11px] text-text-muted">
            Reduces the selected cash asset and frees up that amount from
            your available pool. Record the actual buy in Portfolio so net
            worth stays accurate.
          </div>
          <div>
            <div className="sec mb-2">Amount ({baseCurrency})</div>
            <input
              className="input"
              inputMode="decimal"
              placeholder="0"
              value={investAmount}
              onChange={(e) => setInvestAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <div className="sec mb-2">Source</div>
            <select
              className="input"
              value={investSourceId}
              onChange={(e) => setInvestSourceId(e.target.value)}
            >
              {liquidAssets.length === 0 ? (
                <option value="">No cash assets logged</option>
              ) : (
                liquidAssets.map((a) => {
                  const inBase = convertSync(a.value, a.currency, baseCurrency, fxRates);
                  return (
                    <option key={a.id} value={a.id}>
                      {a.name} · {fmtCompact(a.value, a.currency)}
                      {inBase != null && a.currency !== baseCurrency
                        ? ` (≈ ${fmtCompact(inBase, baseCurrency)})`
                        : ''}
                    </option>
                  );
                })
              )}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={investNavigateAfter}
              onChange={(e) => setInvestNavigateAfter(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-[11px] text-text-muted">
              Go to Portfolio to record the holding
            </span>
          </label>
          <div className="flex gap-2">
            <button
              className="btn flex-1"
              onClick={submitInvest}
              disabled={!investAmount || !investSourceId || parseFloat(investAmount) <= 0}
            >
              Move
            </button>
            <button className="btn-ghost" onClick={() => setInvestOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function Cell({ label, value, tone = 'default' }: {
  label: string; value: string; tone?: 'default' | 'muted';
}) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-text-muted">{label}</div>
      <div className={`text-sm font-medium ${tone === 'muted' ? 'text-text-muted' : 'text-text'}`}>{value}</div>
    </div>
  );
}

interface GoalRowProps {
  goal: SavingsGoal;
  onAllocate: (delta: number) => void;
  onSet: (amount: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function GoalRow({ goal, onAllocate, onSet, onEdit, onDelete }: GoalRowProps) {
  const completed = !!goal.completedAt;
  const pct = goal.targetAmount > 0
    ? Math.min(100, (goal.allocatedAmount / goal.targetAmount) * 100)
    : 0;
  const remaining = Math.max(0, goal.targetAmount - goal.allocatedAmount);

  // Deadline pacing — when set, compare expected progress vs actual. Used
  // for the deadline pill tone (warning when behind, success when ahead).
  const pacingTone = useMemo<'success' | 'warning' | 'neutral'>(() => {
    if (!goal.deadline || completed) return 'neutral';
    const created = new Date(goal.createdAt).getTime();
    const due = new Date(goal.deadline).getTime();
    const now = Date.now();
    if (due <= created) return 'neutral'; // malformed; don't second-guess
    const totalDur = due - created;
    const elapsed = now - created;
    if (elapsed <= 0) return 'neutral';
    const expectedPct = Math.min(100, (elapsed / totalDur) * 100);
    if (pct >= expectedPct + 5) return 'success';
    if (pct < expectedPct - 5) return 'warning';
    return 'neutral';
  }, [goal.createdAt, goal.deadline, completed, pct]);

  // Quick-allocate amounts based on the goal's scale. Round numbers feel
  // better than literal "10/50/100" — for a €10k goal a 1% allocation
  // (€100) is more useful than €10.
  const quickStep = useMemo(() => {
    if (goal.targetAmount >= 50000) return 500;
    if (goal.targetAmount >= 5000) return 100;
    if (goal.targetAmount >= 500) return 25;
    return 10;
  }, [goal.targetAmount]);

  // Inline custom-amount editor — opens via "…" pill.
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const submitCustom = (mode: 'add' | 'set') => {
    const n = parseFloat(customAmount);
    if (!isFinite(n)) {
      setCustomOpen(false);
      return;
    }
    if (mode === 'add') onAllocate(n);
    else onSet(n);
    setCustomAmount('');
    setCustomOpen(false);
  };

  // v1.2 follow-up — BUG-5. Buffer goal renders with a distinct warning-
  // tinted surface so the user reads it as a continuous reserve instead of
  // a target-to-hit. Delete button is suppressed (store also guards against
  // deletion as defense-in-depth). Progress bar uses warning tint while
  // under target and success once target is met (without auto-completing).
  const isBuffer = !!goal.isBuffer;

  return (
    <div
      className={`${isBuffer
        ? 'glass rounded-xl p-3 border border-warning/40'
        : completed ? 'glass-soft rounded-xl p-3 opacity-70' : 'glass rounded-xl p-3'}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-heading font-semibold text-sm flex items-center gap-1.5">
            {isBuffer && <span aria-hidden className="text-warning">🛟</span>}
            {!isBuffer && completed && <span aria-hidden>✓</span>}
            <span className="truncate">{isBuffer ? 'Emergency Buffer' : goal.title}</span>
          </div>
          <div className="text-[10px] text-text-muted truncate">
            {isBuffer ? (
              goal.targetAmount > 0 ? (
                <>
                  {fmtCompact(goal.allocatedAmount, goal.currency)} reserved · target {fmtCompact(goal.targetAmount, goal.currency)}
                  {remaining > 0 && (
                    <> · <span className="text-warning/80">{fmtCompact(remaining, goal.currency)} short</span></>
                  )}
                </>
              ) : (
                <>{fmtCompact(goal.allocatedAmount, goal.currency)} reserved · set a target in Edit</>
              )
            ) : (
              <>
                {fmtCompact(goal.allocatedAmount, goal.currency)} of {fmtCompact(goal.targetAmount, goal.currency)}
                {!completed && remaining > 0 && (
                  <> · <span className="text-primary/70">{fmtCompact(remaining, goal.currency)} to go</span></>
                )}
              </>
            )}
          </div>
        </div>
        {/* Buffer goal never carries a deadline; show a "Reserve" pill instead
            so the row still has a right-rail affordance. */}
        {isBuffer ? (
          <Pill asLabel size="sm" tone="warning">Reserve</Pill>
        ) : goal.deadline && (
          <Pill
            asLabel
            size="sm"
            tone={pacingTone === 'success' ? 'success' : pacingTone === 'warning' ? 'warning' : 'neutral'}
          >
            {goal.deadline}
          </Pill>
        )}
      </div>

      {/* Progress bar */}
      <div className="relative h-2 mt-2 rounded-full bg-surface2 overflow-hidden">
        <div
          className={`h-full ${isBuffer
            ? (pct >= 100 ? 'bg-success/70' : 'bg-warning/70')
            : (completed ? 'bg-success/70' : 'bg-primary/70')}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <div className="text-[10px] text-text-muted">{pct.toFixed(0)}%</div>
        {goal.notes && (
          <div className="text-[10px] text-text-muted/80 italic truncate ml-2">{goal.notes}</div>
        )}
      </div>

      {/* Allocate controls */}
      {!customOpen ? (
        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
          <Pill size="sm" onClick={() => onAllocate(-quickStep)} disabled={goal.allocatedAmount <= 0}>
            −{quickStep}
          </Pill>
          <Pill size="sm" onClick={() => onAllocate(quickStep)} icon="+">
            {quickStep}
          </Pill>
          <Pill size="sm" onClick={() => setCustomOpen(true)} icon="✎">
            Custom
          </Pill>
          <div className="ml-auto flex items-center gap-1.5">
            <Pill size="sm" onClick={onEdit}>Edit</Pill>
            {/* Buffer goal is non-deletable — see store's deleteGoal guard. */}
            {!isBuffer && (
              <Pill size="sm" tone="danger" onClick={onDelete}>Delete</Pill>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 mt-3 animate-fade-in-up">
          <input
            className="input flex-1 py-2"
            inputMode="decimal"
            placeholder={`Amount in ${goal.currency}`}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            autoFocus
          />
          <Pill size="sm" on onClick={() => submitCustom('add')} icon="+">Add</Pill>
          <Pill size="sm" onClick={() => submitCustom('set')}>Set</Pill>
          <Pill size="sm" onClick={() => { setCustomOpen(false); setCustomAmount(''); }}>×</Pill>
        </div>
      )}
    </div>
  );
}
