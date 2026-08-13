import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8'));

function localCommit(): string {
	try {
		return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		// Production Docker contexts deliberately omit .git. Their build systems
		// pass one of the environment values below instead.
		return '';
	}
}

const commit = (process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || localCommit()).slice(0, 7);

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(commit ? `${version}+${commit}` : version)
	},
	test: {
		include: ['src/**/*.test.ts', '.github/**/*.test.ts'],
		environment: 'node',
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
			reporter: ['text', 'html', 'lcov', 'json-summary'],
			thresholds: {
				statements: 70,
				branches: 69,
				functions: 69,
				lines: 71
			}
		}
	}
});
