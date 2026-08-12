import type { PageServerLoad } from './$types';
import { standings } from '$lib/server/game';
import { latestEvent, winnerMovie } from '$lib/server/views';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		standings: standings(locals.db),
		winner: winnerMovie(locals.db),
		lastEvent: latestEvent(locals.db)
	};
};
