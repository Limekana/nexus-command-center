Build recipe updated — reproducible build should now resolve.

Two problems in the previous revision would have failed the build, plus the reproducible-build fields were incomplete:

1. **Node too old.** The recipe installed Node via `apt-get install -y npm`, which gives Node 18 on the buildserver. This app is Capacitor 7 and `@capacitor/cli` requires `node >=20`, so `npx cap sync android` aborted before Gradle ran. The recipe now installs a pinned, sha256-verified Node 22.23.1 (LTS) in `sudo:`.

2. **`node_modules` reached the source scanner.** esbuild ships a prebuilt binary and Rollup ships native `.node` modules, which the scanner rejects. Added `scandelete: node_modules` — safe because `cap sync` has already copied the built web assets into `android/app/src/main/assets` before the scan runs.

Also: `Categories` was `Money` (not in `config/categories.yml`) → `Finance Manager`; `AutoUpdateMode` is now `Version v%v` and `commit:` pins the `v1.7.0` tag to match `UpdateCheckMode: Tags`.

**Reproducible build:** `Binaries:` and `AllowedAPKSigningKeys` are now set. A release-signed APK is published at the pinned tag:
`https://github.com/Limekana/nexus-command-center/releases/download/v1.7.0/NexusCommandCenter-1.7.0.apk`
Signing cert SHA-256: `27e17d1fba157da6eacde58485aab56066200cc45ad00bd518d828367ec155e4` (shared Limecore Studio key — the same cert signs LimeLog and StudyDesk).

Locally `fdroid lint` passes clean. Ready for a CI re-run — thanks for your patience.
