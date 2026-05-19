// Horizontal chip row showing recurring-pattern templates for one module.
// Renders nothing when there are no templates so the screen layout stays
// stable for new users.

import type { ReactNode } from 'react';

interface TemplateChipsProps<T> {
  templates: T[];
  /** Labels rendered inside the chip — e.g. "Lidl · 12.50€" */
  label: (t: T) => ReactNode;
  /** Fires when the user picks a chip; consumers should pre-fill their form. */
  onPick: (t: T) => void;
  /** Optional title — defaults to "Recent" (compact, neutral framing). */
  title?: string;
}

export default function TemplateChips<T extends { id: string }>({
  templates,
  label,
  onPick,
  title = 'Recent',
}: TemplateChipsProps<T>) {
  if (templates.length === 0) return null;
  return (
    <div>
      <div className="sec mb-2">{title}</div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-4 px-4">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => onPick(t)}
            className="chip flex-shrink-0"
            type="button"
          >
            {label(t)}
          </button>
        ))}
      </div>
    </div>
  );
}
