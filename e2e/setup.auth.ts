import { test, expect } from '@playwright/test';

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
