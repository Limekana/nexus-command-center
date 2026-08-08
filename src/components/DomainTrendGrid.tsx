// v1.9 Item 14b #8 — cross-domain panels, side by side.
//
// The Life screen already shows THIS WEEK's sub-scores and a history of the
// COMPOSITE. What it has never shown is each domain's own weekly series on one
// shared time axis, which is the only view in which "cross-domain" is something
// you can see rather than something the insight text asserts. A phone cannot
// show five aligned series; a desktop column can, and that is the whole reason
// this item is in the desktop edition.
//
// DESIGN — one axis, five readings, no shared scale.
// Sessions, minutes, ratios and scores are not comparable quantities, so each
// row normalises against its own maximum and says so. What IS shared is the
// horizontal position: week N is the same column in every row, so a dip that
// lines up across rows is a real co-occurrence rather than an artefact of two
// charts drawn at different widths. Selecting a week highlights that column in
// every row at once and prints the week's numbers underneath — the plan's
// drill-down requirement (#3) in the form this view can carry it.
//
// Correlation is not claimed. The rows are placed so the eye can find
// co-movement; naming a cause is what `crossDomainSignals`' ranked insights do,
// against a threshold, in words.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PRIMARY, SUCCESS, WARNING, VIOLET } from '../lib/themeColors';

export interface DomainSeries {
  key: string;
  label: string;
  colour: string;
  /** Oldest → newest, one per week, aligned with `weekStarts`. */
  values: (number | null)[];
  /** Fixed upper bound for rows whose scale is meaningful (a 0..100 score, a
   *  0..1 ratio). Omitted rows normalise against their own maximum. */
  max?: number;
  /** Draws a reference line at this value — used for budget adherence, where
   *  1.0 is "exactly on plan" and the interesting fact is which side of it a
   *  week fell on. */
  reference?: number;
  format: (v: number) => string;
}

interface Props {
  /** `YYYY-MM-DD` Mondays, oldest → newest. */
  weekStarts: string[];
  series: DomainSeries[];
}

const ROW_H = 34;

export default function DomainTrendGrid({ weekStarts, series }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const [selected, setSelected] = useState<number | null>(null);

  const scales = useMemo(
    () =>
      series.map((s) => {
        const observed = s.values.filter((v): v is number => v != null && Number.isFinite(v));
        const top = s.max ?? Math.max(...observed, 0);
        // A row whose every value is zero still needs a positive divisor;
        // rendering NaN widths would silently blank the row.
        return top > 0 ? top : 1;
      }),
    [series],
  );

  if (weekStarts.length === 0) {
    return <div className="text-xs text-text-muted text-center py-6">{t('fin.dtg.empty')}</div>;
  }

  const weekLabel = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {series.map((s, rowIdx) => (
            <div key={s.key} className="flex items-center gap-3 mb-1.5 last:mb-0">
              <div className="w-[104px] flex-shrink-0">
                <div className="text-[11px] truncate flex items-center gap-1.5" title={s.label}>
                  <span
                    aria-hidden
                    className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: s.colour }}
                  />
                  <span className="truncate">{s.label}</span>
                </div>
                <div className="text-[9px] text-text-muted tabular-nums">
                  {(() => {
                    const last = s.values[s.values.length - 1];
                    return last == null ? '—' : s.format(last);
                  })()}
                </div>
              </div>

              <div className="flex-1 flex items-end gap-px relative" style={{ height: ROW_H }}>
                {s.reference != null && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 border-t border-dashed border-text-muted/40"
                    style={{ bottom: `${Math.min((s.reference / scales[rowIdx]) * 100, 100)}%` }}
                  />
                )}
                {s.values.map((v, i) => {
                  const isSel = selected === i;
                  const pct = v == null ? 0 : Math.min((v / scales[rowIdx]) * 100, 100);
                  return (
                    <button
                      key={weekStarts[i] ?? i}
                      type="button"
                      onClick={() => setSelected((cur) => (cur === i ? null : i))}
                      title={`${weekLabel(weekStarts[i])} — ${v == null ? '—' : s.format(v)}`}
                      aria-label={`${s.label} ${weekLabel(weekStarts[i])}: ${v == null ? t('fin.dtg.noData') : s.format(v)}`}
                      className={`flex-1 h-full flex items-end min-w-[6px] rounded-sm transition-colors ${
                        isSel ? 'bg-primary/10' : 'hover:bg-surface2/60'
                      }`}
                    >
                      {/* A null week is genuinely absent, not zero — it draws a
                          hairline at the baseline so the column still exists to
                          click without implying a measured zero. */}
                      <span
                        className="w-full rounded-sm"
                        style={{
                          height: v == null ? 1 : `${Math.max(pct, 2)}%`,
                          background: v == null ? 'rgba(139,148,158,0.35)' : s.colour,
                          opacity: selected == null || isSel ? 1 : 0.42,
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3 mt-1">
            <div className="w-[104px] flex-shrink-0" />
            <div className="flex-1 flex gap-px">
              {weekStarts.map((w, i) => (
                <span
                  key={w}
                  className={`flex-1 text-[8px] text-center truncate ${
                    selected === i ? 'text-primary' : 'text-text-muted'
                  }`}
                >
                  {/* Every other label on a dense window — twelve overlapping
                      dates are less readable than six clear ones. */}
                  {weekStarts.length > 8 && i % 2 === 1 ? '' : weekLabel(w)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selected != null && (
        <div className="mt-3 pt-3 border-t border-border/40">
          <div className="sec mb-1.5">{t('fin.dtg.weekOf', { date: weekLabel(weekStarts[selected]) })}</div>
          <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
            {series.map((s) => {
              const v = s.values[selected];
              return (
                <div key={s.key} className="rounded-md border border-border bg-surface2/40 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-wider text-text-muted truncate">{s.label}</div>
                  <div className="text-sm font-heading font-semibold tabular-nums" style={{ color: s.colour }}>
                    {v == null ? '—' : s.format(v)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-[10px] text-text-muted mt-2">{t('fin.dtg.scaleCaveat')}</div>
    </div>
  );
}

/** Palette assignment kept here so the grid matches the Life-score ring's
 *  domain colours rather than inventing a second mapping. */
export const DOMAIN_COLOURS = {
  life: PRIMARY,
  fitness: SUCCESS,
  study: VIOLET,
  habits: WARNING,
  finance: PRIMARY,
} as const;
