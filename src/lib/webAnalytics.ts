// Vercel Web Analytics — web deployment only, compiled out of every other build.
//
// WHY THE GATE IS AT BUILD TIME AND NOT RUNTIME
//
// This is the same bundle `cap sync` copies into the Android APK that F-Droid
// builds and redistributes. A runtime check (`if (!Capacitor.isNativePlatform())`)
// would stop the tracker from *running* there, but the library would still sit
// inside the APK — and `@vercel/analytics` does not declare `sideEffects: false`,
// so Rollup will not tree-shake a static import even behind a branch it can
// prove is dead. A dynamic import behind a compile-time constant does get
// dropped: Vite replaces the flag with a literal, the early return becomes
// unconditional, the rest is unreachable, and the import() and its chunk go
// with it. Checked rather than assumed, on every build:
//
//   npm run build && grep -ri "_vercel/insights" dist/   # expect no matches
//
// The flag comes from `process.env.VERCEL` in vite.config.ts, which Vercel sets
// on every build it runs. Nothing needs configuring by hand, and no local,
// Electron-desktop or F-Droid build can switch it on by accident.
//
// The tracker is also undeclared in our F-Droid recipe (`AntiFeatures` lists
// only NonFreeNet). linsui already caught production.dataviz.cnn.io and
// open.er-api.com as undisclosed hosts on !41550; shipping this one would be
// the same mistake with a review step that no longer exists, since
// AutoUpdateMode: Version publishes without one.

// Declared locally rather than via a global `vite-env.d.ts`: this is the only
// `import.meta.env` reader in the app, and pulling in vite/client's ambient
// declarations for one flag would widen the type surface for no benefit.
declare global {
  interface ImportMetaEnv {
    readonly VITE_WEB_ANALYTICS?: boolean;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export function initWebAnalytics(): void {
  if (!import.meta.env.VITE_WEB_ANALYTICS) return;
  import('@vercel/analytics')
    .then(({ inject }) => inject())
    .catch(() => {
      // Analytics must never be why the app fails to start.
    });
}
