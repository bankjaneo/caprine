#!/usr/bin/env node
// Debug helper for inspecting Caprine's injected environment in a live browser.
// Not part of the app build — local debugging tool only.
//
// Usage:
//   # Build a self-contained JS payload that injects Caprine CSS into a page.
//   # Output is a single expression string; paste into chrome-devtools evaluate_script
//   # (wrap in a function: `() => { ... }` already handled by --wrap).
//   node debug/caprine-debug.mjs css [--ref <git-ref>] [--files a.css,b.css] [--out payload.js]
//
//   # Build a payload from an arbitrary JS snippet file (filesystem access unavailable
//   # in some agent runtimes, so payloads are materialized to disk).
//   node debug/caprine-debug.mjs js <snippet.js> [--out payload.js]
//
//   # Send a payload file over CDP to a debuggable browser (e.g. Caprine relaunched
//   # with: /Applications/Caprine.app/Contents/MacOS/Caprine --remote-debugging-port=9222)
//   # Requires Node >= 21 (built-in WebSocket) or the `ws` package.
//   node debug/caprine-debug.mjs cdp --port 9222 --payload payload.js [--url-substring facebook.com]
//
// Examples:
//   node debug/caprine-debug.mjs css --ref facebook-migrate --out debug/payload-base-css.js
//   node debug/caprine-debug.mjs css --files css/browser.css,css/dark-mode.css --out debug/payload-worktree-css.js
//   node debug/caprine-debug.mjs cdp --port 9222 --payload debug/payload-base-css.js

import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';

const args = process.argv.slice(2);
const command = args[0];

function parseFlags(rest) {
	const flags = {};
	for (let i = 0; i < rest.length; i++) {
		const arg = rest[i];
		if (arg.startsWith('--')) {
			const next = rest[i + 1];
			flags[arg.slice(2)] = next === undefined || next.startsWith('--') ? true : next;
			if (flags[arg.slice(2)] !== true) {
				i++;
			}
		}
	}

	return flags;
}

function readCssFromRef(gitRef, file) {
	return execFileSync('git', ['show', `${gitRef}:${file}`], {encoding: 'utf8', maxBuffer: 10 * 1024 * 1024});
}

function readCssFromWorktree(file) {
	return readFileSync(file, 'utf8');
}

// Wraps CSS in an idempotent injection snippet that also mimics Caprine's
// JS-side environment setup (os class + thread-list container class).
function buildCssPayload(cssFiles) {
	const css = cssFiles.map(({name, content}) => `/* ===== ${name} ===== */\n${content}`).join('\n');
	return `(function () {
	if (document.getElementById('caprine-debug-css')) {
		return {injected: false, reason: 'already injected'};
	}
	document.documentElement.classList.add('os-darwin');
	const threadList = document.querySelector('[role="navigation"]:has([role="grid"])');
	if (threadList?.parentElement) {
		threadList.parentElement.classList.add('caprine-thread-list-container');
	}
	const style = document.createElement('style');
	style.id = 'caprine-debug-css';
	style.textContent = ${JSON.stringify(css)};
	document.head.append(style);
	return {injected: true, bytes: style.textContent.length};
})();`;
}

function buildJsPayload(snippet) {
	return `(function () {
	${snippet}
})();`;
}

async function sendOverCdp({port, payload, urlSubstring}) {
	const list = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
	const targets = list.filter(t => t.type === 'page' && (!urlSubstring || t.url.includes(urlSubstring)));
	if (targets.length === 0) {
		console.error(`No page target matching "${urlSubstring ?? '(any)'}" on port ${port}`);
		process.exitCode = 1;
		return;
	}

	const expression = readFileSync(payload, 'utf8');
	for (const target of targets) {
		const ws = new WebSocket(target.webSocketDebuggerUrl);
		await new Promise((resolve, reject) => {
			ws.addEventListener('open', resolve, {once: true});
			ws.addEventListener('error', reject, {once: true});
		});
		const result = await new Promise(resolve => {
			ws.addEventListener('message', event => {
				const message = JSON.parse(event.data);
				if (message.id === 1) {
					resolve(message.result);
				}
			});
			ws.send(JSON.stringify({
				id: 1,
				method: 'Runtime.evaluate',
				params: {expression, awaitPromise: true, returnByValue: true},
			}));
		});
		console.log(`[${target.url}]`, JSON.stringify(result));
		ws.close();
	}
}

if (command === 'css') {
	const flags = parseFlags(args.slice(1));
	const ref = typeof flags.ref === 'string' ? flags.ref : null;
	const files = (typeof flags.files === 'string' ? flags.files : 'css/browser.css').split(',');
	const out = typeof flags.out === 'string' ? flags.out : 'debug/payload.js';
	const cssFiles = files.map(file => ({
		name: ref ? `${ref}:${file}` : file,
		content: ref ? readCssFromRef(ref, file) : readCssFromWorktree(file),
	}));
	writeFileSync(out, buildCssPayload(cssFiles));
	console.log(`Wrote ${out} (${cssFiles.map(f => f.name).join(', ')})`);
} else if (command === 'js') {
	const flags = parseFlags(args.slice(2));
	const out = typeof flags.out === 'string' ? flags.out : 'debug/payload.js';
	writeFileSync(out, buildJsPayload(readFileSync(args[1], 'utf8')));
	console.log(`Wrote ${out}`);
} else if (command === 'cdp') {
	const flags = parseFlags(args.slice(1));
	await sendOverCdp({
		port: Number(flags.port ?? 9222),
		payload: typeof flags.payload === 'string' ? flags.payload : 'debug/payload.js',
		urlSubstring: typeof flags['url-substring'] === 'string' ? flags['url-substring'] : 'facebook.com',
	});
} else {
	console.error('Unknown command. Use: css | js | cdp (see header comment for usage)');
	process.exitCode = 1;
}
