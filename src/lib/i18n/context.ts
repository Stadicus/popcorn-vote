import { getContext, setContext } from 'svelte';
import type { Locale } from './locales';
import { translate, type Translate } from './translate';

const KEY = Symbol('i18n');

/**
 * The root layout hands down a getter, not a value: `data.locale` changes when
 * the language switches, and a getter keeps every `t(…)` in the component tree
 * reactive without a store, and without the module-level locale state that the
 * ready-made i18n libraries all bring along.
 */
export function setI18n(locale: () => Locale): void {
	setContext(KEY, locale);
}

export function getI18n(): Translate {
	const locale = read();
	return (key, params) => translate(locale(), key, params);
}

/**
 * The active language itself, for the places that hand it to `Intl` rather than
 * to the catalogue: dates, numbers, weekday and language names. Also a getter,
 * for the same reason `setI18n()` takes one.
 */
export function getLocale(): () => Locale {
	return read();
}

function read(): () => Locale {
	const locale = getContext<(() => Locale) | undefined>(KEY);
	if (!locale) throw new Error('getI18n() needs a parent component that called setI18n()');
	return locale;
}
