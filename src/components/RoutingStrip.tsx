import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useFitnessStore } from '../store/useFitnessStore';
import { useStudiesStore } from '../store/useStudiesStore';
import { useTaskStore } from '../store/useTaskStore';
import { useSyncStore } from '../store/useSyncStore';

/**
 * Rack's routing strip — the input row at the top of the rack.
 *
 * `●—— LIMELOG ——● —— STUDYDESK ——○`, then the sync clock.
 *
 * This is the element that makes the *suite* visible: NCC is a hub three
 * sibling apps write into, and nothing in the free theme ever says so. It only
 * pays off when several inputs are live, which is the point — the buyer is the
 * completionist running all three.
 *
 * Dashboard only. Repeating it on every screen would turn a status line into
 * chrome.
 *
 * Deviation from the handoff, deliberate: it defines a lit dot as "that app
 * has written **since last sync**". Taken literally, every dot goes dark the
 * moment a sync completes — which is precisely when the data is freshest, so
 * the strip would read as "everything is silent" exactly when everything is
 * healthy. Lit here means "has written within the last 7 days", which is the
 * question a glance is actually asking: is this input still feeding me?
 */

const LIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isRecent(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? false : now - t <= LIVE_WINDOW_MS;
}

export function RoutingStrip({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const workouts = useFitnessStore((s) => s.sessions);
  const studySessions = useStudiesStore((s) => s.studySessions);
  const grades = useStudiesStore((s) => s.grades);
  const tasks = useTaskStore((s) => s.tasks);
  const lastSyncedAt = useSyncStore((s) => s.lastSyncedAt);

  const inputs = useMemo(() => {
    // Read the clock once per render rather than per input, so three dots
    // cannot straddle a tick and disagree about what "now" is.
    const now = Date.now();
    const newest = (xs: Array<string | undefined>) =>
      xs.reduce<string | null>((a, b) => (b && (!a || b > a) ? b : a), null);

    return [
      {
        key: 'limelog',
        label: 'LIMELOG',
        live: isRecent(newest(workouts.map((s) => s.date)), now),
      },
      {
        key: 'studydesk',
        label: 'STUDYDESK',
        live: isRecent(
          newest([
            ...studySessions.map((s) => s.startedAt),
            ...grades.map((g) => g.updatedAt ?? g.createdAt),
          ]),
          now,
        ),
      },
      {
        key: 'nexus',
        label: 'NEXUS',
        live: isRecent(newest(tasks.map((x) => x.updatedAt ?? x.createdAt)), now),
      },
    ];
  }, [workouts, studySessions, grades, tasks]);

  const clock = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className={`panel px-3 py-2 flex items-center gap-2 overflow-x-auto no-scrollbar ${className}`}>
      <span className="sec flex-shrink-0">{t('rack.inputs')}</span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {inputs.map((input, i) => (
          <span key={input.key} className="flex items-center gap-1.5 flex-shrink-0">
            {i > 0 && <span className="w-3 h-px bg-border" aria-hidden="true" />}
            <span
              className={`rack-led${input.live ? ' rack-led--on' : ''}`}
              aria-hidden="true"
            />
            <span className="sec whitespace-nowrap">{input.label}</span>
            <span
              className="sr-only"
            >{input.live ? t('rack.inputLive') : t('rack.inputSilent')}</span>
          </span>
        ))}
      </div>
      <span className="font-mono text-[0.625rem] text-text-muted flex-shrink-0 tabular-nums">
        {clock}
      </span>
    </div>
  );
}

export default RoutingStrip;
