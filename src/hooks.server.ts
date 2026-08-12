import { json, redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import { building } from '$app/environment';
import { loadConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { ensureBalances } from '$lib/server/game';
import { startScheduler } from '$lib/server/schedule';
import { seedDemoMovies } from '$lib/server/demo';
import { log } from '$lib/server/log';
import { AUTH_COOKIE, isAuthed } from '$lib/server/auth';
import { deviceCookie } from '$lib/server/cookies';
import { logFailure, shortPath } from '$lib/server/api';
import { LANG_COOKIE, resolveLocale } from '$lib/i18n/locales';
import { translator } from '$lib/i18n/translate';

if (!building) {
	const config = loadConfig();
	const db = getDb();
	ensureBalances(db, config);
	startScheduler(db, config);
	// Only for test instances (PV_DEMO_DATA) and only when the movie list is
	// empty. Runs alongside, so that the movie database does not hold up the
	// server start.
	void seedDemoMovies(db, config).catch((err) => log.warn('Demo content could not be created', { err }));
}

// Reachable without a PIN: the PIN page itself, the health address and the app's
// basic equipment.
// /offline.html has to be open: the service worker puts the page into the cache
// while installing, and behind the PIN guard the redirect to /pin would arrive
// there instead.
// /api/language likewise: whoever cannot read the PIN page has to be able to
// change the language before signing in. The endpoint only writes a cookie from
// the known list of languages, holds no server state and gives nothing away .
// the same class as /api/pin itself.
const OPEN_PATHS = new Set([
	'/pin',
	'/api/pin',
	'/api/language',
	'/healthz',
	'/manifest.webmanifest',
	'/service-worker.js',
	'/offline.html'
]);

function isOpen(pathname: string): boolean {
	return (
		OPEN_PATHS.has(pathname) ||
		pathname.startsWith('/_app/') ||
		pathname.startsWith('/icon-') ||
		pathname.startsWith('/favicon') ||
		pathname === '/apple-touch-icon.png'
	);
}

export const handle: Handle = async ({ event, resolve }) => {
	const config = loadConfig();
	event.locals.config = config;
	event.locals.db = getDb();

	// Resolve the language before the PIN guard: the PIN page and the 401 answer
	// both come into being before anyone has signed in, and need it anyway.
	const locale = resolveLocale(event.cookies.get(LANG_COOKIE), config.interfaceLanguage);
	event.locals.locale = locale;
	event.locals.t = translator(locale);

	// Device PIN: once per device, after that everything is open.
	const pathname = event.url.pathname;
	const authed = isAuthed(event.locals.db, config, event.cookies.get(AUTH_COOKIE));
	event.locals.authed = authed;
	if (!authed && !isOpen(pathname)) {
		if (pathname.startsWith('/api/') || pathname.startsWith('/covers/')) {
			return json({ error: event.locals.t('auth.required') }, { status: 401 });
		}
		throw redirect(307, '/pin');
	}
	if (authed && pathname === '/pin') {
		throw redirect(307, '/');
	}

	const cookie = event.cookies.get('pv_person');
	const person = config.members.find((m) => m.id === cookie);
	event.locals.personId = person?.id ?? null;
	if (person) {
		// Extend the cookie by a year on every use.
		event.cookies.set(
			'pv_person',
			person.id,
			deviceCookie(config, event.request.headers, { httpOnly: false })
		);
	}

	const response = await resolve(event, {
		// `<html lang>` has to match the rendered language: screen readers pick
		// their voice from it, and otherwise the browser offers to translate the
		// reader's own mother tongue.
		//
		// The whole attribute is searched for, not just `%lang%`: this function
		// runs over every output chunk, including the ones with movie titles and
		// descriptions in them. A movie carrying `%lang%` in its title should not
		// quietly turn into "de".
		transformPageChunk: ({ html }) => html.replace('lang="%lang%"', `lang="${locale}"`)
	});
	// Security headers for public operation; SvelteKit sets the CSP
	// (svelte.config.js) including nonces for our own inline scripts.
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'no-referrer');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	return response;
};

/**
 * Every unexpected error, as one line in the same shape as the rest of the log.
 *
 * Without this hook SvelteKit prints its own formatted stack instead: readable
 * on its own, but multi-line and free of request context, so it neither says
 * which address produced it nor survives `docker logs … | jq` between the JSON
 * lines. Whoever reads the log after a few weeks needs both.
 *
 * A 404 is left out on purpose. It is not a fault of the app, and every bookmark
 * from before the rename makes one, logged, they would bury the errors that
 * matter.
 *
 * The reference is short and deliberately not unique across all time: it ties a
 * report from the family ("it said 4f2a") to a line in the log, and eight hex
 * characters are enough for that within one container life.
 */
export const handleError: HandleServerError = ({ error, event, status, message }) => {
	if (status === 404) return { message };

	const reference = logFailure('Unexpected error while answering a request', status, error, {
		method: event.request.method,
		path: shortPath(event.url.pathname)
	});
	// Suppressed by LOG_LEVEL, so no line exists to name.
	if (!reference) return { message };
	// The reference rides along inside the message as well, because one path
	// cannot read the field: when the root layout's load throws, SvelteKit renders
	// `src/error.html` instead of `+error.svelte`, and that template can only
	// substitute `%sveltekit.error.message%`. Without this, exactly the worst
	// failure, the app not coming up at all, would log a reference that no
	// screen ever names. `+error.svelte` shows the field and never this message
	// for a 500, so nobody sees it twice.
	return { message: `${message} (${reference})`, reference };
};
