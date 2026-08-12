import { defineConfig } from '@playwright/test';

// End-to-end tests against the built production server.
// Run `npm run build` first; the database starts empty for every run.
export default defineConfig({
	testDir: 'e2e',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
	use: {
		baseURL: 'http://localhost:4173'
	},
	projects: [
		{
			name: 'chromium',
			use: {
				browserName: 'chromium',
				launchOptions: {
					args: ['--disable-software-rasterizer'],
					// Locally a pre-installed Chromium can be used.
					...(process.env.PLAYWRIGHT_CHROMIUM_PATH
						? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
						: {})
				}
			}
		},
		{
			name: 'webkit',
			use: { browserName: 'webkit' }
		}
	],
	webServer: {
		command:
			'rm -rf e2e/.data && env -u ORIGIN -u PROTOCOL_HEADER PV_DEMO_DATA= PV_INTERFACE_LANGUAGE= TMDB_API_KEY= OMDB_API_KEY= PV_CONFIG= PV_MEMBERS="Anna,Ben,Carla,David" PV_PIN=2611 DATA_DIR=e2e/.data PORT=4173 node build/index.js',
		url: 'http://localhost:4173/healthz',
		reuseExistingServer: false,
		timeout: 30_000
	}
});
