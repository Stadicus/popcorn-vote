import { beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '$lib/server/config';
import { createDb, type DB } from '$lib/server/db';
import { setTonightAbsent } from '$lib/server/tonight';
import { load } from './+page.server';

// Both entrances to the evening have to *read* the shared selection, not just
// write it. Without that the shared state is a one-way street to the
// television, and a second phone evaluates with nobody absent while the TV is
// dimming that very film.

let db: DB;

const config = { members: [{ id: 'anna' }, { id: 'ben' }] } as AppConfig;

beforeEach(() => {
	db = createDb(':memory:');
});

const pageData = () => load({ locals: { db, config } } as never);

describe('the evaluation page loader', () => {
	it('starts with nobody away when no evening is stored', async () => {
		await expect(pageData()).resolves.toMatchObject({ absent: [] });
	});

	it('hands the stored evening to the page', async () => {
		setTonightAbsent(db, ['ben']);
		await expect(pageData()).resolves.toMatchObject({ absent: ['ben'] });
	});
});
