import type { PageServerLoad } from './$types';
import { listMovies, winnerMovie } from '$lib/server/views';

export const load: PageServerLoad = async ({ locals }) => {
	return {
		movies: listMovies(locals.db),
		winner: winnerMovie(locals.db)
	};
};
