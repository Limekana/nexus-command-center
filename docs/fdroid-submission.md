# F-Droid Submission — Build Recipe & MR Notes

Reference for the Limecore suite's F-Droid inclusion. Covers the three
`fdroiddata` merge requests, the build recipe each uses, and the review
fixes applied. Read this before bumping a version or touching the recipe —
several settings look redundant but exist to satisfy the reviewer or the
reproducible-build check.

## The three apps

All three are Capacitor + Vite Android apps that share one build shape. Each
is submitted as a separate `fdroiddata` merge request against
`gitlab.com/fdroid/fdroiddata`.

| App | applicationId | fdroiddata MR | Source repo |
|---|---|---|---|
| Nexus Command Center | `com.limecore.nexus` | [!41550](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/41550) | `Limekana/nexus-command-center` |
| LimeLog | `com.limecore.workouttracker` | [!41548](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/41548) | `Limekana/limelog` |
| StudyDesk | `com.StudyDesk.app` | [!41551](https://gitlab.com/fdroid/fdroiddata/-/merge_requests/41551) | `Limekana/StudyDesk` |

Reviewer: **linsui**. As of the last update all three carry the
*ready-for-testing* status and have no open review comments — they sit in
F-Droid's manual test/merge queue.

## Build recipe (per app)

The `Builds:` entry each app uses in its `fdroiddata` metadata:

```yaml
Builds:
  - versionName: <x.y.z>
    versionCode: <n>
    commit: <FULL 40-char commit hash of the release tag>   # NOT the tag
    subdir: android/app
    sudo:
      - echo "deb https://deb.debian.org/debian forky main" > /etc/apt/sources.list.d/forky.list
      - apt-get update
      - apt-get install -y -t forky nodejs npm
    init:
      - cd ../..
      - npm ci
    gradle:
      - yes
    prebuild:
      - cd ../..
      - npm run build
      - npx cap sync android
    scandelete:
      - node_modules
```

Key points:

- **Node.js comes from Debian forky**, installed with apt (`-t forky` scopes
  the pull to just `nodejs`/`npm` so the rest of the system stays on the base
  suite). This replaced an earlier approach that `curl`-downloaded a Node
  tarball from nodejs.org. F-Droid prefers a distro package, and forky
  (Debian testing) carries a new-enough Node 22 for the toolchain. It also
  sidesteps the buildserver having no `xz`, which had forced a `.tar.gz`
  workaround.
- **`init`/`prebuild` `cd ../..`** because `fdroidserver` runs the recipe from
  the `android/app` subdir, but `npm`/`cap sync` must run from the repo root.
- **`scandelete: node_modules`** removes build-only binaries the source
  scanner would otherwise flag.
- **`gradle: [yes]`** builds the release variant with Gradle.

## Reproducible builds

Each metadata file sets `Binaries:` (pointing at the signed APK on the
matching GitHub release tag) and `AllowedAPKSigningKeys`. F-Droid rebuilds
from source and compares against the published APK, so the build must be
byte-for-byte reproducible.

- The signed release APKs are published on GitHub Releases at each pinned tag
  (`v%v` in the `Binaries:` URL resolves to the release asset).
- All three apps share one signing certificate:
  `27e17d1fba157da6eacde58485aab56066200cc45ad00bd518d828367ec155e4`.
- Switching Node from the tarball to forky did **not** break reproducibility:
  the JS bundle is determined by the toolchain pinned in `package-lock.json`
  (Vite/rollup/esbuild) via `npm ci`, not by the Node runtime version. The
  reproducible `fdroid build` job stays green after the swap.
- Also required for `check apk` to pass: the AGP dependency-metadata signing
  block is disabled in the app (`dependenciesInfo { includeInApk false }`),
  so no unreproducible dependency-metadata blob lands in the APK.

## Review fixes applied (chronological summary)

The recipe went through several rounds with linsui. The settled outcomes:

1. **Summary/Description** removed from the metadata — pulled from each repo's
   Fastlane metadata instead.
2. **`commit:` must be a full commit hash**, never a tag or branch.
3. **`AntiFeatures: NonFreeNet` must carry a reason** in map form, e.g.:
   ```yaml
   AntiFeatures:
     NonFreeNet:
       en-US: The app connects to Supabase (cloud sync), Google (sign-in), third-party
         finance data providers, and a hosted AI service.
   ```
   The reason text is per app (LimeLog and StudyDesk name only their own
   services). Do not collapse this back to the bare `- NonFreeNet` list.
4. **Node install from Debian forky** (see recipe above).
5. **Reproducible-build fields** (`Binaries` + `AllowedAPKSigningKeys`) added.
6. **Category** corrected to a canonical F-Droid category (NCC: Finance
   Manager; LimeLog: Sports & Health; StudyDesk: Science & Education).
7. Metadata kept in canonical form (`fdroid rewritemeta` / `fdroid lint`
   must pass — the CI checks it).

### Two regressions caught late

While reworking the Node/AGP recipe and bumping versions, the re-typed
`Builds` block accidentally reverted two earlier fixes. Both were restored:

- `commit:` had fallen back to the release **tag** — re-pinned to the full
  hash.
- `AntiFeatures` had fallen back to the bare `- NonFreeNet` **list** — the
  reason map was restored.

Full commit hashes currently pinned:

| App | Version | Commit hash |
|---|---|---|
| Nexus Command Center | 1.7.1 | `18800af86a93b562a29d81474ee4264c5fa21a12` |
| LimeLog | 1.8.2 | `59a26d54c563c30a9ab0a78a715f239f3c76ddb9` |
| StudyDesk | 1.5.4 | `f70322dc3f1da0a52540d1dc1f260113be1c645c` |

## Checklist when releasing a new version

When you cut a new release and update an MR:

1. Tag the release, build and sign the APK, publish it as a GitHub Release
   asset matching the `Binaries:` URL pattern.
2. In the `fdroiddata` metadata, add/replace the `Builds:` entry with the new
   `versionName` / `versionCode` and the **full commit hash** of the new tag
   (resolve with `git ls-remote <repo> refs/tags/<tag>`).
3. Keep the `AntiFeatures: NonFreeNet` reason map — do not let a rewrite drop
   it back to a list.
4. Keep Node coming from forky.
5. Update `CurrentVersion` / `CurrentVersionCode`.
6. Push to the MR branch; confirm the pipeline is green (`fdroid build`,
   `check apk`, `fdroid lint`, `fdroid rewritemeta`) before pinging the
   reviewer.
