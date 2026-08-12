import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import type { AppConfig } from './config';
import { createDb, metaGet, metaSet, type DB } from './db';
import { forgetRejections, noteRejected } from './keys';
import { runPosterCacheTick, runRatingBackfill } from './schedule';

// The backfill catches up the TMDB rating for movies added before the app stored
// one. No network here: `fetch` is stubbed, and what is checked is the walk .
// which movies it picks, how far the cursor moves, and that it touches nothing
// but the rating.

const config = {
	tmdbApiKey: 'test-key',
	tmdbKeyState: 'ok',
	dataDir: '/tmp/pv-test',
	httpsProof: { mode: 'none' }
} as AppConfig;

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});
// The refusal is module state in keys.ts. Left standing by a test that failed
// half-way, it would make every later test here return 0 for a reason that has
// nothing to do with what they check.
afterEach(() => forgetRejections());

/** Answers every TMDB request with a rating; counts what was asked for. */
function answerWithRating(rating: number | null) {
	const asked: number[] = [];
	vi.stubGlobal('fetch', async (input: URL | string) => {
		const url = new URL(String(input));
		asked.push(Number(url.pathname.split('/').pop()));
		return { ok: true, status: 200, json: async () => ({ vote_average: rating ?? 0 }) } as Response;
	});
	return asked;
}

function dbWithMovies(movies: { tmdbId: number | null; rating?: number | null }[]): DB {
	const db = createDb(':memory:');
	const insert = db.prepare(
		`INSERT INTO movies (title, tmdb_id, tmdb_rating, proposed_by, created_at)
		 VALUES (?, ?, ?, 'anna', '2026-01-01T00:00:00.000Z')`
	);
	movies.forEach((m, i) => insert.run(`Movie ${i + 1}`, m.tmdbId, m.rating ?? null));
	return db;
}

describe('the TMDB poster cache', () => {
	it('removes posters before their six-month cache lifetime ends', () => {
		const db = createDb(':memory:');
		const now = new Date('2026-08-01T12:00:00.000Z');
		vi.spyOn(fs, 'readdirSync').mockReturnValue(['old.jpg', 'fresh.jpg'] as never);
		vi.spyOn(fs, 'statSync').mockImplementation(
			(file) =>
				({
					isFile: () => true,
					mtimeMs: String(file).endsWith('old.jpg')
						? new Date('2026-01-31T12:00:00.000Z').getTime()
						: new Date('2026-07-31T12:00:00.000Z').getTime()
				}) as fs.Stats
		);
		const remove = vi.spyOn(fs, 'rmSync').mockImplementation(() => undefined);

		expect(runPosterCacheTick(db, config, now)).toBe(1);
		expect(remove).toHaveBeenCalledWith('/tmp/pv-test/covers/old.jpg', { force: true });
		expect(metaGet(db, 'last_poster_cache_prune')).toBe(now.toISOString());

		// The sweep runs only once a day, so a permanent server never holds on to
		// stale content simply because it did not restart.
		expect(runPosterCacheTick(db, config, new Date('2026-08-02T11:59:59.000Z'))).toBe(0);
	});
});

describe('the rating backfill', () => {
	it('fills in the rating and moves the cursor', async () => {
		const db = dbWithMovies([{ tmdbId: 101 }, { tmdbId: 102 }]);
		const asked = answerWithRating(7.5);

		expect(await runRatingBackfill(db, config)).toBe(2);

		expect(asked).toEqual([101, 102]);
		const rows = db.prepare('SELECT tmdb_rating FROM movies ORDER BY id').all();
		expect(rows).toEqual([{ tmdb_rating: 7.5 }, { tmdb_rating: 7.5 }]);
		expect(metaGet(db, 'tmdb_rating_backfill_cursor')).toBe('2');
	});

	// Nothing to ask about: a movie entered by hand has no TMDB id.
	it('skips movies without a tmdb_id', async () => {
		const db = dbWithMovies([{ tmdbId: null }, { tmdbId: 102 }]);
		const asked = answerWithRating(6);

		await runRatingBackfill(db, config);

		expect(asked).toEqual([102]);
	});

	// Already answered once, never asked again.
	it('leaves a movie that already has a rating alone', async () => {
		const db = dbWithMovies([{ tmdbId: 101, rating: 8.1 }]);
		const asked = answerWithRating(3);

		await runRatingBackfill(db, config);

		expect(asked).toEqual([]);
		expect(db.prepare('SELECT tmdb_rating FROM movies').get()).toEqual({ tmdb_rating: 8.1 });
	});

	// The reason for the cursor. TMDB has no rating for this film and never will,
	// so its column stays empty, without the cursor it would come back every
	// minute for ever.
	it('does not ask twice about a movie TMDB has no rating for', async () => {
		const db = dbWithMovies([{ tmdbId: 101 }]);
		const asked = answerWithRating(0);

		await runRatingBackfill(db, config);
		expect(metaGet(db, 'tmdb_rating_backfill_cursor')).toBe('1');

		await runRatingBackfill(db, config);
		expect(asked).toEqual([101]);
	});

	// Five per tick, so a large archive is spread over minutes instead of firing
	// one burst at somebody else's API.
	it('takes at most five movies per run', async () => {
		const db = dbWithMovies(Array.from({ length: 7 }, (_, i) => ({ tmdbId: 100 + i })));
		const asked = answerWithRating(5);

		await runRatingBackfill(db, config);
		expect(asked).toHaveLength(5);

		await runRatingBackfill(db, config);
		expect(asked).toHaveLength(7);
	});

	// A failed request ends the batch where it is. The cursor stays on the last
	// movie actually looked at, so the next tick resumes there instead of walking
	// past the one that failed.
	it('stops at a failed request and resumes there', async () => {
		const db = dbWithMovies([{ tmdbId: 101 }, { tmdbId: 102 }, { tmdbId: 103 }]);
		vi.stubGlobal('fetch', async (input: URL | string) => {
			const id = Number(String(input).split('/').pop()?.split('?')[0]);
			if (id === 102) throw new Error('network is down');
			return { ok: true, status: 200, json: async () => ({ vote_average: 6.6 }) } as Response;
		});

		expect(await runRatingBackfill(db, config)).toBe(1);
		expect(metaGet(db, 'tmdb_rating_backfill_cursor')).toBe('1');

		const asked = answerWithRating(6.6);
		await runRatingBackfill(db, config);
		expect(asked).toEqual([102, 103]);
	});

	// Five requests at ten seconds each may take fifty of the sixty seconds
	// between ticks. Without this, two runs would read the same cursor.
	it('does not start a second run while one is in flight', async () => {
		const db = dbWithMovies([{ tmdbId: 101 }]);
		let release = () => {};
		const held = new Promise<void>((resolve) => (release = resolve));
		const asked: number[] = [];
		vi.stubGlobal('fetch', async (input: URL | string) => {
			asked.push(Number(String(input).split('/').pop()?.split('?')[0]));
			await held;
			return { ok: true, status: 200, json: async () => ({ vote_average: 7 }) } as Response;
		});

		const first = runRatingBackfill(db, config);
		expect(await runRatingBackfill(db, config)).toBe(0);
		release();
		await first;

		expect(asked).toEqual([101]);
	});

	// Without a key there is nothing to ask, and the cursor stays put so a key
	// added later still gets the whole run.
	it('does nothing without a TMDB key', async () => {
		const db = dbWithMovies([{ tmdbId: 101 }]);
		const asked = answerWithRating(7);

		const noKey = { ...config, tmdbApiKey: '', tmdbKeyState: 'missing' } as AppConfig;
		expect(await runRatingBackfill(db, noKey)).toBe(0);

		expect(asked).toEqual([]);
		expect(metaGet(db, 'tmdb_rating_backfill_cursor')).toBeNull();
	});

	// The example placeholder is a non-empty string, so the plain "is there a key"
	// check let it through and bought one doomed request a minute. This is the
	// case the `keyState` guard exists for.
	it('does nothing with the placeholder key from the example configuration', async () => {
		const db = dbWithMovies([{ tmdbId: 101 }]);
		const asked = answerWithRating(7);

		const placeholder = {
			...config,
			tmdbApiKey: 'YOUR-TMDB-KEY',
			tmdbKeyState: 'placeholder'
		} as AppConfig;
		expect(await runRatingBackfill(db, placeholder)).toBe(0);

		expect(asked).toEqual([]);
	});

	// A key the provider has refused is not a key at all here. Asking anyway would
	// buy one doomed request and one warning a minute, all night. Coming back is
	// somebody else's job, any other successful request clears the verdict.
	it('does nothing while the key stands refused', async () => {
		const db = dbWithMovies([{ tmdbId: 101 }]);
		const asked = answerWithRating(7);

		const refused = { ...config, tmdbKeyState: 'ok' } as AppConfig;
		noteRejected('tmdb', 'test-key');
		expect(await runRatingBackfill(db, refused)).toBe(0);
		expect(asked).toEqual([]);

		// And it resumes once the key counts as good again.
		forgetRejections();
		await runRatingBackfill(db, refused);
		expect(asked).toEqual([101]);
	});

	// TMDB removes and merges ids. A 404 is its verdict about this film, not about
	// the connection, holding the cursor there would ask again every minute for
	// ever and starve every film behind it.
	it('walks past a film TMDB no longer knows', async () => {
		const db = dbWithMovies([{ tmdbId: 101 }, { tmdbId: 102 }]);
		const asked: number[] = [];
		vi.stubGlobal('fetch', async (input: URL | string) => {
			const id = Number(String(input).split('/').pop()?.split('?')[0]);
			asked.push(id);
			if (id === 101) return { ok: false, status: 404, json: async () => ({}) } as Response;
			return { ok: true, status: 200, json: async () => ({ vote_average: 6.6 }) } as Response;
		});

		expect(await runRatingBackfill(db, config)).toBe(1);

		// Both were tried in the same batch, and the dead one is behind us.
		expect(asked).toEqual([101, 102]);
		expect(metaGet(db, 'tmdb_rating_backfill_cursor')).toBe('2');
		expect(db.prepare('SELECT tmdb_rating FROM movies ORDER BY id').all()).toEqual([
			{ tmdb_rating: null },
			{ tmdb_rating: 6.6 }
		]);
	});

	// The second permanent status, tested in its own right: narrowing the class
	// back to 404 alone would otherwise pass every test and quietly resurrect the
	// wedge for a withheld title.
	it('walks past a film withheld in this country', async () => {
		const db = dbWithMovies([{ tmdbId: 101 }, { tmdbId: 102 }]);
		const asked: number[] = [];
		vi.stubGlobal('fetch', async (input: URL | string) => {
			const id = Number(String(input).split('/').pop()?.split('?')[0]);
			asked.push(id);
			if (id === 101) return { ok: false, status: 451, json: async () => ({}) } as Response;
			return { ok: true, status: 200, json: async () => ({ vote_average: 6.6 }) } as Response;
		});

		expect(await runRatingBackfill(db, config)).toBe(1);

		expect(asked).toEqual([101, 102]);
		expect(metaGet(db, 'tmdb_rating_backfill_cursor')).toBe('2');
	});

	// The counterpart: a 5xx may well work in a minute, so that one still holds.
	it('stops and holds the cursor on a server error', async () => {
		const db = dbWithMovies([{ tmdbId: 101 }, { tmdbId: 102 }]);
		const asked: number[] = [];
		vi.stubGlobal('fetch', async (input: URL | string) => {
			asked.push(Number(String(input).split('/').pop()?.split('?')[0]));
			return { ok: false, status: 503, json: async () => ({}) } as Response;
		});

		expect(await runRatingBackfill(db, config)).toBe(0);

		expect(asked).toEqual([101]);
		expect(metaGet(db, 'tmdb_rating_backfill_cursor')).toBeNull();
	});

	// Ten seconds pass between picking a film and having an answer. Somebody who
	// re-links the film in that window gets a rating for the entry it points at
	// now, and the answer still on its way belongs to the entry it pointed at
	// before. It must not land on top.
	it('does not overwrite a rating that arrived while it was asking', async () => {
		const db = dbWithMovies([{ tmdbId: 101 }]);
		vi.stubGlobal('fetch', async () => {
			db.prepare('UPDATE movies SET tmdb_id = 999, tmdb_rating = 9.1 WHERE id = 1').run();
			return { ok: true, status: 200, json: async () => ({ vote_average: 4.2 }) } as Response;
		});

		expect(await runRatingBackfill(db, config)).toBe(0);

		expect(db.prepare('SELECT tmdb_id, tmdb_rating FROM movies').get()).toEqual({
			tmdb_id: 999,
			tmdb_rating: 9.1
		});
		// Walked past all the same: the film has a rating, just not this one's.
		expect(metaGet(db, 'tmdb_rating_backfill_cursor')).toBe('1');
	});

	// A restart mid-run picks up from the durable cursor, not from the beginning.
	it('resumes from the stored cursor', async () => {
		const db = dbWithMovies([{ tmdbId: 101 }, { tmdbId: 102 }]);
		metaSet(db, 'tmdb_rating_backfill_cursor', '1');
		const asked = answerWithRating(7);

		await runRatingBackfill(db, config);

		expect(asked).toEqual([102]);
	});
});
