import { useSyncStore } from '../store/useSyncStore';

function timeOf(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fi-FI', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export default function SyncStatusChip() {
  const isOnline = useSyncStore((s) => s.isOnline);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);
  const pendingCount = useSyncStore((s) => s.pendingCount);

  if (!isOnline) {
    return (
      <div className="alert alert-warn">
        <span className="w-2 h-2 rounded-full bg-warning" />
        <span>Offline — {pendingCount} writes queued</span>
      </div>
    );
  }

  return (
    <div className="alert alert-ok">
      <span className="w-2 h-2 rounded-full bg-success" />
      <span>
        Local · synced {timeOf(lastSyncedAt) ?? '—'} · offline-capable
      </span>
    </div>
  );
}
