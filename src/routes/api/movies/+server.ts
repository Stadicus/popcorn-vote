import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, requirePerson } from '$lib/server/api';
import { findDuplicates, RuleError } from '$lib/server/game';
import { fetchDetails } from '$lib/server/tmdb';
import { keyProblem } from '$lib/server/keys';
import { log } from '$lib/server/log';

/** Duplicate hint before adding. */
export const GET: RequestHandler = async ({ url, locals }) => {
	const tmdbId = url.searchParams.get('tmdbId');
	const title = url.searchParams.get('title') ?? '';
	const year = url.searchParams.get('year');
	const hints = findDuplicates(locals.db, tmdbId ? Number(tmdbId) : null, title, year ? Number(year) : null);
	return json({ duplicates: hints });
};

/** Add a movie: either through TMDB (tmdbId) or by hand (title, year). */
export const POST: RequestHandler = ({ request, locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		const body = (await request.json()) as { tmdbId?: number; title?: string; year?: number };

		let fields;
		if (body.tmdbId) {
			try {
				const d = await fetchDetails(locals.config, Number(body.tmdbId));
				fields = {
					title: d.title,
					year: d.year,
					tmdb_id: d.tmdbId,
					imdb_id: d.imdbId,
					overview: d.overview,
					runtime: d.runtime,
					genres: d.genres,
					certification: d.certification,
					original_language: d.originalLanguage,
					imdb_rating: d.imdbRating,
					tmdb_rating: d.tmdbRating,
					poster_file: d.posterFile,
					trailer_youtube_id: d.trailerYoutubeId
				};
			} catch (err) {
				// A known key problem names itself instead of blaming the film. Built
				// here rather than thrown as a `RuleError`, which carries one key and
				// this needs two: the cause, and the way out that the old sentence
				// named and the cause alone would drop. Logged once when it was found,
				// so not logged again here.
				const problem = keyProblem(locals.config, 'tmdb');
				if (problem) {
					// Flagged like the other two, so the page can put it in the notice
					// rather than a second box saying the same thing in another frame.
					const error = `${locals.t(problem)} ${locals.t('keys.tmdbManual')}`;
					return json({ error, keyProblem: true }, { status: 400 });
				}
				log.error('TMDB details lookup failed', { err });
				throw new RuleError('rule.tmdbUnreachableManual');
			}
		} else {
			const title = String(body.title ?? '').trim();
			if (!title) throw new RuleError('rule.titleRequired');
			const year = Number(body.year) || null;
			fields = {
				title,
				year,
				tmdb_id: null,
				imdb_id: null,
				overview: null,
				runtime: null,
				genres: null,
				certification: null,
				original_language: null,
				imdb_rating: null,
				tmdb_rating: null,
				poster_file: null,
				trailer_youtube_id: null
			};
		}

		const result = locals.db
			.prepare(
				`INSERT INTO movies (status, title, year, tmdb_id, imdb_id, overview, runtime, genres, certification,
					original_language, imdb_rating, tmdb_rating, poster_file, trailer_youtube_id, proposed_by, created_at)
				 VALUES ('list', @title, @year, @tmdb_id, @imdb_id, @overview, @runtime, @genres, @certification,
					@original_language, @imdb_rating, @tmdb_rating, @poster_file, @trailer_youtube_id, @proposed_by, @created_at)`
			)
			.run({ ...fields, proposed_by: person, created_at: new Date().toISOString() });

		return json({ ok: true, movieId: Number(result.lastInsertRowid) });
	});
