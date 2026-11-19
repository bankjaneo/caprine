import {spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {autoUpdater, PacmanUpdater, RpmUpdater} from 'electron-updater';

// Linux packages built before the package-type override were stamped "deb" by
// electron-builder even when they shipped as RPM or pacman packages. Fall back
// to the package manager that actually owns the executable so those installs
// don't try to run dpkg.
function isOwnedBy(packageManager: string): boolean {
	return spawnSync(packageManager, ['-qf', process.execPath], {stdio: 'ignore'}).status === 0;
}

const packageTypePath = path.join(process.resourcesPath, 'package-type');
const packageType = existsSync(packageTypePath) ? readFileSync(packageTypePath, 'utf8').trim() : undefined;

function getUpdater() {
	if (process.platform !== 'linux' || packageType !== 'deb') {
		return autoUpdater;
	}

	if (isOwnedBy('rpm')) {
		return new RpmUpdater();
	}

	if (isOwnedBy('pacman')) {
		return new PacmanUpdater();
	}

	return autoUpdater;
}

export default getUpdater();
