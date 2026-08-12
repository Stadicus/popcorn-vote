import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AUTH_COOKIE, hashPin, userCookieValue } from '$lib/server/auth';
import { replaceUsers, storedUsers } from '$lib/server/config-service';
import {
	hasUsableAdmin,
	loginIdentifierTaken,
	requireAdmin,
	wouldLockOutCurrentAdmin
} from '$lib/server/settings';
import { authCookie } from '$lib/server/cookies';

export const PUT: RequestHandler = async (event) => {
	requireAdmin(event);
	const users = storedUsers();
	const user = users.find((candidate) => candidate.id === event.params.id);
	if (!user) return json({ error: event.locals.t('settings.errorUserNotFound') }, { status: 404 });
	const body: unknown = await event.request.json().catch(() => null);
	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		return json({ error: event.locals.t('settings.errorInvalidUser') }, { status: 400 });
	}
	const values = body as Record<string, unknown>;
	if (
		(values.name !== undefined && typeof values.name !== 'string') ||
		(values.role !== undefined && values.role !== 'admin' && values.role !== 'user') ||
		(values.enabled !== undefined && typeof values.enabled !== 'boolean') ||
		(values.pin !== undefined && typeof values.pin !== 'string')
	) {
		return json({ error: event.locals.t('settings.errorInvalidUser') }, { status: 400 });
	}
	const nameValue = values.name as string | undefined;
	const roleValue = values.role as 'admin' | 'user' | undefined;
	const enabledValue = values.enabled as boolean | undefined;
	const pinValue = values.pin as string | undefined;
	if (nameValue !== undefined) {
		const name = nameValue.trim();
		if (name.length < 2 || name.length > 80)
			return json({ error: event.locals.t('settings.errorName') }, { status: 400 });
		if (loginIdentifierTaken(users, name, user.id)) {
			return json({ error: event.locals.t('settings.errorUniqueName') }, { status: 400 });
		}
		user.name = name;
	}
	if (roleValue !== undefined) user.role = roleValue;
	if (enabledValue !== undefined) user.enabled = enabledValue;
	const currentNamedUserId = event.locals.user?.kind === 'user' ? event.locals.user.id : undefined;
	if (wouldLockOutCurrentAdmin(currentNamedUserId, user.id, user.role, user.enabled)) {
		return json({ error: event.locals.t('settings.errorSelfLockout') }, { status: 400 });
	}
	let pinChanged = false;
	if (pinValue) {
		if (!/^\d{4}$/.test(pinValue))
			return json({ error: event.locals.t('settings.errorPin') }, { status: 400 });
		user.pin_hash = hashPin(pinValue);
		pinChanged = true;
	}
	if (!hasUsableAdmin(users))
		return json({ error: event.locals.t('settings.errorLastAdmin') }, { status: 400 });
	replaceUsers(users);
	if (pinChanged && user.enabled && currentNamedUserId === user.id) {
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
	if (event.locals.user?.kind === 'user' && event.locals.user.id === event.params.id) {
		return json({ error: event.locals.t('settings.errorSelfLockout') }, { status: 400 });
	}
	const users = storedUsers();
	const remaining = users.filter((candidate) => candidate.id !== event.params.id);
	if (remaining.length === users.length)
		return json({ error: event.locals.t('settings.errorUserNotFound') }, { status: 404 });
	if (!hasUsableAdmin(remaining))
		return json({ error: event.locals.t('settings.errorDeleteLastAdmin') }, { status: 400 });
	replaceUsers(remaining);
	return json({ ok: true });
};
