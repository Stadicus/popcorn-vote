import { beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '$lib/server/config';
import { createDb, type DB } from '$lib/server/db';
import { setTonightAbsent } from '$lib/server/tonight';
import { load } from './+page.server';

// The film page carries the free-pick dialog, which is the evening's second
// entrance. If it did not read the shared selection it would happily offer a
// film that is waiting for somebody and record the night as a full one.

let db: DB;

const config = { members: [{ id: 'anna' }, { id: 'ben' }], sources: [] } as unknown as AppConfig;

function addMovie(): number {
	const result = db
		.prepare("INSERT INTO movies (status, title, proposed_by, created_at) VALUES ('list', ?, ?, ?)")
		.run('A', 'anna', new Date().toISOString());
	return Number(result.lastInsertRowid);
}

beforeEach(() => {
	db = createDb(':memory:');
});

const pageData = (id: number) =>
	load({ params: { id: String(id) }, locals: { db, config, t: (k: string) => k } } as never);

describe('the film page loader', () => {
	it('starts with nobody away when no evening is stored', async () => {
		await expect(pageData(addMovie())).resolves.toMatchObject({ absent: [] });
	});

	it('hands the stored evening to the free-pick dialog', async () => {
		const id = addMovie();
		setTonightAbsent(db, ['ben']);
		await expect(pageData(id)).resolves.toMatchObject({ absent: ['ben'] });
	});
});
