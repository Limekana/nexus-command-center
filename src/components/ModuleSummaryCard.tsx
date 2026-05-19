import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface ModuleSummaryCardProps {
  title: string;
  icon: string;
  tag?: string;
  to: string;
  children: ReactNode;
}

export default function ModuleSummaryCard({ title, icon, tag, to, children }: ModuleSummaryCardProps) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="card text-left active:scale-[0.99] active:bg-surface2 transition-transform flex flex-col min-h-[124px]"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-heading font-semibold text-sm flex items-center gap-2">
          <span>{icon}</span> {title}
        </span>
        {tag && (
          <span className="text-[9px] font-heading uppercase tracking-wider text-primary border border-primary/40 bg-primary/5 rounded-sm px-1.5 py-0.5">
            {tag}
          </span>
        )}
      </div>
      <div className="space-y-1.5 flex-1 flex flex-col justify-center">{children}</div>
    </button>
  );
}
