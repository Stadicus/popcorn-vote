import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import type { AppConfig } from '$lib/server/config';
import { loadConfig } from '$lib/server/config';
import { saveInitialSetup } from '$lib/server/config-service';
import { createDb, metaSet } from '$lib/server/db';
import { ensureBalances } from '$lib/server/game';
import { translator } from '$lib/i18n/translate';
import { POST } from './+server';

vi.mock('$lib/server/config', () => ({ loadConfig: vi.fn() }));
vi.mock('$lib/server/config-service', () => ({ saveInitialSetup: vi.fn() }));
vi.mock('$lib/server/game', () => ({ ensureBalances: vi.fn() }));
vi.mock('$lib/server/demo', () => ({ seedDemoMovies: vi.fn(() => Promise.resolve()) }));
vi.mock('$lib/server/auth', () => ({ AUTH_COOKIE: 'pv_auth', cookieValue: vi.fn(() => 'auth-cookie') }));
vi.mock('$lib/server/cookies', () => ({ authCookie: vi.fn(() => ({ path: '/' })) }));

const currentConfig = {
	pin: '',
	users: [],
	tmdbKeyState: 'missing',
	omdbKeyState: 'missing',
	origins: { 'TMDB key': 'missing', 'OMDb key': 'missing' }
} as unknown as AppConfig;

const validBody = {
	title: 'Friday films',
	members: ['Anna', 'Ben'],
	pin: '2611',
	confirmPin: '2611',
	tokenAmount: 1,
	tokenWeekday: 0,
	tokenHour: 8,
	tokenCap: 5,
	tokenStart: 3,
	timezone: 'Europe/Zurich',
	sources: ['Cinema', 'Home'],
	tmdbApiKey: 'tmdb-test-key',
	omdbApiKey: '',
	interfaceLanguage: 'en',
	movieLanguage: 'latin',
	movieFallbackLanguage: 'en-US',
	certificationCountry: 'US',
	trailerLanguages: ['original', 'en']
};

function event(
	body: unknown,
	config: Pick<AppConfig, 'pin' | 'users'> = { pin: '', users: [] },
	initialized = false
): RequestEvent {
	const db = createDb(':memory:');
	if (initialized) metaSet(db, 'auth_secret', 'existing');
	return {
		request: new Request('http://localhost/api/setup', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		cookies: { set: vi.fn() },
		locals: { config, db, t: translator('en') }
	} as unknown as RequestEvent;
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(loadConfig).mockReturnValue(currentConfig);
});

describe('POST /api/setup', () => {
	it('returns 409 without reparsing after setup is complete', async () => {
		const response = await POST(event({}, { pin: '2611', users: [] }));
		expect(response.status).toBe(409);
		expect(loadConfig).not.toHaveBeenCalled();
	});

	it('returns 503 for an existing data store with missing authentication', async () => {
		const response = await POST(event({}, { pin: '', users: [] }, true));
		expect(response.status).toBe(503);
	});

	it.each([
		['a four-digit PIN', { pin: '12', confirmPin: '12' }, 400],
		['matching PINs', { confirmPin: '9999' }, 400],
		['an instance title', { title: '' }, 400],
		['at least one member', { members: [] }, 400],
		['distinct member names', { members: ['Anna', ' anna '] }, 400],
		['at least one source', { sources: [' '] }, 400],
		['a TMDB key', { tmdbApiKey: '' }, 400],
		['a non-placeholder TMDB key', { tmdbApiKey: 'YOUR-TMDB-KEY' }, 400],
		['known language defaults', { interfaceLanguage: 'xx' }, 400],
		['valid voting rules', { tokenCap: 0 }, 400],
		['a valid timezone', { timezone: 'Mars/Olympus' }, 400]
	])('requires %s', async (_label, change, status) => {
		const response = await POST(event({ ...validBody, ...change }));
		expect(response.status).toBe(status);
		expect(saveInitialSetup).not.toHaveBeenCalled();
	});

	it('persists the complete setup, initializes balances and signs the family in', async () => {
		const requestEvent = event(validBody);
		const response = await POST(requestEvent);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
		expect(saveInitialSetup).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'Friday films',
				members: ['Anna', 'Ben'],
				tmdbApiKey: 'tmdb-test-key',
				omdbApiKey: undefined,
				interfaceLanguage: 'en'
			})
		);
		expect(ensureBalances).toHaveBeenCalledWith(requestEvent.locals.db, currentConfig);
		expect(requestEvent.cookies.set).toHaveBeenCalledWith('pv_auth', 'auth-cookie', { path: '/' });
	});
});
