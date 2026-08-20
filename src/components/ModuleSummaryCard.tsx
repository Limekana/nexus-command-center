import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import Glyph from './Glyph';

interface ModuleSummaryCardProps {
  title: string;
  /** A Glyph name (see components/Glyph.tsx), not a character. */
  icon: string;
  tag?: string;
  to: string;
  children: ReactNode;
}

/**
 * The Dashboard's primary visual, repeated 5–6 times, so it carries the look
 * more than any other component. Flat panel, rule, micro-label tag chip, and a
 * stroke icon that takes its colour from the row rather than from the
 * platform's emoji font.
 */
export default function ModuleSummaryCard({ title, icon, tag, to, children }: ModuleSummaryCardProps) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="panel p-4 text-start press-spring flex flex-col min-h-[124px] w-full"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-heading font-semibold text-sm flex items-center gap-2">
          <Glyph name={icon} size={15} className="text-text-muted" /> {title}
        </span>
        {tag && (
          <span className="chip-micro h-6">{tag}</span>
        )}
      </div>
      <div className="space-y-1.5 flex-1 flex flex-col justify-center">{children}</div>
    </button>
  );
}
