import { CATALOGUES, type Catalogue, type Message, type MessageKey } from './catalogues';
import { DEFAULT_LOCALE, type Locale } from './locales';

export type Params = Record<string, string | number>;

/** Looks up one message in a language that was fixed beforehand. */
export type Translate = (key: MessageKey, params?: Params) => string;

/** Only the tests bring their own; everything else uses the shipped catalogues. */
export type Registry = Partial<Record<Locale, Catalogue>>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** The parameter that decides the plural category, per the message format. */
const COUNT = 'n';

/**
 * One `Intl.PluralRules` per language. Building one costs roughly twenty times
 * what using it costs, and a list page asks for counted messages dozens of
 * times per render.
 *
 * This is not the module-level locale state the architecture forbids: the map
 * is keyed by language and holds no notion of a "current" one, so no request
 * can read anything of another request's here.
 */
const PLURAL_RULES = new Map<Locale, Intl.PluralRules>();

function pluralRules(locale: Locale): Intl.PluralRules {
	let rules = PLURAL_RULES.get(locale);
	if (!rules) {
		rules = new Intl.PluralRules(locale);
		PLURAL_RULES.set(locale, rules);
	}
	return rules;
}

/**
 * Binds a language once, so a request handler or a component can call `t(key)`
 * without repeating it.
 *
 * There is no module-level "current language" on purpose: the server answers
 * concurrent requests in one process, and a shared variable would leak one
 * family's language into another family's response.
 */
export function translator(locale: Locale, registry: Registry = CATALOGUES): Translate {
	return (key, params) => translate(locale, key, params, registry);
}

/**
 * Looks the key up in `locale`, falls back to English when it is missing there,
 * picks the plural category and substitutes the placeholders.
 */
export function translate(
	locale: Locale,
	key: MessageKey,
	params?: Params,
	registry: Registry = CATALOGUES
): string {
	const message = registry[locale]?.[key] ?? registry[DEFAULT_LOCALE]?.[key];
	if (message === undefined) {
		warn(`"${key}" is missing from ${locale} and from ${DEFAULT_LOCALE}`);
		// The key itself, never an empty string: a missing translation has to
		// leave something on the screen that names what is missing.
		return key;
	}
	return fill(plural(locale, key, message, params), key, params);
}

/**
 * Picks the plural form for `params.n` through `Intl.PluralRules`, falling back
 * to `other`. Categories rather than a two-element array: a language with three
 * or more forms should cost a translator nothing but its own JSON file.
 */
function plural(locale: Locale, key: MessageKey, message: Message, params?: Params): string {
	if (typeof message === 'string') return message;
	const count = Number(params?.[COUNT]);
	const category = Number.isFinite(count) ? pluralRules(locale).select(count) : 'other';
	const form = message[category] ?? message.other;
	if (form === undefined) {
		warn(`"${key}" has neither a "${category}" nor an "other" form in ${locale}`);
		return key;
	}
	return form;
}

function fill(text: string, key: MessageKey, params?: Params): string {
	return text.replace(PLACEHOLDER, (whole, name: string) => {
		const value = params?.[name];
		if (value === undefined) {
			warn(`"${key}" has no value for {${name}}`);
			// The placeholder stays visible. A gap that names itself is easier to
			// spot and to report than a sentence that silently lost a word.
			return whole;
		}
		return String(value);
	});
}

/**
 * Development only. In production a missing message is a cosmetic flaw, and it
 * would otherwise write a line into the operator's log on every single request.
 */
function warn(message: string): void {
	if (import.meta.env.DEV) console.warn(`[i18n] ${message}`);
}
