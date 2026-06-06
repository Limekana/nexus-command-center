interface QuickLogFABProps {
  onClick: () => void;
}

/**
 * v1.2 FAB — pop-in on mount, spring scale on press, cyan-glow halo.
 *
 * Visual: keeps the cyan circle but layers an outer halo via shadow-glass-glow
 * + a brief pop-in animation when first painted (after the user navigates to
 * a FAB-eligible route). On press, the spring scale-down (.press-spring) reads
 * as the surface compressing rather than the flat scale-95 v1.0 had.
 */
export default function QuickLogFAB({ onClick }: QuickLogFABProps) {
  return (
    <button
      onClick={onClick}
      // bottom = glass nav-bar height (~5.5rem) + safe-area-inset + 1rem gap
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 7rem)' }}
      className="fixed right-5 w-14 h-14 rounded-full bg-primary text-bg z-20 flex items-center justify-center shadow-glass-glow animate-pop-in press-spring"
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
