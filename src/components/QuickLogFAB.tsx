interface QuickLogFABProps {
  onClick: () => void;
}

/**
 * FAB — the app's one primary action, and the one element that earns a solid
 * fill of the signal amber.
 *
 * v1.10: the cyan glow halo is gone. A circle of the accent colour on a flat
 * ground is already the loudest thing on screen; a bloom around it was adding
 * emphasis to something that had no competition. Still circular — under the
 * instrument system `rounded-full` is reserved for genuinely round objects
 * (rings, dots, this), which is what makes the distinction carry meaning now
 * that panels and chips are square.
 */
export default function QuickLogFAB({ onClick }: QuickLogFABProps) {
  return (
    <button
      onClick={onClick}
      // bottom = nav-bar height (~5.5rem) + safe-area-inset + 1rem gap
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 7rem)' }}
      className="fixed end-5 w-14 h-14 rounded-full bg-primary text-bg z-20 flex items-center justify-center animate-pop-in press-spring"
      aria-label="Quick log"
    >
      <svg
        viewBox="0 0 24 24"
        className="w-7 h-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
