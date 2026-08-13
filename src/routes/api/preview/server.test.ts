import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { translator } from '$lib/i18n/translate';

const { fetchPreview, keyProblem, error } = vi.hoisted(() => ({
	fetchPreview: vi.fn(),
	keyProblem: vi.fn(),
	error: vi.fn()
}));

vi.mock('$lib/server/tmdb', () => ({ fetchPreview }));
vi.mock('$lib/server/keys', () => ({ keyProblem }));
vi.mock('$lib/server/log', () => ({ log: { error } }));

import { GET } from './+server';

function event(tmdbId: string): RequestEvent {
	return {
		url: new URL(`/api/preview?tmdbId=${tmdbId}`, 'http://localhost'),
		locals: { config: {}, t: translator('en') }
	} as unknown as RequestEvent;
}

beforeEach(() => {
	fetchPreview.mockReset();
	keyProblem.mockReset();
	error.mockReset();
});

describe('GET /api/preview', () => {
	it('requires a TMDB id before making a request', async () => {
		const response = await GET(event(''));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Choose a movie.' });
		expect(fetchPreview).not.toHaveBeenCalled();
	});

	it('returns the preview from TMDB', async () => {
		fetchPreview.mockResolvedValue({ title: 'The Matrix' });
		expect(await (await GET(event('603'))).json()).toEqual({ preview: { title: 'The Matrix' } });
		expect(fetchPreview).toHaveBeenCalledWith({}, 603);
	});

	it('distinguishes key failures from a temporary provider outage', async () => {
		fetchPreview.mockRejectedValueOnce(new Error('403'));
		keyProblem.mockReturnValueOnce('keys.tmdbMissing');
		const keyResponse = await GET(event('603'));
		expect(keyResponse.status).toBe(503);
		expect(await keyResponse.json()).toEqual({
			error: 'Movie search is unavailable. No TMDB key is configured.',
			keyProblem: true
		});

		fetchPreview.mockRejectedValueOnce(new Error('offline'));
		const unavailable = await GET(event('603'));
		expect(unavailable.status).toBe(502);
		expect(await unavailable.json()).toEqual({ error: 'The movie database is unavailable right now.' });
		expect(error).toHaveBeenCalledOnce();
	});
});
