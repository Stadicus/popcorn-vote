import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		serviceWorker: {
			// A reverse proxy in front of a self-hosted install commonly intercepts
			// /robots.txt at the edge. cache.addAll() during install is all-or-nothing,
			// so precaching it would let one proxy quirk fail the entire service worker.
			files: (filename) => !/\.DS_Store/.test(filename) && filename !== 'robots.txt'
		},
		csp: {
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'https://image.tmdb.org'],
				'frame-src': ['https://www.youtube-nocookie.com', 'https://www.youtube.com'],
				'connect-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'frame-ancestors': ['self']
			}
		}
	}
};

export default config;
