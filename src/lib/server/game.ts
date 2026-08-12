import crypto from 'node:crypto';
import type { MessageKey } from '$lib/i18n/catalogues';
import type { Params } from '$lib/i18n/translate';
import type { DB } from './db';
import type { AppConfig } from './config';

/**
 * A broken game rule, carried as a catalogue key rather than as a finished
 * sentence: `handled()` renders it in the language of the request, the rules
 * themselves stay free of presentation, and the tests assert on the key instead
 * of on prose that a translator may reword.
 *
 * `super(key)` keeps the key visible in stack traces and in anything that logs
 * an unexpected `Error` — never a blank message.
 */
export class RuleError extends Error {
	constructor(
		readonly key: MessageKey,
		readonly params?: Params
	) {
		super(key);
	}
}

export interface MovieRow {
	id: number;
	status: string;
	title: string;
	year: number | null;
	tmdb_id: number | null;
	imdb_id: string | null;
	overview: string | null;
	runtime: number | null;
	genres: string | null;
	certification: string | null;
	original_language: string | null;
	imdb_rating: number | null;
	tmdb_rating: number | null;
	poster_file: string | null;
	trailer_youtube_id: string | null;
	source_hint: string | null;
	proposed_by: string;
	created_at: string;
	won_at: string | null;
	won_via: string | null;
	watched_at: string | null;
	deleted_at: string | null;
	deleted_by: string | null;
	trash_stakes: string | null;
}

export interface StakeRow {
	movie_id: number;
	person_id: string;
	count: number;
}

function now(): string {
	return new Date().toISOString();
}

// --- People and balances -----------------------------------------------------

/** Creates missing balances; new people start with the configured starting balance. */
export function ensureBalances(db: DB, config: AppConfig): void {
	const insert = db.prepare('INSERT OR IGNORE INTO balances (person_id, free_tokens) VALUES (?, ?)');
	for (const m of config.members) insert.run(m.id, config.tokenStart);
}

export function getBalance(db: DB, personId: string): number {
	const row = db.prepare('SELECT free_tokens FROM balances WHERE person_id = ?').get(personId) as
		{ free_tokens: number } | undefined;
	return row?.free_tokens ?? 0;
}

function addToBalance(db: DB, personId: string, delta: number): void {
	db.prepare(
		'INSERT INTO balances (person_id, free_tokens) VALUES (?, MAX(0, ?)) ' +
			'ON CONFLICT(person_id) DO UPDATE SET free_tokens = MAX(0, free_tokens + ?)'
	).run(personId, delta, delta);
}

/**
 * One weekly credit: everyone with fewer than `cap` free tokens gets
 * `tokenAmount` added, up to the cap at most.
 *
 * A partial credit rather than all-or-nothing: whoever sits at `cap` minus one
 * gets exactly one of three tokens, the other two expire. Whoever is above the
 * cap through taking tokens back is left untouched by the WHERE clause — there
 * any credit would be a reward for hoarding.
 */
export function creditOnce(db: DB, config: AppConfig): void {
	ensureBalances(db, config);
	const update = db.prepare(
		'UPDATE balances SET free_tokens = MIN(free_tokens + ?, ?) WHERE person_id = ? AND free_tokens < ?'
	);
	for (const m of config.members) {
		update.run(config.tokenAmount, config.tokenCap, m.id, config.tokenCap);
	}
}

// --- Placing and taking back tokens ------------------------------------------

function requireMember(config: AppConfig, personId: string): void {
	if (!config.members.some((m) => m.id === personId)) {
		throw new RuleError('rule.unknownPerson');
	}
}

function getMovie(db: DB, movieId: number): MovieRow {
	const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(movieId) as MovieRow | undefined;
	if (!movie) throw new RuleError('rule.movieNotFound');
	return movie;
}

export function stake(db: DB, config: AppConfig, personId: string, movieId: number, delta: 1 | -1): void {
	requireMember(config, personId);
	const movie = getMovie(db, movieId);
	const tx = db.transaction(() => {
		if (delta === 1) {
			if (movie.status !== 'list') throw new RuleError('rule.stakeNotPossible');
			const balance = getBalance(db, personId);
			if (balance < 1) throw new RuleError('rule.noFreeToken');
			addToBalance(db, personId, -1);
			db.prepare(
				'INSERT INTO stakes (movie_id, person_id, count) VALUES (?, ?, 1) ' +
					'ON CONFLICT(movie_id, person_id) DO UPDATE SET count = count + 1'
			).run(movieId, personId);
		} else {
			if (movie.status !== 'list') throw new RuleError('rule.unstakeNotPossible');
			const row = db
				.prepare('SELECT count FROM stakes WHERE movie_id = ? AND person_id = ?')
				.get(movieId, personId) as { count: number } | undefined;
			if (!row || row.count < 1) throw new RuleError('rule.noTokenOfYours');
			if (row.count === 1) {
				db.prepare('DELETE FROM stakes WHERE movie_id = ? AND person_id = ?').run(movieId, personId);
			} else {
				db.prepare('UPDATE stakes SET count = count - 1 WHERE movie_id = ? AND person_id = ?').run(
					movieId,
					personId
				);
			}
			// Taking back is deliberately never capped (see specification 11.2).
			addToBalance(db, personId, 1);
		}
	});
	tx();
}

// --- Evaluation ---------------------------------------------------------------

export function currentWinner(db: DB): MovieRow | null {
	return (db.prepare("SELECT * FROM movies WHERE status = 'winner'").get() as MovieRow | undefined) ?? null;
}

export interface Standing {
	movieId: number;
	title: string;
	tokens: number;
}

/**
 * One order for the movie list, the evaluation page and the TV board: most
 * tokens at the top, on a tie alphabetically by German rules (umlauts sort with
 * their base letter, case ignored).
 *
 * Every view has to use the same comparison — otherwise, on a tie, the television
 * shows a different order than the phone beside it. SQLite cannot do this
 * (COLLATE knows no umlauts), so the sorting happens in JavaScript.
 */
export function byTokensThenTitle(
	a: { tokens: number; title: string },
	b: { tokens: number; title: string }
): number {
	return b.tokens - a.tokens || a.title.localeCompare(b.title, 'de', { sensitivity: 'base' });
}

export function standings(db: DB): Standing[] {
	const rows = db
		.prepare(
			`SELECT m.id AS movieId, m.title, COALESCE(SUM(s.count), 0) AS tokens
			 FROM movies m LEFT JOIN stakes s ON s.movie_id = m.id
			 WHERE m.status = 'list'
			 GROUP BY m.id ORDER BY m.created_at ASC`
		)
		.all() as Standing[];
	return rows.sort(byTokensThenTitle);
}

export interface EvaluationResult {
	winner: MovieRow;
	wheel: { candidates: Standing[]; winnerMovieId: number } | null;
	standings: Standing[];
}

export function evaluate(
	db: DB,
	config: AppConfig,
	actor: string,
	rng: () => number = secureRandom
): EvaluationResult {
	requireMember(config, actor);
	const tx = db.transaction((): EvaluationResult => {
		if (currentWinner(db)) throw new RuleError('rule.winnerPending');
		const board = standings(db);
		const totalTokens = board.reduce((sum, s) => sum + s.tokens, 0);
		if (totalTokens === 0) throw new RuleError('rule.noTokensPlaced');

		const top = board[0].tokens;
		const candidates = board.filter((s) => s.tokens === top);
		let wheel: EvaluationResult['wheel'] = null;
		let winnerId = candidates[0].movieId;
		if (candidates.length > 1) {
			winnerId = candidates[Math.floor(rng() * candidates.length)].movieId;
			wheel = { candidates, winnerMovieId: winnerId };
		}

		db.prepare("UPDATE movies SET status = 'winner', won_at = ?, won_via = ? WHERE id = ?").run(
			now(),
			wheel ? 'wheel' : 'vote',
			winnerId
		);
		const winner = getMovie(db, winnerId);
		db.prepare('INSERT INTO events (type, actor, created_at, payload) VALUES (?, ?, ?, ?)').run(
			'evaluation',
			actor,
			now(),
			JSON.stringify({
				standings: board,
				winnerMovieId: winnerId,
				winnerTitle: winner.title,
				wheel: wheel
					? {
							candidates: wheel.candidates.map((c) => ({ movieId: c.movieId, title: c.title })),
							result: winner.title
						}
					: null
			})
		);
		return { winner, wheel, standings: board };
	});
	return tx();
}

export function freePick(db: DB, config: AppConfig, actor: string, movieId: number): MovieRow {
	requireMember(config, actor);
	const tx = db.transaction((): MovieRow => {
		if (currentWinner(db)) throw new RuleError('rule.winnerPending');
		const movie = getMovie(db, movieId);
		if (movie.status !== 'list') throw new RuleError('rule.freePickOnlyFromList');
		const board = standings(db);
		db.prepare("UPDATE movies SET status = 'winner', won_at = ?, won_via = 'free_pick' WHERE id = ?").run(
			now(),
			movieId
		);
		db.prepare('INSERT INTO events (type, actor, created_at, payload) VALUES (?, ?, ?, ?)').run(
			'free_pick',
			actor,
			now(),
			JSON.stringify({ standings: board, winnerMovieId: movieId, winnerTitle: movie.title })
		);
		return getMovie(db, movieId);
	});
	return tx();
}

export function revertWinner(db: DB, config: AppConfig, actor: string): MovieRow {
	requireMember(config, actor);
	const tx = db.transaction((): MovieRow => {
		const winner = currentWinner(db);
		if (!winner) throw new RuleError('rule.noWinnerPending');
		db.prepare("UPDATE movies SET status = 'list', won_at = NULL, won_via = NULL WHERE id = ?").run(
			winner.id
		);
		db.prepare('INSERT INTO events (type, actor, created_at, payload) VALUES (?, ?, ?, ?)').run(
			'reverted',
			actor,
			now(),
			JSON.stringify({ movieId: winner.id, title: winner.title })
		);
		return getMovie(db, winner.id);
	});
	return tx();
}

export function confirmWatched(db: DB, config: AppConfig, actor: string): MovieRow {
	requireMember(config, actor);
	const tx = db.transaction((): MovieRow => {
		const winner = currentWinner(db);
		if (!winner) throw new RuleError('rule.noWinnerPending');
		// Now the winner's tokens are finally spent.
		db.prepare('DELETE FROM stakes WHERE movie_id = ?').run(winner.id);
		db.prepare("UPDATE movies SET status = 'archived', watched_at = ? WHERE id = ?").run(now(), winner.id);
		db.prepare('INSERT INTO events (type, actor, created_at, payload) VALUES (?, ?, ?, ?)').run(
			'watched',
			actor,
			now(),
			JSON.stringify({ movieId: winner.id, title: winner.title })
		);
		return getMovie(db, winner.id);
	});
	return tx();
}

/**
 * Corrects whose suggestion it is. Meant for the case where somebody adds a
 * movie on behalf of another family member. Tokens already placed stay untouched
 * — they belong to whoever placed them, not to the person suggesting. The right
 * to delete does move along with the change, though — deliberately not guarded
 * here: anyone at the shared device may still trigger it, only the log now says
 * who did.
 */
export function setProposer(
	db: DB,
	config: AppConfig,
	actor: string,
	movieId: number,
	personId: string
): void {
	requireMember(config, actor);
	requireMember(config, personId);
	const tx = db.transaction(() => {
		const movie = getMovie(db, movieId);
		if (movie.status === 'trashed') {
			throw new RuleError('rule.trashedNotEditable');
		}
		// Nothing actually changes — skip both the write and the log entry, or a
		// retried request writes "reassigned to X, previously X" into a log meant
		// to record real changes.
		if (movie.proposed_by === personId) return;
		db.prepare('UPDATE movies SET proposed_by = ? WHERE id = ?').run(personId, movieId);
		db.prepare('INSERT INTO events (type, actor, created_at, payload) VALUES (?, ?, ?, ?)').run(
			'proposer_changed',
			actor,
			now(),
			JSON.stringify({
				movieId,
				title: movie.title,
				fromPersonId: movie.proposed_by,
				toPersonId: personId
			})
		);
	});
	tx();
}

// --- Deleting, trash, archive -------------------------------------------------

export function deleteMovie(db: DB, config: AppConfig, actor: string, movieId: number): void {
	requireMember(config, actor);
	const tx = db.transaction(() => {
		const movie = getMovie(db, movieId);
		if (movie.status === 'winner') throw new RuleError('rule.winnerNotDeletable');
		if (movie.status !== 'list') throw new RuleError('rule.deleteOnlyFromList');
		if (movie.proposed_by !== actor) throw new RuleError('rule.deleteOnlyOwn');

		const stakesRows = db.prepare('SELECT person_id, count FROM stakes WHERE movie_id = ?').all(movieId) as {
			person_id: string;
			count: number;
		}[];
		// Tokens back to their owners, capped at the limit. Whoever is already above
		// the cap (through taking tokens back) stays unchanged.
		const refund = db.prepare(
			'UPDATE balances SET free_tokens = MAX(free_tokens, MIN(?, free_tokens + ?)) WHERE person_id = ?'
		);
		for (const s of stakesRows) refund.run(config.tokenCap, s.count, s.person_id);
		db.prepare('DELETE FROM stakes WHERE movie_id = ?').run(movieId);
		db.prepare(
			"UPDATE movies SET status = 'trashed', deleted_at = ?, deleted_by = ?, trash_stakes = ? WHERE id = ?"
		).run(
			now(),
			actor,
			JSON.stringify(stakesRows.map((s) => ({ personId: s.person_id, count: s.count }))),
			movieId
		);
	});
	tx();
}

export function restoreMovie(db: DB, config: AppConfig, actor: string, movieId: number): void {
	requireMember(config, actor);
	const movie = getMovie(db, movieId);
	if (movie.status !== 'trashed') throw new RuleError('rule.notInTrash');
	db.prepare(
		"UPDATE movies SET status = 'list', deleted_at = NULL, deleted_by = NULL, trash_stakes = NULL, created_at = ? WHERE id = ?"
	).run(now(), movieId);
}

export function purgeMovie(db: DB, config: AppConfig, actor: string, movieId: number): void {
	requireMember(config, actor);
	const movie = getMovie(db, movieId);
	if (movie.status !== 'trashed') throw new RuleError('rule.notInTrash');
	db.prepare('DELETE FROM movies WHERE id = ?').run(movieId);
}

export function rate(db: DB, config: AppConfig, personId: string, movieId: number, stars: number): void {
	requireMember(config, personId);
	const movie = getMovie(db, movieId);
	if (movie.status !== 'archived') throw new RuleError('rule.rateOnlyArchived');
	if (!(stars >= 1 && stars <= 5) || (stars * 2) % 1 !== 0) {
		throw new RuleError('rule.ratingRange');
	}
	db.prepare(
		'INSERT INTO ratings (movie_id, person_id, stars, rated_at) VALUES (?, ?, ?, ?) ' +
			'ON CONFLICT(movie_id, person_id) DO UPDATE SET stars = excluded.stars, rated_at = excluded.rated_at'
	).run(movieId, personId, stars, now());
}

export function reproposeFromArchive(db: DB, config: AppConfig, actor: string, movieId: number): number {
	requireMember(config, actor);
	const movie = getMovie(db, movieId);
	if (movie.status !== 'archived') throw new RuleError('rule.reproposeOnlyArchived');
	const result = db
		.prepare(
			`INSERT INTO movies (status, title, year, tmdb_id, imdb_id, overview, runtime, genres, certification,
				original_language, imdb_rating, tmdb_rating, poster_file, trailer_youtube_id, source_hint, proposed_by, created_at)
			 VALUES ('list', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			movie.title,
			movie.year,
			movie.tmdb_id,
			movie.imdb_id,
			movie.overview,
			movie.runtime,
			movie.genres,
			movie.certification,
			movie.original_language,
			movie.imdb_rating,
			movie.tmdb_rating,
			movie.poster_file,
			movie.trailer_youtube_id,
			movie.source_hint,
			actor,
			now()
		);
	return Number(result.lastInsertRowid);
}

// --- Duplicates -----------------------------------------------------------------

export interface DuplicateHint {
	kind: 'list' | 'winner' | 'archived';
	title: string;
	proposedBy: string;
	watchedAt: string | null;
}

export function findDuplicates(
	db: DB,
	tmdbId: number | null,
	title: string,
	year: number | null
): DuplicateHint[] {
	const rows = db
		.prepare(
			`SELECT status, title, proposed_by, watched_at, tmdb_id, year FROM movies
			 WHERE status IN ('list', 'winner', 'archived')`
		)
		.all() as {
		status: string;
		title: string;
		proposed_by: string;
		watched_at: string | null;
		tmdb_id: number | null;
		year: number | null;
	}[];
	const norm = title.trim().toLowerCase();
	return rows
		.filter(
			(r) =>
				(tmdbId != null && r.tmdb_id === tmdbId) || (r.title.trim().toLowerCase() === norm && r.year === year)
		)
		.map((r) => ({
			kind: r.status as DuplicateHint['kind'],
			title: r.title,
			proposedBy: r.proposed_by,
			watchedAt: r.watched_at
		}));
}

function secureRandom(): number {
	return crypto.randomInt(0, 2 ** 32) / 2 ** 32;
}
