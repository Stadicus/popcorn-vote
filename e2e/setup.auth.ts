import { test, expect } from '@playwright/test';

test('first run creates a named administrator and opens settings', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/setup$/);
	await expect(page.getByRole('heading', { name: 'The first seat is yours.' })).toBeVisible();

	await page.getByLabel('Display name').fill('E2E Admin');
	await page.getByLabel('PIN', { exact: true }).fill('2611');
	await page.getByLabel('Confirm PIN').fill('2611');
	await page.getByRole('button', { name: /Create account/ }).click();
	await page.waitForURL((url) => url.pathname === '/');
	await page.getByRole('dialog').getByRole('button', { name: /Anna/ }).click();
	await expect(page.locator('header .who')).toContainText('Anna');

	await page.goto('/settings');
	await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
	await page.getByRole('button', { name: /Users/ }).click();
	await expect(page.getByText('E2E Admin', { exact: true })).toBeVisible();
});
