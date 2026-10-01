/**
 * Which languages the interface speaks, and how a request picks one.
 *
 * Shared by server and client, so nothing in here may import from
 * `$lib/server/**`.
 */

/** Every shipped language. English is the source; the rest are translations. */
export const LOCALES = ['en', 'de', 'es', 'fr', 'pt-BR', 'it', 'pl', 'tr', 'ja', 'ar'] as const;

export type Locale = (typeof LOCALES)[number];

/** Without any configuration the interface speaks English. */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Native names, for the switcher that phase 1 adds. Deliberately literals and
 * not catalogue keys: a language is always offered under its own name, so that
 * someone who cannot read the current interface still recognises their own.
 * "Deutsch" stays "Deutsch" on an English screen.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
	en: 'English',
	de: 'Deutsch',
	es: 'Español',
	fr: 'Français',
	'pt-BR': 'Português (Brasil)',
	it: 'Italiano',
	pl: 'Polski',
	tr: 'Türkçe',
	ja: '日本語',
	ar: 'العربية'
};

/**
 * Languages written from right to left. The layout uses logical CSS properties
 * throughout (`.github/no-physical-css.sh` keeps it that way), so a language in
 * here needs no stylesheet of its own.
 */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar']);

/** Writing direction, for `<html dir>`. */
export function direction(locale: Locale): 'ltr' | 'rtl' {
	return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

/**
 * The tag to hand to `Intl` for anything that prints digits.
 *
 * The interface shows Western digits 0-9 in every language. Node 22 and older
 * browsers format plain `ar` with Arabic-Indic digits; the Unicode extension
 * `nu-latn` asks for Latin ones regardless of the ICU version. Plural rules,
 * display names and list formats keep the plain locale, they print no digits.
 */
export function formatLocale(locale: Locale): string {
	return locale === 'ar' ? 'ar-u-nu-latn' : locale;
}

/** Per-device language choice, written by `/api/language`. */
export const LANG_COOKIE = 'pv_lang';

export function isLocale(value: unknown): value is Locale {
	return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Accepts user-entered casing but always returns the shipped canonical tag. */
export function parseLocale(value: unknown): Locale | undefined {
	if (typeof value !== 'string') return undefined;
	const candidate = value.trim().toLowerCase();
	return LOCALES.find((locale) => locale.toLowerCase() === candidate);
}

/**
 * Device cookie beats instance configuration beats English.
 *
 * A pure function on purpose: this is the only piece of phase-0 logic that
 * branches, and `hooks.server.ts` cannot be reached from a unit test.
 *
 * Unknown values are ignored rather than rejected. A cookie naming a language
 * that has since been removed must not lock that device out, and an unusable
 * configured value is already reported at startup by `config.ts`, where the
 * operator can act on it. Warning about the cookie here as well would let any
 * visitor fill the log with made-up values.
 */
export function resolveLocale(cookie: string | undefined, configured: string | undefined): Locale {
	const fromCookie = parseLocale(cookie);
	if (fromCookie) return fromCookie;
	const fromConfig = parseLocale(configured);
	if (fromConfig) return fromConfig;
	return DEFAULT_LOCALE;
}
