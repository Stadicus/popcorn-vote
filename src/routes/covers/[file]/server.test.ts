import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import { GET } from './+server';
import type { AppConfig } from '$lib/server/config';

// The handler is called directly rather than through a request, and deliberately
// so: the URL layer normalises `.` and `..` out of a path before SvelteKit ever
// routes it (`new URL('http://h/covers/%2E%2E').pathname` is `/`), so no request
// can deliver those names here. Only a direct call can show that the guard
// answers them, and what it buys is below: the file system is never touched for
// a name this app could not have written.
//
// Nothing is read from disk and nothing is written; `existsSync` is watched
// rather than exercised, so the suite still runs where the tree is read-only.

const config = { dataDir: '/tmp/pv-covers-test' } as AppConfig;

/** Both the status and whether the file system was consulted at all. */
async function attempt(file: string): Promise<{ status: number; touchedDisk: boolean }> {
	const spy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
	try {
		let status: number;
		try {
			status = (await GET({ params: { file }, locals: { config } } as never)).status;
		} catch (err) {
			// `error(404, …)` from SvelteKit throws rather than returns.
			status = (err as { status?: number }).status ?? 500;
		}
		return { status, touchedDisk: spy.mock.calls.length > 0 };
	} finally {
		spy.mockRestore();
	}
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('the cover guard', () => {
	it('turns away the dot segments no request could deliver anyway', async () => {
		for (const name of ['..', '.']) {
			const { status, touchedDisk } = await attempt(name);
			expect(status).toBe(404);
			expect(touchedDisk).toBe(false);
		}
	});

	it('turns away anything that is not a name this app writes, without a disk lookup', async () => {
		for (const name of ['popcornvote.sqlite', 'config.yaml', 'a1b2c3d4e5f60718.txt', 'short.jpg']) {
			const { status, touchedDisk } = await attempt(name);
			expect(status).toBe(404);
			expect(touchedDisk).toBe(false);
		}
	});

	// A cover stored before the extension was clamped keeps its capitals, and the
	// guard has to keep serving it, otherwise the fix is the regression. That it
	// reaches the file system at all is the assertion; the file is absent here, so
	// the answer is still 404, but for the other reason.
	it('lets a legitimate name reach the file system', async () => {
		for (const name of ['a1b2c3d4e5f60718.JPG', 'a1b2c3d4e5f60718.webp', 'a1b2c3d4e5f60718.jpg']) {
			const { touchedDisk } = await attempt(name);
			expect(touchedDisk).toBe(true);
		}
	});
});
