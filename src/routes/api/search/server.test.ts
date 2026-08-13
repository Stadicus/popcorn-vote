import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { translator } from '$lib/i18n/translate';

const { searchMovies, keyProblem, error } = vi.hoisted(() => ({
	searchMovies: vi.fn(),
	keyProblem: vi.fn(),
	error: vi.fn()
}));

vi.mock('$lib/server/tmdb', () => ({ searchMovies }));
vi.mock('$lib/server/keys', () => ({ keyProblem }));
vi.mock('$lib/server/log', () => ({ log: { error } }));

import { GET } from './+server';

function event(query: string): RequestEvent {
	return {
		url: new URL(`/api/search?q=${encodeURIComponent(query)}`, 'http://localhost'),
		locals: { config: {}, t: translator('en') }
	} as unknown as RequestEvent;
}

beforeEach(() => {
	searchMovies.mockReset();
	keyProblem.mockReset();
	error.mockReset();
});

describe('GET /api/search', () => {
	it('does not query TMDB for a one-character search', async () => {
		expect(await (await GET(event('a'))).json()).toEqual({ results: [] });
		expect(searchMovies).not.toHaveBeenCalled();
	});

	it('returns TMDB search results', async () => {
		searchMovies.mockResolvedValue([{ tmdbId: 603, title: 'The Matrix', year: 1999 }]);
		expect(await (await GET(event(' matrix '))).json()).toEqual({
			results: [{ tmdbId: 603, title: 'The Matrix', year: 1999 }]
		});
		expect(searchMovies).toHaveBeenCalledWith({}, 'matrix');
	});

	it('explains key failures without exposing a provider error', async () => {
		searchMovies.mockRejectedValue(new Error('403'));
		keyProblem.mockReturnValue('keys.tmdbMissing');
		const response = await GET(event('matrix'));
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			error: 'Movie search is unavailable. No TMDB key is configured.',
			keyProblem: true
		});
		expect(error).not.toHaveBeenCalled();
	});

	it('logs a provider failure and returns the generic notice', async () => {
		searchMovies.mockRejectedValue(new Error('offline'));
		const response = await GET(event('matrix'));
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({
			error: 'The movie database is unavailable. Add the movie manually.'
		});
		expect(error).toHaveBeenCalledOnce();
	});
});
