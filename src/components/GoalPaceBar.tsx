// v1.14 — a goal's progress against its reference trajectory.
//
// ── THE IDEA, WHICH IS THE WHOLE DESIGN ──────────────────────────────────
//
// The row already had a progress bar and the words "behind by 1.5". The bar
// said how far along you are; the words said how far along you SHOULD be. The
// second of those was a number the user had to take on trust, sitting next to
// a picture that could not show it.
//
// So the reference trajectory goes on the same track as the fill. A tick marks
// where an even pace would have you today, and the distance between the end of
// the fill and that tick IS the gap — the thing the sentence used to assert is
// now a length you can see. Same move as StudyDesk's weight rail and punch
// card: turn a number you must trust into an object you can check.
//
// ── AND WHAT IT IS NOT ALLOWED TO LOOK LIKE ──────────────────────────────
//
// Behind pace is drawn, not scolded. The previous version tinted the whole bar
// `warning` amber the moment you slipped behind, which is an alarm colour doing
// the exact job the design constraint forbids: a goal is reached at an uneven
// pace, and a quiet week is not a failure. So:
//
//   - the fill keeps its normal colour at every status,
//   - the gap is a soft neutral band, not a red or amber one,
//   - nothing flashes, decays, resets, or can be "lost",
//   - and the sentence underneath names the work that closes it.
//
// There is no visual state in here that a user can fail into. That is
// deliberate and it is the point of the feature.

interface Props {
  /** 0..1 of the target accumulated. May exceed 1. */
  progress: number;
  /** 0..1 of the way from start date to target date. */
  elapsed: number;
  status: 'ahead' | 'on' | 'behind' | 'done' | 'unknown';
  /** The sentence shown beneath; also the bar's accessible name, because a
   *  bar with a tick on it is not self-describing to a screen reader. */
  label: string;
}

const pct = (n: number) => `${Math.min(100, Math.max(0, n * 100)).toFixed(2)}%`;

export default function GoalPaceBar({ progress, elapsed, status, label }: Props) {
  const done = status === 'done';
  // A goal with no target date has no trajectory, so it gets no tick — drawing
  // one at an arbitrary place would invent a deadline the user never set.
  const showTick = status !== 'unknown' && !done;
  const behind = status === 'behind';

  return (
    <div className="relative flex-1 h-2 rounded-full bg-surface2 overflow-hidden" role="img" aria-label={label}>
      <div
        className={`h-full ${done ? 'bg-success' : 'bg-primary'} transition-all`}
        style={{ width: pct(progress) }}
      />
      {/* The gap, drawn only when there is one. Soft and neutral: this is the
          distance left to make up, not a warning. */}
      {behind && (
        <div
          className="absolute inset-y-0 bg-text-muted/20"
          style={{ left: pct(progress), width: pct(Math.max(0, elapsed - progress)) }}
        />
      )}
      {/* Where an even pace would have you today. 2px and full height so it
          reads as a mark ON the track rather than a segment OF it. */}
      {showTick && (
        <div
          className="absolute inset-y-0 w-0.5 bg-text-muted"
          style={{ left: pct(elapsed), transform: 'translateX(-1px)' }}
        />
      )}
    </div>
  );
}
