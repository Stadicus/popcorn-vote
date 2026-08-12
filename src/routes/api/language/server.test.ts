import { describe, it, expect, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { LANG_COOKIE } from '$lib/i18n/locales';
import { translator } from '$lib/i18n/translate';
import { POST } from './+server';

// This endpoint is reachable without a PIN (OPEN_PATHS in hooks.server.ts) and
// therefore takes whatever anyone sends. It must not answer any input with a
// server error — the file is deliberately not called "+server.test.ts", because
// SvelteKit rejects any unknown file with a leading + in the route tree.

/** A minimal event with a cookie store the test can read back. */
function eventFor(rawBody: string) {
	const cookies = {
		set: vi.fn(),
		delete: vi.fn()
	};
	const event = {
		request: new Request('http://localhost/api/language', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: rawBody
		}),
		cookies,
		// `httpsProof` is the only setting this endpoint reads, through
		// `deviceCookie`: it decides whether the cookie carries `Secure`.
		locals: { t: translator('en'), config: { httpsProof: { mode: 'none' } } }
	} as unknown as RequestEvent;
	return { event, cookies };
}

async function answer(rawBody: string) {
	const { event, cookies } = eventFor(rawBody);
	const res = await POST(event);
	return { status: res.status, body: await res.json(), cookies };
}

describe('POST /api/language', () => {
	it('sets the language', async () => {
		const { status, cookies } = await answer('{"language":"de"}');
		expect(status).toBe(200);
		expect(cookies.set).toHaveBeenCalledWith(LANG_COOKIE, 'de', expect.objectContaining({ path: '/' }));
	});

	it('takes spelling and whitespace the way the configuration does', async () => {
		const { status, cookies } = await answer('{"language":" PT-br "}');
		expect(status).toBe(200);
		expect(cookies.set).toHaveBeenCalledWith(LANG_COOKIE, 'pt-BR', expect.anything());
	});

	it('hands the device back to the instance with null', async () => {
		const { status, cookies } = await answer('{"language":null}');
		expect(status).toBe(200);
		// The delete carries the same options as the set, `secure` among them:
		// SvelteKit deletes by setting with `maxAge: 0` over its own defaults, so
		// leaving them out would put a `Secure` flag on the deletion that a device
		// on plain HTTP cannot store — and the override would be unclearable.
		expect(cookies.delete).toHaveBeenCalledWith(
			LANG_COOKIE,
			expect.objectContaining({ path: '/', secure: false })
		);
		expect(cookies.set).not.toHaveBeenCalled();
	});

	it('rejects an unknown language', async () => {
		const { status, body, cookies } = await answer('{"language":"nl"}');
		expect(status).toBe(400);
		expect(body.error).toBeTruthy();
		expect(cookies.set).not.toHaveBeenCalled();
	});

	// Valid JSON that is still not an object. Without the check, unpacking would
	// crash and the open endpoint would answer 500.
	it.each(['null', '"de"', '42', '[ "de" ]', '', 'not json'])(
		'answers body %j with 400 rather than with a server error',
		async (koerper) => {
			const { status, cookies } = await answer(koerper);
			expect(status).toBe(400);
			expect(cookies.set).not.toHaveBeenCalled();
			expect(cookies.delete).not.toHaveBeenCalled();
		}
	);
});
