import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { createDb, type DB } from '$lib/server/db';
import { translator } from '$lib/i18n/translate';

const { parseImportCsv, findDuplicates, searchMovies, fetchDetails, warn, info } = vi.hoisted(() => ({
	parseImportCsv: vi.fn(),
	findDuplicates: vi.fn(),
	searchMovies: vi.fn(),
	fetchDetails: vi.fn(),
	warn: vi.fn(),
	info: vi.fn()
}));

vi.mock('$lib/server/csv', () => ({ parseImportCsv }));
vi.mock('$lib/server/game', async (importOriginal) => ({
	...(await importOriginal<typeof import('$lib/server/game')>()),
	findDuplicates
}));
vi.mock('$lib/server/tmdb', () => ({ searchMovies, fetchDetails }));
vi.mock('$lib/server/log', () => ({ log: { warn, info } }));

import { POST } from './+server';

let db: DB;

function event(csv = 'films'): RequestEvent {
	return {
		request: new Request('http://localhost/api/import', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ csv })
		}),
		locals: { db, personId: 'anna', config: {}, t: translator('en') }
	} as unknown as RequestEvent;
}

beforeEach(() => {
	db = createDb(':memory:');
	for (const mock of [parseImportCsv, findDuplicates, searchMovies, fetchDetails, warn, info])
		mock.mockReset();
	findDuplicates.mockReturnValue([]);
});

describe('POST /api/import', () => {
	it('rejects an import without titles', async () => {
		parseImportCsv.mockReturnValue([]);
		const response = await POST(event());
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'No movie titles found. Use one movie per line.' });
	});

	it('rejects imports larger than the hard limit before querying TMDB', async () => {
		parseImportCsv.mockReturnValue(
			Array.from({ length: 201 }, (_, index) => ({ title: `Film ${index}`, year: null }))
		);
		const response = await POST(event());
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Please import at most 200 movies at a time.' });
		expect(searchMovies).not.toHaveBeenCalled();
	});

	it('imports enriched and manual films while skipping repeated and known entries', async () => {
		parseImportCsv.mockReturnValue([
			{ title: 'Arrival', year: 2016 },
			{ title: 'Arrival', year: 2016 },
			{ title: 'Already there', year: null },
			{ title: 'Hand made', year: 2020 },
			{ title: 'Lookup failure', year: null }
		]);
		findDuplicates.mockImplementation((_db, _tmdbId, title) =>
			title === 'Already there' ? [{ id: 7 }] : []
		);
		searchMovies.mockImplementation(async (_config, title) => {
			if (title === 'Arrival') return [{ title: 'Arrival', year: 2016, tmdbId: 329865 }];
			if (title === 'Lookup failure') throw new Error('offline');
			return [];
		});
		fetchDetails.mockResolvedValue({
			title: 'Arrival',
			year: 2016,
			tmdbId: 329865,
			imdbId: 'tt2543164',
			overview: 'Aliens',
			runtime: 116,
			genres: 'Drama',
			certification: 'FSK 12',
			originalLanguage: 'en',
			imdbRating: 7.9,
			tmdbRating: 7.6,
			posterFile: 'arrival.jpg',
			trailerYoutubeId: 'trailer'
		});

		const response = await POST(event());
		expect(await response.json()).toEqual({ ok: true, created: 3, enriched: 1, manual: 2, skipped: 2 });
		expect(db.prepare('SELECT title, tmdb_id, proposed_by FROM movies ORDER BY id').all()).toEqual([
			{ title: 'Arrival', tmdb_id: 329865, proposed_by: 'anna' },
			{ title: 'Hand made', tmdb_id: null, proposed_by: 'anna' },
			{ title: 'Lookup failure', tmdb_id: null, proposed_by: 'anna' }
		]);
		expect(warn).toHaveBeenCalledOnce();
		expect(info).toHaveBeenCalledWith('CSV import finished', {
			created: 3,
			enriched: 1,
			manual: 2,
			skipped: 2,
			actor: 'anna'
		});
	});
});
