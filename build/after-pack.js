const {execSync} = require('node:child_process');
const path = require('node:path');

// Ad-hoc sign the macOS bundle when no certificate is configured, so the
// signature is at least structurally valid. Without this, macOS reports the
// quarantined app as "damaged" instead of offering a Gatekeeper bypass.
// A real Developer ID signature (CSC_LINK) replaces this during signing.
exports.default = async context => {
	if (context.electronPlatformName !== 'darwin') {
		return;
	}

	const appPath = path.join(
		context.appOutDir,
		`${context.packager.appInfo.productFilename}.app`,
	);

	execSync(`codesign --force --deep --sign - "${appPath}"`, {stdio: 'inherit'});
};
