// Generate RFC 4122 UUIDs. We use proper UUIDs because Supabase columns are
// typed `uuid` — non-UUID ids get rejected with `invalid input syntax for
// type uuid`. The original implementation used a short timestamp+rand string
// which is fine locally but doesn't sync to Postgres.

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback v4 (any old WebView without randomUUID — unlikely on Cap 7).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

// Deterministically map any string to a valid UUID. Used to remap legacy
// non-UUID ids in local Dexie when pushing to Supabase. The same input always
// produces the same UUID, so FK relationships are preserved across the
// remap (workout_set.session_id will reference the same UUID we wrote for
// workout_session.id).
//
// Uses FNV-1a 32-bit applied four times with different seeds to fill 128 bits.
// Not cryptographically secure — that's fine, we just need determinism +
// reasonable collision resistance for app-scale data.
export function legacyIdToUuid(id: string): string {
  if (isUuid(id)) return id;
  const seeds = [0x811c9dc5, 0xdeadbeef, 0x12345678, 0xfedcba98];
  const parts = seeds.map((seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  });
  const hex = parts.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
