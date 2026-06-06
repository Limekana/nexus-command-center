import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

/**
 * Pill — v1.2 chip primitive. Touch-friendly (>=32px, >=40px when size='lg'),
 * always pill-shaped, always glass-backed.
 *
 * Use for: filter chips, sort selectors, segmented controls, signal/rating
 * badges in Insights, status indicators that sit over the mesh.
 *
 * Don't use for: large primary CTAs (use .btn), table-row dense badges where
 * a rectangular .chip-on reads cleaner (kept around).
 *
 * Active state via `on` prop — same semantics as v1.0's .chip-on, but the
 * pill shape + glass blur stays consistent with v1.2 vocabulary.
 *
 * `tone` controls semantic color — `danger`/`success`/`warning` are reserved
 * for signal/rating use (Strong Sell pill is danger, Strong Buy is success).
 * Default tone is neutral; cyan accent only when `on` is true.
 */
export type PillTone = 'neutral' | 'danger' | 'success' | 'warning';
export type PillSize = 'sm' | 'md' | 'lg';

interface PillProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  on?: boolean;
  tone?: PillTone;
  size?: PillSize;
  /** When true, the element is a static <span>, not a clickable <button>. */
  asLabel?: boolean;
  /** Optional leading icon — usually 1 char (emoji or unicode glyph). */
  icon?: ReactNode;
  children?: ReactNode;
}

const TONE_CLASS: Record<PillTone, string> = {
  neutral: '',
  danger:  'pill-danger',
  success: 'pill-success',
  warning: 'pill-warning',
};

const SIZE_CLASS: Record<PillSize, string> = {
  sm: 'h-7 px-2.5 text-[11px]',
  md: '',           // default — h-8 px-3 text-xs via .pill
  lg: 'pill-lg',    // h-10 px-4 text-sm
};

export const Pill = forwardRef<HTMLButtonElement | HTMLSpanElement, PillProps>(
  function Pill(
    { on, tone = 'neutral', size = 'md', asLabel, icon, className = '', children, ...rest },
    ref,
  ) {
    // Active+tone interaction: when explicit tone is set, prefer the tone
    // class so the pill reads as "this rating tier" regardless of selected
    // state. Cyan `on` accent only kicks in for neutral pills (filter chips,
    // sort toggles) where the active concept is "this filter is selected."
    const stateClass = on && tone === 'neutral' ? 'pill-on' : TONE_CLASS[tone];
    const cls = ['pill', SIZE_CLASS[size], stateClass, className]
      .filter(Boolean)
      .join(' ');

    if (asLabel) {
      return (
        <span
          ref={ref as React.Ref<HTMLSpanElement>}
          className={cls}
          {...(rest as React.HTMLAttributes<HTMLSpanElement>)}
        >
          {icon && <span aria-hidden>{icon}</span>}
          {children}
        </span>
      );
    }
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type="button"
        aria-pressed={on}
        className={cls}
        {...rest}
      >
        {icon && <span aria-hidden>{icon}</span>}
        {children}
      </button>
    );
  },
);
