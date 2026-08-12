/**
 * Installing as an app ("add to home screen").
 *
 * Chrome announces exactly once per page load that installation is allowed — and
 * it does so early, often before any sub-page has been opened. That is why the
 * layout calls `listen()` once and the event is kept here until somebody uses
 * it. Safari knows none of this; there only the manual instructions remain.
 */

/** Chrome's own event, absent from the standard types. */
interface InstallPromptEvent extends Event {
	prompt: () => Promise<void>;
}

const DISMISSED_KEY = 'pv-install-dismissed';

const state = $state({
	/** Set as soon as Chrome offers the installation. */
	prompt: null as InstallPromptEvent | null,
	/** Is the app already running in its own window (installed)? */
	standalone: true,
	/** iPhone/iPad in Safari: installing only works by hand, through "share". */
	iosSafari: false,
	/**
	 * Notice dismissed for good. Starts on the hiding side, like `standalone`:
	 * before hydration nobody knows, and a banner flashing up briefly would be
	 * worse than one that appears a blink later.
	 */
	dismissed: true
});

/** Only call from inside `listen()` — there is no localStorage during server rendering. */
function readDismissed(): boolean {
	try {
		return localStorage.getItem(DISMISSED_KEY) === '1';
	} catch {
		// Safari in private mode throws on access. Then we simply ask every time.
		return false;
	}
}

/**
 * Exported for the TV stage's breakout button: it asks at its own mount time,
 * because `install.standalone` starts on `true` until the layout's `listen()`
 * has run — the hiding side for the install banner, the showing side there.
 */
export function detectStandalone(): boolean {
	return (
		window.matchMedia('(display-mode: standalone)').matches ||
		// Safari does not know display-mode and reports it on navigator instead.
		(navigator as Navigator & { standalone?: boolean }).standalone === true
	);
}

function detectIosSafari(): boolean {
	const ua = navigator.userAgent;
	// iPadOS presents itself as Macintosh but has a touchscreen.
	const ios = /iphone|ipod|ipad/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
	// Chrome, Firefox and Edge on iOS cannot install — the notice does not help there.
	return ios && !/crios|fxios|edgios/i.test(ua);
}

export const install = {
	get prompt() {
		return state.prompt;
	},
	get standalone() {
		return state.standalone;
	},
	get iosSafari() {
		return state.iosSafari;
	},
	get dismissed() {
		return state.dismissed;
	},

	/** Hide the notice, for good. */
	dismiss(): void {
		state.dismissed = true;
		try {
			localStorage.setItem(DISMISSED_KEY, '1');
		} catch {
			// No storage, no note to self: then the notice comes back on the next
			// load. Better than an error message for a hint.
		}
	},

	/** Bring the notice back; the entry on "more" uses this. */
	reset(): void {
		state.dismissed = false;
		try {
			localStorage.removeItem(DISMISSED_KEY);
		} catch {
			// see dismiss()
		}
	},

	/** Call from the layout; returns the cleanup function for onMount. */
	listen(): () => void {
		state.standalone = detectStandalone();
		state.iosSafari = detectIosSafari();
		state.dismissed = readDismissed();

		// Did the offer arrive before Svelte took over? Then it is waiting in the
		// early catcher from app.html.
		const early = (window as Window & { __pvInstallEvent?: InstallPromptEvent | null }).__pvInstallEvent;
		if (early) state.prompt = early;

		const onPrompt = (event: Event) => {
			// Chrome should not ask by itself — we offer it in the banner.
			event.preventDefault();
			state.prompt = event as InstallPromptEvent;
		};
		const onInstalled = () => {
			state.prompt = null;
			state.standalone = true;
			(window as Window & { __pvInstallEvent?: InstallPromptEvent | null }).__pvInstallEvent = null;
		};
		window.addEventListener('beforeinstallprompt', onPrompt);
		window.addEventListener('appinstalled', onInstalled);
		return () => {
			window.removeEventListener('beforeinstallprompt', onPrompt);
			window.removeEventListener('appinstalled', onInstalled);
		};
	},

	/** Opens the browser's installation dialog. The event is valid only once. */
	async run(): Promise<void> {
		const event = state.prompt;
		if (!event) return;
		state.prompt = null;
		await event.prompt();
	}
};
