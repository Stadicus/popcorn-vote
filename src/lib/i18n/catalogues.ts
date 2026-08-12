import de from '../../../messages/de.json';
import en from '../../../messages/en.json';
import es from '../../../messages/es.json';
import fr from '../../../messages/fr.json';
import it from '../../../messages/it.json';
import ja from '../../../messages/ja.json';
import pl from '../../../messages/pl.json';
import ptBR from '../../../messages/pt-BR.json';
import tr from '../../../messages/tr.json';
import type { Locale } from './locales';

/**
 * One message: a finished sentence, or a set of CLDR plural categories
 * (`one`, `other`, …) that `Intl.PluralRules` picks from.
 */
export type Message = string | Record<string, string>;

export type Catalogue = Record<string, Message>;

/**
 * Every shipped language. Adding one is a JSON file plus entries here and in
 * `locales.ts`.
 *
 * Deliberately not `import.meta.glob`: globbing types the catalogues as
 * `unknown`, which would cost exactly the key type below.
 */
export const CATALOGUES: Record<Locale, Catalogue> = {
	en,
	de,
	es,
	fr,
	'pt-BR': ptBR,
	it,
	pl,
	tr,
	ja
};

/**
 * Every key the interface may ask for. `en.json` is the source language and is
 * complete by definition, so `tsconfig.json`'s `resolveJsonModule` gives the
 * exact union for free — no generator, no build step to keep in sync.
 */
export type MessageKey = keyof typeof en;
