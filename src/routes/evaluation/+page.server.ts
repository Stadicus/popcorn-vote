import type { PageServerLoad } from './$types';
import { tonightAbsent } from '$lib/server/tonight';
import { listMovies, winnerMovie } from '$lib/server/views';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		// The movies with their stakes rather than a finished ranking: the page has
		// to recount as soon as somebody is ticked off, and it does that with the
		// same `nightBoard()` the server evaluates with. Sending the ranking as well
		// would be a second query nothing reads.
		movies: listMovies(locals.db),
		// The evening as every device sees it. Without this the shared state would
		// be a one-way street to the television: a second phone, or this one after
		// a reload, would show the full count and evaluate with nobody absent.
		absent: tonightAbsent(locals.db),
		winner: winnerMovie(locals.db)
	};
};
