import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// LAN_DEV=1 binds the dev server to all interfaces so a phone on the same
// Wi-Fi can hit it (Capacitor live-reload). Default is localhost only — never
// expose the dev server on untrusted networks, since dev-time tools like
// Vite/esbuild have known cross-origin read vulnerabilities on the dev port.
const lanDev = process.env.LAN_DEV === '1';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    host: lanDev ? true : 'localhost',
    port: 5173,
  },
  build: {
    outDir: 'dist',
    // Source maps leak full TS source + comments into the shipped APK. Off in
    // production; inline in dev so DevTools traces are still readable.
    sourcemap: process.env.NODE_ENV === 'production' ? false : 'inline',
  },
});
