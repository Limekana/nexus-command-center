# F-Droid CI handoff — 2026-07-20

Branch: `fdroid/ci-handoff-2026-07-20`. Everything below is verified, not assumed.
The registry entry lives in `limecore/Nexus_Version_Status.md` (not a git repo, so
the recipes + this doc are mirrored here under `fdroid/`).

MRs: NCC !41550 · LimeLog !41548 · StudyDesk !41551 (`fdroid/fdroiddata` on GitLab)
Fork: `gitlab.com/Limekana/fdroiddata`, branches `add-ncc` / `add-limecore-suite` / `add-studydesk`
Local fork clone on the dev machine: `C:\Windows\Temp\fdroiddata-fork`

---

## DONE — shipped and verified

### The reproducible-build mismatch is root-caused and fixed
It was **two unrelated bugs**, and neither was what we assumed. Both original
hypotheses (Node version drift, Windows-vs-Linux path separators) were tested and
**falsified**: a clean `npm ci` + build is byte-identical across Windows and Debian,
Node 22 and Node 24 (verified in Docker), and `node_modules` matched
`package-lock.json` exactly (0 drifted packages) in both repos.
**F-Droid's builds were correct. Ours were wrong.**

**1. NCC — stale synced web assets.**
`android/app/src/main/assets/public/` held an *older* bundle. `assembleRelease` was
run without re-running `npm run build && npx cap sync android`, so Gradle packaged
whatever was already sitting there. Proof: the shipped bundle contained `/growth`
and `nav.growth` — the **reverted** Growth hub — which do not exist anywhere in
v1.7.0 source, and it was 10,439 bytes larger than v1.7.0 produces.
→ Rebuilt correctly (`index-wpJ2IxFl.js` / `index-D94EUagt.css`, matching F-Droid CI
exactly), release asset **replaced**. Tag and source unchanged.
→ **Process rule: always `npm run cap:sync` immediately before `assembleRelease`.**

**2. LimeLog — missing build-time env (worse).**
`src/lib/supabase.ts` read `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from
`import.meta.env` with **no fallback**. Vite inlines those at build time and `.env`
is gitignored, so any clean-checkout build (i.e. F-Droid) inlined `undefined` and
shipped an app whose `createClient` threw at startup — no sign-in, no sync — and
could never byte-match ours.
→ Fixed in v1.8.1 using the `env || hardcoded` pattern NCC and StudyDesk already had.
Verified: a no-`.env` Debian/Node 22 container build is now **byte-identical** to the
local build. The anon key is publishable (RLS is the gate) and was already inlined in
every released APK.

### Releases (all signed, cert `27e17d1f…55e4` — one shared keystore for all 3 apps)
- **NCC v1.7.0** — APK replaced on the existing release. Binaries URL → 200.
- **LimeLog v1.8.1** (vc17) — new release published. Binaries URL → 200.
- **StudyDesk v1.5.2** (vc11) — tagged + pushed, **no APK yet** (see blockers).

### Other fixes landed
- **StudyDesk v1.5.2** closes `STUDYDESK-UNSCOPED`: the uncommitted `develop` work was
  audit fixes. Includes a real data-loss fix in `src/lib/merge.js` — LWW compared
  timestamps as **strings** (local `...sssZ` vs Postgres `...+00:00`), so two writes in
  the same second could clobber the newer edit. Plus midnight-rollover fix (`TODAY` was
  frozen at module load), hydrate guards, eslint `android/` ignore.
- **LimeLog `.gitignore`**: `android/key.properties` (keystore password) was untracked
  **and unignored** — any `git add -A` would have committed it to a public repo. Fixed.

---

## BLOCKED — what's left

### 1. fdroiddata CI still red — canonical formatting only (NOT build logic)
`fdroid lint` **passes**. The failures are `fdroid rewritemeta`, `schema validation`,
and `fdroid build`. Reproduced locally: **`fdroid rewritemeta` rewrites the file into a
canonical form and CI rejects any diff.** It strips all comments, reorders fields, and
wraps long values. Our recipes are heavily commented → guaranteed diff → fail.

**Do not blindly use local `fdroid rewritemeta` output.** The dev machine's
fdroidserver (in the hermes venv) is a *different version* from CI's: it wraps
`AllowedAPKSigningKeys` and leaves **trailing spaces**, which its own linter then
flags, and it is not idempotent. Merged, CI-passing recipes in fdroiddata master
(e.g. `metadata/InfinityLoop1309.NewPipeEnhanced.yml`, `metadata/S.N.A.K.E.yml`) keep
`AllowedAPKSigningKeys: <64hex>` on **one unwrapped line** (87 chars).

**Recommended next step:** match fdroiddata's own tooling version rather than guessing —
install the fdroidserver version CI uses (or run their container) and let *that*
`rewritemeta` produce the file. Then commit its exact output, comments stripped. Our
rationale is preserved in `fdroid/README.md`, which does not ship to fdroiddata.

Canonical field order observed: `AntiFeatures, Categories, License, AuthorName,
SourceCode, IssueTracker, AutoName, RepoType, Repo, Binaries, Builds,
AllowedAPKSigningKeys, AutoUpdateMode, UpdateCheckMode, CurrentVersion,
CurrentVersionCode`; build keys: `versionName, versionCode, commit, subdir, sudo, init,
gradle, prebuild, scandelete`.

Note: YAML line-folding collapses the checksum line's two spaces to one
(`HASH  file` → `HASH file`). **Verified harmless** — GNU `sha256sum -c` accepts one space.

### 2. StudyDesk cannot be release-signed here
`android/key.properties` is **absent** in the StudyDesk repo (present in NCC and
LimeLog). Building it produces an *unsigned* APK. That file holds the keystore
password, so it needs to be added by hand on the dev machine. Until then StudyDesk's
`Binaries:` URL 404s, which is why **its recipe was deliberately NOT pushed** to
`add-studydesk` — pushing it would fail that MR's CI.

### 3. MR comments not posted
No `glab` CLI and no GitLab token on the dev machine, so there is no API path. Pushing
to the fork branches *does* re-trigger CI (that worked), but leaving a comment needs a
browser session. Draft text is in `fdroid/MR_COMMENT_NCC.md` — paste it into !41550
once CI is actually green. **Do not claim "fixed" before CI passes.**

---

## Quick reference

```
# reproduce a clean F-Droid-style build (no .env), any app:
docker run --rm -v "$PWD:/app" -w /app node:22.23.1-bookworm-slim \
  bash -c "npm ci && npm run build && ls dist/assets/"

# correct release build (NEVER skip cap:sync):
npm run cap:sync && cd android && ./gradlew assembleRelease

# verify signing cert:
apksigner verify --print-certs app-release.apk
```

Suite state: NCC `1.7.0` · LimeLog `1.8.1` 🟠 · StudyDesk `1.5.2` 🟠
