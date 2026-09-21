# Design: Dual Electron runtimes (modern window chrome + maximum macOS support)

Date: 2026-09-21
Status: Approved design, pending spec review

## Problem

Caprine (this fork is the successor of `sindresorhus/caprine`) pins Electron 29.4.6
(Chromium 122, early 2024). The Electron binaries shipped in that build are linked
against macOS SDK 14.0 (verified with `vtool`: `minos 11.0 / sdk 14.0`).

macOS 26+ decides whether to render the modern window chrome — Liquid Glass, and the
redesigned traffic-light buttons introduced in macOS 27 Golden Gate — using a
"linked-on-or-after" check against the app binary's `LC_BUILD_VERSION` SDK stamp.
Apps stamped with SDK < 26 get legacy rendering regardless of anything the app does.
Native system apps (Finder) get the new design; Caprine's buttons render flat.

Additional facts established during investigation:

- Electron 43.7.3 official arm64 binaries are stamped `minos 12.0 / sdk 26.5`
  (verified via `vtool` on the npm-distributed binary). Electron 38+ ships
  Tahoe-correct window chrome.
- macOS 27 Golden Gate is Apple Silicon-only. Intel Macs stop at macOS 26 Tahoe
  (security updates ~2 more years). The glass traffic-light design therefore only
  ever appears on Apple Silicon hardware.
- macOS auto-update is currently broken: releases contain no `latest-*.yml`
  manifests, and the updater's GitHub provider resolves from the stale
  `repository` field (`sindresorhus/caprine`).

## Goal

1. Apple Silicon mac, Windows, and Linux builds move to Electron 43.7.3 — the newest
   line that still supports macOS 12 (Monterey) — gaining modern window chrome
   (glass traffic lights on macOS 26/27) and ~2 years of Chromium/security updates.
2. The Intel mac build keeps its exact current runtime (Electron 29.4.6) and floor
   (macOS 10.15 per Electron 29's official minimum) — no regression for old-macOS users.
3. All runtime code stays compatible with both Electron 29 and Electron 43,
   enforced continuously in CI.
4. Auto-update works again, pointing at `bankjaneo/caprine`, with per-architecture
   mac manifests.

## Non-goals

- `vtool` re-stamping of Electron binaries (unsupported binary mutation; rejected).
- Custom CSS-drawn traffic lights (freezes one macOS look; rejected).
- Adopting the new Electron 26+ glass APIs (`glassEffect`, `setGlassEffectRegions`)
  — possible future follow-up, not needed for the traffic lights.
- Dropping support for any currently supported OS beyond what the version matrix
  below implies.

## Version matrix

| Target        | Electron | macOS floor         | Change          |
|---------------|----------|---------------------|-----------------|
| mac arm64     | 43.7.3   | macOS 12            | bump            |
| mac x64       | 29.4.6   | macOS 10.15         | unchanged       |
| Windows       | 43.7.3   | Windows 10+ (no change expected; confirm from Electron 43 release notes during implementation) | bump |
| Linux         | 43.7.3   | per Electron 43     | bump            |

Notes:
- `LSMinimumSystemVersion` is derived per build by electron-builder from the
  Electron version in use; no manual config needed.
- macOS 27 (and the glass look) requires Apple Silicon; Intel users on Tahoe get
  Tahoe-era/legacy chrome with the SDK 26/14 stamps respectively — native to
  whatever OS they run.

## Implementation

### 1. Repository / dependency layout

- `package.json`: `electron` → `^43.7.3` (this is the default for dev, arm64 mac,
  Windows, Linux; regenerate the lockfile). The maintainer develops on arm64
  macOS 27, so `npm start` shows the new design.
- The mac x64 CI phase pins the legacy runtime: `npm install --no-save
  --no-save electron@29.4.6` before running tsc and packaging.
- `allowScripts` in `package.json` gains `electron@43.7.3` (keep `electron@29.4.6`).
  Verify during implementation what consumes `allowScripts` today so the new
  version's install script is allowed wherever the old one is.

### 2. Build pipeline (`.github/workflows/build.yml`)

The macOS packaging step becomes four sequential steps in the same job. Both
phases share `dist/` (both arches' artifacts are uploaded together); only the
`latest-mac.yml` manifest is renamed between phases so the merge step can see both:

1. **arm64 phase (Electron 43):** `npx electron-builder --mac --arm64
   --publish never` → `Caprine-x.y.z-arm64-mac.zip`, `Caprine-x.y.z-arm64.dmg`,
   and a `latest-mac.yml` listing the arm64 zip. Preserve it as
   `dist/latest-mac-arm64.yml` so the next phase can't clobber it.
2. **Pin legacy runtime:** `npm install --no-save electron@29.4.6`, then `npm run
   build` (this also type-checks the source against Electron 29's type
   definitions — see §3).
3. **x64 phase (Electron 29):** `npx electron-builder --mac --x64 --publish never`
   → `Caprine-x.y.z-mac.zip`, `Caprine-x.y.z.dmg`, `latest-mac.yml` with the x64
   zip. Preserve as `dist/latest-mac-x64.yml`.
4. **Merge manifests:** small script (`scripts/merge-latest-mac.mjs`) merges the
   two preserved files into one `dist/latest-mac.yml` whose `files` array contains
   both entries. electron-updater selects the correct artifact per architecture by
   file-name suffix (`-mac.zip` for x64, `-arm64-mac.zip` for arm64). Both entries
   must carry their own `sha512`/`size`.
5. **Uploads:** unchanged globs (`dist/*.dmg dist/*.zip`) plus `dist/*.yml`
   (`latest-mac.yml`, plus whatever `latest.yml` / `latest-linux.yml` the Windows
   and Linux jobs emit).
6. Windows and Linux jobs: unchanged except that they now build against Electron 43
   from the lockfile and upload their emitted manifests.

`--publish never` stays: uploads remain the existing explicit
`gh release upload … --clobber` steps; electron-builder's own publishing is not
used (auto-update follow-up stays in scope only for manifests, see §4).

### 3. Dual-runtime source compatibility (Electron 29 ↔ 43)

Audit of Caprine's actual usage:

- `electron-better-ipc@2.0.1` (used in 6 files) — small surface, but a 2021-era
  release; **runtime verification on Electron 43 is required**. Fallback if it
  breaks: replace with thin native `ipcRenderer.invoke`/`ipcMain.handle` wrappers
  in `source/util.ts` (the codebase's IPC usage is small enough to make this a
  contained change).
- `@electron/remote@2.1.2` — maintained, used with the correct
  `initialize()`/`enable()` pattern; expected fine on 43.
- Touch Bar APIs — still present in Electron 43; no change needed.
- `titleBarStyle: 'hiddenInset'` + `trafficLightPosition` — supported in 43, which
  additionally includes the macOS 26+ traffic-light placement fixes that 29 lacks.
- No `setPermissionRequestHandler` usage (its signature broke in Electron 33) —
  not applicable.
- `nodeIntegration: true` — still supported.
- Node.js runtime bump 20 → 22 — no nonstandard Node API usage found in `source/`.

Enforcement:
- The x64 CI phase compiles the source with tsc against Electron 29's bundled
  type definitions and runs the linter, so any use of a post-29 API fails CI.
- Any new Electron API used in mainline code must either exist in 29 or be
  guarded by a runtime version check — document this constraint in `AGENTS.md`.

### 4. Auto-update manifests

- `package.json`: `repository` → `bankjaneo/caprine`; add an explicit
  electron-builder `publish` config `{provider: "github", owner: "bankjaneo",
  repo: "caprine"}` so the updater's embedded `app-update.yml` points at the fork
  deterministically (keep the snap target's existing publish list).
- Update-info files (`latest-mac.yml`, `latest.yml`, `latest-linux.yml`) are
  generated into `dist/` even with `--publish never`; CI uploads them.
- The merged `latest-mac.yml` (§2 step 4) serves both architectures; Windows
  (`latest.yml`) and Linux (`latest-linux.yml`) need no merging (single runtime).
- Caveat: existing installed users keep the old (broken/stale) `app-update.yml`
  until they manually install any fork build once; after that, updates flow.
- Risk to test: Squirrel.Mac (macOS updater) verifies the downloaded app's code
  signature against the installed app. If fork releases are built without signing
  (`CSC_LINK` unset), mac auto-update may refuse to install updates. Must be
  verified on a beta-channel release before calling this done.

## Testing / acceptance

1. `npm test` (tsc + xo + stylelint) green.
2. Local build of both mac artifacts; `vtool` on the packaged frameworks shows
   arm64: `sdk 26.5 / minos 12.0`, x64: `sdk 14.0` (identical to today).
3. `LSMinimumSystemVersion` in each built app's Info.plist: arm64 ≥ 12.0;
   x64 unchanged.
4. Visual confirmation on macOS 27 (maintainer's machine): Electron 43 build shows
   glass traffic lights; x64 (Electron 29) build unchanged.
5. Runtime smoke on Electron 43: load messenger.com, conversation list, notifications,
   download, context menu, menu bar actions, dark mode toggle, vibrancy setting.
6. Dual-runtime IPC check: the `electron-better-ipc` flows work on 43 (see §3).
7. Auto-update: publish a beta-channel pre-release with the merged manifest; from
   an installed build (one per arch), confirm update detection → download →
   install. Includes resolving the signing risk in §4.
8. Windows/Linux CI jobs complete and upload manifests; existing package targets
   (NSIS, AppImage, deb, rpm, pacman, snap) unchanged.

## Documentation

- README: update supported versions ("macOS 10.12+" claim is stale) to the new
  matrix; note the Intel/Apple Silicon runtime difference and that Intel builds
  receive no new Chromium features (security-legacy line).
- AGENTS.md: add the dual-runtime constraint (mainline must remain Electron
  29-compatible; tsc in the x64 CI phase enforces it) and the build-phase layout.

## Risks

- `electron-better-ipc@2.0.1` incompatibility with Electron 43 → contained
  replacement (§3).
- Unsigned builds + Squirrel.Mac signature check → mac auto-update may not work
  without signing; verify before relying on it (§4).
- Chromium 122 (Intel runtime) will eventually fail against messenger.com changes;
  that is the natural end-of-life for the Electron 29 line and out of our control.
- `allowScripts` consumer unknown → verify during implementation (§1).
