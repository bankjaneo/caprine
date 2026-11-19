#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {
	readFile,
	readdir,
	stat,
	writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {parse, stringify} from 'yaml';

// The RPM and pacman packages are built outside electron-builder, so their
// artifacts never reach the generated latest-linux*.yml manifests. Without
// entries there, RpmUpdater and PacmanUpdater cannot find an update file.
// Add them (with checksums) before the release is published.
const artifactPattern = /-(?<arch>x86_64|amd64|arm64|aarch64)\.(?:rpm|pkg\.tar\.zst)$/;

const manifestForArch = new Map([
	['x86_64', 'dist/latest-linux.yml'],
	['amd64', 'dist/latest-linux.yml'],
	['arm64', 'dist/latest-linux-arm64.yml'],
	['aarch64', 'dist/latest-linux-arm64.yml'],
]);

const distFiles = await readdir('dist');
const artifacts = distFiles
	.filter(file => artifactPattern.test(file))
	.toSorted((a, b) => a.localeCompare(b));

if (artifacts.length === 0) {
	console.log('No RPM or pacman artifacts found in dist/');
	process.exit(0);
}

const artifactsByManifest = new Map();
for (const artifact of artifacts) {
	const {arch} = artifactPattern.exec(artifact).groups;
	const manifestPath = manifestForArch.get(arch);
	const manifestArtifacts = artifactsByManifest.get(manifestPath) ?? [];
	manifestArtifacts.push(artifact);
	artifactsByManifest.set(manifestPath, manifestArtifacts);
}

await Promise.all([...artifactsByManifest].map(async ([manifestPath, manifestArtifacts]) => {
	const manifest = parse(await readFile(manifestPath, 'utf8'));
	manifest.files ??= [];

	const entries = await Promise.all(manifestArtifacts.map(async artifact => {
		const filePath = path.join('dist', artifact);
		const [content, {size}] = await Promise.all([readFile(filePath), stat(filePath)]);
		return {
			url: artifact,
			sha512: createHash('sha512').update(content).digest('base64'),
			size,
		};
	}));

	// Replace existing entries so rerunning the script stays idempotent.
	const urls = new Set(entries.map(entry => entry.url));
	manifest.files = [...manifest.files.filter(file => !urls.has(file.url)), ...entries];

	await writeFile(manifestPath, stringify(manifest));
	console.log(`Added ${entries.length} package(s) to ${manifestPath}`);
}));
