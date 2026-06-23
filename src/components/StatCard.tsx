interface StatCardProps {
  value: string | number;
  label: string;
  sub?: string;
  highlight?: boolean;
  tone?: 'default' | 'danger' | 'success' | 'warning';
}

const toneClass: Record<string, string> = {
  default: 'text-text-muted',
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
};

export default function StatCard({ value, label, sub, highlight, tone = 'default' }: StatCardProps) {
  return (
    <div className={`stat-box ${highlight ? 'stat-box-hi' : ''}`}>
      <div className="font-heading font-bold text-2xl text-text leading-tight tracking-tight">{value}</div>
      <div className="sec">{label}</div>
      {sub && <div className={`text-[10px] mt-0.5 ${toneClass[tone]}`}>{sub}</div>}
    </div>
  );
}
