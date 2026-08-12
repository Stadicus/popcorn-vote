import { readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

const { version } = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8'));

const commit = (process.env.RENDER_GIT_COMMIT ?? process.env.GITHUB_SHA ?? '').slice(0, 7);

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__APP_VERSION__: JSON.stringify(commit ? `${version}+${commit}` : version)
	},
	test: {
		include: ['src/**/*.test.ts', '.github/**/*.test.ts'],
		environment: 'node'
	}
});
