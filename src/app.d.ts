import type { Locale } from '$lib/i18n/locales';
import type { Translate } from '$lib/i18n/translate';
import type { AppConfig } from '$lib/server/config';
import type { DB } from '$lib/server/db';

declare global {
	/** Version from package.json, substituted by Vite at build time (see vite.config.ts). */
	const __APP_VERSION__: string;

	namespace App {
		/**
		 * `handleError` puts a short reference on every unexpected error. It ties
		 * what somebody saw on their screen to the line about it in the container
		 * log, without it a report is "it broke this morning" and the log holds
		 * a dozen candidates.
		 */
		interface Error {
			message: string;
			reference?: string;
		}

		interface Locals {
			config: AppConfig;
			db: DB;
			personId: string | null;
			authed: boolean;
			/** Language of this one request: cookie, else configuration, else English. */
			locale: Locale;
			/** Translator for this request alone, never shared across requests. */
			t: Translate;
		}
	}
}

export {};
