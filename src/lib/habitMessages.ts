// ─── v1.5.2 Habit notification copy ──────────────────────────────────────
//
// Duolingo-style: rotating, streak-aware messages instead of a bare title.
// The variant rotates by day-of-year so the copy changes day to day but is
// deterministic (we re-pick on every app open, so it stays fresh). `{h}` is
// the habit title, `{n}` the current streak length.

export type HabitMsgKind = 'primary' | 'evening' | 'morning' | 'milestone';

interface Msg {
  title: string;
  body: string;
}

function fill(s: string, habit: string, streak: number): string {
  return s.replace(/\{h\}/g, habit).replace(/\{n\}/g, String(streak));
}

// Pools. Each entry is [title, body]. Title is short; body carries personality.
const PRIMARY_STREAK: [string, string][] = [
  ['🔥 {n}-day streak', "Keep it alive — time for {h}."],
  ['Day {n} done?', "Don't break the chain. {h} is calling."],
  ['{n} days strong 💪', '{h} — same time, same energy.'],
  ['Streak watch: {n} days', 'One rep of consistency: {h}.'],
];
const PRIMARY_FRESH: [string, string][] = [
  ['Time for {h}', 'Small step now, big momentum later.'],
  ['{h} 🎯', 'Start a streak today — just begin.'],
  ['Quick win available', '{h}. Two minutes of effort, all-day pride.'],
  ['Your move', '{h} is waiting. Make today count.'],
];
const EVENING_STREAK: [string, string][] = [
  ['Streak at risk 🌙', "Your {n}-day run on {h} isn't logged yet — still time."],
  ["Don't lose {n} days", '{h} before bed keeps the streak alive.'],
  ['Last call for {h}', "{n}-day streak on the line. You've got this."],
];
const MORNING_CATCHUP: [string, string][] = [
  ['Log last night? 📖', 'Did you do {h}? Tap to mark it.'],
  ['Catch-up', "{h} yesterday — tap to log it if you did."],
  ['Morning check-in', 'Forgot to log {h} last night? Tap to fix it.'],
];

export function habitMessage(kind: HabitMsgKind, habit: string, streak: number, seed = dayOfYear()): Msg {
  let pool: [string, string][];
  switch (kind) {
    case 'primary':
      pool = streak > 0 ? PRIMARY_STREAK : PRIMARY_FRESH;
      break;
    case 'evening':
      pool = EVENING_STREAK;
      break;
    case 'morning':
      pool = MORNING_CATCHUP;
      break;
    case 'milestone':
      return milestoneMessage(habit, streak);
  }
  const [t, b] = pool[Math.abs(seed) % pool.length];
  return { title: fill(t, habit, streak), body: fill(b, habit, streak) };
}

function milestoneMessage(habit: string, streak: number): Msg {
  const flair = streak >= 365 ? '🏆' : streak >= 100 ? '💯' : streak >= 30 ? '⭐' : '🔥';
  return {
    title: `${flair} ${streak}-day streak!`,
    body: `${streak} days of ${habit}. That's a real habit now — keep going.`,
  };
}

/** The streak lengths that trigger a one-off celebration notification. */
export const STREAK_MILESTONES = [7, 30, 100, 365] as const;

function dayOfYear(d: Date = new Date()): number {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}
