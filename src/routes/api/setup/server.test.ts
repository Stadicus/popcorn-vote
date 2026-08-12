import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import type { AppConfig } from '$lib/server/config';
import { createDb, metaSet } from '$lib/server/db';
import { translator } from '$lib/i18n/translate';
import { POST } from './+server';

function event(config: Pick<AppConfig, 'pin' | 'users'>, initialized = false): RequestEvent {
	const db = createDb(':memory:');
	if (initialized) metaSet(db, 'auth_secret', 'existing');
	return {
		request: new Request('http://localhost/api/setup', { method: 'POST', body: '{}' }),
		cookies: { set: vi.fn() },
		locals: { config, db, t: translator('en') }
	} as unknown as RequestEvent;
}

describe('POST /api/setup gate', () => {
	it('returns 409 without reparsing after setup is complete', async () => {
		const response = await POST(event({ pin: '2611', users: [] }));
		expect(response.status).toBe(409);
	});

	it('returns 503 for an existing data store with missing authentication', async () => {
		const response = await POST(event({ pin: '', users: [] }, true));
		expect(response.status).toBe(503);
	});
});
