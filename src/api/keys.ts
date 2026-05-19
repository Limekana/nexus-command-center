// User-provided API keys, stored via Capacitor Preferences (falls back to
// localStorage in dev browser). Two design points worth flagging:
//
// 1. NO defaults. We don't ship a built-in key — users enter their own. This
//    keeps each install on its own 60 calls/min budget instead of fighting
//    over a single shared key. Without a key, fetch functions short-circuit
//    and the UI surfaces a "Add your Finnhub key in Settings" banner.
//
// 2. Multiple key slots. Finnhub's free tier is 60/min PER KEY. Users can
//    register multiple free accounts and add two keys here; we round-robin
//    them on each call, doubling effective headroom for the cost of a few
//    extra minutes of signup. `getApiKey('finnhub')` returns whichever key
//    has the lowest recent-call count, falling back to whichever exists.
//
// CoinGecko + Yahoo (chart, quoteSummary) don't require keys.

import { Preferences } from '@capacitor/preferences';

export type ApiKeyName = 'finnhub' | 'finnhub2';

const PREFIX = 'apikey_';

async function readKey(name: ApiKeyName): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key: PREFIX + name });
    if (value) return value;
  } catch {
    const v = localStorage.getItem(PREFIX + name);
    if (v) return v;
  }
  return null;
}

// In-memory rotation index for Finnhub key selection. Picks the next slot
// each call so consecutive requests spread across both keys.
let finnhubRotateIdx = 0;

// Public: return whichever finnhub key is available, alternating between
// slots when both are configured. Logical name 'finnhub' triggers rotation;
// 'finnhub2' is treated as a direct lookup (used by Settings UI).
export async function getApiKey(name: ApiKeyName): Promise<string | null> {
  if (name === 'finnhub2') return readKey('finnhub2');
  // Logical name 'finnhub' — pick from the configured slots.
  const [k1, k2] = await Promise.all([readKey('finnhub'), readKey('finnhub2')]);
  if (k1 && k2) {
    finnhubRotateIdx = (finnhubRotateIdx + 1) % 2;
    return finnhubRotateIdx === 0 ? k1 : k2;
  }
  return k1 || k2 || null;
}

export async function setApiKey(name: ApiKeyName, value: string): Promise<void> {
  try {
    await Preferences.set({ key: PREFIX + name, value });
  } catch {
    localStorage.setItem(PREFIX + name, value);
  }
}

export async function clearApiKey(name: ApiKeyName): Promise<void> {
  try {
    await Preferences.remove({ key: PREFIX + name });
  } catch {
    localStorage.removeItem(PREFIX + name);
  }
}

export function maskKey(key: string): string {
  if (!key) return '—';
  if (key.length < 6) return '••••';
  return `••••${key.slice(-4)}`;
}

// Convenience for UI: how many Finnhub key slots are currently filled (0/1/2)?
export async function finnhubKeyCount(): Promise<number> {
  const [k1, k2] = await Promise.all([readKey('finnhub'), readKey('finnhub2')]);
  return (k1 ? 1 : 0) + (k2 ? 1 : 0);
}
