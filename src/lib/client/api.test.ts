import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Translate } from '$lib/i18n/translate';

const navigation = vi.hoisted(() => ({
	invalidateAll: vi.fn()
}));

vi.mock('$app/navigation', () => navigation);

import { call, errorText, redirectIfUnauthorized } from './api';

const t: Translate = (key, params) => {
	if (key === 'error.reference') return `Reference ${params?.reference}`;
	return `translated:${key}`;
};

beforeEach(() => {
	navigation.invalidateAll.mockReset();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('errorText()', () => {
	it('prefers a server sentence and appends its reference', () => {
		expect(errorText({ ok: false, error: 'Could not save.', reference: '12ab34cd' }, t)).toBe(
			'Could not save. Reference 12ab34cd'
		);
	});

	it('translates a local error key', () => {
		expect(errorText({ ok: false, errorKey: 'error.offline' }, t)).toBe('translated:error.offline');
	});
});

describe('redirectIfUnauthorized()', () => {
	it('redirects only a 401 response to the PIN page', () => {
		const assign = vi.fn();
		vi.stubGlobal('window', { location: { assign } });

		expect(redirectIfUnauthorized(new Response(null, { status: 401 }))).toBe(true);
		expect(assign).toHaveBeenCalledWith('/pin');

		assign.mockClear();
		expect(redirectIfUnauthorized(new Response(null, { status: 403 }))).toBe(false);
		expect(assign).not.toHaveBeenCalled();
	});
});

describe('call()', () => {
	it('sends JSON, returns the answer and refreshes page data', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ value: 42 }), { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(call<{ value: number }>('/api/example', { body: { title: 'Arrival' } })).resolves.toEqual({
			ok: true,
			data: { value: 42 }
		});
		expect(fetchMock).toHaveBeenCalledWith('/api/example', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title: 'Arrival' })
		});
		expect(navigation.invalidateAll).toHaveBeenCalledOnce();
	});

	it('supports read requests without refreshing page data', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
		vi.stubGlobal('fetch', fetchMock);

		await expect(call('/api/tv', { method: 'GET', refresh: false })).resolves.toEqual({
			ok: true,
			data: {}
		});
		expect(fetchMock).toHaveBeenCalledWith('/api/tv', {
			method: 'GET',
			headers: undefined,
			body: undefined
		});
		expect(navigation.invalidateAll).not.toHaveBeenCalled();
	});

	it('redirects an expired session before reading the response body', async () => {
		const assign = vi.fn();
		vi.stubGlobal('window', { location: { assign } });
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

		await expect(call('/api/stake')).resolves.toEqual({ ok: false, errorKey: 'auth.required' });
		expect(assign).toHaveBeenCalledWith('/pin');
		expect(navigation.invalidateAll).not.toHaveBeenCalled();
	});

	it('preserves a useful server error and its diagnostic fields', async () => {
		vi.stubGlobal(
			'fetch',
			vi
				.fn()
				.mockResolvedValue(
					new Response(
						JSON.stringify({ error: 'Movie not found.', reference: '89abcdef', keyProblem: true }),
						{ status: 404 }
					)
				)
		);

		await expect(call('/api/movies/999')).resolves.toEqual({
			ok: false,
			error: 'Movie not found.',
			reference: '89abcdef',
			keyProblem: true
		});
		expect(navigation.invalidateAll).not.toHaveBeenCalled();
	});

	it('uses a safe generic error for a broken non-JSON answer', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })));

		await expect(call('/api/movies')).resolves.toEqual({
			ok: false,
			errorKey: 'error.unexpected',
			reference: undefined
		});
	});

	it('reports a network failure as offline', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection refused')));

		await expect(call('/api/movies')).resolves.toEqual({ ok: false, errorKey: 'error.offline' });
		expect(navigation.invalidateAll).not.toHaveBeenCalled();
	});
});
