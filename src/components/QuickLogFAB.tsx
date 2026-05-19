interface QuickLogFABProps {
  onClick: () => void;
}

export default function QuickLogFAB({ onClick }: QuickLogFABProps) {
  return (
    <button
      onClick={onClick}
      // bottom = nav-bar height (~5.5rem of content) + safe-area-inset + small gap
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 7rem)' }}
      className="fixed right-5 w-14 h-14 rounded-full bg-primary text-bg shadow-glow active:scale-95 z-20 flex items-center justify-center"
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
