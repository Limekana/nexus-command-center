// v1.15 (Item 13) — Rack's primary meter: this month's budget read off a
// cream-lit scale with the limit printed on it, so 91% is visibly in the red
// zone rather than merely coloured red. Rack-only; the free theme keeps its
// StatCard. Callers gate on the active theme.
import { useTranslation } from 'react-i18next';
import Meter from './Meter';
import { formatCurrency } from '../utils/formatters';

interface Props {
  spent: number;
  limit: number;
}

// Where the printed red zone starts — the same 90% the StatCard's danger tone
// already switches at, so the two themes agree about when a budget is in
// trouble.
const RED_ZONE_FROM = 90;

export default function RackBudgetMeter({ spent, limit }: Props) {
  const { t } = useTranslation();
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
  const month = new Date().toLocaleDateString(undefined, { month: 'long' });
  return (
    <div className="panel px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="sec">{t('rack.budgetMeter', { month })}</span>
        <span className="font-mono text-xs text-primary tabular-nums">{pct}%</span>
      </div>
      <div className="mt-2 ms-2 p-2" style={{ background: 'var(--meter-face)' }}>
        <Meter
          value={spent}
          max={limit}
          redZoneFrom={RED_ZONE_FROM}
          showScale
          height={11}
          label={t('rack.budgetMeterAria', { pct })}
        />
        <div className="meter-readout text-xl mt-1.5">
          {formatCurrency(Math.max(0, limit - spent))}
          <span className="meter-readout__unit">{t('rack.left')}</span>
        </div>
      </div>
    </div>
  );
}
