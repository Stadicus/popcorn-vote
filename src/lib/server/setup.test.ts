import { beforeEach, describe, expect, it } from 'vitest';
import { createDb, metaSet, type DB } from './db';
import { authenticationMissing, pristineForSetup } from './setup';
import type { AppConfig } from './config';

let db: DB;

beforeEach(() => {
	db = createDb(':memory:');
});

describe('first-run setup gate', () => {
	it('opens only with no configured authentication and a pristine database', () => {
		expect(authenticationMissing({ users: [], pin: '' } as unknown as AppConfig)).toBe(true);
		expect(authenticationMissing({ users: [], pin: '2611' } as unknown as AppConfig)).toBe(false);
		expect(pristineForSetup(db)).toBe(true);
	});

	it('stays closed after authentication was ever initialized', () => {
		metaSet(db, 'auth_secret', 'existing');
		expect(pristineForSetup(db)).toBe(false);
	});

	it('stays closed when existing movie data would otherwise be exposed', () => {
		db.prepare(
			"INSERT INTO movies (title, proposed_by, created_at) VALUES ('Existing', 'anna', '2026-08-12T00:00:00Z')"
		).run();
		expect(pristineForSetup(db)).toBe(false);
	});
});
