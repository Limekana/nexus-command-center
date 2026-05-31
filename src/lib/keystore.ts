// v1.4 — TS wrapper around the native LimecoreKeystore plugin.
//
// Wraps Android Keystore primitives (see LimecoreKeystorePlugin.java) with
// a graceful no-op fallback for web dev. Native paths throw on Keystore
// errors; callers must wrap in try/catch and decide whether to fall back
// to plaintext storage (auth.ts does this for PIN hash on first load).
//
// Aliases used elsewhere in the app — declared here as constants so the
// migration path can refer to them without typo risk:
//   - 'auth.pin' — PIN hash storage (v3 format)
//   - 'dexie.key' — reserved for future Dexie at-rest encryption

import { Capacitor, registerPlugin } from '@capacitor/core';

interface LimecoreKeystoreApi {
  getOrCreateKey(opts: { alias: string }): Promise<{ created: boolean }>;
  hasKey(opts: { alias: string }): Promise<{ exists: boolean }>;
  encrypt(opts: { alias: string; plaintext: string }): Promise<{ ciphertext: string; iv: string }>;
  decrypt(opts: { alias: string; ciphertext: string; iv: string }): Promise<{ plaintext: string }>;
  deleteKey(opts: { alias: string }): Promise<void>;
}

// Plugin name MUST match @CapacitorPlugin(name = "LimecoreKeystore") on
// the Java side. Registered in MainActivity.registerPlugin(...).
const LimecoreKeystore = registerPlugin<LimecoreKeystoreApi>('LimecoreKeystore');

export const KEYSTORE_ALIAS_PIN = 'auth.pin';
export const KEYSTORE_ALIAS_DEXIE = 'dexie.key';

/** True if we're on a platform where the plugin can actually do work.
 *  Returns false on web (the plugin is registered but the methods will
 *  throw). Caller should branch on this before attempting encryption. */
export function keystoreAvailable(): boolean {
  return Capacitor.isNativePlatform();
}

/** Ensure a key exists at the given alias. Idempotent — no-op when the
 *  key already exists. Returns true if a new key was minted this call. */
export async function ensureKey(alias: string): Promise<boolean> {
  if (!keystoreAvailable()) return false;
  const { created } = await LimecoreKeystore.getOrCreateKey({ alias });
  return created;
}

/** Encrypt UTF-8 plaintext. Returns the base64 pair the caller must
 *  persist together — decrypt requires both. Throws if the key doesn't
 *  exist or the underlying Keystore call fails. */
export async function encrypt(alias: string, plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  if (!keystoreAvailable()) {
    throw new Error('Keystore unavailable on this platform.');
  }
  return await LimecoreKeystore.encrypt({ alias, plaintext });
}

/** Decrypt a base64 ciphertext+iv pair. Throws on GCM auth failure
 *  (tampering, wrong key) — callers should treat that as "blob is
 *  unrecoverable, reinitialize." */
export async function decrypt(alias: string, ciphertext: string, iv: string): Promise<string> {
  if (!keystoreAvailable()) {
    throw new Error('Keystore unavailable on this platform.');
  }
  const { plaintext } = await LimecoreKeystore.decrypt({ alias, ciphertext, iv });
  return plaintext;
}

/** Check whether a key exists at the alias without trying to use it. */
export async function hasKey(alias: string): Promise<boolean> {
  if (!keystoreAvailable()) return false;
  const { exists } = await LimecoreKeystore.hasKey({ alias });
  return exists;
}

/** Delete a key. Used to invalidate stored blobs (the encrypted data
 *  becomes permanently unrecoverable). */
export async function deleteKey(alias: string): Promise<void> {
  if (!keystoreAvailable()) return;
  await LimecoreKeystore.deleteKey({ alias });
}
