import type { PageServerLoad } from './$types';
import { isLocale, LANG_COOKIE } from '$lib/i18n/locales';

export const load: PageServerLoad = ({ locals, cookies }) => {
	const languageChoice = cookies.get(LANG_COOKIE);
	return {
		locale: locals.locale,
		languageChoice: isLocale(languageChoice) ? languageChoice : null,
		tmdbConfigured: locals.config.tmdbKeyState === 'ok',
		omdbConfigured: locals.config.omdbKeyState === 'ok'
	};
};
