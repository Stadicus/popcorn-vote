import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { MovieRow } from '$lib/server/game';
import { toView } from '$lib/server/views';

export const load: PageServerLoad = async ({ params, locals }) => {
	const row = locals.db.prepare('SELECT * FROM movies WHERE id = ?').get(Number(params.id)) as
		MovieRow | undefined;
	if (!row) throw error(404, locals.t('rule.movieNotFound'));
	return { movie: toView(locals.db, row), sources: locals.config.sources };
};
