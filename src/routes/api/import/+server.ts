import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, requirePerson } from '$lib/server/api';
import { parseImportCsv } from '$lib/server/csv';
import { findDuplicates, RuleError } from '$lib/server/game';
import { fetchDetails, searchMovies } from '$lib/server/tmdb';
import { log } from '$lib/server/log';

const MAX_ROWS = 200;

/**
 * CSV import: one line per movie (title; optionally year). Every title is
 * enriched through TMDB where possible (cover, description and so on), otherwise
 * added as a manual entry. Duplicates are skipped.
 */
export const POST: RequestHandler = ({ request, locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		const { csv } = (await request.json().catch(() => ({}))) as { csv?: string };
		const rows = parseImportCsv(String(csv ?? ''));
		if (rows.length === 0) throw new RuleError('rule.importNoTitles');
		if (rows.length > MAX_ROWS) throw new RuleError('rule.importTooMany', { max: MAX_ROWS });

		let created = 0;
		let enriched = 0;
		let manual = 0;
		let skipped = 0;
		const seen = new Set<string>();

		const insert = locals.db.prepare(
			`INSERT INTO movies (status, title, year, tmdb_id, imdb_id, overview, runtime, genres, certification,
				original_language, imdb_rating, tmdb_rating, poster_file, trailer_youtube_id, proposed_by, created_at)
			 VALUES ('list', @title, @year, @tmdb_id, @imdb_id, @overview, @runtime, @genres, @certification,
				@original_language, @imdb_rating, @tmdb_rating, @poster_file, @trailer_youtube_id, @proposed_by, @created_at)`
		);

		for (const row of rows) {
			const key = `${row.title.toLowerCase()}|${row.year ?? ''}`;
			if (seen.has(key) || findDuplicates(locals.db, null, row.title, row.year).length > 0) {
				skipped++;
				continue;
			}
			seen.add(key);

			let fields: Record<string, unknown> = {
				title: row.title,
				year: row.year,
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

			// Enrichment through TMDB where possible, otherwise it stays a manual entry.
			// Deliberately not time-boxed: a long list is a long request, and how long
			// a request may take is the reverse proxy's setting to make, not this
			// app's. Whoever imports hundreds of films raises the timeout in front of
			// it rather than getting half the covers.
			try {
				const hits = await searchMovies(locals.config, row.title);
				const hit =
					hits.find(
						(h) => h.title.toLowerCase() === row.title.toLowerCase() && (!row.year || h.year === row.year)
					) ?? hits[0];
				if (hit) {
					const d = await fetchDetails(locals.config, hit.tmdbId);
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
					enriched++;
				} else {
					manual++;
				}
			} catch (err) {
				log.warn('Import: TMDB lookup failed, adding the movie by hand', { title: row.title, err });
				manual++;
			}

			insert.run({ ...fields, proposed_by: person, created_at: new Date().toISOString() });
			created++;
		}

		log.info('CSV import finished', { created, enriched, manual, skipped, actor: person });
		return json({ ok: true, created, enriched, manual, skipped });
	});
