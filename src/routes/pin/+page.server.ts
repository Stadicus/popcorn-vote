import type { PageServerLoad } from './$types';
import { checkAttempt } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
	const users = event.locals.config.users ?? [];
	let ip = 'unknown';
	try {
		ip = event.getClientAddress();
	} catch {
		// without a socket (prerendering, for instance) there is no IP
	}
	const gate = checkAttempt(event.locals.db, ip);
	return {
		pinConfigured: event.locals.config.pin.length > 0 || users.length > 0,
		namedUsers: users.some((user) => user.enabled),
		demoPin:
			event.locals.config.demoData && event.locals.config.pin.length > 0 ? event.locals.config.pin : null,
		waitSeconds: gate.allowed ? 0 : gate.waitSeconds
	};
};
