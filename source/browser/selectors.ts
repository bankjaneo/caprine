export default {
	leftSidebar: '[role="navigation"]:has([role=grid]) > div > div', // Thread list navigation container
	chatsIcon: '[role="navigation"]:has([role="grid"]) a[href="/messages/t/"]', // ! Legacy messenger.com selector, no longer used for tray icon
	conversationList: '[role="navigation"]:has([role="grid"]) [role="grid"]',
	conversationContent: '[role="log"]',
	conversationSidebarUnreadDot: 'svg[viewBox="0 0 20 20"] path[d^="M2.25 10a1.75"]', // Unread status dot
	conversationSidebarTextParent: 'span:has(> span[class*="x1lliihq"][class*="x6ikm8r"][class*="x10wlt62"][class*="xlyipyv"][class*="xuxw1ft"])', // Parent element of the conversation text element (needed for notifications)
	conversationSidebarTextSelector: '[class*="x1lliihq"][class*="x6ikm8r"][class*="x10wlt62"][class*="x1n2onr6"][class*="xlyipyv"][class*="xuxw1ft"]', // Generic selector for the text contents of all conversations
	conversationSidebarSelector: '[role=row]', // Selector for a single conversation row in the grid
	// Both notification switches are the first INPUT in their own parent divs, so :first-of-type
	// matches both. Plain querySelector returns the first in DOM order = "Notification sounds" switch.
	notificationCheckbox: '[role="dialog"] [role="switch"]',
	rightSidebarMenu: '[role="button"][aria-expanded]:has(path[d^="M18,10 C16.6195"])', // Conversation information button
	rightSidebarButtons: '[role="main"] [role="button"]',
	muteIconNewDesign: 'path[d^="M6.535 16.5H2.287"]', // Crossed-bell icon in the conversation menu
	// Selector for the crossed-bell muted conversation indicator (16×16 icon).
	// Every icon shares the x1k90msu class, so match the unique bell path instead.
	mutedConversation: 'svg[viewBox="0 0 16 16"] path[d^="M2.5 6c0-.322"]',
	// Close button is the only labeled button inside preferences overlay (language-independent)
	closePreferencesButton: '[role="dialog"] [role="button"][aria-label]',
	// Legacy user menu selector - no longer used, kept for reference
	userMenu: '.qi72231t.o9w3sbdw.nu7423ey.tav9wjvu.flwp5yud.tghlliq5.gkg15gwv.s9ok87oh.s9ljgwtm.'
		+ 'lxqftegz.bf1zulr9.frfouenu.bonavkto.djs4p424.r7bn319e.bdao358l.fsf7x5fv.tgm57n0e.jez8cy9q.'
		+ 's5oniofx.m8h3af8h.l7ghb35v.kjdc1dyq.kmwttqpk.dnr7xe2t.aeinzg81.srn514ro.oxkhqvkx.rl78xhln.'
		+ 'nch0832m.om3e55n1.cr00lzj9.rn8ck1ys.s3jn8y49.g4tp4svg.o9erhkwx.dzqi5evh.hupbnkgi.hvb2xoa8.'
		+ 'fxk3tzhb.jl2a5g8c.f14ij5to.l3ldwz01.icdlwmnq > .aglvbi8b.om3e55n1.i8zpp7h3.g4tp4svg',
	// Settings button is the first [aria-haspopup=menu] button in the thread-list nav (language-independent)
	userMenuNewSidebar: '[role="navigation"]:has([role=grid]) [role=button][aria-haspopup="menu"]',
	// Profile button is the last [aria-expanded] button in the page banner (language-independent)
	userProfileButton: '[role=banner] [role=button][aria-expanded]',
	viewsMenu: '[role="navigation"]:has([role="grid"]) [role="tablist"]',
	selectedConversation: '[role="grid"] [role="row"] [role="link"][aria-current="page"]',
	conversationLabelSelectors: [
		'[class*="x1lliihq"][class*="x6ikm8r"][class*="x10wlt62"][class*="xlyipyv"][class*="xuxw1ft"]',
		'[aria-label]:not([role=button]):not([role=menu]):not([role=navigation])',
	],
	preferencesSelector: '[role="dialog"]:has(h2)',
	conversationMenuSelectorNewDesign: '[role=menu]',
};
