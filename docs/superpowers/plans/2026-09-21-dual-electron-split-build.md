# Dual Electron Runtimes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Caprine's mac builds so Apple Silicon (and Windows/Linux) run Electron 43.7.3 (modern window chrome on macOS 26/27) while the Intel mac build keeps Electron 29.4.6 (macOS 10.15 floor), and make auto-update work against `bankjaneo/caprine` with per-arch manifests.

**Architecture:** The repo's default Electron becomes 43.7.3 (dev + arm64 mac + win + linux). The CI mac job pins Electron 29.4.6 only for the x64 packaging phase, which also re-runs tsc so the source is continuously type-checked against Electron 29's definitions. Auto-update manifests are generated with `--publish never`, the two mac manifests are merged by a small script into one `latest-mac.yml` (electron-updater 6.x picks the right zip per arch — verified against `MacUpdater.filterFilesForArch` and `findFile`), and CI uploads `dist/*.yml` alongside existing artifacts.

**Tech Stack:** Electron 43.7.3 / 29.4.6, electron-builder 24.x, electron-updater 6.1.8, GitHub Actions (`build.yml`), `yaml` npm package (manifest merge).

**Spec:** `docs/superpowers/specs/2026-09-21-dual-electron-split-build-design.md`

## Global Constraints

- Mac x64 runtime must remain Electron **29.4.6** exactly; its macOS floor stays **10.15** — never regress this.
- Mac arm64, Windows, Linux run Electron **43.7.3**.
- Mainline source (`source/`) must compile and run on **both** Electron 29 and 43. New Electron APIs require a runtime version guard or a 29-compatible pattern.
- String style in JS/TS is **single quotes** (XO-enforced; note: AGENTS.md's "double quotes" section is inaccurate — follow the lint). Tab indentation, no semicolons.
- `allowScripts` in `package.json` must list every Electron version whose install script must run: `electron@29.4.6` and `electron@43.7.3`.
- Updater/publish must target **`bankjaneo/caprine`** only. Never publish to the upstream repo.
- Keep `--publish never` on all electron-builder invocations; uploads stay via `gh release upload`.

## Review Focus

1. **Merged `latest-mac.yml` arch resolution** — an arm64 Mac must resolve the `-arm64-mac.zip` entry and an Intel Mac the `-mac.zip` entry from the single manifest. Pinned by the fixture check in Task 4 and end-to-end in Task 7.
2. **Electron 29 compatibility of new/changed code** — the x64 CI phase compiles against Electron 29's type definitions; any post-29 API must fail there. Pinned by the tsc step in Task 5's workflow (and Task 1's local pre-check).
3. **Updater pointing at the fork, not upstream** — the packaged app's `Contents/Resources/app-update.yml` must say `owner: bankjaneo / repo: caprine`. Pinned by Task 3's verification.
4. **LSMinimumSystemVersion per build** — arm64 ≥ 12.0, x64 unchanged (10.15). Pinned by Info.plist checks in Task 1 (node_modules) and Task 5/7 (packaged apps).
5. **electron-better-ipc on Electron 43** — all `ipc.callMain`/`ipc.answerMain`/`ipc.callRenderer`/`ipc.answerRenderer` flows must work at runtime. Pinned by the manual smoke checklist in Task 2; fallback replacement code is in that task.

---

### Task 1: Bump default Electron to 43.7.3

**Files:**
- Modify: `package.json` (devDependencies `electron`, `allowScripts`)
- Modify: `package-lock.json` (regenerated)

**Interfaces:**
- Consumes: nothing.
- Produces: `node_modules/electron` = 43.7.3 (default runtime for dev, arm64, win, linux). Later tasks rely on `npm ci` installing 43.7.3 by default and the x64 pin command downgrading to 29.4.6.

- [ ] **Step 1: Update `package.json`**

In devDependencies, change:

```json
"electron": "^29.0.1",
```

to:

```json
"electron": "^43.7.3",
```

In `allowScripts`, change:

```json
"allowScripts": {
	"electron@29.4.6": true
}
```

to:

```json
"allowScripts": {
	"electron@29.4.6": true,
	"electron@43.7.3": true
}
```

- [ ] **Step 2: Install and regenerate lockfile**

Run: `npm install` (from the repo root)
Expected: postinstall (`patch-package && electron-builder install-app-deps`) succeeds; Electron 43.7.3 binary downloaded to `node_modules/electron/dist`.

- [ ] **Step 3: Verify the Electron 43 binary stamps**

Run: `vtool -show-build node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework | grep -E 'platform|minos|sdk'`
Expected: `platform MACOS`, `minos 12.0`, `sdk 26.5` (matches the spike verification).

- [ ] **Step 4: Compile and lint against Electron 43's type definitions**

Run: `npm test`
Expected: PASS. If tsc fails, fix each error using the spec's §3 audit list — e.g., check for removed APIs (none known in Caprine's usage). Do **not** adopt post-29-only APIs; keep fixes 29-compatible (they must still compile in Task 5's x64 phase). If a genuinely needed API is 43-only, guard it with `process.versions.electron` comparison and note it in the commit message.
Note: xo must also pass; keep new code xo-clean (tabs, single quotes, no semicolons).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "Bump default Electron to 43.7.3 for arm64/win/linux builds"
```

### Task 2: Runtime smoke on Electron 43 (local) + electron-better-ipc verification

**Files:**
- Possibly Modify: `source/util.ts`, `source/browser.ts`, `source/menu.ts`, `source/index.ts`, `source/touch-bar.ts`, `source/autoplay.ts`, `source/browser/conversation-list.ts` (only if the better-ipc fallback in Step 2 is needed)
- Modify: `package.json` (only if fallback needed)

**Interfaces:**
- Consumes: Electron 43.7.3 from Task 1.
- Produces: confirmation that all IPC flows work on 43 (or a native replacement in place that both runtimes support).

- [ ] **Step 1: Launch the app on Electron 43**

Run: `npm start`
Expected: app opens, messenger.com loads, conversations render.

**Visually confirm the new window chrome:** the traffic-light buttons in the top-left must render in the macOS 27 liquid glass style (gradient/highlighted, matching Finder), not the old flat solid circles. This is the spec's acceptance check §Testing item 4.

- [ ] **Step 2: Exercise the better-ipc flows (manual checklist)**

While the app runs, verify each of these; each one crosses the ipc bridge on Electron 43:
1. Menu: View → Toggle Developer Tools, then close it (menu → renderer action path).
2. Menu: View → Change Theme → any theme (uses `ipc.answerMain('set-theme')` + `get-config-theme`).
3. Menu: View → Sidebar width options (`update-sidebar` flow).
4. Menu: View → Toggle Private Mode (touch-bar/private-mode IPC).
5. Save a setting (e.g., View → Toggle Message Buttons) and confirm it persists after reload (config write via renderer → main).
6. Right-click in the page and use the context menu (electron-context-menu on 43); copy something from it.
7. Trigger a download or open a link externally if convenient (electron-dl / shell flows).

Expected: all work. Log any console errors (`console.error` from main process appears in the terminal running `npm start`).

- [ ] **Step 3: If any better-ipc flow fails — apply the native replacement (otherwise skip to Step 4)**

Replace the `electron-better-ipc` dependency with a small native shim. Create `source/ipc.ts`:

```ts
import {ipcMain as rawMain, ipcRenderer as rawRenderer} from 'electron';

type MainHandler = (data: any) => any | Promise<any>;
type RendererHandler = (data: any) => any | Promise<any>;

// Mirrors electron-better-ipc's API surface as used in this codebase.
export const ipcMain = {
	answerRenderer(channel: string, handler: RendererHandler): void {
		rawMain.handle(channel, (_event, data: any) => handler(data));
	},
	async callRenderer(channel: string, data?: any): Promise<any> {
		const [win] = (await import('electron')).BrowserWindow.getAllWindows();
		return win?.webContents.invoke(channel, data);
	},
};

export const ipcRenderer = {
	answerMain(channel: string, handler: MainHandler): void {
		rawRenderer.on(channel, async (event, {nonce, data}: {nonce: string; data?: any}) => {
			const result = await handler(data);
			event.sender.send(`${channel}:${nonce}`, result);
		});
	},
	callMain<T = undefined, R = any>(channel: string, data?: T): Promise<R> {
		const nonce = Math.random().toString(36).slice(2);
		return new Promise(resolve => {
			rawRenderer.once(`${channel}:${nonce}`, (_event, result: R) => resolve(result));
			rawRenderer.send(channel, {nonce, data});
		});
	},
};
```

Then in each of the six files replace `import {ipcMain as ipc} from 'electron-better-ipc'` (or the ipcRenderer variant) with the matching import from `./ipc` (renderer files: `./ipc`; from `source/browser/conversation-list.ts`: `../ipc`). Remove `electron-better-ipc` from `package.json` dependencies and run `npm install`. Re-run the full checklist in Step 2.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit (only if changes were made in Step 3; otherwise skip)**

```bash
git add -A
git commit -m "Replace electron-better-ipc with native ipc shim"
```

### Task 3: Point auto-update at the fork and emit update manifests

**Files:**
- Modify: `package.json` (`repository`, `build.publish`)

**Interfaces:**
- Consumes: Electron 43 (Task 1).
- Produces: electron-builder emits `dist/latest-mac.yml`, `dist/latest.yml`, `dist/latest-linux.yml` on every `--publish never` build, and packaged apps embed `app-update.yml` pointing at `bankjaneo/caprine`. Task 5's workflow and Task 4's merge script consume these.

- [ ] **Step 1: Update `package.json`**

Change:

```json
"repository": "sindresorhus/caprine",
```

to:

```json
"repository": "bankjaneo/caprine",
```

Inside the `build` object (top level, alongside `files`), add:

```json
"publish": {
	"provider": "github",
	"owner": "bankjaneo",
	"repo": "caprine"
},
```

(Keep the `snap.publish` list as-is — target-specific publish overrides top-level for the snap target only.)

- [ ] **Step 2: Build the arm64 mac target locally and check emission + embed**

Run:

```bash
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --arm64 --publish never
```

Expected: completes; `dist/latest-mac.yml` exists; check its content:

```bash
cat dist/latest-mac.yml
```

Expected shape:

```yaml
version: 2.61.25
files:
  - url: Caprine-2.61.25-arm64-mac.zip
    sha512: <hash>
    size: <number>
path: Caprine-2.61.25-arm64-mac.zip
sha512: <hash>
releaseDate: '<date>'
```

Then check the embedded updater config:

```bash
cat dist/mac-arm64/Caprine.app/Contents/Resources/app-update.yml
```

Expected: contains `provider: github`, `owner: bankjaneo`, `repo: caprine`.

- [ ] **Step 3: Clean the local dist output**

Run: `rm -rf dist`
Expected: directory removed (Task 5's local workflow test rebuilds it).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Point auto-updater at bankjaneo/caprine and emit update manifests"
```

### Task 4: Manifest merge script

**Files:**
- Create: `scripts/merge-latest-mac.mjs`
- Modify: `package.json` (devDependencies: `yaml`)

**Interfaces:**
- Consumes: `dist/latest-mac-arm64.yml` and `dist/latest-mac-x64.yml` (produced by Task 5's workflow phases; electron-builder's per-run `latest-mac.yml`).
- Produces: `dist/latest-mac.yml` with a merged `files` array. Executed by Task 5's workflow.

- [ ] **Step 1: Add the devDependency**

Run: `npm install --save-dev yaml`
Expected: `yaml` added to devDependencies.

- [ ] **Step 2: Write the script**

Create `scripts/merge-latest-mac.mjs`:

```js
#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {parse, stringify} from 'yaml';

// Merges the per-arch latest-mac.yml files produced by the two mac packaging
// phases into one manifest. electron-updater 6.x selects the right file per
// architecture from the `files` array (MacUpdater prefers `arm64` entries on
// arm64/Rosetta Macs and excludes them on Intel Macs).
const readManifest = async path => parse(await readFile(path, 'utf8'));

const mergeMacManifests = (x64, arm64) => ({
	...x64,
	files: [
		...x64.files,
		...arm64.files.filter(file => !x64.files.some(existing => existing.url === file.url)),
	],
});

const [x64, arm64] = await Promise.all([
	readManifest('dist/latest-mac-x64.yml'),
	readManifest('dist/latest-mac-arm64.yml'),
]);

if (x64.version !== arm64.version) {
	throw new Error(`Version mismatch between mac manifests: ${x64.version} != ${arm64.version}`);
}

await writeFile('dist/latest-mac.yml', stringify(mergeMacManifests(x64, arm64)));
console.log(`Merged mac manifests for version ${x64.version}: ${mergeMacManifests(x64, arm64).files.length} file entries`);
```

- [ ] **Step 3: Verify with fixtures**

Create throwaway fixtures and run the script:

```bash
mkdir -p /private/var/folders/fm/6lcsfk190z15dwlj5ws0849r0000gn/T/opencode/manifest-fixture dist
cat > /private/var/folders/fm/6lcsfk190z15dwlj5ws0849r0000gn/T/opencode/manifest-fixture/latest-mac-x64.yml <<'EOF'
version: 9.9.9
files:
  - url: Caprine-9.9.9-mac.zip
    sha512: x64hash
    size: 111
path: Caprine-9.9.9-mac.zip
sha512: x64hash
releaseDate: '2026-09-21T00:00:00.000Z'
EOF
cat > /private/var/folders/fm/6lcsfk190z15dwlj5ws0849r0000gn/T/opencode/manifest-fixture/latest-mac-arm64.yml <<'EOF'
version: 9.9.9
files:
  - url: Caprine-9.9.9-arm64-mac.zip
    sha512: arm64hash
    size: 222
path: Caprine-9.9.9-arm64-mac.zip
sha512: arm64hash
releaseDate: '2026-09-21T00:00:00.000Z'
EOF
cp /private/var/folders/fm/6lcsfk190z15dwlj5ws0849r0000gn/T/opencode/manifest-fixture/latest-mac-x64.yml dist/latest-mac-x64.yml
cp /private/var/folders/fm/6lcsfk190z15dwlj5ws0849r0000gn/T/opencode/manifest-fixture/latest-mac-arm64.yml dist/latest-mac-arm64.yml
node scripts/merge-latest-mac.mjs
cat dist/latest-mac.yml
rm -rf dist /private/var/folders/fm/6lcsfk190z15dwlj5ws0849r0000gn/T/opencode/manifest-fixture
```

Expected: merged output has top-level fields from the x64 manifest and a `files` array with both `Caprine-9.9.9-mac.zip` (x64hash) and `Caprine-9.9.9-arm64-mac.zip` (arm64hash). Deleting `dist` is safe — it is build output.

Also verify the version-mismatch guard:

```bash
# temporarily edit one fixture's version to 9.9.10 and re-run; expected: throws "Version mismatch"
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS (xo lints `scripts/*.mjs`).

- [ ] **Step 5: Commit**

```bash
git add scripts/merge-latest-mac.mjs package.json package-lock.json
git commit -m "Add script merging per-arch mac update manifests"
```

### Task 5: npm scripts + CI workflow restructure

**Files:**
- Modify: `package.json` (scripts)
- Modify: `.github/workflows/build.yml` (mac packaging + all upload steps)

**Interfaces:**
- Consumes: Tasks 1–4 (Electron 43 default, publish config, merge script, `dist:mac:*` scripts added here).
- Produces: release artifacts including merged `latest-mac.yml`, `latest.yml`, `latest-linux.yml`.

- [ ] **Step 1: Add npm scripts**

In `package.json` scripts, after `"dist:mac"`:

```json
"dist:mac:arm64": "electron-builder --mac --arm64",
"dist:mac:x64": "electron-builder --mac --x64",
```

- [ ] **Step 2: Rewrite the macOS packaging + upload steps in `.github/workflows/build.yml`**

Replace the existing "Package Caprine for macOS" step and "Upload macOS artifacts to GitHub Release" step with:

```yaml
      - name: Package Caprine for macOS (arm64)
        if: startsWith(matrix.os, 'macos')
        run: |
          if [ -n "${{ secrets.CSC_LINK }}" ]; then
            export CSC_LINK="${{ secrets.CSC_LINK }}"
            export CSC_KEY_PASSWORD="${{ secrets.CSC_KEY_PASSWORD }}"
          else
            export CSC_IDENTITY_AUTO_DISCOVERY=false
          fi
          npm run dist:mac:arm64 -- --publish never
          mv dist/latest-mac.yml dist/latest-mac-arm64.yml
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Pin Electron 29 for x64 mac build
        if: startsWith(matrix.os, 'macos')
        run: |
          npm install --no-save electron@29.4.6
          npm run build
      - name: Package Caprine for macOS (x64)
        if: startsWith(matrix.os, 'macos')
        run: |
          if [ -n "${{ secrets.CSC_LINK }}" ]; then
            export CSC_LINK="${{ secrets.CSC_LINK }}"
            export CSC_KEY_PASSWORD="${{ secrets.CSC_KEY_PASSWORD }}"
          else
            export CSC_IDENTITY_AUTO_DISCOVERY=false
          fi
          npm run dist:mac:x64 -- --publish never
          mv dist/latest-mac.yml dist/latest-mac-x64.yml
          node scripts/merge-latest-mac.mjs
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - name: Upload macOS artifacts to GitHub Release
        if: startsWith(matrix.os, 'macos')
        run: gh release upload "${{ github.ref_name }}" dist/*.dmg dist/*.zip dist/*.yml --clobber --repo "${{ github.repository }}"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] **Step 3: Extend Windows and Linux upload steps to include manifests**

Windows upload step, change:

```yaml
        run: gh release upload "${{ github.ref_name }}" dist/*.exe --clobber --repo "${{ github.repository }}"
```

to:

```yaml
        run: gh release upload "${{ github.ref_name }}" dist/*.exe dist/*.yml --clobber --repo "${{ github.repository }}"
```

Linux upload step, change:

```yaml
        run: gh release upload "${{ github.ref_name }}" dist/*.AppImage dist/*.deb --clobber --repo "${{ github.repository }}"
```

to:

```yaml
        run: gh release upload "${{ github.ref_name }}" dist/*.AppImage dist/*.deb dist/*.yml --clobber --repo "${{ github.repository }}"
```

Note: the Linux job later builds RPM/pacman packages into the same `dist/`; their uploads do not glob `*.yml`, so no interference. If electron-builder does not emit `latest-linux.yml` (AppImage updates are optional in electron-updater), the glob still matches nothing and the step must not fail — if `gh release upload` errors on an empty glob, wrap that glob accordingly (verify with a real run in Task 7).

- [ ] **Step 4: Local dry-run of the x64 pin + packaging sequence**

Run (this verifies the exact commands CI will use):

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:arm64 -- --publish never
mv dist/latest-mac.yml dist/latest-mac-arm64.yml
npm install --no-save electron@29.4.6
npm run build
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:x64 -- --publish never
mv dist/latest-mac.yml dist/latest-mac-x64.yml
node scripts/merge-latest-mac.mjs
```

Expected: both artifact sets exist; `dist/latest-mac.yml` contains both file entries. Verify stamps:

```bash
vtool -show-build dist/mac-arm64/Caprine.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework | grep -E 'minos|sdk'
vtool -show-build dist/mac/Caprine.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework | grep -E 'minos|sdk'
```

Expected: arm64 app = `minos 12.0 / sdk 26.5`; x64 app = `sdk 14.0` (identical to the currently installed Caprine). Also check floors:

```bash
/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' dist/mac-arm64/Caprine.app/Contents/Info.plist
/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' dist/mac/Caprine.app/Contents/Info.plist
```

Expected: arm64 ≥ `12.0.0`; x64 value identical to the installed Caprine's (compare with `/Applications/Caprine.app`). If electron-builder does not set `LSMinimumSystemVersion` per build automatically, add `-c.mac.minimumSystemVersion=12.0.0` to the arm64 script and `-c.mac.minimumSystemVersion=10.15.0` to the x64 script and re-run.

- [ ] **Step 5: Restore default Electron and clean up**

Run:

```bash
rm -rf dist
npm install
```

Expected: `node_modules/electron` back on 43.7.3.

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json .github/workflows/build.yml
git commit -m "Split mac builds: arm64 on Electron 43, x64 on Electron 29; upload update manifests"
```

### Task 6: Documentation

**Files:**
- Modify: `README.md` (line ~50 supported versions)
- Modify: `AGENTS.md` (Build/Lint/Test section + a dual-runtime note)

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: accurate public and contributor-facing documentation.

- [ ] **Step 1: Update README supported versions**

Replace (README.md line 50):

```markdown
*macOS 10.12+ (Intel and Apple Silicon), Linux (x64 and arm64), and Windows 10+ (64-bit) are supported.*
```

with:

```markdown
*macOS 10.15+ on Intel and macOS 12+ on Apple Silicon; Linux (x64 and arm64) and Windows 10+ (64-bit) are supported.*

Apple Silicon builds ship a modern Electron runtime — on macOS 26/27 they get the system's Liquid Glass window controls. Intel builds intentionally keep the older Electron 29 runtime for maximum compatibility with older macOS versions; they receive no new Chromium features. If Facebook's website stops working in old Chromium, Intel users will need to update macOS (to the extent their Mac supports) or use a browser-based fallback.
```

Also check the README install instructions for anything version-specific; do not touch unrelated sections.

- [ ] **Step 2: Update AGENTS.md**

In the "Build/Lint/Test Commands" section, after the Distribution bullets, add:

```markdown
- **mac dual-runtime builds:** `npm run dist:mac:arm64` (Electron 43) and `npm run dist:mac:x64` (pins Electron 29.4.6 — run `npm install` afterwards to restore). CI's mac job runs both phases and merges `latest-mac.yml` via `scripts/merge-latest-mac.mjs`.
```

And add a new bullet under "Code Style Guidelines" → TypeScript section (or as its own paragraph after Code Style):

```markdown
### Dual Electron runtime constraint

Mainline source must compile and run on both Electron 29 (mac x64 runtime) and Electron 43 (arm64/win/linux). CI enforces the 29 side by re-running tsc against Electron 29's type definitions in the x64 packaging phase. Do not use post-29 APIs without a runtime version guard.
```

- [ ] **Step 3: Commit**

```bash
git add README.md AGENTS.md
git commit -m "Document dual-runtime macOS support and build commands"
```

### Task 7: End-to-end CI + auto-update verification (requires maintainer)

**Files:**
- Modify: none (verification task; fix-ups if a check fails)

**Interfaces:**
- Consumes: everything from Tasks 1–6, pushed to `dual-electron-runtimes` and merged, plus signing secrets in CI and a tag.

- [ ] **Step 1: Push and open/merge a PR**

```bash
git push -u origin dual-electron-runtimes
gh pr create --fill
```

Review the CI run for the tests job (tsc + lint on Node 24).

- [ ] **Step 2: Publish a beta-tagged release to exercise the full pipeline**

```bash
# Bump version with a prerelease tag (e.g. 2.61.26-beta.1), commit, then:
git tag v2.61.26-beta.1 && git push origin v2.61.26-beta.1
```

Expected: `build.yml` runs; the release contains for mac: `Caprine-2.61.26-beta.1.dmg`, `Caprine-2.61.26-beta.1-arm64.dmg`, `Caprine-2.61.26-beta.1-mac.zip`, `Caprine-2.61.26-beta.1-arm64-mac.zip`, and `latest-mac.yml` with **both** file entries; plus `latest.yml` (Windows) and `latest-linux.yml`.

- [ ] **Step 3: Verify updater end-to-end on this machine (arm64)**

Download and install `Caprine-2.61.26-beta.1-arm64.dmg` manually (this represents the fork build a user installs once). Then publish a follow-up beta (e.g. `v2.61.26-beta.2`, content changes irrelevant) and launch the installed app.

Expected: within the 4-hour interval or on next launch, the updater resolves `latest-mac.yml` from `bankjaneo/caprine`, prefers the arm64 zip, downloads, and prompts/installs on quit. Check logs: `~/Library/Logs/Caprine/main.log` (electron-updater logging) for `arm64` file selection.

Caveat from the spec: if builds are unsigned, Squirrel.Mac may refuse the downloaded update — if this fails with a signature error, record it: mac auto-update then requires signing (`CSC_LINK`), and the follow-up decision is either set up signing or document mac updates as manual.

- [ ] **Step 4: Verify Intel runtime in CI output**

In the release artifacts, download `Caprine-2.61.26-beta.1-mac.zip`, unpack, and run the same `vtool` + `LSMinimumSystemVersion` checks as Task 5 Step 4 on the unpacked app.

Expected: `sdk 14.0` and floor unchanged vs the previously released fork build.

- [ ] **Step 5: File follow-ups as needed**

If any check in Steps 2–4 failed, fix in this branch and re-tag. Record the Intel-runtime end-of-life trigger (messenger.com breaking in Chromium 122) as an issue so the future removal of the x64 Electron 29 phase is deliberate.
