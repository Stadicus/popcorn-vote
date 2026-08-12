import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb, metaSet } from '../src/lib/server/db';

test.skip(({ browserName }) => browserName !== 'chromium', 'one server-level check is enough');

const PORT = 43174;
const BASE_URL = `http://localhost:${PORT}`;

test('existing data without authentication is locked instead of entering setup', async ({ request }) => {
	const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'popcorn-vote-lockdown-'));
	const db = createDb(path.join(dataDir, 'popcornvote.sqlite'));
	metaSet(db, 'auth_secret', 'existing-installation');
	db.prepare(
		"INSERT INTO movies (title, proposed_by, created_at) VALUES ('Existing', 'anna', '2026-08-12T00:00:00Z')"
	).run();
	db.close();

	let server: ChildProcess | undefined;
	try {
		server = spawn(process.execPath, ['build/index.js'], {
			cwd: process.cwd(),
			env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), PV_PIN: '', PV_CONFIG: '' },
			stdio: 'ignore'
		});
		await expect
			.poll(async () => {
				try {
					return (await request.get(`${BASE_URL}/healthz`)).status();
				} catch {
					return 0;
				}
			})
			.toBe(200);

		const setup = await request.post(`${BASE_URL}/api/setup`, { data: {} });
		expect(setup.status()).toBe(503);
		expect(await setup.json()).toMatchObject({
			error: 'Authentication is not configured and setup is locked.'
		});
		const page = await request.get(`${BASE_URL}/`, { maxRedirects: 0 });
		expect(page.status()).toBe(503);
	} finally {
		server?.kill('SIGTERM');
		fs.rmSync(dataDir, { recursive: true, force: true });
	}
});
