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
    // ─── Dev-only CORS proxies ────────────────────────────────────────
    //
    // On Android, network calls go through @capacitor/core's CapacitorHttp,
    // which bypasses the WebView's CORS check entirely. So the production
    // build doesn't need these — they're a dev-preview-only convenience so
    // localhost:5173 can actually fetch quotes/news/FX while iterating.
    //
    // Each proxy strips its prefix and forwards to the real upstream. The
    // API code (yahoo.ts, finnhub.ts, coingecko.ts, marketNews.ts,
    // fxRates.ts) detects Capacitor.isNativePlatform() and uses the direct
    // URLs in native builds; on web it uses the proxied paths below.
    proxy: {
      '/yfin': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/yfin/, ''),
      },
      '/yfin2': {
        target: 'https://query2.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/yfin2/, ''),
      },
      '/fh': {
        target: 'https://finnhub.io',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/fh/, ''),
      },
      '/cg': {
        target: 'https://api.coingecko.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/cg/, ''),
      },
      '/fx': {
        target: 'https://open.er-api.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/fx/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    // Source maps leak full TS source + comments into the shipped APK. Off in
    // production; inline in dev so DevTools traces are still readable.
    sourcemap: process.env.NODE_ENV === 'production' ? false : 'inline',
  },
});
