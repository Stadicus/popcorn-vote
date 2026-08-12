import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AUTH_COOKIE, checkAttempt, cookieValue, tryPin } from '$lib/server/auth';
import { deviceCookie } from '$lib/server/cookies';

export const POST: RequestHandler = async (event) => {
	const { request, cookies, locals } = event;
	// This handler does not go through handled() and therefore reads the language
	// out of locals itself.
	const t = locals.t;
	if (!locals.config.pin) {
		return json(
			{ error: t('pin.notConfiguredShort', { file: 'config.yaml', env: 'PV_PIN' }) },
			{ status: 503 }
		);
	}

	// Behind a reverse proxy, getClientAddress() delivers the real sender IP when
	// ADDRESS_HEADER=x-forwarded-for is set (see the documentation).
	let ip = 'unknown';
	try {
		ip = event.getClientAddress();
	} catch {
		// For instance in tests without a socket, then everyone shares one brake.
	}

	const gate = checkAttempt(locals.db, ip);
	if (!gate.allowed) {
		// The page counts the remaining time down itself (waitSeconds), so it is not
		// repeated in the text here.
		return json({ error: t('pin.tooManyAttempts'), waitSeconds: gate.waitSeconds }, { status: 429 });
	}

	const { pin } = (await request.json().catch(() => ({}))) as { pin?: string };
	const result = tryPin(locals.db, locals.config, String(pin ?? ''), ip);

	if (!result.ok) {
		return json({ error: t('pin.wrong'), waitSeconds: result.waitSeconds }, { status: 403 });
	}

	cookies.set(
		AUTH_COOKIE,
		cookieValue(locals.db, locals.config),
		deviceCookie(locals.config, request.headers)
	);
	return json({ ok: true });
};
