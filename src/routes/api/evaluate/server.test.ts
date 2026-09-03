import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { createDb, type DB } from '$lib/server/db';
import { ensureBalances, stake } from '$lib/server/game';
import { translator } from '$lib/i18n/translate';

vi.mock('$lib/server/log', () => ({ log: { error: vi.fn() }, writes: () => false }));

import { POST } from './+server';

const config = {
	members: [
		{ id: 'anna', name: 'Anna', color: '#e63946', emoji: '' },
		{ id: 'ben', name: 'Ben', color: '#457b9d', emoji: '' }
	],
	tokenStart: 0
};

let db: DB;

/**
 * The two ways this endpoint is called: with a body, the way the evaluation page
 * sends it now, and without one at all, the way `call()` sends a request that has
 * nothing to say.
 */
function event(body?: unknown): RequestEvent {
	return {
		url: new URL('/api/evaluate', 'http://localhost'),
		request: new Request(
			'http://localhost/api/evaluate',
			body === undefined
				? { method: 'POST' }
				: {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(body)
					}
		),
		locals: { db, personId: 'anna', config, locale: 'en', t: translator('en') }
	} as unknown as RequestEvent;
}

/** A request with a content type of our choosing, for the header cases. */
function raw(contentType: string, body: string): RequestEvent {
	return {
		url: new URL('/api/evaluate', 'http://localhost'),
		request: new Request('http://localhost/api/evaluate', {
			method: 'POST',
			headers: { 'content-type': contentType },
			body
		}),
		locals: { db, personId: 'anna', config, locale: 'en', t: translator('en') }
	} as unknown as RequestEvent;
}

function addMovie(title: string, proposedBy: string): number {
	const result = db
		.prepare("INSERT INTO movies (status, title, proposed_by, created_at) VALUES ('list', ?, ?, ?)")
		.run(title, proposedBy, new Date().toISOString());
	return Number(result.lastInsertRowid);
}

beforeEach(() => {
	db = createDb(':memory:');
	ensureBalances(db, { ...config, tokenStart: 3 } as never);
});

describe('/api/evaluate', () => {
	it('works without a body at all and reads that as "everybody is here"', async () => {
		const a = addMovie('A', 'anna');
		stake(db, config as never, 'anna', a, 1);

		const response = await POST(event());
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.winner.id).toBe(a);
		expect(body.absent).toEqual([]);
		expect(body.blocked).toEqual([]);
	});

	it('counts the night for whoever is named as present', async () => {
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config as never, 'anna', a, 1);
		stake(db, config as never, 'ben', b, 1);
		stake(db, config as never, 'ben', b, 1);

		const response = await POST(event({ absent: ['ben'] }));
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.winner.id).toBe(a);
		expect(body.absent).toEqual(['ben']);
		expect(body.blocked).toEqual([{ movieId: b, title: 'B', byPersonIds: ['ben'] }]);
	});

	it('refuses anything that is not a list of ids', async () => {
		const a = addMovie('A', 'anna');
		stake(db, config as never, 'anna', a, 1);

		for (const absent of ['ben', [7], {}]) {
			const response = await POST(event({ absent }));
			expect(response.status, `absent: ${JSON.stringify(absent)}`).toBe(400);
			await expect(response.json()).resolves.toEqual({ error: 'The request is invalid.' });
		}
	});

	// A body the endpoint cannot read must not quietly become "everybody is here":
	// that would count the votes of the very people the caller declared absent.
	it('refuses a body it cannot read instead of assuming a full night', async () => {
		const a = addMovie('A', 'anna');
		stake(db, config as never, 'anna', a, 1);

		const response = await POST(raw('text/plain', JSON.stringify({ absent: ['ben'] })));
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: 'The request is invalid.' });
	});

	it('reads the content type whatever its casing', async () => {
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config as never, 'anna', a, 1);
		stake(db, config as never, 'ben', b, 1);

		const response = await POST(raw('Application/JSON', JSON.stringify({ absent: ['ben'] })));
		expect(response.status).toBe(200);
		expect((await response.json()).absent).toEqual(['ben']);
	});

	it('answers a blocked night with the name of whoever it waits for', async () => {
		const b = addMovie('B', 'ben');
		stake(db, config as never, 'ben', b, 1);

		const response = await POST(event({ absent: ['ben'] }));
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toContain('Ben');
	});
});
