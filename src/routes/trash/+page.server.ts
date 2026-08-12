import type { PageServerLoad } from './$types';
import { trashMovies } from '$lib/server/views';

export const load: PageServerLoad = async ({ locals }) => {
	return { trash: trashMovies(locals.db) };
};
