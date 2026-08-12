import fs from 'node:fs';
import path from 'node:path';
import type { DB } from './db';
import { metaGet, metaSet } from './db';
import { creditOnce } from './game';
import type { AppConfig } from './config';
import { keyState } from './keys';
import { fetchTmdbRating, TmdbError } from './tmdb';
import { log } from './log';

const HOUR_MS = 3_600_000;
// TMDB permits cached API content for at most six months. Keep a margin below
// that limit so the daily cleanup cannot run beyond it.
const POSTER_CACHE_MAX_AGE_MS = 180 * 24 * HOUR_MS;
const POSTER_CACHE_PRUNE_INTERVAL_MS = 24 * HOUR_MS;
const POSTER_CACHE_PRUNE_META_KEY = 'last_poster_cache_prune';

interface TimeParts {
	weekday: number; // 0 = Sunday
	hour: number;
	date: string; // YYYY-MM-DD in the relevant timezone
}

// One formatter per timezone, created once and kept: `missedCredits` samples
// hour by hour and would otherwise run up thousands of new Intl objects.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timezone: string): Intl.DateTimeFormat {
	let fmt = formatters.get(timezone);
	if (!fmt) {
		fmt = new Intl.DateTimeFormat('en-CA', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			hour12: false,
			weekday: 'short'
		});
		formatters.set(timezone, fmt);
	}
	return fmt;
}

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Weekday, hour and date of a moment in the configured timezone. */
export function timeParts(date: Date, timezone: string): TimeParts {
	const parts = Object.fromEntries(
		formatterFor(timezone)
			.formatToParts(date)
			.map((p) => [p.type, p.value])
	);
	return {
		weekday: WD[parts.weekday] ?? 0,
		hour: Number(parts.hour) % 24,
		date: `${parts.year}-${parts.month}-${parts.day}`
	};
}

/**
 * Counts how often the configured credit moment (weekday + whole hour in the
 * configured timezone) fell between `from` (exclusive) and `to` (inclusive).
 * Sampled hour by hour; hours dropped by a daylight-saving change do not exist
 * locally either.
 *
 * Sampling happens on whole UTC hours. In zones with a half-hour offset (such as
 * Asia/Kolkata or Pacific/Chatham) no sample hits the moment exactly — but the
 * local hour being looked for lasts a full hour and therefore always contains
 * exactly one sample. So nothing is lost, the credit is merely noticed up to 59
 * minutes later there. `game.test.ts` pins that down for several such zones.
 */
export function missedCredits(from: Date, to: Date, weekday: number, hour: number, timezone: string): number {
	let count = 0;
	// Round up to the next whole hour after `from`.
	let t = Math.ceil((from.getTime() + 1) / HOUR_MS) * HOUR_MS;
	const seen = new Set<string>();
	for (; t <= to.getTime(); t += HOUR_MS) {
		const p = timeParts(new Date(t), timezone);
		const key = `${p.date}T${p.hour}`;
		if (p.weekday === weekday && p.hour === hour && !seen.has(key)) {
			seen.add(key);
			count++;
		}
	}
	return count;
}

/** Call at startup and every minute after: catches up missed credits. */
export function runCreditTick(db: DB, config: AppConfig, nowDate: Date = new Date()): number {
	const last = metaGet(db, 'last_credit_check');
	if (!last) {
		// First run: count from now on, no retroactive flood.
		metaSet(db, 'last_credit_check', nowDate.toISOString());
		return 0;
	}
	const missed = missedCredits(
		new Date(last),
		nowDate,
		config.tokenWeekday,
		config.tokenHour,
		config.timezone
	);
	for (let i = 0; i < missed; i++) creditOnce(db, config);
	metaSet(db, 'last_credit_check', nowDate.toISOString());
	return missed;
}

/**
 * The most recent backup moment that is not in the future: the last local hour
 * `hour`, searched backwards hour by hour. A little more than one day of
 * hindsight, so that an hour skipped by a clock change still finds its previous
 * day.
 */
function lastScheduled(nowDate: Date, hour: number, timezone: string): number {
	let t = Math.floor(nowDate.getTime() / HOUR_MS) * HOUR_MS;
	for (let i = 0; i <= 26; i++, t -= HOUR_MS) {
		if (timeParts(new Date(t), timezone).hour === hour) return t;
	}
	return 0;
}

/**
 * Is a backup due? Measured against the last scheduled moment, not against "24
 * hours ago".
 *
 * The difference matters now that the hour is configurable: asking "backed up
 * today already?" never lets a newly set hour take effect while it lies *later*
 * in the day than the previous backup — the same date blocks it, the 24-hour net
 * is all that is left, and the backup drifts a minute further every day instead
 * of arriving at the configured hour. Measured against the scheduled moment the
 * new hour takes effect immediately, and catching up after downtime is
 * preserved: whoever slept through the moment still has it ahead of them at the
 * next start.
 */
export function backupDue(lastIso: string | null, nowDate: Date, config: AppConfig): boolean {
	const lastMs = lastIso ? new Date(lastIso).getTime() : 0;
	return lastMs < lastScheduled(nowDate, config.backupHour, config.timezone);
}

const BACKUP_PREFIX = 'popcornvote-';

/** Nightly backup at the configured hour in the configured timezone. */
export function runBackupTick(db: DB, config: AppConfig, nowDate: Date = new Date()): boolean {
	const last = metaGet(db, 'last_backup_at');
	if (!backupDue(last, nowDate, config)) return false;

	const dir = path.join(config.dataDir, 'backups');
	fs.mkdirSync(dir, { recursive: true });
	const stamp = nowDate.toISOString().replace(/[:T]/g, '-').slice(0, 16);
	const target = path.join(dir, `${BACKUP_PREFIX}${stamp}.sqlite`);
	db.prepare('VACUUM INTO ?').run(target);
	metaSet(db, 'last_backup_at', nowDate.toISOString());

	const files = fs
		.readdirSync(dir)
		.filter((f) => f.startsWith(BACKUP_PREFIX) && f.endsWith('.sqlite'))
		.sort();
	while (files.length > config.backupKeep) {
		const oldest = files.shift();
		if (oldest) fs.rmSync(path.join(dir, oldest), { force: true });
	}
	return true;
}

/**
 * Removes downloaded TMDB posters before their permitted cache lifetime ends.
 *
 * The database deliberately keeps the poster filename: a missing image degrades
 * to the normal no-poster state, and relinking the film fetches a fresh one.
 */
export function runPosterCacheTick(db: DB, config: AppConfig, nowDate: Date = new Date()): number {
	const last = metaGet(db, POSTER_CACHE_PRUNE_META_KEY);
	if (last && nowDate.getTime() - new Date(last).getTime() < POSTER_CACHE_PRUNE_INTERVAL_MS) return 0;

	const dir = path.join(config.dataDir, 'covers');
	const cutoff = nowDate.getTime() - POSTER_CACHE_MAX_AGE_MS;
	let removed = 0;
	try {
		for (const file of fs.readdirSync(dir)) {
			const target = path.join(dir, file);
			if (fs.statSync(target).isFile() && fs.statSync(target).mtimeMs <= cutoff) {
				fs.rmSync(target, { force: true });
				removed++;
			}
		}
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
	}
	metaSet(db, POSTER_CACHE_PRUNE_META_KEY, nowDate.toISOString());
	return removed;
}

/** Films looked at per tick. Five requests at ten seconds each still fit in a minute. */
const BACKFILL_BATCH = 5;

const BACKFILL_CURSOR = 'tmdb_rating_backfill_cursor';

/**
 * One run at a time. Five requests may take fifty of the sixty seconds between
 * ticks, and two overlapping runs would read the same cursor and fetch the same
 * films twice. Nobody would see it — this runs at night on somebody's server.
 */
let backfillRunning = false;

/**
 * Whether TMDB's answer was about this one film rather than about the state of
 * things. Two statuses qualify: 404 for an id that was removed or merged away,
 * and 451 for a title withheld where we are. Neither comes out differently
 * tomorrow, so the walk steps past them.
 *
 * Everything else holds the cursor, because it may well work in a minute — no
 * network, a timeout, 429, 5xx. **401 and 403 are deliberately in that second
 * group** although they can look film-shaped: both can just as easily be about
 * the key, and a key affects every film. Stepping past them would walk the whole
 * archive past a problem that one corrected key would have solved, quietly and
 * for good.
 *
 * What that leaves: a film whose entry answers something else permanently — a
 * stuck 500 — still holds the cursor and costs a log line a minute. Accepted
 * rather than counted around: an attempt counter would be a second piece of
 * durable state for a case nobody here has seen, and the noisy failure is the
 * one that gets noticed and fixed.
 */
function aboutThisFilm(err: unknown): boolean {
	if (!(err instanceof TmdbError)) return false;
	return err.status === 404 || err.status === 451;
}

/**
 * Catches up the TMDB rating for films added before the app stored one.
 *
 * A cursor rather than "everything still missing a rating": a film TMDB has no
 * rating for — or no longer knows at all — keeps its empty column for good, and
 * without the cursor it would come back every minute for ever.
 *
 * Writes `tmdb_rating` and nothing else. Re-fetching the details would rewrite
 * title, description and poster along the current language rule and silently
 * rename a whole archive — the one thing storing them at fetch time is meant to
 * prevent.
 */
export async function runRatingBackfill(db: DB, config: AppConfig): Promise<number> {
	if (backfillRunning) return 0;
	// `keyState` rather than a plain check for a key: it also covers the example
	// placeholder and a key TMDB has refused. Without that last one, a wrong key
	// would buy one doomed request and one warning every minute, all night, on a
	// machine nobody is watching.
	//
	// The price is worth naming: a refusal is module state that only another
	// successful request clears (keys.ts), and this function deliberately sends
	// none. So a single 401 — a genuinely wrong key, or one bad night at TMDB —
	// pauses the catch-up until somebody uses the film search or the container
	// restarts. A pause nobody notices beats a warning a minute nobody reads, and
	// the operator sees the key problem under "More" either way.
	if (keyState(config, 'tmdb') !== 'ok') return 0;
	backfillRunning = true;
	let filled = 0;
	try {
		const cursor = Number(metaGet(db, BACKFILL_CURSOR) ?? 0);
		const pending = db
			.prepare(
				`SELECT id, tmdb_id FROM movies
				 WHERE id > ? AND tmdb_id IS NOT NULL AND tmdb_rating IS NULL
				 ORDER BY id LIMIT ?`
			)
			.all(cursor, BACKFILL_BATCH) as { id: number; tmdb_id: number }[];

		for (const movie of pending) {
			// The film id and the message, never the URL: it carries the API key as a
			// query parameter.
			let rating: number | null = null;
			try {
				rating = await fetchTmdbRating(config, movie.tmdb_id);
			} catch (err) {
				log.warn('Rating backfill: TMDB lookup failed', { movieId: movie.id, err });
				// Holding the cursor is right for something that may work in a minute
				// and wrong for something that never will: one film TMDB answers the
				// same way for ever would be asked about every minute, and no film
				// behind it would ever be reached.
				if (!aboutThisFilm(err)) break;
			}
			if (rating !== null) {
				// The row is checked again, because ten seconds passed between picking
				// it and having an answer. In that window somebody may have linked the
				// film to a different entry in the database — and then this rating
				// belongs to the film it used to be, not the one it is now. Writing it
				// would replace a fresh, correct number with a stale, wrong one, and
				// nothing anywhere would say so.
				const written = db
					.prepare('UPDATE movies SET tmdb_rating = ? WHERE id = ? AND tmdb_id = ? AND tmdb_rating IS NULL')
					.run(rating, movie.id, movie.tmdb_id);
				if (written.changes > 0) filled++;
			}
			// Moves on even without a rating — otherwise this film returns every minute.
			metaSet(db, BACKFILL_CURSOR, String(movie.id));
		}
	} finally {
		backfillRunning = false;
	}
	return filled;
}

let started = false;

export function startScheduler(db: DB, config: AppConfig): void {
	if (started) return;
	started = true;
	const tick = () => {
		try {
			const credited = runCreditTick(db, config);
			if (credited > 0) log.info('Token credit booked', { credits: credited });
			runBackupTick(db, config);
			const expiredPosters = runPosterCacheTick(db, config);
			if (expiredPosters > 0) log.info('Expired TMDB posters removed', { posters: expiredPosters });
		} catch (err) {
			log.error('Scheduler tick failed', { err });
		}
		// Detached on purpose: the tick itself is synchronous, and this one waits on
		// somebody else's server.
		void runRatingBackfill(db, config)
			.then((filled) => {
				if (filled > 0) log.info('TMDB ratings filled in', { movies: filled });
			})
			.catch((err) => log.error('Rating backfill failed', { err }));
	};
	tick();
	setInterval(tick, 60_000);
}
