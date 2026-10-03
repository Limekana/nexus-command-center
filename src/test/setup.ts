// Global test setup (v1.16, limecore#11).

// Dexie needs a real IndexedDB; this installs one on globalThis.
import 'fake-indexeddb/auto';

// `src/db/database.ts` reaches `lib/entitlement` → `lib/supabase`, and the
// Supabase client reads its persisted session the moment it is constructed.
// Under `environment: 'node'` there is no web storage, so that read rejects and
// Vitest reports an unhandled error even when every assertion passes. A plain
// in-memory Map is enough: no test asserts on session persistence, and keeping
// the node environment means the suite does not pay for a DOM it never uses.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: memoryStorage, writable: true });
}
