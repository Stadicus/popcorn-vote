import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { hashPin } from '$lib/server/auth';
import { replaceUsers, storedUsers } from '$lib/server/config-service';
import { requireAdmin } from '$lib/server/settings';

function usableAdmins(users: ReturnType<typeof storedUsers>): number {
	return users.filter((user) => user.role === 'admin' && user.enabled).length;
}

export const PUT: RequestHandler = async (event) => {
	requireAdmin(event);
	const users = storedUsers();
	const user = users.find((candidate) => candidate.id === event.params.id);
	if (!user) return json({ error: 'User not found.' }, { status: 404 });
	const body = (await event.request.json().catch(() => ({}))) as {
		name?: string;
		role?: string;
		enabled?: boolean;
		pin?: string;
	};
	if (body.name !== undefined) {
		const name = String(body.name).trim();
		if (name.length < 2 || name.length > 80)
			return json({ error: 'Name must be between 2 and 80 characters.' }, { status: 400 });
		if (
			users.some(
				(candidate) =>
					candidate.id !== user.id && candidate.name.toLocaleLowerCase('en') === name.toLocaleLowerCase('en')
			)
		) {
			return json({ error: 'Display names must be unique.' }, { status: 400 });
		}
		user.name = name;
	}
	if (body.role !== undefined) user.role = body.role === 'admin' ? 'admin' : 'user';
	if (body.enabled !== undefined) user.enabled = body.enabled;
	if (body.pin) {
		if (!/^\d{4}$/.test(body.pin))
			return json({ error: 'PIN must contain exactly 4 digits.' }, { status: 400 });
		user.pin_hash = hashPin(body.pin);
	}
	if (usableAdmins(users) === 0)
		return json({ error: 'At least one enabled administrator is required.' }, { status: 400 });
	replaceUsers(users);
	return json({ ok: true });
};

export const DELETE: RequestHandler = (event) => {
	requireAdmin(event);
	const users = storedUsers();
	const remaining = users.filter((candidate) => candidate.id !== event.params.id);
	if (remaining.length === users.length) return json({ error: 'User not found.' }, { status: 404 });
	if (usableAdmins(remaining) === 0)
		return json({ error: 'The last enabled administrator cannot be deleted.' }, { status: 400 });
	replaceUsers(remaining);
	return json({ ok: true });
};
