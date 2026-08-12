import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AUTH_COOKIE, hashPin, userCookieValue } from '$lib/server/auth';
import { replaceUsers } from '$lib/server/config-service';
import { loadConfig } from '$lib/server/config';
import { authCookie } from '$lib/server/cookies';
import { authenticationMissing, pristineForSetup } from '$lib/server/setup';
import { seedDemoMovies } from '$lib/server/demo';
import { log } from '$lib/server/log';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!authenticationMissing(locals.config))
		return json({ error: locals.t('setup.errorComplete') }, { status: 409 });
	if (!pristineForSetup(locals.db))
		return json({ error: locals.t('setup.errorExistingData') }, { status: 503 });
	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		pin?: string;
		confirmPin?: string;
	};
	const current = loadConfig(true);
	if (!authenticationMissing(current))
		return json({ error: locals.t('setup.errorComplete') }, { status: 409 });
	const name = String(body.name ?? '').trim();
	const pin = String(body.pin ?? '');
	if (name.length < 2 || name.length > 80)
		return json({ error: locals.t('settings.errorName') }, { status: 400 });
	if (!/^\d{4}$/.test(pin)) return json({ error: locals.t('settings.errorPin') }, { status: 400 });
	if (pin !== body.confirmPin) return json({ error: locals.t('settings.errorPinMismatch') }, { status: 400 });
	const id =
		name
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'admin';
	const pinHash = hashPin(pin);
	replaceUsers([{ id, name, role: 'admin', enabled: true, pin_hash: pinHash }]);
	const config = loadConfig();
	cookies.set(AUTH_COOKIE, userCookieValue(locals.db, id, pinHash), authCookie(config, request.headers));
	void seedDemoMovies(locals.db, config).catch((err) =>
		log.warn('Demo content could not be created', { err })
	);
	return json({ ok: true });
};
