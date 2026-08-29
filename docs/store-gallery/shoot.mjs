// Crisp screenshots of the demo instance for the store gallery.
import { chromium, devices } from 'playwright';

const BASE = 'http://localhost:4180';
const OUT = new URL('./shots', import.meta.url).pathname;
const only = process.argv.slice(2);
const want = (n) => only.length === 0 || only.includes(n);

const browser = await chromium.launch();
const phone = { ...devices['iPhone 15 Pro Max'], deviceScaleFactor: 3 };
const ctx = await browser.newContext({ ...phone, baseURL: BASE, locale: 'en-US' });
const page = await ctx.newPage();

await page.goto('/');
if (page.url().endsWith('/pin')) {
	await page.getByLabel('PIN').fill('2611');
	await page.waitForURL((u) => u.pathname === '/');
}
const dlg = page.getByRole('dialog');
if (await dlg.isVisible().catch(() => false)) {
	await dlg.getByRole('button', { name: /Anna/ }).click();
}
await page.waitForTimeout(800);
// Dismiss the install banner and spend a vote: that clears the "balance is
// full" notice and creates the 3:3 tie the wheel needs.
const dismiss = page.getByRole('button', { name: 'Dismiss' });
if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
await page.getByRole('button', { name: 'Put a vote on Incredibles 2' }).click();
await page.waitForTimeout(1200);
await page.goto('/');

async function shot(name, opts = {}) {
	if (!want(name)) return;
	await page.waitForTimeout(600);
	await page.screenshot({ path: `${OUT}/${name}.png`, ...opts });
	console.log('shot', name);
}

await shot('list');

await page.goto('/propose');
await page
	.getByRole('searchbox')
	.or(page.getByPlaceholder(/search|title/i))
	.first()
	.fill('moana');
await page.waitForTimeout(2500);
await shot('search');

// Standings before the evaluation.
await page.goto('/evaluation');
await shot('standings');

await page.getByRole('button', { name: 'Reveal winner' }).first().click();
await page.getByRole('dialog').getByRole('button', { name: 'Reveal winner' }).click();
await page.waitForTimeout(1500);
await shot('wheel');
await page.waitForTimeout(9000);
await shot('winner');

await page.goto('/more');
await shot('more');
await page.goto('/archive');
await shot('archive');

// TV mode on a big screen.
const tv = await browser.newContext({
	viewport: { width: 1920, height: 1080 },
	deviceScaleFactor: 2,
	baseURL: BASE,
	locale: 'en-US'
});
const tp = await tv.newPage();
await tp.goto('/');
if (tp.url().endsWith('/pin')) {
	await tp.getByLabel('PIN').fill('2611');
	await tp.waitForURL((u) => u.pathname === '/');
}
await tp.goto('/tv');
await tp.addStyleTag({
	content: 'header button, .actions button, button[aria-label] { visibility: hidden !important; }'
});
await tp.waitForTimeout(2500);
if (want('tv')) {
	await tp.screenshot({ path: `${OUT}/tv.png` });
	console.log('shot tv');
}

await browser.close();
