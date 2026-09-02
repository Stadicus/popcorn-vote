import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { createDb, type DB } from '$lib/server/db';
import { ensureBalances, evaluate, stake } from '$lib/server/game';
import { setTonightAbsent, tonightAbsent } from '$lib/server/tonight';
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
		url: new URL('/api/tonight', 'http://localhost'),
		request: new Request('http://localhost/api/tonight', {
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

describe('/api/tonight', () => {
	it('records who is away and answers with the tidied list', async () => {
		const response = await POST(event({ absent: ['ben', 'ben'] }));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, absent: ['ben'] });
		expect(tonightAbsent(db, config.members)).toEqual(['ben']);
	});

	it('records everybody being here again', async () => {
		setTonightAbsent(db, ['ben']);
		const response = await POST(event({ absent: [] }));
		expect(await response.json()).toEqual({ ok: true, absent: [] });
		expect(tonightAbsent(db, config.members)).toEqual([]);
	});

	// The reason validAbsent() exists apart from requireAbsent(): a finger moving
	// across the chips passes through this state, and it has to be recordable.
	it('accepts an evening nobody would attend, which /api/evaluate refuses', async () => {
		const response = await POST(event({ absent: ['anna', 'ben'] }));
		expect(response.status).toBe(200);
		expect(tonightAbsent(db, config.members)).toEqual(['anna', 'ben']);
	});

	it('refuses an id that is nobody', async () => {
		const response = await POST(event({ absent: ['mia'] }));
		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('Unknown person');
		expect(tonightAbsent(db, config.members)).toEqual([]);
	});

	it('refuses anything that is not a list of ids', async () => {
		for (const absent of ['ben', [7], 5]) {
			const response = await POST(event({ absent }));
			expect(response.status, JSON.stringify(absent)).toBe(400);
			await expect(response.json()).resolves.toEqual({ error: 'The request is invalid.' });
		}
		expect(tonightAbsent(db, config.members)).toEqual([]);
	});

	// Between the reveal and "watched" the evening is settled. A phone that keeps
	// tapping must not move it, and must not be told off for trying either.
	it('does not write while a winner is on the table, and says so by answering with the stored evening', async () => {
		const a = addMovie('A', 'anna');
		stake(db, config as never, 'anna', a, 1);
		setTonightAbsent(db, ['ben']);
		evaluate(db, config as never, 'anna', undefined, ['ben']);

		const response = await POST(event({ absent: [] }));
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true, absent: ['ben'] });
		expect(tonightAbsent(db, config.members)).toEqual(['ben']);
	});
});
