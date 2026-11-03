import {app, dialog} from 'electron';
import pWaitFor from 'p-wait-for';

function showWaitDialog(): void {
	const buttonIndex = dialog.showMessageBoxSync({
		message: 'You appear to be offline. Caprine requires a working internet connection.',
		detail: 'Do you want to wait?',
		buttons: [
			'Wait',
			'Quit',
		],
		defaultId: 0,
		cancelId: 1,
	});

	if (buttonIndex === 1) {
		app.quit();
	}
}

export default async (): Promise<void> => {
	const {default: isOnline} = await import('is-online');

	if (await isOnline()) {
		return;
	}

	const connectivityTimeout = setTimeout(showWaitDialog, 15_000);

	await pWaitFor(isOnline, {interval: 1000});
	clearTimeout(connectivityTimeout);
};
