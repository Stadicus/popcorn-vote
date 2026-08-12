import type { PageServerLoad } from './$types';
import { archiveMovies } from '$lib/server/views';

export const load: PageServerLoad = async ({ locals }) => {
	return { archive: archiveMovies(locals.db) };
};
