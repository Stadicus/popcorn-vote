import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Arabic labels come from the catalogue rather than being repeated here: the
// translation is still being reviewed, and a reworded label should not turn this
// test red.
const arabic = JSON.parse(readFileSync(new URL('../messages/ar.json', import.meta.url), 'utf8')) as Record<
	string,
	string
>;

/**
 * Fills the wizard in English, switches it to Arabic and returns what the form
 * would send. The request is answered here and never reaches the server, so the
 * installation stays unconfigured for the real first run below.
 */
async function arabicSetupRequest(page: Page, beforeSwitch?: () => Promise<void>) {
	await page.goto('/setup');
	await page.getByLabel('Family member name').fill('Anna');
	await page.getByLabel('Shared family PIN').fill('2611');
	await page.getByLabel('Confirm PIN').fill('2611');
	await page.getByLabel('TMDB API key').fill('e2e-tmdb-key');
	await beforeSwitch?.();

	await page.locator('.site-head .language select').selectOption('ar');
	await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

	let sent: Record<string, unknown> | undefined;
	await page.route('**/api/setup', async (route) => {
		sent = route.request().postDataJSON();
		await route.fulfill({ status: 400, json: { error: 'intercepted' } });
	});
	await page.getByRole('button', { name: arabic['setup.complete'] }).click();
	await expect.poll(() => sent).toBeDefined();
	return sent!;
}

// The wizard follows a language switch with its film defaults: Arabic asks TMDB
// for Arabic, falls back to English and puts Arabic trailers first.
test('switching the wizard to Arabic carries the Arabic film defaults', async ({ page }) => {
	const sent = await arabicSetupRequest(page);
	expect(sent).toMatchObject({
		interfaceLanguage: 'ar',
		movieLanguage: 'ar-SA',
		movieFallbackLanguage: 'en-US',
		certificationCountry: 'US',
		trailerLanguages: ['ar', 'en', 'original']
	});
});

test('a film setting changed by hand survives the language switch', async ({ page }) => {
	const sent = await arabicSetupRequest(page, async () => {
		await page.getByLabel('Age-rating country').selectOption('GB');
		await page.getByLabel('Trailer languages').fill('original');
	});
	expect(sent).toMatchObject({
		movieLanguage: 'ar-SA',
		certificationCountry: 'GB',
		trailerLanguages: ['original']
	});
});

test('first run configures the family without accounts', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/setup$/);
	await expect(page.getByRole('heading', { name: 'Everyone’s invited.' })).toBeVisible();

	const language = page.locator('.site-head .language select');
	await expect(language).toHaveValue('en');
	await expect(language.locator('option', { hasText: 'App default' })).toHaveCount(0);

	await page.getByLabel('Family member name').fill('Anna');
	for (const member of ['Ben', 'Carla', 'David']) {
		await page.getByRole('button', { name: /Add family member/ }).click();
		await page.getByLabel('Family member name').last().fill(member);
	}
	await page.getByLabel('Shared family PIN').fill('2611');
	await page.getByLabel('Confirm PIN').fill('2611');
	await page.getByLabel('TMDB API key').fill('e2e-tmdb-key');
	await page.getByRole('button', { name: /Start movie night/ }).click();
	await page.waitForURL((url) => url.pathname === '/');
	await page.getByRole('dialog').getByRole('button', { name: /Anna/ }).click();
	await expect(page.locator('header .who')).toContainText('Anna');

	await page.goto('/settings');
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
	await expect(page.getByRole('button', { name: /Security/ })).toBeVisible();
	await expect(page.getByRole('button', { name: /Users/ })).toHaveCount(0);
});
