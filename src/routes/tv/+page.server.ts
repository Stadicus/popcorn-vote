import type { PageServerLoad } from './$types';
import { nightStandings } from '$lib/server/game';
import { tonightAbsent } from '$lib/server/tonight';
import { latestEvent, winnerMovie } from '$lib/server/views';

export const load: PageServerLoad = async ({ locals }) => {
	const absent = tonightAbsent(locals.db, locals.config.members);
	return {
		standings: nightStandings(locals.db, absent),
		winner: winnerMovie(locals.db),
		lastEvent: latestEvent(locals.db)
	};
};
