import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashPin } from '$lib/server/auth';
import { replaceUsers, storedUsers } from '$lib/server/config-service';
import { requireAdmin } from '$lib/server/settings';

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
		return json({ error: 'Name must be between 2 and 80 characters.' }, { status: 400 });
	if (!/^\d{4}$/.test(pin)) return json({ error: 'PIN must contain exactly 4 digits.' }, { status: 400 });
	const users = storedUsers();
	if (users.some((user) => user.name.toLocaleLowerCase('en') === name.toLocaleLowerCase('en'))) {
		return json({ error: 'Display names must be unique.' }, { status: 400 });
	}
	const base =
		name
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'user';
	let id = base;
	for (let suffix = 2; users.some((user) => user.id === id); suffix += 1) id = `${base}-${suffix}`;
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
