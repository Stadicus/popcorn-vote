import { defineConfig } from '@playwright/test';

const setupBrowser = process.env.PW_SETUP_BROWSER === 'webkit' ? 'webkit' : 'chromium';

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
			name: 'setup',
			testMatch: /setup\.auth\.ts/,
			use: {
				browserName: setupBrowser,
				...(setupBrowser === 'chromium'
					? {
							launchOptions: {
								args: ['--disable-software-rasterizer'],
								...(process.env.PLAYWRIGHT_CHROMIUM_PATH
									? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
									: {})
							}
						}
					: {})
			}
		},
		{
			name: 'chromium',
			dependencies: ['setup'],
			testIgnore: /setup\.auth\.ts/,
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
			dependencies: ['setup'],
			testIgnore: /setup\.auth\.ts/,
			use: { browserName: 'webkit' }
		}
	],
	webServer: {
		command:
			'rm -rf e2e/.data && env -u ORIGIN -u PROTOCOL_HEADER -u TMDB_API_KEY -u OMDB_API_KEY -u PV_PIN PV_DEMO_DATA= PV_INTERFACE_LANGUAGE= PV_CONFIG= PV_MEMBERS="Anna,Ben,Carla,David" DATA_DIR=e2e/.data PORT=4173 node build/index.js',
		url: 'http://localhost:4173/healthz',
		reuseExistingServer: false,
		timeout: 30_000
	}
});
