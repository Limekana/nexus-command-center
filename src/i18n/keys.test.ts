import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import en from './locales/en.json';

// v1.17 (NCC#111) — every literal key passed to `t()` must exist in en.json.
// A missing key has no fallback: i18next prints the key itself, in every
// language. `yearReview.back` shipped that way for months because nothing
// checked. Keys built at runtime (`t(\`fin.${x}\`)`) are out of reach of a
// static scan and are not covered here.

const SRC = join(__dirname, '..');
const KEY = /\bt\(\s*(['"])([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)\1/g;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function lookup(key: string): unknown {
  return key.split('.').reduce<unknown>(
    (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    en,
  );
}

// A plural key is called by its base name and stored as `_one`/`_other`.
const exists = (key: string) =>
  lookup(key) !== undefined || lookup(`${key}_one`) !== undefined || lookup(`${key}_other`) !== undefined;

describe('i18n keys', () => {
  it('every literal t() key resolves in en.json', () => {
    const missing: string[] = [];
    let seen = 0;
    for (const file of sourceFiles(SRC)) {
      for (const match of readFileSync(file, 'utf8').matchAll(KEY)) {
        seen++;
        if (!exists(match[2])) missing.push(`${match[2]} (${file.slice(SRC.length + 1)})`);
      }
    }
    // Guards the scan itself: a regex that silently matched nothing would pass.
    expect(seen).toBeGreaterThan(1000);
    expect(missing).toEqual([]);
  });
});
