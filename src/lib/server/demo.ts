import type { DB } from './db';
import type { AppConfig, Member } from './config';
import { confirmWatched, deleteMovie, ensureBalances, evaluate, rate, stake } from './game';
import { searchMovies, fetchDetails } from './tmdb';
import { log } from './log';

/**
 * Demo content for test instances.
 *
 * The test instance on Render starts with an empty database on every deploy.
 * Without content you see an empty list there and can try out neither the vote
 * nor the TV stage. With `PV_DEMO_DATA=true` (or `demo_data: true` in
 * config.yaml) the app therefore fills every area on first start: list, archive
 * with ratings, log and trash.
 *
 * Archive and trash come about through the **real flow**, adding, placing
 * tokens, evaluating, confirming "watched", rating and deleting respectively.
 * Invented records would be faster but would produce states the game rules never
 * bring about.
 *
 * Three limitations worth knowing:
 *
 * 1. The guard only applies to an **empty** movie table. A running family
 *    installation therefore can no longer be hit by the setting, a freshly set
 *    up one very much can. That is why it lives solely in the Render blueprint
 *    for the test instance and nowhere else.
 * 2. The movie data comes over the network, which takes time. Between the check
 *    and the write somebody could suggest the first real movie, so it is checked
 *    again inside a transaction immediately before writing.
 * 3. `evaluate()` always evaluates **all** movies with status `list`; leaving
 *    individual ones out is not possible. That is why the archive cycles run
 *    strictly one after another and in full before trash and list come about .
 *    otherwise an evaluation would drag a list movie into the archive.
 */

const DAY_MS = 86_400_000;
const HOUR = 1 / 24;

/** Balance during seeding: high enough that no `stake()` fails. */
const WORKING_BALANCE = 99;

interface ArchivePlan {
	title: string;
	/** How many days ago the movie night was. */
	daysAgo: number;
	/** Who suggested it, as an index into the list of people. */
	suggestedBy: number;
	/** One tokens from this person per entry. */
	tokens: number[];
	/** Stars per person, in the order of the list of people. */
	stars: number[];
}

const ARCHIVE: ArchivePlan[] = [
	{ title: 'Back to the Future', daysAgo: 34, suggestedBy: 0, tokens: [0, 1, 2], stars: [4.5, 5, 4] },
	{ title: 'The Jungle Book', daysAgo: 20, suggestedBy: 2, tokens: [2, 3, 0], stars: [4, 3.5, 4.5] },
	{ title: 'Paddington 2', daysAgo: 7, suggestedBy: 1, tokens: [1, 1, 3], stars: [5, 4.5, 5] }
];

/** Deleted suggestions. Only whoever suggested it may delete it. */
const TRASH = [
	{ title: 'The Lord of the Rings: The Fellowship of the Ring', daysAgo: 12, suggestedBy: 3, tokens: [0] },
	{ title: 'Jurassic Park', daysAgo: 4, suggestedBy: 1, tokens: [1, 2] }
];

/** The running list. The first entry is in front so the stage has something to show. */
const LIST = [
	{ title: 'Moana', daysAgo: 9, suggestedBy: 0, tokens: [0, 1, 2] },
	{ title: 'Incredibles 2', daysAgo: 8, suggestedBy: 1, tokens: [1, 3] },
	{ title: 'Ratatouille', daysAgo: 6, suggestedBy: 2, tokens: [2, 0] },
	{ title: 'Coco', daysAgo: 5, suggestedBy: 3, tokens: [3] },
	{ title: 'Finding Nemo', daysAgo: 3, suggestedBy: 0, tokens: [] },
	{ title: 'The Lion King', daysAgo: 1, suggestedBy: 2, tokens: [] }
];

/** Person for an index; wraps around so the plans work out with two people too. */
function person(config: AppConfig, index: number): Member {
	return config.members[index % config.members.length];
}

/** A moment `days` days ago; fractions are allowed (see HOUR). */
function daysAgoIso(days: number): string {
	return new Date(Date.now() - days * DAY_MS).toISOString();
}

function lastEventId(db: DB): number {
	const { highest } = db.prepare('SELECT COALESCE(MAX(id), 0) AS highest FROM events').get() as {
		highest: number;
	};
	return highest;
}

/**
 * Creates the demo content. Runs in the background because the movie database is
 * queried; the server starts independently of it. Failures here have no
 * consequences: at worst the test instance stays empty.
 */
export async function seedDemoMovies(db: DB, config: AppConfig): Promise<void> {
	if (!config.demoData || !isEmpty(db)) return;

	const title = [...ARCHIVE, ...TRASH, ...LIST].map((e) => e.title);
	log.info('Preparing demo content', { movies: title.length });

	// First fetch everything that needs the network, without writing anything.
	const data = new Map<string, Record<string, unknown>>();
	for (const t of title) {
		try {
			data.set(t, await fetchFields(config, t));
		} catch (err) {
			log.warn('Demo movie could not be prepared', { title: t, err });
		}
	}
	if (data.size === 0) return;

	const created = writeEverything(db, config, data);
	if (created > 0) log.info('Demo content created', { movies: created });
}

/**
 * Every write inside **exactly one** transaction, which begins with the repeated
 * emptiness check.
 *
 * Were this to fall apart into several transactions, the check would protect only
 * the first step: on the publicly reachable test instance a single visitor
 * suggesting a real movie between two cycles would be enough, the next
 * evaluation would drag it into the archive, or the resulting tie would make
 * `confirmWatched` refuse and leave a half-filled database behind.
 *
 * The calls to `stake`, `evaluate`, `confirmWatched` and `deleteMovie` bring
 * transactions of their own; inside a running transaction better-sqlite3 turns
 * those into savepoints.
 */
function writeEverything(db: DB, config: AppConfig, data: Map<string, Record<string, unknown>>): number {
	const tx = db.transaction(() => {
		if (!isEmpty(db)) {
			log.info('Demo content skipped, movies already exist');
			return 0;
		}

		// Raise the balances temporarily: seeding hands out more tokens than three
		// starting balances provide. Without this, individual stake() calls would fail
		// silently and the demo would be half empty.
		// `ensureBalances` only creates the rows here; which value it writes does not
		// matter, the next line overwrites it anyway.
		ensureBalances(db, config);
		const balance = db.prepare('UPDATE balances SET free_tokens = ? WHERE person_id = ?');
		for (const m of config.members) balance.run(WORKING_BALANCE, m.id);

		let created = 0;
		for (const plan of ARCHIVE) {
			const fields = data.get(plan.title);
			if (fields && archiveCycle(db, config, fields, plan)) created++;
		}
		for (const plan of TRASH) {
			const fields = data.get(plan.title);
			if (fields && trashEntry(db, config, fields, plan)) created++;
		}
		for (const plan of LIST) {
			const fields = data.get(plan.title);
			if (!fields) continue;
			const movieId = insert(
				db,
				config,
				fields,
				person(config, plan.suggestedBy).id,
				daysAgoIso(plan.daysAgo)
			);
			placeTokens(db, config, movieId, plan.tokens);
			created++;
		}

		// Plausible balances at the end: one person at the cap, so that the "balance
		// full" notice is visible on the test instance too.
		config.members.forEach((m, i) => balance.run(Math.max(1, config.tokenCap - i), m.id));
		return created;
	});
	return tx();
}

/**
 * A complete movie night: add, place tokens, evaluate, confirm "watched", rate.
 * Exactly one movie is on the list per cycle so that the lead is unambiguous, on
 * a tie `evaluate()` would wait for the wheel and `confirmWatched` would refuse.
 */
function archiveCycle(
	db: DB,
	config: AppConfig,
	fields: Record<string, unknown>,
	plan: ArchivePlan
): boolean {
	const fromEventId = lastEventId(db);
	const suggester = person(config, plan.suggestedBy).id;
	const movieId = insert(db, config, fields, suggester, daysAgoIso(plan.daysAgo + 10));
	placeTokens(db, config, movieId, plan.tokens);

	evaluate(db, config, suggester);
	confirmWatched(db, config, suggester);
	config.members.forEach((m, i) => {
		const stars = plan.stars[i % plan.stars.length];
		rate(db, config, m.id, movieId, stars);
	});

	// Without back-dating, the archive would list movies from weeks ago while the
	// log dated the same evaluations to today. Archive, log and ratings have to
	// tell the same timeline.
	const wonAt = daysAgoIso(plan.daysAgo + 5 * HOUR);
	const watchedAt = daysAgoIso(plan.daysAgo);
	db.prepare('UPDATE movies SET won_at = ?, watched_at = ? WHERE id = ?').run(wonAt, watchedAt, movieId);
	// These are exactly the rows /log shows. Each cycle produces exactly one
	// evaluation and one "watched", so bounding by id is enough.
	db.prepare("UPDATE events SET created_at = ? WHERE id > ? AND type = 'evaluation'").run(wonAt, fromEventId);
	db.prepare("UPDATE events SET created_at = ? WHERE id > ? AND type = 'watched'").run(
		watchedAt,
		fromEventId
	);
	// `rate()` writes no events row (the column does not know the type, and
	// /log consequently shows no ratings). The date is pulled along anyway,
	// so that the timeline is right there too.
	db.prepare('UPDATE ratings SET rated_at = ? WHERE movie_id = ?').run(
		daysAgoIso(plan.daysAgo - 1 * HOUR),
		movieId
	);
	return true;
}

/** A deleted suggestion through the regular delete function, so the tokens summary is real. */
function trashEntry(
	db: DB,
	config: AppConfig,
	fields: Record<string, unknown>,
	plan: (typeof TRASH)[number]
): boolean {
	// Whoever deletes has to be the same person who suggested, otherwise
	// deleteMovie() refuses and the seeding breaks off.
	const suggester = person(config, plan.suggestedBy).id;
	const movieId = insert(db, config, fields, suggester, daysAgoIso(plan.daysAgo + 6));
	placeTokens(db, config, movieId, plan.tokens);
	deleteMovie(db, config, suggester, movieId);
	db.prepare('UPDATE movies SET deleted_at = ? WHERE id = ?').run(daysAgoIso(plan.daysAgo), movieId);
	return true;
}

function placeTokens(db: DB, config: AppConfig, movieId: number, tokens: number[]): void {
	for (const index of tokens) stake(db, config, person(config, index).id, movieId, 1);
}

function isEmpty(db: DB): boolean {
	const { count } = db.prepare('SELECT COUNT(*) AS count FROM movies').get() as { count: number };
	return count === 0;
}

/** Fetches the movie data from the database on the network, otherwise the title stands alone. */
async function fetchFields(config: AppConfig, title: string): Promise<Record<string, unknown>> {
	let fields: Record<string, unknown> = {
		title: title,
		year: null,
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

	if (config.tmdbApiKey) {
		try {
			const hits = await searchMovies(config, title);
			if (hits.length > 0) {
				const d = await fetchDetails(config, hits[0].tmdbId);
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
			}
		} catch (err) {
			// Without a poster the movie is still usable for trying things out.
			log.warn('Demo movie created without database data', { title: title, err });
		}
	}
	return fields;
}

/** Writes a prepared movie; runs inside the transaction. */
function insert(
	db: DB,
	config: AppConfig,
	fields: Record<string, unknown>,
	personId: string,
	createdAt: string
): number {
	const result = db
		.prepare(
			`INSERT INTO movies (status, title, year, tmdb_id, imdb_id, overview, runtime, genres, certification,
				original_language, imdb_rating, tmdb_rating, poster_file, trailer_youtube_id, source_hint, proposed_by, created_at)
			 VALUES ('list', @title, @year, @tmdb_id, @imdb_id, @overview, @runtime, @genres, @certification,
				@original_language, @imdb_rating, @tmdb_rating, @poster_file, @trailer_youtube_id, @source_hint, @proposed_by, @created_at)`
		)
		.run({
			...fields,
			source_hint: config.sources[0] ?? null,
			proposed_by: personId,
			created_at: createdAt
		});
	return Number(result.lastInsertRowid);
}
