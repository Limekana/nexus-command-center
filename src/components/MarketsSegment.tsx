// Markets segment — v1.4. The third Finance view. Macro snapshot: global
// indices, EUR FX pairs, benchmark rates, commodities, and an economic-event
// countdown. Fetches on mount (5-min cache in the store), with a manual
// refresh and a stale indicator when a refresh falls back to cached data.

import { useEffect } from 'react';
import SparkLine from './SparkLine';
import { useMarketsStore, type MacroRate } from '../store/useMarketsStore';
import { upcomingEvents, EVENT_ICONS } from '../data/economicCalendar';

export default function MarketsSegment() {
  const { indices, fxRates, macroRates, commodities, isLoading, stale, error, lastFetched, fetchMarkets } =
    useMarketsStore();

  useEffect(() => {
    void fetchMarkets();
  }, [fetchMarkets]);

  const events = upcomingEvents(5);
  const empty = indices.length === 0 && fxRates.length === 0 && commodities.length === 0 && macroRates.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.15em] text-text-muted">
          {lastFetched
            ? `Updated ${minutesAgo(lastFetched)}`
            : isLoading
              ? 'Loading…'
              : 'Markets'}
          {stale && <span className="text-warning"> · ⚠ cached</span>}
        </span>
        <button
          type="button"
          onClick={() => fetchMarkets({ force: true })}
          disabled={isLoading}
          className="text-[10px] uppercase tracking-wider text-primary border border-primary/40 rounded-sm px-2 py-0.5 active:bg-primary/10 disabled:opacity-40"
        >
          {isLoading ? '…' : '↻ Refresh'}
        </button>
      </div>

      {empty && isLoading && <SkeletonRows />}

      {empty && !isLoading && (
        <div className="card text-center text-xs text-text-muted py-6">
          {error ?? 'No market data available right now.'}
          <div className="text-[10px] mt-1">Tap ↻ Refresh to try again.</div>
        </div>
      )}

      {indices.length > 0 && (
        <Section title="Indices">
          {indices.map((i) => (
            <QuoteRow key={i.ticker} label={i.label} value={fmtNum(i.price)} change={i.changePercent} spark={i.spark} />
          ))}
        </Section>
      )}

      {fxRates.length > 0 && (
        <Section title="FX · EUR base">
          {fxRates.map((f) => (
            <QuoteRow key={f.pair} label={f.pair} value={fmtNum(f.rate, 4)} change={f.changePercent} spark={f.spark} />
          ))}
        </Section>
      )}

      {macroRates.length > 0 && (
        <Section title="Rates">
          {macroRates.map((r) => (
            <RateRow key={r.label} rate={r} />
          ))}
        </Section>
      )}

      {commodities.length > 0 && (
        <Section title="Commodities">
          {commodities.map((c) => (
            <CommodityRow key={c.label} label={c.label} value={`$${fmtNum(c.price)}`} change={c.changePercent} />
          ))}
        </Section>
      )}

      <Section title="Economic Calendar">
        {events.length === 0 && (
          <div className="text-[11px] text-text-muted text-center py-2">No upcoming events scheduled.</div>
        )}
        {events.map((e) => (
          <div key={`${e.date}-${e.label}`} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
            <CountdownBadge daysUntil={e.daysUntil} isToday={e.isToday} />
            <span className="text-sm" aria-hidden>{EVENT_ICONS[e.type]}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs truncate">{e.label}</div>
              <div className="text-[10px] text-text-muted">{fmtEventDate(e.date)}</div>
            </div>
            <span className="text-[9px] uppercase tracking-wider text-text-muted">{e.region}</span>
          </div>
        ))}
      </Section>
    </div>
  );
}

// ── Section shell ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="text-[10px] uppercase tracking-[0.15em] text-text-muted mb-2">{title}</div>
      <div>{children}</div>
    </div>
  );
}

// ── Index / FX row: label · value · change% arrow · sparkline ───────────────
function QuoteRow({ label, value, change, spark }: { label: string; value: string; change: number; spark: number[] }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
      <div className="w-24 flex-shrink-0">
        <div className="text-xs font-heading font-semibold truncate">{label}</div>
        <div className="text-[10px] text-text-muted">{value}</div>
      </div>
      <div className="flex-1 min-w-0 h-5">
        {spark.length >= 2 ? <SparkLine data={spark} height={20} /> : <div className="h-5" />}
      </div>
      <ChangePill change={change} />
    </div>
  );
}

// ── Commodity row: label · value · change% · inline day-change bar ──────────
function CommodityRow({ label, value, change }: { label: string; value: string; change: number }) {
  // Bar width ∝ |change| / 3, clamped to 32px. Positive cyan, negative red.
  const width = Math.min(32, (Math.abs(change) / 3) * 32);
  const positive = change >= 0;
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-heading font-semibold truncate">{label}</div>
        <div className="text-[10px] text-text-muted">{value}</div>
      </div>
      <div className="relative w-8 h-3 rounded-sm bg-surface2 overflow-hidden" aria-hidden>
        <div
          className={`absolute inset-y-0 left-0 ${positive ? 'bg-primary/60' : 'bg-danger/60'}`}
          style={{ width: `${width}px` }}
        />
      </div>
      <ChangePill change={change} />
    </div>
  );
}

// ── Rate row: label · 10-dot gauge · value ─────────────────────────────────
function RateRow({ rate }: { rate: MacroRate }) {
  const filled = Math.max(0, Math.min(10, Math.round((rate.value / rate.rangeMax) * 10)));
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
      <div className="flex-1 min-w-0 text-xs font-heading font-semibold truncate">{rate.label}</div>
      <div className="flex gap-0.5" aria-hidden>
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${i < filled ? 'bg-primary' : 'bg-surface2'}`}
          />
        ))}
      </div>
      <span className="text-xs font-heading font-semibold text-text w-12 text-right">
        {rate.value.toFixed(2)}%
      </span>
    </div>
  );
}

// ── Change % arrow pill ────────────────────────────────────────────────────
function ChangePill({ change }: { change: number }) {
  const flat = Math.abs(change) < 0.005;
  const arrow = flat ? '→' : change > 0 ? '↑' : '↓';
  const tone = flat ? 'text-text-muted' : change > 0 ? 'text-success' : 'text-danger';
  return (
    <span className={`text-[11px] font-heading whitespace-nowrap w-16 text-right ${tone}`}>
      {change > 0 && !flat ? '+' : ''}
      {change.toFixed(2)}% {arrow}
    </span>
  );
}

// ── Days-until badge ───────────────────────────────────────────────────────
function CountdownBadge({ daysUntil, isToday }: { daysUntil: number; isToday: boolean }) {
  const tone = isToday
    ? 'bg-danger/15 text-danger border-danger/40'
    : daysUntil <= 7
      ? 'bg-danger/10 text-danger border-danger/30'
      : daysUntil <= 14
        ? 'bg-warning/10 text-warning border-warning/30'
        : 'bg-surface2 text-text-muted border-border';
  return (
    <span className={`text-[9px] font-heading font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border w-10 text-center flex-shrink-0 ${tone}`}>
      {isToday ? 'Today' : `${daysUntil}d`}
    </span>
  );
}

function SkeletonRows() {
  return (
    <div className="card space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5">
          <div className="w-24 h-4 rounded-sm bg-surface2 animate-pulse" />
          <div className="flex-1 h-5 rounded-sm bg-surface2 animate-pulse" />
          <div className="w-16 h-4 rounded-sm bg-surface2 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

// ── Formatting helpers ─────────────────────────────────────────────────────
function fmtNum(n: number, decimals = 2): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function minutesAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins <= 0) return 'just now';
  if (mins === 1) return '1 min ago';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
}

function fmtEventDate(iso: string): string {
  const [y, m, d] = iso.split('-').map((p) => parseInt(p, 10));
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
