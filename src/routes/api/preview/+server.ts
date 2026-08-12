import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchPreview } from '$lib/server/tmdb';
import { keyProblem } from '$lib/server/keys';
import { log } from '$lib/server/log';

export const GET: RequestHandler = async ({ url, locals }) => {
	const tmdbId = Number(url.searchParams.get('tmdbId'));
	if (!tmdbId) return json({ error: locals.t('rule.tmdbIdMissing') }, { status: 400 });
	try {
		return json({ preview: await fetchPreview(locals.config, tmdbId) });
	} catch (err) {
		const problem = keyProblem(locals.config, 'tmdb');
		if (problem) {
			const error = `${locals.t('keys.tmdbSearch')} ${locals.t(problem)}`;
			return json({ error, keyProblem: true }, { status: 503 });
		}
		log.error('Preview lookup failed', { err });
		return json({ error: locals.t('rule.tmdbUnreachable') }, { status: 502 });
	}
};
