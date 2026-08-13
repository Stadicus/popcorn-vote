import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export interface LoginIdentity {
	id: string;
	name: string;
}

export interface ManagedUser extends LoginIdentity {
	role: 'admin' | 'user';
	enabled: boolean;
}

export function hasUsableAdmin(users: ManagedUser[]): boolean {
	return users.some((user) => user.role === 'admin' && user.enabled);
}

export function loginIdentifierTaken(users: LoginIdentity[], value: string, exceptId?: string): boolean {
	const key = value.trim().toLocaleLowerCase('en');
	return users.some(
		(user) =>
			user.id !== exceptId &&
			(user.id.toLocaleLowerCase('en') === key || user.name.toLocaleLowerCase('en') === key)
	);
}

export function wouldLockOutCurrentAdmin(
	currentUserId: string | undefined,
	targetUserId: string,
	role: 'admin' | 'user',
	enabled: boolean
): boolean {
	return currentUserId === targetUserId && (role !== 'admin' || !enabled);
}

export function requireAdmin(event: Pick<RequestEvent, 'locals'>): void {
	if (event.locals.user?.role !== 'admin') throw error(403, event.locals.t('settings.errorAdminRequired'));
}

export function publicSettings(config: App.Locals['config']) {
	const environment = Object.entries(config.origins)
		.filter(([, source]) => !['config.yaml', 'default', 'demo', 'missing', 'none'].includes(source))
		.map(([setting, variable]) => ({ setting, variable }));
	return {
		sharedFamilyPin: config.users.length === 0 && Boolean(config.pin),
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
