import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { createDb, type DB } from '$lib/server/db';
import { ensureBalances, standings, stake } from '$lib/server/game';
import { setTonightAbsent } from '$lib/server/tonight';
import { translator } from '$lib/i18n/translate';

vi.mock('$lib/server/log', () => ({ log: { error: vi.fn() }, writes: () => false }));

import { GET } from './+server';

const config = {
	members: [
		{ id: 'anna', name: 'Anna', color: '#e63946', emoji: '' },
		{ id: 'ben', name: 'Ben', color: '#457b9d', emoji: '' }
	],
	tokenStart: 0
};

let db: DB;

function event(): RequestEvent {
	return {
		url: new URL('/api/tv', 'http://localhost'),
		request: new Request('http://localhost/api/tv'),
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

describe('/api/tv', () => {
	// With nobody named the television has to see exactly what it always saw.
	it('counts every vote when no evening is stored', async () => {
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config as never, 'anna', a, 1);
		stake(db, config as never, 'ben', b, 1);

		const body = await (await GET(event())).json();
		expect(body.absent).toEqual([]);
		expect(body.standings.map((s: { title: string; tokens: number }) => [s.title, s.tokens])).toEqual(
			standings(db).map((s) => [s.title, s.tokens])
		);
		expect(body.standings.every((s: { blockedBy: string[] }) => s.blockedBy.length === 0)).toBe(true);
	});

	it('counts for whoever is there once an evening is stored', async () => {
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config as never, 'anna', a, 1);
		stake(db, config as never, 'ben', b, 1);
		stake(db, config as never, 'ben', b, 1);
		setTonightAbsent(db, ['ben']);

		const body = await (await GET(event())).json();
		expect(body.absent).toEqual(['ben']);
		const rows = Object.fromEntries(
			body.standings.map((s: { title: string; tokens: number; blockedBy: string[] }) => [
				s.title,
				{ tokens: s.tokens, blockedBy: s.blockedBy }
			])
		);
		expect(rows.A).toEqual({ tokens: 1, blockedBy: [] });
		// B keeps its two votes on the list but none of them count tonight.
		expect(rows.B).toEqual({ tokens: 0, blockedBy: ['ben'] });
	});

	it('forgets an evening older than twelve hours', async () => {
		const b = addMovie('B', 'ben');
		stake(db, config as never, 'ben', b, 1);
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-02T20:00:00.000Z'));
		setTonightAbsent(db, ['ben']);
		vi.setSystemTime(new Date('2026-09-03T09:00:00.000Z'));

		const body = await (await GET(event())).json();
		vi.useRealTimers();
		expect(body.absent).toEqual([]);
		expect(body.standings[0].tokens).toBe(1);
	});
});
