import { describe, it, expect } from 'vitest';
import { CATALOGUES, type Catalogue, type Message, type MessageKey } from './catalogues';
import { LOCALES, type Locale } from './locales';
import { translate, translator } from './translate';

// English is the source language. These tests keep every translation aligned:
// a forgotten key or placeholder would otherwise only show up as stray English
// or broken text in one of the translated interfaces.

/** Every `{placeholder}` a message uses, across all of its plural forms. */
function placeholders(message: Message): Set<string> {
	const forms = typeof message === 'string' ? [message] : Object.values(message);
	const found = new Set<string>();
	for (const form of forms) {
		for (const [, name] of form.matchAll(/\{(\w+)\}/g)) found.add(name);
	}
	return found;
}

describe('message catalogues', () => {
	it('know the same keys in every language', () => {
		const sourceKeys = Object.keys(CATALOGUES.en).sort();
		for (const locale of LOCALES) {
			expect(Object.keys(CATALOGUES[locale]).sort(), `keys in ${locale}`).toEqual(sourceKeys);
		}
	});

	it('use the same placeholders per key', () => {
		// Compared across all plural forms together: a singular form may spell out
		// the {n}, and a lost {file} still shows up.
		for (const [key, message] of Object.entries(CATALOGUES.en)) {
			const sourcePlaceholders = [...placeholders(message)].sort();
			for (const locale of LOCALES) {
				const translated = CATALOGUES[locale][key];
				// If the key is missing entirely, the test above reports it. Skip it here
				// so a TypeError does not hide the useful key mismatch.
				if (translated === undefined) continue;
				expect([...placeholders(translated)].sort(), `placeholders of "${key}" in ${locale}`).toEqual(
					sourcePlaceholders
				);
			}
		}
	});

	it('exist for every offered language', () => {
		for (const locale of LOCALES) {
			expect(Object.keys(CATALOGUES[locale]).length).toBeGreaterThan(0);
		}
	});

	// Without "other", a counted message stays empty for every count that does not
	// happen to fall into one of the spelled-out categories, and the bare key ends
	// up on the screen. The type checker does not see this (every category is
	// optional), and the shipped app carries no warning about it either: that hangs
	// on import.meta.env.DEV and is built out.
	it('have an "other" in every plural form as a backstop', () => {
		for (const locale of LOCALES) {
			for (const [key, message] of Object.entries(CATALOGUES[locale])) {
				if (typeof message === 'string') continue;
				expect(Object.keys(message), `plural forms of "${key}" in ${locale}`).toContain('other');
			}
		}
	});

	// Arabic tells six plural forms apart, and CLDR hands out every one of them
	// for real counts (0, 1, 2, 3-10, 11-99, 100 …). A missing one would quietly
	// fall back to "other" and read wrong. The counted keys are taken from the
	// source language, so a new one is covered without touching this test.
	// `{n}` is required where the number is not already spelled out in the word:
	// in `zero`, `one` and `two` Arabic grammar may carry it in the noun itself.
	it('spell out all six Arabic plural forms', () => {
		const counted = Object.entries(CATALOGUES.en).filter(([, message]) => typeof message !== 'string');
		expect(counted.length).toBeGreaterThan(0);
		for (const [key] of counted) {
			const message = CATALOGUES.ar[key];
			expect(typeof message, `"${key}" in ar`).toBe('object');
			if (typeof message !== 'object') continue;
			for (const category of ['zero', 'one', 'two', 'few', 'many', 'other']) {
				expect(message[category]?.trim(), `"${key}".${category} in ar`).toBeTruthy();
			}
			for (const category of ['few', 'many', 'other']) {
				expect(message[category], `"${key}".${category} in ar`).toContain('{n}');
			}
		}
	});

	// An empty text is as bad as a missing one but slips past every other check:
	// the key is there, the placeholders match, the type checker is satisfied, and
	// nothing appears on the screen anyway.
	it('have no empty text anywhere', () => {
		for (const locale of LOCALES) {
			for (const [key, message] of Object.entries(CATALOGUES[locale])) {
				const formen = typeof message === 'string' ? [message] : Object.values(message);
				for (const form of formen) {
					expect(form.trim(), `text of "${key}" in ${locale}`).not.toBe('');
				}
			}
		}
	});
});

describe('translate()', () => {
	it('delivers the text of the chosen language', () => {
		expect(translate('de', 'pin.title')).toBe('PIN eingeben');
		expect(translate('en', 'pin.title')).toBe('Enter PIN');
		expect(translate('es', 'nav.movieNight')).toBe('Noche de cine');
		expect(translate('fr', 'nav.movieNight')).toBe('Soirée cinéma');
		expect(translate('pt-BR', 'nav.movieNight')).toBe('Noite de cinema');
		expect(translate('it', 'nav.movieNight')).toBe('Serata cinema');
		expect(translate('pl', 'nav.movieNight')).toBe('Wieczór filmowy');
		expect(translate('tr', 'nav.movieNight')).toBe('Film gecesi');
		expect(translate('ja', 'nav.movieNight')).toBe('映画の夜');
		expect(translate('ar', 'nav.movieNight')).toBe('سهرة الأفلام');
	});

	it('substitutes placeholders', () => {
		expect(translate('en', 'pin.notConfiguredShort', { file: 'config.yaml', env: 'PV_PIN' })).toBe(
			'No PIN has been configured yet. Please set it in config.yaml or via PV_PIN.'
		);
	});

	it('falls back to English for a missing key rather than to emptiness', () => {
		const registry = { en: { 'pin.title': 'Enter PIN' }, de: {} as Catalogue };
		expect(translate('de', 'pin.title', undefined, registry)).toBe('Enter PIN');
	});

	it('shows the key when no language knows it', () => {
		// Visibly wrong beats invisibly empty: a blank screen tells nobody what
		// is missing.
		const key = 'does.not.exist' as MessageKey;
		expect(translate('de', key, undefined, { en: {}, de: {} })).toBe(key);
	});

	it('leaves an unfilled placeholder standing', () => {
		expect(translate('en', 'pin.notConfiguredShort', { file: 'config.yaml' })).toContain('{env}');
	});

	it('picks the plural form by the rules of the language', () => {
		const registry: Partial<Record<Locale, Catalogue>> = {
			en: { 'token.count': { one: '1 token', other: '{n} tokens' } },
			de: { 'token.count': { one: '1 Token', other: '{n} Token' } }
		};
		const key = 'token.count' as MessageKey;
		const t = (locale: Locale, n: number) => translate(locale, key, { n }, registry);

		expect(t('en', 0)).toBe('0 tokens');
		expect(t('en', 1)).toBe('1 token');
		expect(t('en', 2)).toBe('2 tokens');

		expect(t('de', 0)).toBe('0 Token');
		expect(t('de', 1)).toBe('1 Token');
		expect(t('de', 2)).toBe('2 Token');
	});

	it('keeps zero visible in languages whose CLDR one category includes zero', () => {
		expect(translate('fr', 'person.freeTokens', { name: 'Alex', n: 0 })).toBe(
			'Votes disponibles pour Alex : 0'
		);
		expect(translate('pt-BR', 'person.freeTokens', { name: 'Alex', n: 0 })).toBe(
			'Votos disponíveis para Alex: 0'
		);
	});

	it('picks each of the six Arabic plural forms', () => {
		const key = 'token.count' as MessageKey;
		const registry = {
			ar: {
				'token.count': { zero: 'zero', one: 'one', two: 'two', few: 'few', many: 'many', other: 'other' }
			}
		};
		const pick = (n: number) => translate('ar', key, { n }, registry);
		expect([0, 1, 2, 3, 11, 100].map(pick)).toEqual(['zero', 'one', 'two', 'few', 'many', 'other']);
	});

	it('takes "other" when the matching category is missing', () => {
		const key = 'token.count' as MessageKey;
		const registry = { en: { 'token.count': { other: '{n} tokens' } } };
		expect(translate('en', key, { n: 1 }, registry)).toBe('1 tokens');
	});
});

// Under `dir="rtl"` the bidi algorithm would turn "Movie (2019)" into
// ")Movie (2019". Every interpolated string is wrapped in FSI … PDI, so that it
// takes its direction from its own first strong character.
describe('bidi isolation', () => {
	const FSI = '\u2068';
	const PDI = '\u2069';
	const key = 'movie.picked' as MessageKey;
	const registry = {
		en: { 'movie.picked': '{title} was picked by {n} people' },
		de: { 'movie.picked': '{title} haben {n} Leute ausgesucht' },
		ar: { 'movie.picked': 'اختار {n} أشخاص {title}' }
	};

	it('isolates a Latin title inside an Arabic sentence, but not a count', () => {
		expect(translate('ar', key, { title: 'Movie (2019)', n: 3 }, registry)).toBe(
			'اختار 3 أشخاص \u2068Movie (2019)\u2069'
		);
	});

	// The criterion is the runtime type, not the placeholder name. A title that
	// happens to be all digits arrives as a string and is isolated, which does no
	// harm; the same goes for a number somebody passed as a string.
	it('decides by the runtime type of the value', () => {
		expect(translate('ar', key, { title: '1917', n: '3' }, registry)).toBe(
			`اختار ${FSI}3${PDI} أشخاص ${FSI}1917${PDI}`
		);
	});

	it('leaves left-to-right languages byte for byte as they were', () => {
		expect(translate('en', key, { title: 'Movie (2019)', n: 3 }, registry)).toBe(
			'Movie (2019) was picked by 3 people'
		);
		expect(translate('de', key, { title: 'Movie (2019)', n: 3 }, registry)).toBe(
			'Movie (2019) haben 3 Leute ausgesucht'
		);
	});
});

describe('translator()', () => {
	it('binds the language once and holds no shared state', () => {
		// The heart of the concurrency rule: two simultaneous requests must not
		// switch each other's language.
		const german = translator('de');
		const english = translator('en');
		expect(german('pin.wrong')).toBe('Falscher PIN.');
		expect(english('pin.wrong')).toBe('Wrong PIN.');
		expect(german('pin.wrong')).toBe('Falscher PIN.');
	});
});
