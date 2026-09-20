// v1.15 (Item 13, handoff follow-up #46) — Rack's Dashboard units below the
// primary budget meter: the 2U meter bank and the channels unit.
//
// They replace the overview StatCards under Rack. That is also how the theme
// keeps status colour off the metal: the StatCards print their danger/success
// line straight onto the panel, which is the thing the handoff says turns a
// machine into a skin. Here status lives on the meter face (fill, tick) or in
// an LED dot, never as coloured text on the faceplate.
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Meter, { type PeakTone } from './Meter';
import type { Task } from '../types/tasks';
import { isOverdue, isToday } from '../utils/formatters';

// ── Meter bank ────────────────────────────────────────────────────────────

interface BankProps {
  gpa: number | null;
  gpaMax: number;
  gpaPrevious: number | null;
  gpaDisplay: string;
  workouts: number;
  /** The "on target" count the free theme's StatCard already uses. */
  workoutTarget: number;
  tasksDue: number;
  tasksOverdue: number;
}

function BankCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="sec text-[0.625rem] truncate">{label}</div>
      <div className="mt-1 p-1.5" style={{ background: 'var(--meter-face)' }}>
        {children}
      </div>
    </div>
  );
}

export function RackMeterBank(p: BankProps) {
  const { t } = useTranslation();

  // GPA: the held peak is the previous GPA. At or above it holds (green);
  // a new best lights the tick; below it prints in the red zone colour.
  let gpaTone: PeakTone = 'ok';
  if (p.gpa != null && p.gpaPrevious != null) {
    gpaTone = p.gpa > p.gpaPrevious ? 'new' : p.gpa < p.gpaPrevious ? 'over' : 'ok';
  }

  // Workouts: tick at the weekly target; the scale runs a little past it so
  // beating the target is visible rather than pinned at the end.
  const workoutMax = Math.max(p.workoutTarget + 1, p.workouts);

  // Tasks due: no tick. Anything overdue means the count is over its limit,
  // so the fill itself goes to the red-zone colour.
  const taskMax = Math.max(5, p.tasksDue);

  return (
    <div className="panel px-2.5 py-2.5 grid grid-cols-3 gap-2">
      <BankCell label={t('dash.gpa')}>
        <div className="meter-readout text-[0.9375rem]">{p.gpaDisplay}</div>
        <Meter
          className="mt-1"
          value={p.gpa ?? 0}
          max={p.gpaMax}
          peak={p.gpaPrevious ?? undefined}
          peakTone={gpaTone}
          height={5}
          label={t('dash.gpa')}
        />
      </BankCell>
      <BankCell label={t('rack.workouts')}>
        <div className="meter-readout text-[0.9375rem]">{p.workouts}×</div>
        <Meter
          className="mt-1"
          value={p.workouts}
          max={workoutMax}
          peak={p.workoutTarget}
          peakTone={p.workouts >= p.workoutTarget ? 'ok' : 'over'}
          height={5}
          label={t('rack.workouts')}
        />
      </BankCell>
      <BankCell label={t('rack.tasksDue')}>
        <div className="meter-readout text-[0.9375rem]">{p.tasksDue}</div>
        <Meter
          className="mt-1"
          value={p.tasksDue}
          max={taskMax}
          forceOver={p.tasksOverdue > 0}
          height={5}
          label={t('rack.tasksDue')}
        />
      </BankCell>
    </div>
  );
}

// ── Channels ──────────────────────────────────────────────────────────────

const CHANNEL_ROWS = 3;

export function RackChannels({ tasks }: { tasks: Task[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const open = tasks.filter((x) => !x.completed && x.dueDate);
  const overdue = open.filter((x) => isOverdue(x.dueDate!));
  const today = open.filter((x) => isToday(x.dueDate!) && !isOverdue(x.dueDate!));
  const rows = [
    ...overdue.map((task) => ({ task, over: true })),
    ...today.map((task) => ({ task, over: false })),
  ].slice(0, CHANNEL_ROWS);

  return (
    <button type="button" onClick={() => navigate('/tasks')} className="panel w-full text-start px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="sec">{t('rack.channels')}</span>
        {overdue.length > 0 && (
          <span className="font-mono text-[0.625rem] tracking-[0.1em] text-danger">
            {t('rack.nOver', { count: overdue.length })}
          </span>
        )}
      </div>
      <div className="mt-1.5">
        {rows.length === 0 ? (
          <div className="flex items-center gap-2 py-1.5 text-xs text-text-muted">
            <span className="rack-led" aria-hidden="true" />
            {t('rack.allClear')}
          </div>
        ) : (
          rows.map(({ task, over }, i) => (
            <div
              key={task.id}
              className={`flex items-center gap-2 py-1.5 ${i > 0 ? 'border-t border-border-soft' : ''}`}
            >
              <span className={`rack-led ${over ? 'rack-led--on' : 'rack-led--ok'}`} aria-hidden="true" />
              <span className="flex-1 min-w-0 truncate text-xs">{task.title}</span>
              <span className={`font-mono text-[0.5625rem] tracking-[0.1em] uppercase ${over ? 'text-danger' : 'text-text-faint'}`}>
                {over ? t('rack.statusOver') : t('rack.statusToday')}
              </span>
            </div>
          ))
        )}
      </div>
    </button>
  );
}
