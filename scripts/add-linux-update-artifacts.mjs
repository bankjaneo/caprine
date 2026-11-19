#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {
	readFile,
	readdir,
	stat,
	writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {parse, Scalar, stringify} from 'yaml';

// The RPM and pacman packages are built outside electron-builder, so their
// artifacts never reach the generated latest-linux*.yml manifests. Without
// entries there, RpmUpdater and PacmanUpdater cannot find an update file.
// Add them (with checksums) before the release is published.
const rpmPattern = /^caprine-(?<version>.+)-(?<arch>x86_64|amd64|arm64|aarch64)\.rpm$/;
const pacmanPattern = /^caprine-(?<version>.+)-\d+-(?<arch>x86_64|amd64|arm64|aarch64)\.pkg\.tar\.zst$/;

const manifestForArch = new Map([
	['x86_64', 'dist/latest-linux.yml'],
	['amd64', 'dist/latest-linux.yml'],
	['arm64', 'dist/latest-linux-arm64.yml'],
	['aarch64', 'dist/latest-linux-arm64.yml'],
]);

const {version} = JSON.parse(await readFile('package.json', 'utf8'));

const distFiles = await readdir('dist');
const artifacts = distFiles.flatMap(file => {
	const match = rpmPattern.exec(file) ?? pacmanPattern.exec(file);
	if (match === null) {
		return [];
	}

	// Pacman replaces the SemVer prerelease hyphen with an underscore.
	const artifactVersion = match.groups.version.replaceAll('_', '-');
	if (artifactVersion !== version) {
		return [];
	}

	return [{file, arch: match.groups.arch}];
}).toSorted((a, b) => a.file.localeCompare(b.file));

if (artifacts.length === 0) {
	throw new Error(`No RPM or pacman artifacts for version ${version} found in dist/`);
}

const artifactsByManifest = new Map();
for (const artifact of artifacts) {
	const manifestPath = manifestForArch.get(artifact.arch);
	const manifestArtifacts = artifactsByManifest.get(manifestPath) ?? [];
	manifestArtifacts.push(artifact.file);
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

	// YAML would otherwise leave a timestamp-looking string unquoted, which
	// js-yaml parses as a Date instead of the string the update info expects.
	if (typeof manifest.releaseDate === 'string') {
		const releaseDate = new Scalar(manifest.releaseDate);
		releaseDate.type = Scalar.QUOTE_DOUBLE;
		manifest.releaseDate = releaseDate;
	}

	await writeFile(manifestPath, stringify(manifest));
	console.log(`Added ${entries.length} package(s) to ${manifestPath}`);
}));
