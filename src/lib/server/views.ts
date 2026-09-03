import type { DB } from './db';
import type { AppConfig } from './config';
import type { MovieRow } from './game';
import { byTokensThenTitle } from '$lib/standings';
import { getBalance } from './game';

export interface StakeInfo {
	personId: string;
	count: number;
}

export interface MovieView {
	id: number;
	status: string;
	title: string;
	year: number | null;
	tmdbId: number | null;
	overview: string | null;
	runtime: number | null;
	genres: string | null;
	certification: string | null;
	originalLanguage: string | null;
	imdbRating: number | null;
	tmdbRating: number | null;
	poster: string | null;
	trailerYoutubeId: string | null;
	sourceHint: string | null;
	proposedBy: string;
	createdAt: string;
	wonAt: string | null;
	wonVia: string | null;
	/** Who was not there that night, or `null` for the usual case: everybody. */
	absent: string[] | null;
	watchedAt: string | null;
	tokens: number;
	stakes: StakeInfo[];
}

export function toView(db: DB, row: MovieRow): MovieView {
	const stakes = db
		.prepare('SELECT person_id AS personId, count FROM stakes WHERE movie_id = ? ORDER BY count DESC')
		.all(row.id) as StakeInfo[];
	return {
		id: row.id,
		status: row.status,
		title: row.title,
		year: row.year,
		tmdbId: row.tmdb_id,
		overview: row.overview,
		runtime: row.runtime,
		genres: row.genres,
		certification: row.certification,
		originalLanguage: row.original_language,
		imdbRating: row.imdb_rating,
		tmdbRating: row.tmdb_rating,
		poster: row.poster_file ? `/covers/${row.poster_file}` : null,
		trailerYoutubeId: row.trailer_youtube_id,
		sourceHint: row.source_hint,
		proposedBy: row.proposed_by,
		createdAt: row.created_at,
		wonAt: row.won_at,
		wonVia: row.won_via,
		absent: row.absent ? (JSON.parse(row.absent) as string[]) : null,
		watchedAt: row.watched_at,
		tokens: stakes.reduce((sum, s) => sum + s.count, 0),
		stakes
	};
}

export function listMovies(db: DB): MovieView[] {
	const rows = db.prepare("SELECT * FROM movies WHERE status = 'list'").all() as MovieRow[];
	// The same comparison as for the evaluation page and the TV board, so that the
	// order on a tie is identical everywhere.
	return rows.map((r) => toView(db, r)).sort(byTokensThenTitle);
}

export function winnerMovie(db: DB): MovieView | null {
	const row = db.prepare("SELECT * FROM movies WHERE status = 'winner'").get() as MovieRow | undefined;
	return row ? toView(db, row) : null;
}

export interface RatingInfo {
	personId: string;
	stars: number;
}

export interface ArchiveEntry extends MovieView {
	ratings: RatingInfo[];
	average: number | null;
}

export function archiveMovies(db: DB): ArchiveEntry[] {
	const rows = db
		// `id DESC` is the tiebreak, not the guarantee: two films are never confirmed
		// in the same millisecond, so the freshly watched one is on top through
		// `watched_at` alone. Without it a collision would be resolved by nothing at
		// all, which is a worse thing to hand the archive page.
		.prepare("SELECT * FROM movies WHERE status = 'archived' ORDER BY watched_at DESC, id DESC")
		.all() as MovieRow[];
	return rows.map((row) => {
		const ratings = db
			.prepare('SELECT person_id AS personId, stars FROM ratings WHERE movie_id = ?')
			.all(row.id) as RatingInfo[];
		const average = ratings.length
			? Math.round((ratings.reduce((sum, r) => sum + r.stars, 0) / ratings.length) * 10) / 10
			: null;
		return { ...toView(db, row), ratings, average };
	});
}

export function trashMovies(
	db: DB
): (MovieView & { deletedAt: string | null; deletedBy: string | null; trashStakes: StakeInfo[] })[] {
	const rows = db
		.prepare("SELECT * FROM movies WHERE status = 'trashed' ORDER BY deleted_at DESC")
		.all() as MovieRow[];
	return rows.map((row) => ({
		...toView(db, row),
		deletedAt: row.deleted_at,
		deletedBy: row.deleted_by,
		trashStakes: row.trash_stakes ? (JSON.parse(row.trash_stakes) as StakeInfo[]) : []
	}));
}

export interface EventView {
	id: number;
	type: string;
	actor: string;
	createdAt: string;
	payload: Record<string, unknown>;
}

export function eventLog(db: DB): EventView[] {
	const rows = db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 200').all() as {
		id: number;
		type: string;
		actor: string;
		created_at: string;
		payload: string;
	}[];
	return rows.map((r) => ({
		id: r.id,
		type: r.type,
		actor: r.actor,
		createdAt: r.created_at,
		payload: JSON.parse(r.payload) as Record<string, unknown>
	}));
}

/**
 * The event types that decide what the TV stage shows, kept in one place so a
 * type can only ever be added here deliberately, not by accident of being the
 * newest row. Mirrored in the `events.type` comment in `db.ts`, which lists
 * every type that actually gets written; this is the subset of those the TV
 * acts on.
 */
export const WINNER_LIFECYCLE_EVENT_TYPES = ['evaluation', 'free_pick', 'reverted', 'watched'] as const;

/**
 * Latest event for the TV: the TV view spots a fresh evaluation or free pick by
 * it and replays the wheel or celebrates. Scoped to `WINNER_LIFECYCLE_EVENT_TYPES`
 * on purpose, an event type outside it (a reassigned suggestion, say) would
 * otherwise become "the latest event" the moment someone else triggers it, and
 * the TV would read that as "already seen, show calmly" and quietly skip the
 * wheel and the celebration for an evaluation that just happened. `eventLog()`
 * above returns everything, unfiltered, for `/log`; this one deliberately does not.
 */
export function latestEvent(db: DB): EventView | null {
	const placeholders = WINNER_LIFECYCLE_EVENT_TYPES.map(() => '?').join(', ');
	const row = db
		.prepare(`SELECT * FROM events WHERE type IN (${placeholders}) ORDER BY id DESC LIMIT 1`)
		.get(...WINNER_LIFECYCLE_EVENT_TYPES) as
		{ id: number; type: string; actor: string; created_at: string; payload: string } | undefined;
	if (!row) return null;
	return {
		id: row.id,
		type: row.type,
		actor: row.actor,
		createdAt: row.created_at,
		payload: JSON.parse(row.payload) as Record<string, unknown>
	};
}

export function balances(db: DB, config: AppConfig): Record<string, number> {
	const result: Record<string, number> = {};
	for (const m of config.members) result[m.id] = getBalance(db, m.id);
	return result;
}
