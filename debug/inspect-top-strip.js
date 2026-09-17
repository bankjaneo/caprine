// Measures the top strip of the window the way the PR's logic sees it.
// Returns element geometry, drag-bar state, and overlay-detection results.
const labels = ['Previous photo', 'Next photo', 'Close', 'Download', 'Forward', 'Pause GIF', 'Play GIF', 'Media viewer'];
const els = [...document.querySelectorAll('[aria-label], [role="button"], button, a')];
const strip = els
	.map(el => ({el, rect: el.getBoundingClientRect()}))
	.filter(({rect}) => rect.top < 60 && rect.bottom > 0 && rect.height > 0 && rect.width > 0)
	.map(({el, rect}) => ({
		label: el.getAttribute('aria-label'),
		tag: el.tagName.toLowerCase(),
		role: el.getAttribute('role'),
		top: Math.round(rect.top * 10) / 10,
		left: Math.round(rect.left),
		size: Math.round(rect.width) + 'x' + Math.round(rect.height),
	}))
	.sort((a, b) => a.left - b.left || a.top - b.top);

const dragBar = document.getElementById('caprine-drag-bar');
const dialog = document.querySelector('[role="dialog"]');

return {
	pathname: location.pathname,
	inner: window.innerWidth + 'x' + window.innerHeight,
	hasMediaViewerDialog: !!dialog,
	hasStoryPagelet: !!document.querySelector('[data-pagelet*="Story"]'),
	hasMediaViewerPagelet: !!document.querySelector('[data-pagelet*="MediaViewer"]'),
	dragBar: dragBar
		? {
				pointerEvents: dragBar.style.pointerEvents || '(empty = default)',
				rect: (() => {
					const rect = dragBar.getBoundingClientRect();
					return Math.round(rect.width) + 'x' + Math.round(rect.height) + ' @top ' + Math.round(rect.top);
				})(),
			}
		: null,
	viewerControls: strip.filter(c => labels.some(label => c.label && (c.label === label || c.label.startsWith(label)))),
	topStrip: strip,
};
