import { defineConfig } from 'vitest/config';
import path from 'path';

// Kept separate from `vite.config.ts` on purpose: that file carries the dev
// proxies, the Capacitor/Electron build shape and a `define` keyed off
// `process.env.VERCEL`, none of which a Node-side unit run needs. Tests here
// are pure logic only (v1.16, limecore#11) — no jsdom, no component rendering.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Dexie needs a real IndexedDB; `fake-indexeddb/auto` installs one on
    // globalThis. Loaded for every file rather than per-test so a module that
    // touches `db` at import time cannot throw before a test body runs.
    setupFiles: ['./src/test/setup.ts'],
  },
});
