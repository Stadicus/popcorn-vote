import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { createDb, type DB } from '$lib/server/db';
import { translator } from '$lib/i18n/translate';

const { fetchDetails, keyProblem } = vi.hoisted(() => ({ fetchDetails: vi.fn(), keyProblem: vi.fn() }));

vi.mock('$lib/server/tmdb', () => ({ fetchDetails }));
vi.mock('$lib/server/keys', () => ({ keyProblem }));
vi.mock('$lib/server/log', () => ({ log: { error: vi.fn() } }));

import { GET, POST } from './+server';

let db: DB;

function event(path: string, body?: unknown): RequestEvent {
	return {
		url: new URL(path, 'http://localhost'),
		request: new Request(
			`http://localhost${path}`,
			body === undefined
				? {}
				: {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(body)
					}
		),
		locals: {
			db,
			personId: 'anna',
			config: {},
			t: translator('en')
		}
	} as unknown as RequestEvent;
}

beforeEach(() => {
	db = createDb(':memory:');
	fetchDetails.mockReset();
	keyProblem.mockReset();
});

describe('/api/movies', () => {
	it('returns duplicate hints without changing the list', async () => {
		db.prepare(
			"INSERT INTO movies (status, title, year, proposed_by, created_at) VALUES ('list', ?, ?, ?, ?)"
		).run('Arrival', 2016, 'anna', '2026-01-01T00:00:00.000Z');

		const response = await GET(event('/api/movies?title=Arrival&year=2016'));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ duplicates: [expect.objectContaining({ title: 'Arrival' })] });
	});

	it('adds a trimmed manual suggestion and assigns it to the selected person', async () => {
		const response = await POST(event('/api/movies', { title: '  Moon  ', year: 2009 }));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, movieId: 1 });
		expect(db.prepare('SELECT title, year, proposed_by, tmdb_id FROM movies').get()).toEqual({
			title: 'Moon',
			year: 2009,
			proposed_by: 'anna',
			tmdb_id: null
		});
	});

	it('adds a TMDB suggestion with the fetched details', async () => {
		fetchDetails.mockResolvedValue({
			title: 'Spirited Away',
			year: 2001,
			tmdbId: 129,
			imdbId: 'tt0245429',
			overview: 'A',
			runtime: 125,
			genres: 'Animation',
			certification: 'FSK 0',
			originalLanguage: 'ja',
			imdbRating: 8.6,
			tmdbRating: 8.5,
			posterFile: '129.jpg',
			trailerYoutubeId: 'trailer'
		});

		const response = await POST(event('/api/movies', { tmdbId: 129 }));
		expect(await response.json()).toEqual({ ok: true, movieId: 1 });
		expect(fetchDetails).toHaveBeenCalledWith({}, 129);
		expect(db.prepare('SELECT title, tmdb_id, imdb_id FROM movies').get()).toEqual({
			title: 'Spirited Away',
			tmdb_id: 129,
			imdb_id: 'tt0245429'
		});
	});

	it('turns a known TMDB-key failure into actionable feedback', async () => {
		fetchDetails.mockRejectedValue(new Error('forbidden'));
		keyProblem.mockReturnValue('keys.tmdbMissing');

		const response = await POST(event('/api/movies', { tmdbId: 129 }));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: 'No TMDB key is configured. Adding a movie by hand still works.',
			keyProblem: true
		});
	});
});
