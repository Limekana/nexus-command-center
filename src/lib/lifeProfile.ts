// ─── v1.5 Life Profile model ─────────────────────────────────────────────
//
// The Life Score used to weight four fixed domains equally (Finance, Fitness,
// Studies, Habits — 25% each). v1.5 makes the domain mix configurable:
//
//   - Student      : Finance · Fitness · Studies · Habits   (25 each)
//   - Professional : Finance · Fitness · Work    · Habits   (25 each)
//   - Custom       : any ≥2 of the five domains, weights summing to 100
//
// A domain with weight 0 is excluded from the score and its Life-tab card.
// Pure model + validation + auto-balance helpers — no React, no storage. The
// store (useLifeProfileStore) owns persistence; the Custom configurator (1C)
// drives the auto-balance functions here.

export const DOMAIN_KEYS = ['finance', 'fitness', 'studies', 'work', 'habits'] as const;
export type DomainKey = (typeof DOMAIN_KEYS)[number];

export type LifeProfilePreset = 'student' | 'professional' | 'custom';

/** One baseline setting, effective from a week-start key (`YYYY-MM-DD`). */
export interface WeeklyTargetRule {
  /** Week-start key this baseline takes effect from, inclusive. */
  from: string;
  target: number;
}

export interface LifeProfile {
  preset: LifeProfilePreset;
  /** weight 0–100 per domain; 0 = excluded. Enabled weights sum to 100. */
  domains: Record<DomainKey, number>;
  /**
   * v1.9 (Item 3) — workouts/week the fitness sub-score aims at, as a *history*
   * rather than one number, ascending by `from`.
   *
   * A single mutable number would have rewritten the past: raise your target
   * from 3 to 5 and every closed week silently re-scores against 5, so a week
   * you finished on target drops to 60. `crossDomainSignals` states the rule
   * this has to obey — "history must not drift" — so each change appends an
   * entry instead, and a week is always scored against the baseline that was
   * in force while it was being lived.
   *
   * Empty/absent means the pre-v1.9 default of 3 for every week, so existing
   * profiles keep scoring exactly as they did.
   */
  weeklyTargets?: WeeklyTargetRule[];
  /**
   * Per-week exceptions keyed by week-start, for weeks the baseline shouldn't
   * judge — illness, injury, travel. Beats the baseline for that week only.
   */
  weeklyTargetOverrides?: Record<string, number>;
}

/** Pre-v1.9 hardcoded value. Still the default when nothing has been set. */
export const DEFAULT_WEEKLY_WORKOUT_TARGET = 3;
export const MIN_WEEKLY_WORKOUT_TARGET = 1;
/** Two a day, every day, is already past anything the score can usefully rank. */
export const MAX_WEEKLY_WORKOUT_TARGET = 14;

function clampTarget(n: unknown): number | null {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.min(MAX_WEEKLY_WORKOUT_TARGET, Math.max(MIN_WEEKLY_WORKOUT_TARGET, Math.round(v)));
}

/**
 * The workout target in force for `weekKey`: a per-week override if one exists,
 * otherwise the newest baseline that had taken effect by then, otherwise the
 * pre-v1.9 default.
 */
export function weeklyTargetFor(profile: LifeProfile | undefined, weekKey: string): number {
  if (!profile) return DEFAULT_WEEKLY_WORKOUT_TARGET;
  const override = profile.weeklyTargetOverrides?.[weekKey];
  const clampedOverride = override === undefined ? null : clampTarget(override);
  if (clampedOverride !== null) return clampedOverride;
  // Rules are kept sorted ascending, so the last one that has taken effect by
  // `weekKey` wins. Keys are `YYYY-MM-DD`, where lexical order is chronological.
  let current = DEFAULT_WEEKLY_WORKOUT_TARGET;
  for (const rule of profile.weeklyTargets ?? []) {
    if (rule.from <= weekKey) current = rule.target;
    else break;
  }
  return current;
}

/** The baseline in force right now — what Settings shows and edits. */
export function currentWeeklyTarget(profile: LifeProfile | undefined): number {
  const rules = profile?.weeklyTargets ?? [];
  return rules.length ? rules[rules.length - 1].target : DEFAULT_WEEKLY_WORKOUT_TARGET;
}

/**
 * Set the baseline from `fromWeekKey` forward, leaving earlier weeks alone.
 *
 * Replaces rather than appends when a rule already starts at that same week, so
 * changing your mind twice in one week doesn't grow the list.
 */
export function withWeeklyTarget(
  profile: LifeProfile,
  target: number,
  fromWeekKey: string,
): LifeProfile {
  const clamped = clampTarget(target) ?? DEFAULT_WEEKLY_WORKOUT_TARGET;
  const rules = (profile.weeklyTargets ?? []).filter((r) => r.from !== fromWeekKey);
  rules.push({ from: fromWeekKey, target: clamped });
  rules.sort((a, b) => a.from.localeCompare(b.from));
  return { ...profile, weeklyTargets: rules };
}

/** Set (or, with `null`, clear) the exception for one week. */
export function withWeeklyTargetOverride(
  profile: LifeProfile,
  weekKey: string,
  target: number | null,
): LifeProfile {
  const next = { ...(profile.weeklyTargetOverrides ?? {}) };
  if (target === null) delete next[weekKey];
  else next[weekKey] = clampTarget(target) ?? DEFAULT_WEEKLY_WORKOUT_TARGET;
  return { ...profile, weeklyTargetOverrides: next };
}

/** A custom profile must keep at least this many domains enabled… */
export const MIN_ENABLED_DOMAINS = 2;
/** …and no enabled domain may drop below this weight. */
export const MIN_DOMAIN_WEIGHT = 5;

export const STUDENT_PROFILE: LifeProfile = {
  preset: 'student',
  domains: { finance: 25, fitness: 25, studies: 25, work: 0, habits: 25 },
};

const PROFESSIONAL_PROFILE: LifeProfile = {
  preset: 'professional',
  domains: { finance: 25, fitness: 25, studies: 0, work: 25, habits: 25 },
};

export function presetProfile(preset: 'student' | 'professional'): LifeProfile {
  return preset === 'student' ? clone(STUDENT_PROFILE) : clone(PROFESSIONAL_PROFILE);
}

export function enabledDomains(p: LifeProfile): DomainKey[] {
  return DOMAIN_KEYS.filter((k) => (p.domains[k] ?? 0) > 0);
}

export function totalWeight(p: LifeProfile): number {
  return DOMAIN_KEYS.reduce((sum, k) => sum + (p.domains[k] ?? 0), 0);
}

interface ProfileValidation {
  valid: boolean;
  error?: string;
}

/** Structural validation used before persisting. Presets are always valid;
 *  custom profiles must have ≥2 enabled domains, each ≥MIN, summing to 100. */
export function validateLifeProfile(p: LifeProfile): ProfileValidation {
  if (!p || !p.domains) return { valid: false, error: 'Missing profile' };
  for (const k of DOMAIN_KEYS) {
    const w = p.domains[k];
    if (typeof w !== 'number' || !Number.isFinite(w) || w < 0 || w > 100) {
      return { valid: false, error: `Invalid weight for ${k}` };
    }
  }
  const enabled = enabledDomains(p);
  if (enabled.length < MIN_ENABLED_DOMAINS) {
    return { valid: false, error: `Enable at least ${MIN_ENABLED_DOMAINS} domains` };
  }
  if (enabled.some((k) => p.domains[k] < MIN_DOMAIN_WEIGHT)) {
    return { valid: false, error: `Each domain needs at least ${MIN_DOMAIN_WEIGHT}%` };
  }
  if (totalWeight(p) !== 100) {
    return { valid: false, error: 'Weights must total 100%' };
  }
  return { valid: true };
}

/** Coerce an untrusted value (e.g. from user_preferences JSONB) into a valid
 *  LifeProfile, falling back to Student. Never throws. */
export function sanitiseLifeProfile(raw: unknown): LifeProfile {
  if (!raw || typeof raw !== 'object') return clone(STUDENT_PROFILE);
  const obj = raw as Partial<LifeProfile>;
  const preset: LifeProfilePreset =
    obj.preset === 'professional' || obj.preset === 'custom' || obj.preset === 'student'
      ? obj.preset
      : 'custom';
  const domains: Record<DomainKey, number> = { finance: 0, fitness: 0, studies: 0, work: 0, habits: 0 };
  const src = (obj.domains ?? {}) as Partial<Record<DomainKey, unknown>>;
  for (const k of DOMAIN_KEYS) {
    const n = Number(src[k]);
    domains[k] = Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
  }
  // v1.9 — the workout-target fields are rebuilt here too. This function
  // constructs a fresh object rather than spreading `obj`, so anything not
  // named explicitly is silently dropped on every load; leaving these out
  // would have wiped the user's target the first time their profile synced.
  const rawRules = Array.isArray(obj.weeklyTargets) ? obj.weeklyTargets : [];
  const weeklyTargets: WeeklyTargetRule[] = rawRules
    .map((r) => {
      const from = (r as Partial<WeeklyTargetRule>)?.from;
      const target = clampTarget((r as Partial<WeeklyTargetRule>)?.target);
      return typeof from === 'string' && WEEK_KEY_RE.test(from) && target !== null
        ? { from, target }
        : null;
    })
    .filter((r): r is WeeklyTargetRule => r !== null)
    .sort((a, b) => a.from.localeCompare(b.from));

  const weeklyTargetOverrides: Record<string, number> = {};
  const rawOverrides = (obj.weeklyTargetOverrides ?? {}) as Record<string, unknown>;
  if (rawOverrides && typeof rawOverrides === 'object') {
    for (const [k, v] of Object.entries(rawOverrides)) {
      const target = clampTarget(v);
      if (WEEK_KEY_RE.test(k) && target !== null) weeklyTargetOverrides[k] = target;
    }
  }

  const candidate: LifeProfile = { preset, domains, weeklyTargets, weeklyTargetOverrides };
  return validateLifeProfile(candidate).valid ? candidate : clone(STUDENT_PROFILE);
}

/** Week-start keys are `YYYY-MM-DD`; anything else is not ours and is dropped. */
const WEEK_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Auto-balance (Custom configurator) ──────────────────────────────────

/** Set `target`'s weight to `desired`, redistributing the remainder across the
 *  other enabled domains proportionally to their current weights, keeping the
 *  total at exactly 100 and every enabled domain ≥ MIN. Marks preset 'custom'. */
export function withWeight(profile: LifeProfile, target: DomainKey, desired: number): LifeProfile {
  const enabled = enabledDomains(profile);
  if (!enabled.includes(target)) return profile;
  const others = enabled.filter((d) => d !== target);
  if (others.length === 0) {
    return setDomains(profile, { ...zeroAll(), [target]: 100 });
  }
  const maxForTarget = 100 - MIN_DOMAIN_WEIGHT * others.length;
  const w = clampInt(desired, MIN_DOMAIN_WEIGHT, maxForTarget);
  const balanced = balance(others.map((d) => profile.domains[d]), 100 - w);
  const next = zeroAll();
  next[target] = w;
  others.forEach((d, i) => (next[d] = balanced[i]));
  return setDomains(profile, next);
}

/** Enable or disable `target`. Disabling redistributes its weight equally to
 *  the remaining enabled domains; enabling starts it at the average of the
 *  currently-enabled domains and rebalances. Refuses to drop below
 *  MIN_ENABLED_DOMAINS. Marks preset 'custom'. */
export function withDomainEnabled(profile: LifeProfile, target: DomainKey, enabled: boolean): LifeProfile {
  const currentlyEnabled = enabledDomains(profile);
  const isOn = currentlyEnabled.includes(target);

  if (enabled && isOn) return profile;
  if (!enabled && !isOn) return profile;

  if (!enabled) {
    // Disabling — must keep ≥ MIN_ENABLED_DOMAINS.
    if (currentlyEnabled.length <= MIN_ENABLED_DOMAINS) return profile;
    const others = currentlyEnabled.filter((d) => d !== target);
    const balanced = balance(others.map((d) => profile.domains[d]), 100);
    const next = zeroAll();
    others.forEach((d, i) => (next[d] = balanced[i]));
    return setDomains(profile, next);
  }

  // Enabling — give it the average of the currently-enabled domains, then
  // rebalance the rest down to fit.
  const avg = currentlyEnabled.length > 0
    ? Math.round(currentlyEnabled.reduce((s, d) => s + profile.domains[d], 0) / currentlyEnabled.length)
    : 100;
  const start = clampInt(avg, MIN_DOMAIN_WEIGHT, 100 - MIN_DOMAIN_WEIGHT * currentlyEnabled.length);
  const balanced = balance(currentlyEnabled.map((d) => profile.domains[d]), 100 - start);
  const next = zeroAll();
  next[target] = start;
  currentlyEnabled.forEach((d, i) => (next[d] = balanced[i]));
  return setDomains(profile, next);
}

// ─── internals ───────────────────────────────────────────────────────────

function setDomains(profile: LifeProfile, domains: Record<DomainKey, number>): LifeProfile {
  return { preset: 'custom', domains };
}

function zeroAll(): Record<DomainKey, number> {
  return { finance: 0, fitness: 0, studies: 0, work: 0, habits: 0 };
}

/** Distribute `total` across `weights.length` slots proportionally to the
 *  given current weights, each result ≥ MIN, integers summing to exactly
 *  `total`. */
function balance(weights: number[], total: number): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const min = MIN_DOMAIN_WEIGHT;
  // Reserve the minimums, distribute the surplus proportionally.
  const surplus = Math.max(0, total - min * n);
  const sum = weights.reduce((a, b) => a + b, 0);
  const result = weights.map((w) =>
    min + (sum > 0 ? Math.round((surplus * w) / sum) : Math.round(surplus / n)),
  );
  // Correct rounding drift so the result sums to exactly `total`.
  let drift = total - result.reduce((a, b) => a + b, 0);
  let i = 0;
  while (drift !== 0 && n > 0) {
    const idx = i % n;
    const step = drift > 0 ? 1 : -1;
    if (result[idx] + step >= min) {
      result[idx] += step;
      drift -= step;
    }
    i++;
    if (i > 1000) break; // safety
  }
  return result;
}

function clampInt(n: number, lo: number, hi: number): number {
  const v = Math.round(Number.isFinite(n) ? n : lo);
  return Math.min(Math.max(v, lo), Math.max(lo, hi));
}

function clone(p: LifeProfile): LifeProfile {
  return { preset: p.preset, domains: { ...p.domains } };
}
