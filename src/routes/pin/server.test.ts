import { beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '$lib/server/config';
import { createDb, type DB } from '$lib/server/db';
import { load } from './+page.server';

let db: DB;

beforeEach(() => {
	db = createDb(':memory:');
});

async function pageData(demoData: boolean, pin = '2611') {
	return load({
		getClientAddress: () => '192.0.2.1',
		locals: {
			db,
			config: { demoData, pin } as AppConfig
		}
	} as never);
}

describe('PIN page data', () => {
	it('exposes the configured PIN as a hint in demo mode', async () => {
		await expect(pageData(true)).resolves.toMatchObject({
			pinConfigured: true,
			demoPin: '2611',
			waitSeconds: 0
		});
	});

	it('never exposes the PIN outside demo mode', async () => {
		await expect(pageData(false)).resolves.toMatchObject({
			pinConfigured: true,
			demoPin: null
		});
	});

	it('does not invent a demo hint when no PIN is configured', async () => {
		await expect(pageData(true, '')).resolves.toMatchObject({
			pinConfigured: false,
			demoPin: null
		});
	});
});
