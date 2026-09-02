import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { MovieRow } from '$lib/server/game';
import { tonightAbsent } from '$lib/server/tonight';
import { toView } from '$lib/server/views';

export const load: PageServerLoad = async ({ params, locals }) => {
	const row = locals.db.prepare('SELECT * FROM movies WHERE id = ?').get(Number(params.id)) as
		MovieRow | undefined;
	if (!row) throw error(404, locals.t('rule.movieNotFound'));
	// The film page is the evening's second entrance: the free-pick dialog has to
	// know who is away, or it would offer a film that is waiting for somebody and
	// record the night as one where everybody was there.
	return {
		movie: toView(locals.db, row),
		sources: locals.config.sources,
		absent: tonightAbsent(locals.db, locals.config.members)
	};
};
