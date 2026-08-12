import type { PageServerLoad } from './$types';
import { standings } from '$lib/server/game';
import { winnerMovie } from '$lib/server/views';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		standings: standings(locals.db),
		winner: winnerMovie(locals.db)
	};
};
