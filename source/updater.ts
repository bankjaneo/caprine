import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {autoUpdater, PacmanUpdater, RpmUpdater} from 'electron-updater';

// Linux packages built before the package-type override were stamped "deb" by
// electron-builder even when they shipped as RPM or pacman packages. Fall back
// to the package manager that actually owns the executable so those installs
// don't keep trying to run dpkg.
function isOwnedBy(packageManager: string, queryFlag: string): boolean {
	return spawnSync(packageManager, [queryFlag, process.execPath], {
		stdio: 'ignore',
		timeout: 2000,
	}).status === 0;
}

function getPackageType(): string | undefined {
	try {
		return readFileSync(path.join(process.resourcesPath, 'package-type'), 'utf8').trim();
	} catch {
		return undefined;
	}
}

export function getUpdater() {
	if (process.platform !== 'linux' || getPackageType() !== 'deb') {
		return autoUpdater;
	}

	if (isOwnedBy('rpm', '-qf')) {
		return new RpmUpdater();
	}

	if (isOwnedBy('pacman', '-Qo')) {
		return new PacmanUpdater();
	}

	return autoUpdater;
}
