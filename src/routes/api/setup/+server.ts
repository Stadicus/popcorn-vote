import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AUTH_COOKIE, hashPin, userCookieValue } from '$lib/server/auth';
import { replaceUsers } from '$lib/server/config-service';
import { loadConfig } from '$lib/server/config';
import { authCookie } from '$lib/server/cookies';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	const body = (await request.json().catch(() => ({}))) as {
		name?: string;
		pin?: string;
		confirmPin?: string;
	};
	const current = loadConfig(true);
	if (current.users.length > 0 || current.pin)
		return json({ error: 'Setup is already complete.' }, { status: 409 });
	const name = String(body.name ?? '').trim();
	const pin = String(body.pin ?? '');
	if (name.length < 2 || name.length > 80)
		return json({ error: 'Name must be between 2 and 80 characters.' }, { status: 400 });
	if (!/^\d{4}$/.test(pin)) return json({ error: 'PIN must contain exactly 4 digits.' }, { status: 400 });
	if (pin !== body.confirmPin) return json({ error: 'The PINs do not match.' }, { status: 400 });
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
	return json({ ok: true });
};
