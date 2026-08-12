import type { PageServerLoad } from './$types';
import { publicSettings, requireAdmin } from '$lib/server/settings';
import { APP_VERSION } from '$lib/version';

export const load: PageServerLoad = (event) => {
	requireAdmin(event);
	return { settings: publicSettings(event.locals.config), version: APP_VERSION, locale: event.locals.locale };
};
