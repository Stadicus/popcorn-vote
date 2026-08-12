import { describe, it, expect } from 'vitest';
import { DEFAULT_LOCALE, isLocale, LOCALE_NAMES, LOCALES, parseLocale, resolveLocale } from './locales';

// The precedence lives in a function of its own, because it would otherwise sit
// in hooks.server.ts — the one place with real branching that no unit test can
// reach.

describe('resolveLocale()', () => {
	it('takes the cookie before the configuration', () => {
		expect(resolveLocale('en', 'de')).toBe('en');
		expect(resolveLocale('de', 'en')).toBe('de');
	});

	it('takes the configuration when no cookie is set', () => {
		expect(resolveLocale(undefined, 'pt-br')).toBe('pt-BR');
	});

	it('falls back to English without either', () => {
		expect(resolveLocale(undefined, undefined)).toBe('en');
		expect(DEFAULT_LOCALE).toBe('en');
	});

	it('ignores an unknown cookie rather than failing on it', () => {
		// A device whose language no longer exists has to stay usable — and a
		// made-up value must not write a warning into the log, or any visitor could
		// fill it at will.
		expect(resolveLocale('klingon', 'de')).toBe('de');
		expect(resolveLocale('', 'de')).toBe('de');
	});

	it('ignores an unknown configured language', () => {
		// It is reported at startup in config.ts, where the operator sees it.
		expect(resolveLocale(undefined, 'klingon')).toBe('en');
	});
});

describe('isLocale()', () => {
	it('recognises exactly the shipped languages', () => {
		for (const locale of LOCALES) expect(isLocale(locale)).toBe(true);
		expect(isLocale('nl')).toBe(false);
		expect(isLocale('DE')).toBe(false);
		expect(isLocale(undefined)).toBe(false);
		expect(isLocale(42)).toBe(false);
	});
});

describe('parseLocale()', () => {
	it('returns the canonical shipped tag regardless of input casing', () => {
		expect(parseLocale(' PT-br ')).toBe('pt-BR');
		expect(parseLocale('FR')).toBe('fr');
		expect(parseLocale('nl')).toBeUndefined();
	});
});

describe('LOCALE_NAMES', () => {
	it('names every language in its own spelling', () => {
		// For the switcher: whoever cannot read the interface still finds
		// "Deutsch".
		for (const locale of LOCALES) expect(LOCALE_NAMES[locale]).toBeTruthy();
	});
});
