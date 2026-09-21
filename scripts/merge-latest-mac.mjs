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

const merged = mergeMacManifests(x64, arm64);
await writeFile('dist/latest-mac.yml', stringify(merged));
console.log(`Merged mac manifests for version ${x64.version}: ${merged.files.length} file entries`);
