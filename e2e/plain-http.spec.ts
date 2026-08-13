import { test, expect, chromium, type Browser, type Page } from '@playwright/test';

// Signing in over plain HTTP from something that is not loopback, a LAN address
// or an mDNS name, which is how a self-hosted instance without a certificate is
// reached.
//
// This needs its own file and its own browser, because it turns on the *origin*
// rather than on anything the app renders. `localhost` and `127.0.0.1` count as
// trustworthy origins by definition, so a `Secure` cookie is stored there even
// over HTTP, and the rest of the suite, which runs on `localhost:4173`, cannot
// see this defect at all. Chromium resolves `popcorn.local` to the loopback
// address itself, so the request on the wire is identical to the one the other
// tests make; only the origin's trustworthiness differs.
//
// What it caught: with no HTTPS proof configured, adapter-node assumes `https`
// for every request, SvelteKit therefore defaults every cookie to `Secure`, and
// the browser drops it. The PIN is accepted, the answer is a 200, and the next
// navigation lands back on `/pin`, with nothing said anywhere.

const HOST = 'popcorn.local';
const BASE = `http://${HOST}:4173`;

// Chromium only, and not by preference: the whole trick is
// `--host-resolver-rules`, which is a Chromium flag with no WebKit counterpart.
// The alternative would be an entry in the machine's hosts file, which a test
// has no business writing. In the WebKit run of the matrix this file therefore
// has nothing to do, and would otherwise launch a second Chromium that the CI
// job for that engine does not even install.
//
// The behaviour under test is the browser's, not the app's, and it is the same
// rule in both engines: a cookie marked `Secure` is refused from an origin that
// is not trustworthy. WebKit is in fact the stricter of the two, it was a
// WebKit run that first surfaced this defect, through localhost, where Chromium
// silently accepted the cookie.
test.skip(
	({ browserName }) => browserName !== 'chromium',
	'needs --host-resolver-rules, which only Chromium has'
);

let browser: Browser;
let page: Page;

test.beforeAll(async () => {
	browser = await chromium.launch({
		args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`, '--disable-software-rasterizer'],
		...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {})
	});
});

test.afterAll(async () => {
	await browser?.close();
});

test.beforeEach(async () => {
	page = await browser.newPage();
});

test.afterEach(async () => {
	await page?.close();
});

test('signs in over plain HTTP on a non-loopback origin', async () => {
	await page.goto(`${BASE}/`);
	await expect(page).toHaveURL(/\/pin$/);
	await page.getByLabel('PIN').fill('2611');

	// The whole point: the app has to stay on `/`. Before the fix the cookie was
	// dropped and this went back to `/pin`.
	await page.waitForURL((url) => url.pathname === '/');
	const cookies = await page.context().cookies();
	expect(cookies.map((c) => c.name)).toContain('pv_auth');
	expect(cookies.find((c) => c.name === 'pv_auth')?.secure).toBe(false);

	// It has to survive a reload as well, a cookie the browser accepted but did
	// not keep would still leave the family locked out on the next visit.
	await page.goto(`${BASE}/`);
	await expect(page).toHaveURL(new RegExp(`${HOST}:4173/$`));
});

// All five cookie call sites share one helper, and the sign-in alone would only
// prove one of them. Choosing a person writes `pv_person`, the language switch
// writes and deletes `pv_lang`.
test('keeps the person and the language over plain HTTP', async () => {
	await page.goto(`${BASE}/`);
	await page.getByLabel('PIN').fill('2611');
	await page.waitForURL((url) => url.pathname === '/');

	await page.getByRole('button', { name: /Anna/ }).first().click();
	await expect(page.locator('header .who')).toContainText('Anna');
	await page.reload();
	await expect(page.locator('header .who')).toContainText('Anna');

	const named = async (name: string) => (await page.context().cookies()).find((c) => c.name === name);
	expect((await named('pv_person'))?.value).toBe('anna');

	// Switching the language writes `pv_lang`; the empty option ("follow the
	// instance") deletes it. The delete is the case that hides: SvelteKit
	// implements it as a set with `maxAge: 0` over its own defaults, so without
	// the shared options it would carry `Secure` and the device could not clear
	// its own override.
	await page.goto(`${BASE}/more`);
	const languages = page.locator('.langswitch select');
	await languages.selectOption('de');
	await expect.poll(async () => (await named('pv_lang'))?.value).toBe('de');
	await languages.selectOption('');
	await expect.poll(async () => (await named('pv_lang'))?.value).toBeUndefined();
});
