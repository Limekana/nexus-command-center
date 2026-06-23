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

export interface LifeProfile {
  preset: LifeProfilePreset;
  /** weight 0–100 per domain; 0 = excluded. Enabled weights sum to 100. */
  domains: Record<DomainKey, number>;
}

/** A custom profile must keep at least this many domains enabled… */
export const MIN_ENABLED_DOMAINS = 2;
/** …and no enabled domain may drop below this weight. */
export const MIN_DOMAIN_WEIGHT = 5;

export const DOMAIN_LABELS: Record<DomainKey, string> = {
  finance: 'Finance',
  fitness: 'Fitness',
  studies: 'Studies',
  work: 'Work',
  habits: 'Habits',
};

export const STUDENT_PROFILE: LifeProfile = {
  preset: 'student',
  domains: { finance: 25, fitness: 25, studies: 25, work: 0, habits: 25 },
};

export const PROFESSIONAL_PROFILE: LifeProfile = {
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

export interface ProfileValidation {
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
  const candidate: LifeProfile = { preset, domains };
  return validateLifeProfile(candidate).valid ? candidate : clone(STUDENT_PROFILE);
}

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
