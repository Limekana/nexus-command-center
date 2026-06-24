interface ProgressBarProps {
  label: string;
  value: number;
  max: number;
  format?: (v: number, m: number) => string;
}

export default function ProgressBar({ label, value, max, format }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const over = value > max;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-text-muted">{label}</span>
        <span className={over ? 'text-danger' : 'text-text'}>
          {format ? format(value, max) : `${value} / ${max}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface2 overflow-hidden">
        <div
          className={`h-full ${over ? 'bg-danger' : pct > 80 ? 'bg-warning' : 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
