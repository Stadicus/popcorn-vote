import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AUTH_COOKIE, cookieValue, tryPin, tryUserPin } from '$lib/server/auth';
import { authCookie as authCookieOptions } from '$lib/server/cookies';

export const POST: RequestHandler = async (event) => {
	const { request, cookies, locals } = event;
	// This handler does not go through handled() and therefore reads the language
	// out of locals itself.
	const t = locals.t;
	if (!locals.config.pin && locals.config.users.length === 0) {
		return json(
			{ error: t('pin.notConfiguredShort', { file: 'config.yaml', env: 'PV_PIN' }) },
			{ status: 503 }
		);
	}

	// Behind a reverse proxy, getClientAddress() delivers the real sender IP when
	// ADDRESS_HEADER=x-forwarded-for is set (see the documentation). It is off by
	// default because on a directly reachable installation the caller writes that
	// header and could pick the address counted here; the configuration says at
	// startup which way it stands.
	let ip = 'unknown';
	try {
		ip = event.getClientAddress();
	} catch {
		// For instance in tests without a socket, then everyone shares one brake.
	}

	const { pin, userId } = (await request.json().catch(() => ({}))) as { pin?: string; userId?: string };
	const result =
		locals.config.users.length > 0 && String(userId ?? '').trim() !== ''
			? tryUserPin(locals.db, locals.config, String(userId ?? ''), String(pin ?? ''), ip)
			: tryPin(locals.db, locals.config, String(pin ?? ''), ip);

	if (!result.ok) {
		return json(
			{ error: result.allowed ? t('pin.wrong') : t('pin.tooManyAttempts'), waitSeconds: result.waitSeconds },
			{ status: result.allowed ? 403 : 429 }
		);
	}

	const authCookie =
		'cookie' in result && typeof result.cookie === 'string'
			? result.cookie
			: cookieValue(locals.db, locals.config);
	cookies.set(AUTH_COOKIE, authCookie, authCookieOptions(locals.config, request.headers));
	return json({ ok: true });
};
