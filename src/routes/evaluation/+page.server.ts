import type { PageServerLoad } from './$types';
import { listMovies, winnerMovie } from '$lib/server/views';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		// The movies with their stakes rather than a finished ranking: the page has
		// to recount as soon as somebody is ticked off, and it does that with the
		// same `nightBoard()` the server evaluates with. Sending the ranking as well
		// would be a second query nothing reads.
		movies: listMovies(locals.db),
		winner: winnerMovie(locals.db)
	};
};
