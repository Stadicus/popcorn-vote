import { test, expect, type Page } from '@playwright/test';

async function enterPin(page: Page) {
	await page.goto('/');
	await expect(page).toHaveURL(/\/pin$/);
	for (const digit of ['2', '6', '1', '1']) {
		await page.getByRole('button', { name: digit, exact: true }).click();
	}
	await page.waitForURL((url) => url.pathname === '/');
}

async function choosePerson(page: Page, name: string) {
	await page
		.getByRole('button', { name: new RegExp(name) })
		.first()
		.click();
	await expect(page.locator('header .who')).toContainText(name);
}

/** Add a movie by hand (the search would need a TMDB key). */
async function addMovieByHand(page: Page, title: string) {
	await page.goto('/propose');
	await page.getByRole('button', { name: /Add manually/ }).click();
	await page.getByPlaceholder('Title', { exact: true }).fill(title);
	await page.getByRole('button', { name: 'Add', exact: true }).click();
	await page.waitForURL(/\/movie\/\d+/);
}

/** Titles of the tiles in the order they appear in the DOM. */
function tileOrder(page: Page): Promise<string[]> {
	return page.locator('.tile .name').allInnerTexts();
}

test('a complete movie night: add, vote, evaluate, rate', async ({ page }) => {
	await enterPin(page);
	await choosePerson(page, 'Anna');

	await addMovieByHand(page, 'E2E-Test-Movie');
	await expect(page.getByRole('heading', { name: /E2E-Test-Movie/ })).toBeVisible();

	// Place a vote (starting balance 3) and see it again
	await page.getByRole('button', { name: /Add vote/ }).click();
	await expect(page.getByText('Anna: 1')).toBeVisible();

	// Evaluation with its confirmation modal
	await page.goto('/evaluation');
	await page.getByRole('button', { name: 'Reveal winner' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Reveal winner' }).click();
	await expect(page.getByRole('heading', { name: /Tonight's movie is/ })).toBeVisible();

	// While the winner is pending: no new evaluation is possible
	await expect(page.getByText(/Confirm or undo this result first/)).toBeVisible();

	await page.getByRole('button', { name: 'Mark as watched' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Mark as watched' }).click();
	await expect(page.getByRole('button', { name: 'Mark as watched' })).toHaveCount(0);
	await page.goto('/archive');
	await expect(page.locator('strong', { hasText: 'E2E-Test-Movie' })).toBeVisible();

	// Rating with half stars. The number is written in the notation of the active
	// language, so with a dot in English.
	await page.getByRole('button', { name: '4.5 stars' }).click();
	await expect(page.getByText('Average: 4.5')).toBeVisible();
});

test('the vote balance falls and rises when placing and taking back', async ({ page }) => {
	await enterPin(page);
	await choosePerson(page, 'Ben');

	await addMovieByHand(page, 'Second Movie');

	// 3 → 2 → 3 free votes in the header
	await expect(page.locator('header .tokens')).toContainText('3');
	await page.getByRole('button', { name: /Add vote/ }).click();
	await expect(page.locator('header .tokens')).toContainText('2');
	await page.getByRole('button', { name: /Remove vote/ }).click();
	await expect(page.locator('header .tokens')).toContainText('3');
});

test('the TV view shows the standings without the app frame', async ({ page, browserName }) => {
	await enterPin(page);
	await choosePerson(page, 'Carla');

	// This test adds both movies itself, otherwise the claim below would be
	// worthless as soon as somebody changed the order of the tests.
	await addMovieByHand(page, 'TV-Leftover'); // stays without votes
	await addMovieByHand(page, 'TV-Favourite');
	await page.getByRole('button', { name: /Add vote/ }).click();
	await expect(page.getByText('Carla: 1')).toBeVisible();

	await page.goto('/tv');
	await expect(page.getByText('Popcorn Vote', { exact: false }).first()).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Current standings' })).toBeVisible();
	await expect(page.getByText('TV-Favourite')).toBeVisible();
	// The movie without votes stays off the screen.
	await expect(page.getByText('TV-Leftover')).toHaveCount(0);
	// no app menu on the TV stage
	await expect(page.locator('nav')).toHaveCount(0);

	// The breakout button belongs to the installed app on Android only and must
	// not appear in a plain browser context.
	const fullscreenButton = page.getByRole('button', { name: 'Fullscreen', exact: true });
	await expect(page.getByRole('button', { name: 'Open in the browser' })).toHaveCount(0);
	if (browserName === 'chromium') {
		await expect(fullscreenButton).toBeVisible();
	} else {
		// Headless WebKit's fullscreenEnabled is unverified territory, assert
		// that the button follows the capability instead of assuming it exists.
		const enabled = await page.evaluate(() => document.fullscreenEnabled);
		await expect(fullscreenButton).toHaveCount(enabled ? 1 : 0);
	}

	if (browserName === 'chromium') {
		await fullscreenButton.click();
		const exitButton = page.getByRole('button', { name: 'Exit fullscreen' });
		await expect(exitButton).toBeVisible();
		// While fullscreen is on, Esc must not leave the stage.
		await page.keyboard.press('Escape');
		await expect(page).toHaveURL(/\/tv$/);
		await exitButton.click();
		await expect(fullscreenButton).toBeVisible();
		// Leaving the stage tears TV mode down with it.
		await fullscreenButton.click();
		await expect(exitButton).toBeVisible();
		await page.getByRole('button', { name: 'Close TV view' }).click();
		await expect(page).toHaveURL(/\/$/);
		// The teardown's exitFullscreen() is asynchronous, poll instead of racing it.
		await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
	}
});

test('a click beside the person picker closes it, and every balance is shown', async ({ page }) => {
	await enterPin(page);
	await choosePerson(page, 'Anna');

	const header = (await page.locator('header .tokens').innerText()).replace(/\D/g, '');
	expect(Number(header)).toBeGreaterThan(0); // otherwise the comparison below is worthless

	await page.locator('header .who').click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('button', { name: /Ben/ })).toBeVisible();
	await expect(dialog.locator('.tokens')).toHaveCount(4);

	// The value has to come from the server for real: Anna's balance in the dialog
	// matches the one in the header. If the balance object arrived empty, this would
	// read 0.
	const inDialog = (
		await dialog.locator('button', { hasText: 'Anna' }).locator('.tokens').innerText()
	).replace(/\D/g, '');
	expect(inDialog).toBe(header);

	// A click in the top left corner lands beside the window and cancels.
	await page.mouse.click(5, 5);
	await expect(dialog).not.toBeVisible();
});

test('a click beside the confirmation does not evaluate', async ({ page }) => {
	await enterPin(page);
	await choosePerson(page, 'David');

	await page.goto('/evaluation');
	await page.getByRole('button', { name: 'Reveal winner' }).click();
	await expect(page.getByRole('dialog').getByRole('button', { name: 'Reveal winner' })).toBeVisible();

	await page.mouse.click(5, 5);
	// The prompt is gone but nothing was evaluated: the button is still there.
	await expect(page.getByRole('dialog').getByRole('button', { name: 'Reveal winner' })).toBeHidden();
	await expect(page.getByRole('button', { name: 'Reveal winner' })).toBeVisible();
});

test('the list re-sorts only after a short quiet period', async ({ page }) => {
	await enterPin(page);
	await choosePerson(page, 'Ben');

	await addMovieByHand(page, 'ZZ-Latecomer');
	await addMovieByHand(page, 'AA-Frontrunner');

	await page.goto('/');
	const before = await tileOrder(page);
	expect(before.indexOf('AA-Frontrunner')).toBeLessThan(before.indexOf('ZZ-Latecomer'));

	// A vote on the movie further back: it now belongs higher up straight away …
	const tile = page.locator('.tile').filter({ hasText: 'ZZ-Latecomer' });
	await tile.getByRole('button', { name: 'Put a vote on ZZ-Latecomer' }).click();
	await expect(tile.locator('.mine')).toHaveText('1');

	// … the data is there, but the order is deliberately still the old one.
	const immediately = await tileOrder(page);
	expect(immediately.indexOf('AA-Frontrunner')).toBeLessThan(immediately.indexOf('ZZ-Latecomer'));

	// After the quiet period the tile moves up.
	await expect
		.poll(
			async () => {
				const now = await tileOrder(page);
				return now.indexOf('ZZ-Latecomer') < now.indexOf('AA-Frontrunner');
			},
			{ timeout: 8000 }
		)
		.toBe(true);
});

test('the PIN can be typed on the keyboard, and ⌫ takes back one digit', async ({ page }) => {
	await page.goto('/pin');
	// The regular family login must never reveal its PIN. Only an instance
	// explicitly started with demo content receives the small access note.
	await expect(page.getByText('Demo access', { exact: true })).toHaveCount(0);
	// Only once the script runs does anyone listen to the keyboard at all .
	// otherwise the first keystrokes go nowhere. The click tests wait longer
	// implicitly.
	await page.waitForLoadState('networkidle');

	const filled = page.locator('.pindot.filled');
	await page.keyboard.type('261', { delay: 30 });
	await expect(filled).toHaveCount(3);

	// ⌫ takes back exactly one digit, not the whole entry.
	await page.keyboard.press('Backspace');
	await expect(filled).toHaveCount(2);

	// After the fourth digit the app checks by itself.
	await page.keyboard.type('11', { delay: 30 });
	await page.waitForURL((url) => url.pathname === '/');
});

test('a suggestion can be attributed to another person', async ({ page }) => {
	await enterPin(page);
	await choosePerson(page, 'David');

	await addMovieByHand(page, 'Added for Carla');

	const proposer = page.getByLabel('Suggested by');
	await expect(proposer).toHaveValue('david');
	await proposer.selectOption('carla');
	await page.reload();
	await expect(page.getByLabel('Suggested by')).toHaveValue('carla');
});

// The switch itself, before signing in: whoever cannot read the lock screen has
// to be able to change the language from exactly there.
test('the language switcher on the PIN page changes the interface', async ({ page }) => {
	await page.goto('/pin');
	await expect(page.getByText('Enter your family PIN')).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');

	const languages = [
		{ code: 'es', title: 'Introduce el PIN' },
		{ code: 'fr', title: 'Saisir le code PIN' },
		{ code: 'pt-BR', title: 'Digite o PIN' },
		{ code: 'it', title: 'Inserisci il PIN' },
		{ code: 'pl', title: 'Wpisz PIN' },
		{ code: 'tr', title: "PIN'i gir" },
		{ code: 'ja', title: 'PINを入力' },
		{ code: 'de', title: 'PIN eingeben' }
	];
	for (const { code, title } of languages) {
		await page.locator('.lang select').selectOption(code);
		await expect(page).toHaveTitle(title);
		// Not just the text: this is what a screen reader picks its voice from.
		await expect(page.locator('html')).toHaveAttribute('lang', code);
	}

	// The choice applies to the device and survives a page change.
	await page.reload();
	await expect(page.getByText('Familien-PIN eingeben')).toBeVisible();

	// Back to the instance setting, otherwise the next test would arrive here in
	// German, and the choice would have no way back.
	await page.getByLabel('Sprache').selectOption('');
	await expect(page.getByText('Enter your family PIN')).toBeVisible();
	await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('the More page links to the project and carries its signature', async ({ page }) => {
	await enterPin(page);
	await choosePerson(page, 'Anna');
	await page.goto('/more');

	const website = page.locator('a[href="https://popcornvote.org"]');
	await expect(website).toContainText('Project website');
	await expect(website).toHaveAttribute('target', '_blank');
	await expect(website).toHaveAttribute('rel', 'noreferrer');

	const repository = page.locator('a[href="https://github.com/Stadicus/popcorn-vote"]');
	await expect(repository).toContainText('GitHub repository');
	await expect(repository).toHaveAttribute('target', '_blank');
	await expect(repository).toHaveAttribute('rel', 'noreferrer');

	const creditNote = page.getByText('Get one new vote every Sunday at 8:00 AM, up to a balance of 5.', {
		exact: true
	});
	await expect(creditNote).toBeVisible();
	await expect(creditNote).toHaveCSS('text-align', 'center');

	await expect(page.getByText('Made with ❤️ by Stadicus', { exact: true })).toBeVisible();
	await expect(page.locator('.version')).toHaveText(/^Version 1\.0\.0\+[0-9a-f]{7}$/);
});

test('an unknown address lands on the error page', async ({ page }) => {
	await enterPin(page);
	await choosePerson(page, 'Anna');

	const response = await page.goto('/vorschlagen');
	expect(response?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

	await page.getByRole('link', { name: 'Back to movie list' }).click();
	await page.waitForURL((url) => url.pathname === '/');

	await page.context().addCookies([{ name: 'pv_lang', value: 'de', url: page.url() }]);
	await page.goto('/archiv');
	await expect(page.getByRole('heading', { name: 'Diese Seite gibt es nicht' })).toBeVisible();
});

test('a missing database key says so rather than finding nothing', async ({ page }) => {
	await enterPin(page);
	await choosePerson(page, 'David');

	await page.goto('/propose');
	// The consequence first, then the cause: the same bad key means something
	// different depending on which page you meet it on.
	await expect(page.getByText('Movie search is unavailable.')).toBeVisible();
	await expect(page.getByText('No TMDB key is configured.')).toBeVisible();
	await expect(page.getByRole('searchbox')).toBeDisabled();
	// The way out is named, and it still works.
	await expect(page.getByText('Adding a movie by hand still works.')).toBeVisible();
	await addMovieByHand(page, 'Movie Without A Key');
	await expect(page.getByRole('heading', { name: /Movie Without A Key/ })).toBeVisible();

	// The OMDb key costs the IMDb rating and nothing else, so it stays small
	// print under "More" instead of getting in the way of the game.
	await page.goto('/more');
	await expect(page.getByText('IMDb ratings are unavailable. TMDB ratings are shown instead.')).toBeVisible();
	await expect(page.getByText('No OMDb key is configured.')).toBeVisible();
});

// Has to go last: the failed attempts lock the IP for the following seconds.
test('a wrong PIN leads to a rising wait', async ({ page }) => {
	await page.goto('/pin');
	for (let attempt = 0; attempt < 3; attempt++) {
		for (const digit of ['9', '9', '9', '9']) {
			await page.getByRole('button', { name: digit, exact: true }).click();
		}
		await page.waitForTimeout(300);
	}
	await expect(page.getByText(/Next attempt in \d+ seconds?/)).toBeVisible();
});
