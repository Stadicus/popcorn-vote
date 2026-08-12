import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AUTH_COOKIE, hashPin, userCookieValue } from '$lib/server/auth';
import { replaceUsers, storedUsers } from '$lib/server/config-service';
import { hasUsableAdmin, loginIdentifierTaken, requireAdmin } from '$lib/server/settings';
import { authCookie } from '$lib/server/cookies';

export const PUT: RequestHandler = async (event) => {
	requireAdmin(event);
	const users = storedUsers();
	const user = users.find((candidate) => candidate.id === event.params.id);
	if (!user) return json({ error: event.locals.t('settings.errorUserNotFound') }, { status: 404 });
	const body = (await event.request.json().catch(() => ({}))) as {
		name?: string;
		role?: string;
		enabled?: boolean;
		pin?: string;
	};
	if (body.name !== undefined) {
		const name = String(body.name).trim();
		if (name.length < 2 || name.length > 80)
			return json({ error: event.locals.t('settings.errorName') }, { status: 400 });
		if (loginIdentifierTaken(users, name, user.id)) {
			return json({ error: event.locals.t('settings.errorUniqueName') }, { status: 400 });
		}
		user.name = name;
	}
	if (body.role !== undefined) user.role = body.role === 'admin' ? 'admin' : 'user';
	if (body.enabled !== undefined) user.enabled = body.enabled;
	let pinChanged = false;
	if (body.pin) {
		if (!/^\d{4}$/.test(body.pin))
			return json({ error: event.locals.t('settings.errorPin') }, { status: 400 });
		user.pin_hash = hashPin(body.pin);
		pinChanged = true;
	}
	if (!hasUsableAdmin(users))
		return json({ error: event.locals.t('settings.errorLastAdmin') }, { status: 400 });
	replaceUsers(users);
	if (pinChanged && user.enabled && event.locals.user?.id === user.id) {
		event.cookies.set(
			AUTH_COOKIE,
			userCookieValue(event.locals.db, user.id, user.pin_hash),
			authCookie(event.locals.config, event.request.headers)
		);
	}
	return json({ ok: true });
};

export const DELETE: RequestHandler = (event) => {
	requireAdmin(event);
	const users = storedUsers();
	const remaining = users.filter((candidate) => candidate.id !== event.params.id);
	if (remaining.length === users.length)
		return json({ error: event.locals.t('settings.errorUserNotFound') }, { status: 404 });
	if (!hasUsableAdmin(remaining))
		return json({ error: event.locals.t('settings.errorDeleteLastAdmin') }, { status: 400 });
	replaceUsers(remaining);
	return json({ ok: true });
};
