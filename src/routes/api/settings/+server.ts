import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateSettings } from '$lib/server/config-service';
import { loadConfig } from '$lib/server/config';
import { publicSettings, requireAdmin } from '$lib/server/settings';

export const GET: RequestHandler = (event) => {
	requireAdmin(event);
	return json(publicSettings(event.locals.config));
};

export const PUT: RequestHandler = async (event) => {
	requireAdmin(event);
	const body = (await event.request.json().catch(() => ({}))) as {
		title?: string;
		timezone?: string;
		sessionTimeout?: number;
	};
	const values: { title?: string; timezone?: string; sessionTimeout?: number } = {};
	if (event.locals.config.origins.Title !== 'PV_TITLE' && body.title !== undefined) {
		const title = String(body.title).trim();
		if (title.length < 1 || title.length > 80)
			return json({ error: 'Instance name must be between 1 and 80 characters.' }, { status: 400 });
		values.title = title;
	}
	if (event.locals.config.origins.Timezone !== 'PV_TIMEZONE' && body.timezone !== undefined) {
		const timezone = String(body.timezone).trim();
		try {
			new Intl.DateTimeFormat('en', { timeZone: timezone });
		} catch {
			return json({ error: 'Enter a valid timezone such as Europe/Zurich.' }, { status: 400 });
		}
		values.timezone = timezone;
	}
	if (
		event.locals.config.origins['Session timeout'] !== 'PV_SESSION_TIMEOUT' &&
		body.sessionTimeout !== undefined
	) {
		const timeout = Number(body.sessionTimeout);
		if (!Number.isInteger(timeout) || timeout < 300 || timeout > 31_536_000)
			return json({ error: 'Session timeout must be between 5 minutes and one year.' }, { status: 400 });
		values.sessionTimeout = timeout;
	}
	updateSettings(values);
	return json(publicSettings(loadConfig()));
};
