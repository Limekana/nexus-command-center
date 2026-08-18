// v1.8 / ACT-6 — the language picker, shared by Onboarding step 0 and Settings.
//
// Both used to inline `grid grid-cols-2` over SUPPORTED_LANGS. At six languages
// that was 3 rows (~154px); at ten it becomes 5 rows (~262px), which pushes
// Onboarding's Continue button below the fold on a 592px viewport — the same
// defect class as ACT-4, reintroduced by the fix for ACT-2.
//
// So the grid is capped at ~3.5 rows and scrolls. The half-visible row is the
// scroll affordance. The cap only bites once the list outgrows it, so the
// six-language layout renders exactly as before.
//
// The scroll-into-view is not a nicety: with ten languages the selected one can
// sit below the visible rows, and a user whose device resolved to (say) Hindi
// would open the picker, see English/Suomi/Français, and conclude their
// language isn't offered. That is precisely the audience ACT-6 exists for.

import { useEffect, useRef } from 'react';
import { setLanguage, SUPPORTED_LANGS, LANGUAGE_NAMES, type Lang } from '../i18n';

// Onboarding and Settings had different button treatments before this was
// extracted (panel card vs. flat left-aligned row). Both are preserved rather
// than flattened to one — the two screens read differently on purpose.
const VARIANTS = {
  onboarding: {
    base: 'panel-2 p-3 text-sm border transition-colors',
    on: 'border-primary bg-primary/10 text-primary font-semibold',
    off: 'border-border',
  },
  settings: {
    base: 'rounded-md p-2.5 text-sm border transition-colors text-start',
    on: 'border-primary bg-primary/10 text-primary font-semibold',
    off: 'border-border text-text',
  },
} as const;

interface Props {
  /** Currently active language, base tag (e.g. 'fi'). */
  current: Lang;
  variant: keyof typeof VARIANTS;
}

export default function LanguageGrid({ current, variant }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const styles = VARIANTS[variant];

  // Mount-only: bring the active language into view if it sits below the cap.
  //
  // Not `scrollIntoView({ block: 'nearest' })` — that was measured leaving the
  // last row ~10px short. The effect runs before the self-hosted display font
  // has swapped in, rows then grow, and the position it computed is stale. So
  // we do the math against live rects and re-apply once layout settles.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reveal = () => {
      const selected = el.querySelector('[aria-pressed="true"]');
      if (!selected) return;
      const box = el.getBoundingClientRect();
      const target = selected.getBoundingClientRect();
      // Container-relative, so it never scrolls the page.
      if (target.bottom > box.bottom) el.scrollTop += target.bottom - box.bottom;
      else if (target.top < box.top) el.scrollTop -= box.top - target.top;
    };

    reveal();
    const raf = requestAnimationFrame(reveal);
    void document.fonts?.ready.then(reveal).catch(() => {});

    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={ref}
      className="grid grid-cols-2 gap-2 max-h-[184px] overflow-y-auto overscroll-contain pe-0.5"
    >
      {SUPPORTED_LANGS.map((code) => (
        <button
          key={code}
          onClick={() => setLanguage(code)}
          aria-pressed={current === code}
          lang={code}
          className={`${styles.base} ${current === code ? styles.on : styles.off}`}
        >
          {LANGUAGE_NAMES[code]}
        </button>
      ))}
    </div>
  );
}
