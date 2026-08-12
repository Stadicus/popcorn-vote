import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';

function scope(paths: string[]): string {
	const input = paths.length > 0 ? `${paths.join('\0')}\0` : '';
	const result = spawnSync('bash', ['.github/release-scope.sh'], {
		cwd: process.cwd(),
		input,
		encoding: 'utf8'
	});
	expect(result.status, result.stderr).toBe(0);
	return result.stdout.trim();
}

describe('release scope', () => {
	it('skips the independent website and its formatting support files', () => {
		expect(
			scope([
				'docs/website/index.html',
				'docs/website/assets/hero.webp',
				'docs/website-src/src/App.svelte',
				'.prettierignore',
				'.github/no-german-characters.sh'
			])
		).toBe('website-only');
	});

	it('builds a release for application files', () => {
		expect(scope(['src/routes/+page.svelte'])).toBe('app');
	});

	it('builds a release when website and application change together', () => {
		expect(scope(['docs/website/index.html', 'package.json'])).toBe('app');
	});

	it('does not mistake a similarly named documentation file for the website', () => {
		expect(scope(['docs/website.md'])).toBe('app');
	});

	it('builds conservatively when the diff is empty', () => {
		expect(scope([])).toBe('app');
	});
});
