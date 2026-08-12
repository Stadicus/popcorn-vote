import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchMovies } from '$lib/server/tmdb';
import { keyProblem } from '$lib/server/keys';
import { log } from '$lib/server/log';

export const GET: RequestHandler = async ({ url, locals }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	if (query.length < 2) return json({ results: [] });
	try {
		const results = await searchMovies(locals.config, query);
		return json({ results });
	} catch (err) {
		const problem = keyProblem(locals.config, 'tmdb');
		if (problem) {
			const error = `${locals.t('keys.tmdbSearch')} ${locals.t(problem)}`;
			return json({ error, keyProblem: true }, { status: 503 });
		}
		log.error('Movie search failed', { err });
		return json({ error: locals.t('rule.tmdbUnreachableManual') }, { status: 502 });
	}
};
