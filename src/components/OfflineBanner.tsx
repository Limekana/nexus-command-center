import { useSyncStore } from '../store/useSyncStore';

export default function OfflineBanner() {
  const isOnline = useSyncStore((s) => s.isOnline);
  if (isOnline) return null;
  return (
    <div className="bg-warning/10 border-b border-warning/30 text-warning text-xs py-2 px-4 text-center">
      Offline — showing local data · writes queued for sync
    </div>
  );
}
