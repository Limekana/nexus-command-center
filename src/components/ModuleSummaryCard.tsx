import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface ModuleSummaryCardProps {
  title: string;
  icon: string;
  tag?: string;
  to: string;
  children: ReactNode;
}

/**
 * v1.2 — promoted from flat .card to .glass + rounded-xl. This component is
 * the Dashboard's primary visual repeated 5–6 times, so it's the dominant
 * carrier of the v1.2 vibe. The press-spring on tap gives the surface a
 * tactile feel when entering a module.
 *
 * Tag chip migrated to .pill so it reads as part of the v1.2 vocabulary.
 */
export default function ModuleSummaryCard({ title, icon, tag, to, children }: ModuleSummaryCardProps) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="glass rounded-xl p-4 text-left press-spring flex flex-col min-h-[124px] w-full"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-heading font-semibold text-sm flex items-center gap-2">
          <span aria-hidden>{icon}</span> {title}
        </span>
        {tag && (
          <span className="inline-flex items-center h-6 px-2 rounded-pill text-[10px] font-heading uppercase tracking-wider text-primary border border-primary/45" style={{ background: 'rgba(0, 212, 255, 0.10)' }}>
            {tag}
          </span>
        )}
      </div>
      <div className="space-y-1.5 flex-1 flex flex-col justify-center">{children}</div>
    </button>
  );
}
