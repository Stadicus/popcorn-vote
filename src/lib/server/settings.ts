import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export function requireAdmin(event: Pick<RequestEvent, 'locals'>): void {
	if (event.locals.user?.role !== 'admin') throw error(403, 'Administrator access required.');
}

export function publicSettings(config: App.Locals['config']) {
	const environment = Object.entries(config.origins)
		.filter(([, source]) => !['config.yaml', 'default', 'demo', 'missing', 'none'].includes(source))
		.map(([setting, variable]) => ({ setting, variable }));
	return {
		general: {
			title: {
				value: config.title,
				editable: config.origins.Title !== 'PV_TITLE',
				source: config.origins.Title
			},
			timezone: {
				value: config.timezone,
				editable: config.origins.Timezone !== 'PV_TIMEZONE',
				source: config.origins.Timezone
			}
		},
		security: {
			sessionTimeout: {
				value: config.sessionTimeout,
				editable: config.origins['Session timeout'] !== 'PV_SESSION_TIMEOUT',
				source: config.origins['Session timeout']
			}
		},
		users: config.users.map(({ id, name, role, enabled }) => ({ id, name, role, enabled })),
		advanced: { configFile: config.configFile, environment }
	};
}
