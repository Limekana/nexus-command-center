import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.limecore.nexus',
  appName: 'Nexus Command Center',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#0D1117',
  },
  plugins: {
    // CapacitorHttp's global fetch/XHR patch is OFF because it interferes with
    // Supabase JS — specifically it appears to drop or mangle the
    // `Authorization: Bearer <jwt>` header on /rest/v1 calls, causing RLS to
    // reject every write (auth.uid() = null vs. user_id check fails).
    //
    // We still install the plugin so we can call `CapacitorHttp.request()`
    // directly for the one endpoint that needs CORS-bypassed native HTTP:
    // Yahoo Finance's chart API. See src/api/yahoo.ts.
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
