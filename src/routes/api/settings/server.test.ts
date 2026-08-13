import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { translator } from '$lib/i18n/translate';

const { updateSettings, loadConfig, publicSettings, requireAdmin } = vi.hoisted(() => ({
	updateSettings: vi.fn(),
	loadConfig: vi.fn(),
	publicSettings: vi.fn(),
	requireAdmin: vi.fn()
}));

vi.mock('$lib/server/config-service', () => ({ updateSettings }));
vi.mock('$lib/server/config', () => ({ loadConfig }));
vi.mock('$lib/server/settings', () => ({ publicSettings, requireAdmin }));

import { GET, PUT } from './+server';

const responseSettings = { general: { title: { value: 'Movie Night' } } };

function event(body?: unknown, origins: Record<string, string> = {}): RequestEvent {
	return {
		request:
			body === undefined
				? new Request('http://localhost/api/settings', { method: 'PUT' })
				: new Request('http://localhost/api/settings', {
						method: 'PUT',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(body)
					}),
		locals: { config: { origins }, t: translator('en') }
	} as unknown as RequestEvent;
}

beforeEach(() => {
	updateSettings.mockReset();
	loadConfig.mockReset();
	publicSettings.mockReset();
	requireAdmin.mockReset();
	loadConfig.mockReturnValue({ title: 'Reloaded' });
	publicSettings.mockReturnValue(responseSettings);
});

describe('/api/settings', () => {
	it('returns the public settings to an administrator', async () => {
		const response = await GET(event());
		expect(await response.json()).toEqual(responseSettings);
		expect(requireAdmin).toHaveBeenCalledOnce();
		expect(publicSettings).toHaveBeenCalledWith(event().locals.config);
	});

	it.each([
		[{ title: ' ' }, 'Instance name must be between 1 and 80 characters.'],
		[{ title: 'x'.repeat(81) }, 'Instance name must be between 1 and 80 characters.'],
		[{ timezone: 'Mars/Olympus_Mons' }, 'Enter a valid timezone such as Europe/Zurich.'],
		[{ sessionTimeout: 299 }, 'Session timeout must be between 5 minutes and one year.'],
		[{ sessionTimeout: 31_536_001 }, 'Session timeout must be between 5 minutes and one year.'],
		[{ sessionTimeout: 600.5 }, 'Session timeout must be between 5 minutes and one year.']
	])('rejects invalid values: %j', async (body, error) => {
		const response = await PUT(event(body));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error });
		expect(updateSettings).not.toHaveBeenCalled();
	});

	it('trims and persists all editable settings before returning the reloaded values', async () => {
		const response = await PUT(
			event({ title: '  Friday films  ', timezone: ' Europe/Zurich ', sessionTimeout: 3600 })
		);
		expect(await response.json()).toEqual(responseSettings);
		expect(updateSettings).toHaveBeenCalledWith({
			title: 'Friday films',
			timezone: 'Europe/Zurich',
			sessionTimeout: 3600
		});
		expect(publicSettings).toHaveBeenCalledWith({ title: 'Reloaded' });
	});

	it('leaves environment-owned settings out of the write', async () => {
		const response = await PUT(
			event(
				{ title: 'Ignored', timezone: 'Europe/Zurich', sessionTimeout: 3600 },
				{ Title: 'PV_TITLE', Timezone: 'PV_TIMEZONE', 'Session timeout': 'PV_SESSION_TIMEOUT' }
			)
		);
		expect(await response.json()).toEqual(responseSettings);
		expect(updateSettings).toHaveBeenCalledWith({});
	});

	it('treats a malformed JSON body as an empty update', async () => {
		const malformed = {
			request: new Request('http://localhost/api/settings', { method: 'PUT', body: '{' }),
			locals: { config: { origins: {} }, t: translator('en') }
		} as unknown as RequestEvent;
		const response = await PUT(malformed);
		expect(await response.json()).toEqual(responseSettings);
		expect(updateSettings).toHaveBeenCalledWith({});
	});
});
