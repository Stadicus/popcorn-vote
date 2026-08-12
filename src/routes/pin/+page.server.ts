import type { PageServerLoad } from './$types';
import { checkAttempt } from '$lib/server/auth';

export const load: PageServerLoad = async (event) => {
	let ip = 'unknown';
	try {
		ip = event.getClientAddress();
	} catch {
		// without a socket (prerendering, for instance) there is no IP
	}
	const gate = checkAttempt(event.locals.db, ip);
	return {
		pinConfigured: event.locals.config.pin.length > 0,
		waitSeconds: gate.allowed ? 0 : gate.waitSeconds
	};
};
