import type { PageServerLoad } from './$types';
import { eventLog } from '$lib/server/views';

export const load: PageServerLoad = async ({ locals }) => {
	return { events: eventLog(locals.db) };
};
