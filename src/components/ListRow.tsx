import { ReactNode } from 'react';

interface ListRowProps {
  label: ReactNode;
  value?: ReactNode;
  tag?: { text: string; tone?: 'red' | 'green' | 'amber' | 'muted' };
  leading?: ReactNode;
  onClick?: () => void;
}

const toneClasses: Record<string, string> = {
  red: 'bg-danger/15 text-danger border-danger/30',
  green: 'bg-success/15 text-success border-success/30',
  amber: 'bg-warning/15 text-warning border-warning/30',
  muted: 'bg-surface2 text-text-muted border-border',
};

export default function ListRow({ label, value, tag, leading, onClick }: ListRowProps) {
  return (
    <div
      className={`flex items-center gap-3 py-1.5 ${onClick ? 'cursor-pointer active:bg-surface2 -mx-1 px-1 rounded' : ''}`}
      onClick={onClick}
    >
      {leading ?? <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" />}
      <div className="flex-1 text-sm text-text truncate">{label}</div>
      {value && <div className="text-sm text-text-muted whitespace-nowrap">{value}</div>}
      {tag && (
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-sm border whitespace-nowrap ${
            toneClasses[tag.tone ?? 'muted']
          }`}
        >
          {tag.text}
        </span>
      )}
    </div>
  );
}
