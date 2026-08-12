import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashPin } from '$lib/server/auth';
import { replaceUsers, storedUsers } from '$lib/server/config-service';
import { loginIdentifierTaken, requireAdmin } from '$lib/server/settings';

export const POST: RequestHandler = async (event) => {
	requireAdmin(event);
	const body = (await event.request.json().catch(() => ({}))) as {
		name?: string;
		role?: string;
		enabled?: boolean;
		pin?: string;
	};
	const name = String(body.name ?? '').trim();
	const pin = String(body.pin ?? '');
	if (name.length < 2 || name.length > 80)
		return json({ error: event.locals.t('settings.errorName') }, { status: 400 });
	if (!/^\d{4}$/.test(pin)) return json({ error: event.locals.t('settings.errorPin') }, { status: 400 });
	const users = storedUsers();
	if (loginIdentifierTaken(users, name)) {
		return json({ error: event.locals.t('settings.errorUniqueName') }, { status: 400 });
	}
	const base =
		name
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'user';
	let id = base;
	for (let suffix = 2; loginIdentifierTaken(users, id); suffix += 1) id = `${base}-${suffix}`;
	users.push({
		id,
		name,
		role: users.length === 0 || body.role === 'admin' ? 'admin' : 'user',
		enabled: users.length === 0 ? true : body.enabled !== false,
		pin_hash: hashPin(pin)
	});
	replaceUsers(users);
	return json({ ok: true, id }, { status: 201 });
};
