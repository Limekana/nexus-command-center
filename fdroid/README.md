# FD-4 — fdroiddata submission drafts (staging)

Three `metadata/<package>.yml` drafts for submission to `fdroid/fdroiddata`
on GitLab via merge request. Staged here (outside the app repos) until the
prerequisites clear.

MRs: NCC !41550 · LimeLog !41548 · StudyDesk !41551
Fork clone: `C:\Windows\Temp\fdroiddata-fork`
(branches add-ncc / add-limecore-suite / add-studydesk)

Target is **reproducible builds** — linsui asked for this on !41550. F-Droid
builds from our source, byte-compares the result against our own signed APK,
and on a match adopts our signing cert so updates stay interchangeable with
our GitHub Releases builds. Background: `../FDROID_REPRODUCIBLE_BUILDS_GUIDE.md`.

---

## Cleared (2026-07-17)

- ~~**Tags don't exist**~~ — `v1.7.0` (NCC) and `v1.8.0` (LimeLog) are tagged
  and pushed; each recipe's pinned commit is the current `origin/main` HEAD.
  Recipes now pin the **tag name**, not a raw SHA, so `UpdateCheckMode: Tags`
  and `AutoUpdateMode` agree with each other.
- ~~**LICENSE files missing**~~ — MIT `LICENSE` is present in both repo roots.
- **Node too old** — both recipes ran `apt-get install -y npm`, which gives
  Node 18 on the buildserver. `@capacitor/cli` 7 (NCC) needs node >=20 and 8
  (LimeLog) needs >=22, so `cap sync` would have hard-failed. Recipes now
  install a pinned, sha256-verified Node 22.23.1 (LTS Jod) instead.
- **Scanner would reject node_modules** — esbuild's prebuilt binary and
  Rollup's native `.node` modules live there. Added `scandelete: node_modules`,
  which is safe because `cap sync` has already copied the built web assets
  into `android/app/src/main/assets` by the time the scan runs.
- **`AutoUpdateMode: Version`** — corrected to `Version v%v`; tags are
  v-prefixed.
- **Invalid category** — NCC declared `Money`, which is not in fdroiddata's
  `config/categories.yml`; now `Finance Manager`. (LimeLog's `Sports & Health`
  and StudyDesk's `Science & Education` were already valid.)
- **Release cert SHA-256** — resolved. `apksigner verify --print-certs` on the
  published `NexusCommandCenter-1.6.1.apk` and `LimeLog-1.7.1.apk` returns the
  **same** cert for both, confirming the shared-key claim in LimeLog's
  `android/app/build.gradle`:
  ```
  CN=Emil Hongisto, O=Limecore, L=Helsinki, C=.fi
  27e17d1fba157da6eacde58485aab56066200cc45ad00bd518d828367ec155e4
  ```
  Pinned as `AllowedAPKSigningKeys` in both drafts. StudyDesk almost certainly
  shares it too — verify against its own published APK before filling in.

**NCC + LimeLog now pass `fdroid lint` clean** (verified 2026-07-17 against the
fork's `config/`).

## Blockers before submitting

1. **Signed APKs at the pinned tags** — `Binaries:` resolves to
   `.../releases/download/v%v/<Name>-%v.apk`, which matches the existing asset
   naming exactly. But the newest published releases are **NCC v1.6.1** and
   **LimeLog v1.7.1**, while the recipes pin **1.7.0** and **1.8.0**. Those
   tags exist in git but carry no GitHub release and no APK asset, so the
   Binaries URL 404s. Either publish signed APKs at the pinned tags, or roll
   the recipes back to the versions that do have published APKs.
2. **Build recipe validation** — the recipes now lint clean, but linting only
   checks metadata shape; it does not execute the build. They have not been run
   through `fdroid build` in a buildserver VM. Do that before pushing to the
   MRs. Watch for reproducibility drift: build-tool version, embedded
   timestamps, `node_modules` ordering.
3. **StudyDesk (`com.StudyDesk.app.yml`) is untouched** — it still has the old
   Node/scandelete/AutoUpdateMode defects and no `Binaries` /
   `AllowedAPKSigningKeys`. Same fixes apply; it was out of scope for the
   2026-07-17 pass.

## Keystore warning

Back up the release keystore + passwords in two places **now**. Once F-Droid
adopts the cert, losing the key permanently breaks signed updates for every
user who installed from F-Droid.

## Anti-features

All three declare `NonFreeNet` for their user-initiated HTTPS calls (Supabase
sync, Google OAuth, and — NCC only — finance APIs + the AI Edge Function).
This is disclosure, not an inclusion blocker.
