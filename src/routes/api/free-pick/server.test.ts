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

function event(body: unknown): RequestEvent {
	return {
		url: new URL('/api/free-pick', 'http://localhost'),
		request: new Request('http://localhost/api/free-pick', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
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

describe('/api/free-pick', () => {
	it('answers with the winner, who was away and what waited', async () => {
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config as never, 'ben', b, 1);

		const response = await POST(event({ movieId: a, absent: ['ben'] }));
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.winner.id).toBe(a);
		expect(body.winner.absent).toEqual(['ben']);
		expect(body.absent).toEqual(['ben']);
		expect(body.blocked).toEqual([{ movieId: b, title: 'B', byPersonIds: ['ben'] }]);
	});

	it('still works without naming anybody', async () => {
		const a = addMovie('A', 'anna');
		const response = await POST(event({ movieId: a }));
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.winner.absent).toBeNull();
		expect(body.absent).toEqual([]);
	});

	it('refuses a movie the absent voted for, naming them', async () => {
		const b = addMovie('B', 'ben');
		stake(db, config as never, 'ben', b, 1);

		const response = await POST(event({ movieId: b, absent: ['ben'] }));
		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('Ben');
	});

	it('refuses anything that is not a list of ids', async () => {
		const a = addMovie('A', 'anna');
		const response = await POST(event({ movieId: a, absent: 'ben' }));
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: 'The request is invalid.' });
	});
});
