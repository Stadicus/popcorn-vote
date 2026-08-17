import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, requestJsonObject, requirePerson } from '$lib/server/api';
import { RuleError } from '$lib/server/game';
import { fetchDetails } from '$lib/server/tmdb';
import { keyProblem } from '$lib/server/keys';
import { log } from '$lib/server/log';

/** Links an entry added by hand to a TMDB match after the fact. */
export const POST: RequestHandler = ({ request, params, locals }) =>
	handled(locals, async () => {
		requirePerson(locals);
		const { tmdbId } = await requestJsonObject(request);
		let d;
		try {
			d = await fetchDetails(locals.config, Number(tmdbId));
		} catch (err) {
			// The cause on its own here: whoever is linking an entry already has the
			// movie, so "add it by hand" would be an answer to a question nobody
			// asked.
			const problem = keyProblem(locals.config, 'tmdb');
			if (!problem) log.error('TMDB details lookup failed', { err });
			throw new RuleError(problem ?? 'rule.tmdbUnreachable');
		}
		locals.db
			.prepare(
				`UPDATE movies SET title = ?, year = ?, tmdb_id = ?, imdb_id = ?, overview = ?, runtime = ?,
					genres = ?, certification = ?, original_language = ?, imdb_rating = ?, tmdb_rating = ?,
						poster_file = ?, trailer_youtube_id = ?
				 WHERE id = ?`
			)
			.run(
				d.title,
				d.year,
				d.tmdbId,
				d.imdbId,
				d.overview,
				d.runtime,
				d.genres,
				d.certification,
				d.originalLanguage,
				d.imdbRating,
				d.tmdbRating,
				d.posterFile,
				d.trailerYoutubeId,
				Number(params.id)
			);
		return json({ ok: true });
	});
