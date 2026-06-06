import { useSyncStore } from '../store/useSyncStore';

/**
 * v1.2 — moved from a flat top strip to a floating pill that lands below
 * the status bar. Less visually intrusive when offline is a momentary
 * blip on a flaky network, but still clearly signals state via the warning
 * color. Glass background composites with the ambient mesh so the strip
 * never feels glued to the screen edge.
 */
export default function OfflineBanner() {
  const isOnline = useSyncStore((s) => s.isOnline);
  if (isOnline) return null;
  return (
    <div className="px-3 pt-2 safe-top">
      <div className="max-w-md mx-auto">
        <div className="glass rounded-pill text-warning text-xs py-1.5 px-4 text-center border border-warning/40 animate-fade-in-up" style={{ background: 'rgba(210, 153, 34, 0.08)' }}>
          Offline — showing local data · writes queued for sync
        </div>
      </div>
    </div>
  );
}
