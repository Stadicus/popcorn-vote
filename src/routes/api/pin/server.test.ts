import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import type { AppConfig } from '$lib/server/config';
import { hashPin } from '$lib/server/auth';
import { createDb } from '$lib/server/db';
import { translator } from '$lib/i18n/translate';
import { POST } from './+server';

describe('POST /api/pin recovery login', () => {
	it('accepts legacy PV_PIN with a blank account name while named users exist', async () => {
		const cookies = { set: vi.fn() };
		const config = {
			pin: '2611',
			users: [{ id: 'anna', name: 'Anna', role: 'admin', enabled: true, pinHash: hashPin('1234') }],
			sessionTimeout: 3600,
			httpsProof: { mode: 'none' }
		} as unknown as AppConfig;
		const event = {
			request: new Request('http://localhost/api/pin', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ userId: '', pin: '2611' })
			}),
			cookies,
			getClientAddress: () => '192.0.2.10',
			locals: { config, db: createDb(':memory:'), t: translator('en') }
		} as unknown as RequestEvent;

		const response = await POST(event);
		expect(response.status).toBe(200);
		expect(cookies.set).toHaveBeenCalledWith(
			'pv_auth',
			expect.stringMatching(/^legacy\./),
			expect.anything()
		);
	});
});
