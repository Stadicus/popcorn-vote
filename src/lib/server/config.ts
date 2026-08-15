import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { DEFAULT_LOCALE, LOCALES, parseLocale, type Locale } from '$lib/i18n/locales';
import { log } from './log';

export interface Member {
	id: string;
	name: string;
	color: string;
	emoji: string;
}

export interface ConfigUser {
	id: string;
	name: string;
	role: 'admin' | 'user';
	enabled: boolean;
	pinHash: string;
}

/**
 * What the configuration knows about a movie-database key: usable as far as can
 * be told here (`ok`), absent, or still the placeholder from the example
 * configuration. Whether the provider actually accepts it only shows on the
 * first request, that fourth state lives in `keys.ts`.
 */
export type ConfiguredKeyState = 'ok' | 'missing' | 'placeholder';

export interface AppConfig {
	/** The title in the top left; every family may set its own. */
	title: string;
	members: Member[];
	/** How many tokens there are per credit. */
	tokenAmount: number;
	tokenWeekday: number; // 0 = Sunday ... 6 = Saturday
	tokenHour: number;
	tokenCap: number;
	/** Starting balance for new people. */
	tokenStart: number;
	/** Options for the "where to find it" field. */
	sources: string[];
	/**
	 * Language of the interface. Deliberately separate from `language`: whoever uses
	 * the app in English does not necessarily want English movie titles.
	 */
	interfaceLanguage: Locale;
	/** Language of the movie data; `original` stands for the film's own language. */
	language: string;
	/** Fallback language when the main language yields nothing. Never `original`. */
	languageFallback: string;
	/** Country whose age rating is shown (two capital letters). */
	certificationCountry: string;
	/** Preferred order of trailer languages; `original` stands for the original language. */
	trailerLanguages: string[];
	/** Timezone for the credit and the backup. */
	timezone: string;
	backupHour: number;
	/** How many backups are kept. */
	backupKeep: number;
	/** Inactivity window for authentication cookies, in seconds. */
	sessionTimeout: number;
	/** Create demo content on first start; for test instances only. */
	demoData: boolean;
	/**
	 * Whether "More" carries a link to a daily build, a second instance running
	 * the newest code, for whoever wants to look ahead. Off unless an operator
	 * turns it on: nobody else's installation should advertise ours.
	 */
	dailyBuild: boolean;
	/** Where that link points. Empty when unset or unusable; then no link is shown. */
	dailyBuildUrl: string;
	tmdbApiKey: string;
	omdbApiKey: string;
	/** Why the TMDB key is unusable, or `ok`. Never the key itself. */
	tmdbKeyState: ConfiguredKeyState;
	omdbKeyState: ConfiguredKeyState;
	/** Four-digit device PIN; empty = not configured, the app stays locked. */
	pin: string;
	/** Named accounts managed through the settings UI. Empty keeps legacy PIN auth. */
	users: ConfigUser[];
	/** Source names are safe to expose; values never are. */
	origins: Readonly<Record<string, string>>;
	configFile: string;
	dataDir: string;
	/** What proves that a request arrived over HTTPS. See `HttpsProof`. */
	httpsProof: HttpsProof;
}

/**
 * How the app may know a request came in over HTTPS, and it only ever knows it
 * because the operator said so.
 *
 * Behind a reverse proxy the app itself sees plain HTTP, and adapter-node
 * assumes `https` for every request when neither `ORIGIN` nor `PROTOCOL_HEADER`
 * is set. That assumption is why `event.url.protocol` cannot be used here: it
 * says `https:` even for a request that arrived on the container's port over
 * plain HTTP.
 *
 * - `header`, the operator named a forwarding header via `PROTOCOL_HEADER`.
 *   Each request is judged on the value it actually carries, so one installation
 *   can serve HTTPS through a proxy and plain HTTP on the LAN at the same time.
 * - `origin`, `ORIGIN` names an https address. Every request then counts as
 *   HTTPS, which is only correct where the container is unreachable except
 *   through the proxy.
 * - `none`, nothing configured. Cookies carry no `Secure` flag, which is what
 *   an installation reached over plain HTTP on the local network needs.
 */
export type HttpsProof = { mode: 'header'; header: string } | { mode: 'origin' } | { mode: 'none' };

/**
 * Placeholder for "the film's own language". TMDB knows no such language value,
 * the app resolves it before every request (see tmdb.ts).
 */
export const ORIGINAL = 'original';

/**
 * Placeholder for "readable, whatever the film's own alphabet". The title comes
 * in the film's original language as long as that is written in Latin letters,
 * and in English otherwise; description, genres and poster come in English, or in
 * German for German-language films. Resolved per film in tmdb.ts.
 */
export const LATIN = 'latin';

/**
 * The one language `latin` treats as its own. Hardcoded on purpose: deriving it
 * from the interface language would tie two settings together that are
 * deliberately separate, and a fourth language option that only matters in one
 * mode is configuration nobody asked for. Two ways out, both one line of
 * `config.yaml`: `language.fallback` moves the request language for every
 * non-German film, and `language.primary` with a real code turns the mode off.
 */
export const LATIN_NATIVE = 'de';

const WEEKDAYS: Record<string, number> = {
	sunday: 0,
	monday: 1,
	tuesday: 2,
	wednesday: 3,
	thursday: 4,
	friday: 5,
	saturday: 6
};

const FALLBACK_COLORS = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#9b5de5', '#f4845f'];

/**
 * Fallback for the configurable title top left, and what the layout hands out
 * instead of it before the PIN, that one can carry a family name.
 *
 * Not what the PIN page and the TV stage show: those render without the header
 * and take the name from the catalogue key `app.name`. Changing this constant
 * alone renames neither.
 */
export const DEFAULT_TITLE = 'Popcorn Vote';

/**
 * Reads an environment variable and treats an empty value as "not set". For
 * `${VAR}` with no entry in the .env, Docker Compose writes an empty string into
 * the environment, that must not displace the configuration file, or a
 * well-kept config.yaml quietly tips over to defaults.
 */
function env(name: string): string | undefined {
	const value = process.env[name]?.trim();
	return value ? value : undefined;
}

/**
 * A person's colour, or the intended default. Only hex is usable: the interface
 * measures the brightness of the circle to keep text on it readable (see
 * `textColour` in $lib/member). A CSS name like `gold`, or an `rgb(…)`, could not
 * be measured and would get unreadable text in case of doubt.
 */
function checkColour(value: unknown, fallbackValue: string): string {
	const candidate = String(value ?? '').trim();
	if (!candidate) return fallbackValue;
	if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(candidate)) return candidate;
	log.warn(`Colour ${candidate} is unusable (needs hex such as #2f56d3) and is ignored`);
	return fallbackValue;
}

/** Where a value came from, logged at startup. */
type Origins = Record<string, string>;

/** Empty lists count as "not set", just like empty strings. */
function notEmpty<T>(list: T[] | undefined): T[] | undefined {
	return list && list.length > 0 ? list : undefined;
}

/**
 * A whole number in the allowed range, otherwise "not set". Unusable values must
 * not displace the other source, otherwise the origin table claims a source
 * whose value was never used at all.
 */
function wholeNumber(
	name: string,
	source: string,
	value: unknown,
	min: number,
	max: number
): number | undefined {
	if (isBlank(value)) return undefined;
	// Real numbers and digit sequences only. Without this pre-check `Number()`
	// would happily swallow `true` (as 1) and `0x10` (as 16) too, and the origin
	// table would then name a source for a value nobody there meant that way.
	const looksNumeric = typeof value === 'number' || /^-?\d+$/.test(String(value).trim());
	const num = Number(value);
	if (looksNumeric && Number.isInteger(num) && num >= min && num <= max) return num;
	log.warn(`${name} from ${source} is unusable (whole number from ${min} to ${max}) and is ignored`);
	return undefined;
}

/** Like `wholeNumber()`, but for values that are not numbers. */
function isBlank(value: unknown): boolean {
	return value === undefined || value === null || String(value).trim() === '';
}

/**
 * A weekday as a name (`sunday` … `saturday`) or as a number 0–6. Unusable means
 * "not set" here as well: a typo in the environment must not throw a well-kept
 * value from config.yaml back to Sunday.
 */
function weekday(name: string, source: string, value: unknown): number | undefined {
	if (isBlank(value)) return undefined;
	const raw_ = String(value).trim().toLowerCase();
	const fromName = WEEKDAYS[raw_];
	if (fromName !== undefined) return fromName;
	const num = Number(raw_);
	if (Number.isInteger(num) && num >= 0 && num <= 6) return num;
	log.warn(`${name} from ${source} is unusable (sunday to saturday, or 0 to 6) and is ignored`);
	return undefined;
}

/**
 * A language tag such as `de` or `de-DE`, normalised in spelling.
 *
 * `allowed` lists the placeholders this particular setting resolves itself .
 * a list rather than a flag, because the three callers differ: the film language
 * takes `original` and `latin`, the trailer order takes `original` alone
 * (`latin` is a mode for the film data, not a language a trailer can be in), and
 * the fallback takes neither, since its value goes to TMDB unchanged.
 */
function languageTag(
	name: string,
	source: string,
	value: unknown,
	allowed: readonly string[]
): string | undefined {
	if (isBlank(value)) return undefined;
	const candidate = String(value).trim();
	const placeholder = [ORIGINAL, LATIN].find((p) => p === candidate.toLowerCase());
	if (placeholder) {
		if (allowed.includes(placeholder)) return placeholder;
		// Name what this setting does take, the way every other warning here does.
		// The reason differs per caller, the fallback goes to TMDB unchanged, a
		// trailer language is a language a trailer can be in, and a single
		// sentence claiming one of them would be wrong at the other call site.
		const takes = [...allowed, 'a language code such as de-DE'].join(', ');
		log.warn(`${name} from ${source} does not accept "${placeholder}" and is ignored (takes: ${takes})`);
		return undefined;
	}
	const match = /^([a-z]{2})(?:-([a-z]{2}))?$/i.exec(candidate);
	if (match) {
		return match[2] ? `${match[1].toLowerCase()}-${match[2].toUpperCase()}` : match[1].toLowerCase();
	}
	log.warn(`${name} from ${source} is unusable (something like de or de-DE) and is ignored`);
	return undefined;
}

/**
 * Reports sub-keys the block does not have.
 *
 * The expensive case is a typo inside a block that exists: `ui:` or
 * `interface_language:` instead of `interface:`. Nothing takes effect, nothing is
 * logged, and the family's interface turns English overnight when Watchtower
 * pulls the image. A key nobody reads has to say so.
 */
function checkKeys(name: string, read: Record<string, unknown>, known: string[]): void {
	for (const key of Object.keys(read)) {
		if (!known.includes(key)) {
			// Print the allowed keys, the way every other warning here names the usable
			// form. Whoever writes `interface` into the old block sees at once that it
			// does not belong there.
			log.warn(
				`${name}.${key} in config.yaml is unknown and has no effect (${name} knows: ${known.join(', ')})`
			);
		}
	}
}

/** Every key this app reads at the top level of `config.yaml`. */
const TOP_LEVEL_KEYS = [
	'title',
	'members',
	'pin',
	'users',
	'token',
	'language',
	'timezone',
	'backup',
	'security',
	'sources',
	'demo_data',
	'daily_build',
	'tmdb_api_key',
	'omdb_api_key'
];

/**
 * Reports whole blocks the app does not read.
 *
 * The counterpart to `checkKeys()`, one level up, and the one that matters after
 * 2.5.0: an installation still carrying `sprache:` or `zeitzone:` used to be
 * refused at start-up by name. Now those keys are simply not read, and without
 * this line, not read means not mentioned either. The timezone falls back to
 * Europe/Berlin, the backup to 3 a.m., and nothing anywhere says why.
 */
function checkTopLevelKeys(raw: Record<string, unknown>): void {
	for (const key of Object.keys(raw)) {
		if (!TOP_LEVEL_KEYS.includes(key)) {
			log.warn(`${key} in config.yaml is unknown and has no effect (known: ${TOP_LEVEL_KEYS.join(', ')})`);
		}
	}
}

/**
 * The interface language. Unlike the language of the film data this value never
 * reaches a foreign service, it picks one of the translations that ship with
 * the app, so only those are allowed. Anything else is reported and dropped
 * rather than leaving a family stuck in a half-translated interface.
 */
function interfaceLocale(name: string, source: string, value: unknown): Locale | undefined {
	if (isBlank(value)) return undefined;
	const candidate = parseLocale(String(value));
	if (candidate) return candidate;
	log.warn(`${name} from ${source} is unusable (${LOCALES.join(' or ')}) and is ignored`);
	return undefined;
}

/**
 * A block of sub-keys from `config.yaml`.
 *
 * Reading the changelog line "add `interface: de`" and writing
 * `language: de` at the top level is the obvious misreading, and it used to be
 * ignored without a word: the interface stayed English and the log said
 * nothing. A scalar where a block belongs is always a mistake, so say so.
 */
function block(name: string, value: unknown): Record<string, unknown> {
	if (value === undefined || value === null) return {};
	if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
	log.warn(`${name} in config.yaml needs sub-keys and is ignored`);
	return {};
}

/**
 * Trailer languages as a list. TMDB compares them against `iso_639_1`, so only
 * the language part counts, whoever writes `de-DE` means `de` and gets it.
 * Unusable entries drop out one by one; only once none is left does the whole
 * setting count as not set.
 */
function trailerLanguageList(name: string, source: string, value: unknown): string[] | undefined {
	if (isBlank(value)) return undefined;
	const raw_ = Array.isArray(value) ? value.map((e) => String(e)) : String(value).split(',');
	const checked: string[] = [];
	for (const entry of raw_.map((e) => e.trim()).filter(Boolean)) {
		const tagOrNothing = languageTag(name, source, entry, [ORIGINAL]);
		if (!tagOrNothing) continue;
		const short = tagOrNothing === ORIGINAL ? ORIGINAL : tagOrNothing.slice(0, 2);
		if (!checked.includes(short)) checked.push(short);
	}
	return notEmpty(checked);
}

/** Country code for the age rating, two letters such as `DE`. */
function countryCode(name: string, source: string, value: unknown): string | undefined {
	if (isBlank(value)) return undefined;
	const candidate = String(value).trim().toUpperCase();
	if (/^[A-Z]{2}$/.test(candidate)) return candidate;
	log.warn(`${name} from ${source} is unusable (two letters such as DE) and is ignored`);
	return undefined;
}

/**
 * The placeholders our own `config.example.yaml` hands out. Whoever starts on the
 * unchanged example has not configured a key, they have copied a template, and
 * the app has to say so.
 *
 * Without this the literal would travel to TMDB, come back as a 401, and the
 * interface would report the film as the problem ("add the movie by hand") while
 * the log claimed the key came from config.yaml. The PIN placeholder `NNNN` is
 * already caught by its four-digit check; these two had no such check to fall
 * foul of, since any string can be a valid key.
 */
const KEY_PLACEHOLDERS = ['your-tmdb-key', 'your-omdb-key'];

function isPlaceholder(value: unknown): boolean {
	return KEY_PLACEHOLDERS.includes(
		String(value ?? '')
			.trim()
			.toLowerCase()
	);
}

/**
 * A key for one of the movie databases. A placeholder counts as "not set", the
 * same way an empty value does, so the other source still gets its turn and the
 * origin table does not name a source for a value that was never usable.
 */
function apiKey(name: string, source: string, value: unknown): string | undefined {
	if (isBlank(value)) return undefined;
	const candidate = String(value).trim();
	if (isPlaceholder(candidate)) {
		log.warn(`${name} from ${source} is still the placeholder from the example and is ignored`);
		return undefined;
	}
	return candidate;
}

/**
 * Why there is no usable key, the reason the interface shows instead of leaving
 * the family with a search that silently finds nothing. Deliberately derived
 * from the candidates rather than from the chosen value: only they can tell
 * "nobody set one" from "the example was copied unchanged".
 */
function configuredKeyState(chosen: string, candidates: unknown[]): ConfiguredKeyState {
	if (chosen) return 'ok';
	return candidates.some(isPlaceholder) ? 'placeholder' : 'missing';
}

/**
 * Timezone. Deliberately not checked against `Intl.supportedValuesOf('timeZone')`
 *, that list does not know common aliases such as `UTC`, even though
 * `Intl.DateTimeFormat` accepts them without complaint. Hence the practical test.
 */
function timezoneValue(name: string, source: string, value: unknown): string | undefined {
	if (isBlank(value)) return undefined;
	const candidate = String(value).trim();
	try {
		new Intl.DateTimeFormat('en', { timeZone: candidate });
		return candidate;
	} catch {
		log.warn(`${name} from ${source} is unusable (something like Europe/Berlin) and is ignored`);
		return undefined;
	}
}

/**
 * A switch. `true`/`1` turns it on, `false`/`0` explicitly off; everything else
 * is unusable, is reported and counts as not set.
 *
 * Turning it off has to be a value of its own and must not coincide with "not
 * set": otherwise `PV_DEMO_DATA=false` could not override a `demo_data: true`
 * from config.yaml, the environment would drop out silently, the file would
 * win, and a fresh production database would get demo content on its first
 * start. Preventing exactly that is what the precedence is for.
 */
/**
 * A web address that is safe to put in an `href`.
 *
 * The value travels from the configuration into a link the family clicks, so the
 * scheme is checked rather than trusted: `javascript:` and `data:` in that
 * position are script execution, not navigation. The parser does the deciding,
 * because it normalises what a hand-written check walks past, upper case, a tab
 * inside the scheme, leading space. Anything that is not http or https counts as
 * not set, like every other unusable value here.
 *
 * **What comes back is the parser's own form, not what was written.** Deciding on
 * the parsed value and then storing the raw one would leave the two able to
 * disagree, and the only reason they do not today is that a browser resolving an
 * `href` runs the same algorithm, a coincidence that ends the moment this value
 * is used for anything else. So it is normalised once, here, and a bare origin
 * comes back with the trailing slash the parser gives it.
 */
function webAddress(name: string, source: string, value: unknown): string | undefined {
	if (isBlank(value)) return undefined;
	const candidate = String(value).trim();
	let parsed: URL;
	try {
		parsed = new URL(candidate);
	} catch {
		log.warn(`${name} from ${source} is unusable (a full address including https://) and is ignored`);
		return undefined;
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		log.warn(`${name} from ${source} is not an http or https address and is ignored`);
		return undefined;
	}
	return parsed.href;
}

function toggle(name: string, source: string, value: unknown): boolean | undefined {
	if (isBlank(value)) return undefined;
	const raw_ = String(value).trim().toLowerCase();
	if (raw_ === 'true' || raw_ === '1') return true;
	if (raw_ === 'false' || raw_ === '0') return false;
	log.warn(`${name} from ${source} is unusable (true or false) and is ignored`);
	return undefined;
}

/**
 * Chooses between environment, configuration file and default, and says so when
 * both sources set a value (regardless of whether it is the same one). Without
 * that notice you spend a long time wondering why an entry in config.yaml has no
 * effect.
 */
function choose<T>(
	origins: Origins,
	name: string,
	envName: string,
	fromEnv: T | undefined,
	fromFileValue: T | undefined,
	fallbackValue: T
): T {
	if (fromEnv !== undefined && fromFileValue !== undefined) {
		log.warn(`${name} is configured twice. ${envName} wins over config.yaml`);
	}
	if (fromEnv !== undefined) {
		origins[name] = envName;
		return fromEnv;
	}
	if (fromFileValue !== undefined) {
		origins[name] = 'config.yaml';
		return fromFileValue;
	}
	origins[name] = 'default';
	return fallbackValue;
}

/**
 * Finds the first usable PIN from the environment and the file.
 *
 * Deliberately not "the environment always wins": a placeholder such as `NNNN`
 * from a Compose default would otherwise displace a usable PIN from config.yaml
 * and lock out the whole family, in an app whose only way in is the PIN, the
 * most expensive misconfiguration imaginable.
 */
function choosePin(origins: Origins, raw: Record<string, unknown>): string {
	const candidates = [
		{ value: env('PV_PIN') ?? '', source: 'PV_PIN' },
		{ value: raw.pin == null ? '' : String(raw.pin).trim(), source: 'config.yaml' }
	].filter((k) => k.value.length > 0);

	const isValid = (value: string) => /^\d{4}$/.test(value);
	const valid = candidates.find((k) => isValid(k.value));
	// Report only what is genuinely unusable. A usable PIN that merely loses
	// precedence is reported further down as "configured twice", here it would
	// otherwise stand accused of being broken.
	for (const k of candidates) {
		if (!isValid(k.value)) {
			log.warn(`PIN from ${k.source} is unusable (four digits required) and is ignored`);
		}
	}

	if (!valid) {
		if (candidates.length > 0) {
			log.warn('No usable legacy PIN found (four digits required). Named-account setup remains available.');
		} else if (!Array.isArray(raw.users) || raw.users.length === 0) {
			log.info('No authentication configured yet. First-run setup is available.');
		}
		origins['PIN'] = 'missing';
		return '';
	}
	if (candidates.length > 1) {
		log.warn(`PIN is configured twice. ${valid.source} wins`);
	}
	origins['PIN'] = valid.source;
	return valid.value;
}

/**
 * What may prove a request came in over HTTPS, resolved once, like every other
 * setting, so that the startup line names its source.
 *
 * Deliberately not through `choose()`: both candidates are adapter-node's own
 * variables rather than ours, there is no `config.yaml` counterpart to weigh
 * against, and they are not two sources for one value but two different kinds of
 * proof. `choosePin` above is the same shape for the same reason.
 *
 * `PROTOCOL_HEADER` wins over `ORIGIN` because it is the more precise of the
 * two: it judges each request on what it carries, while `ORIGIN` speaks for all
 * of them at once. Note that adapter-node itself decides the other way round .
 * with `ORIGIN` set it never looks at the header, so an installation with both
 * is warned about below rather than left to wonder which one counts.
 */
function chooseHttpsProof(origins: Origins): HttpsProof {
	const header = env('PROTOCOL_HEADER')?.toLowerCase();
	const origin = env('ORIGIN');
	const originProves = origin?.toLowerCase().startsWith('https:') ?? false;

	if (header) {
		// A header name has to be a token, or `Headers.get()` throws a TypeError
		// rather than answering. adapter-node looks the name up on a plain object
		// and simply misses, so a typo there stays quiet, here it would land on
		// every request that writes a cookie, which after one sign-in is every
		// request at all. Treated like every other unusable value in this file:
		// warned about, then ignored.
		if (!/^[!#$%&'*+\-.^_`|~0-9a-z]+$/.test(header)) {
			// What happens instead is decided below and said by the origin table:
			// an https ORIGIN still counts, and only with neither does the startup
			// line report that no cookie is marked.
			log.warn('PROTOCOL_HEADER is unusable (a header name such as x-forwarded-proto) and is ignored');
		} else {
			if (originProves) {
				log.warn(
					'PROTOCOL_HEADER and ORIGIN are both set. PROTOCOL_HEADER decides whether a cookie is marked Secure, judged per request; adapter-node builds the request URL from ORIGIN.'
				);
			}
			origins['HTTPS proof'] = 'PROTOCOL_HEADER';
			return { mode: 'header', header };
		}
	}
	if (originProves) {
		origins['HTTPS proof'] = 'ORIGIN';
		return { mode: 'origin' };
	}
	origins['HTTPS proof'] = 'none';
	return { mode: 'none' };
}

export function dataDir(): string {
	return process.env.DATA_DIR || '/data';
}

let cached: AppConfig | null = null;

export function loadConfig(force = false): AppConfig {
	if (cached && !force) return cached;
	const dir = dataDir();
	const file = process.env.PV_CONFIG || path.join(dir, 'config.yaml');
	let raw: Record<string, unknown> = {};
	if (fs.existsSync(file)) {
		raw = (parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>) ?? {};
	} else {
		log.warn('No configuration file found, running on the example configuration', { file });
	}
	const origins: Origins = {};
	const parsedUsers: ConfigUser[] = Array.isArray(raw.users)
		? raw.users.flatMap((entry, index) => {
				if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
				const user = entry as Record<string, unknown>;
				const id = String(user.id ?? '').trim();
				const name = String(user.name ?? '').trim();
				const pinHash = String(user.pin_hash ?? '').trim();
				if (!id || !name || !pinHash) {
					log.warn(`users[${index}] in config.yaml is incomplete and is ignored`);
					return [];
				}
				if (user.enabled !== undefined && typeof user.enabled !== 'boolean') {
					log.warn(`users[${index}].enabled in config.yaml must be true or false; the user is ignored`);
					return [];
				}
				return [
					{
						id,
						name,
						role: user.role === 'admin' ? ('admin' as const) : ('user' as const),
						enabled: user.enabled !== false,
						pinHash
					}
				];
			})
		: [];
	const loginIdentifiers = new Set<string>();
	const users = parsedUsers.filter((user, index) => {
		const id = user.id.toLocaleLowerCase('en');
		const name = user.name.toLocaleLowerCase('en');
		if (loginIdentifiers.has(id) || loginIdentifiers.has(name)) {
			log.warn(`users[${index}] in config.yaml collides with another login identifier and is ignored`);
			return false;
		}
		loginIdentifiers.add(id);
		loginIdentifiers.add(name);
		return true;
	});

	// People: "Anna,Ben,Carla,David", or with extras "Name:Colour:Emoji,…"
	const membersFromFile = Array.isArray(raw.members) && raw.members.length > 0 ? raw.members : undefined;
	let members = choose<Member[] | undefined>(
		origins,
		'Members',
		'PV_MEMBERS',
		notEmpty(env('PV_MEMBERS') ? parseMembersEnv(env('PV_MEMBERS')!) : undefined),
		notEmpty(
			membersFromFile?.map((m: Record<string, unknown>, i: number) => ({
				id: String(m.id ?? `person${i + 1}`),
				name: String(m.name ?? m.id ?? `Person ${i + 1}`),
				color: checkColour(m.color, FALLBACK_COLORS[i % FALLBACK_COLORS.length]),
				emoji: String(m.emoji ?? '')
			}))
		),
		undefined
	);
	if (!members || members.length === 0) {
		members = [
			// Animals like the example configuration, not 🍿 or 🎬: those two carry a
			// meaning of their own now, and a person badge stands right next to the
			// balance, "🍿 Person 1  3 🍿" would read as two different things at once.
			{ id: 'demo1', name: 'Person 1', color: FALLBACK_COLORS[0], emoji: '🦁' },
			{ id: 'demo2', name: 'Person 2', color: FALLBACK_COLORS[1], emoji: '🦉' }
		];
		origins['Members'] = 'demo';
	}

	checkTopLevelKeys(raw);

	const token = block('token', raw.token);
	checkKeys('token', token, ['amount', 'weekday', 'hour', 'cap', 'start']);
	const languageFile = block('language', raw.language);
	checkKeys('language', languageFile, [
		'interface',
		'primary',
		'fallback',
		'certification_country',
		'trailer'
	]);
	const backupBlock = block('backup', raw.backup);
	checkKeys('backup', backupBlock, ['hour', 'keep']);
	const securityBlock = block('security', raw.security);
	checkKeys('security', securityBlock, ['session_timeout']);
	const dailyBuildBlock = block('daily_build', raw.daily_build);
	checkKeys('daily_build', dailyBuildBlock, ['show', 'url']);

	const sources = choose(
		origins,
		'Sources',
		'PV_SOURCES',
		notEmpty(
			env('PV_SOURCES')
				?.split(',')
				.map((s) => s.trim())
				.filter(Boolean)
		),
		notEmpty(
			Array.isArray(raw.sources)
				? raw.sources.map((s: unknown) => String(s).trim()).filter(Boolean)
				: undefined
		),
		['Netflix', 'Google', 'Server']
	);

	// Resolved before the object because the raw candidates are needed twice: once
	// for the key itself and once for the reason there is none.
	const tmdbCandidates = [env('TMDB_API_KEY'), raw.tmdb_api_key];
	const omdbCandidates = [env('OMDB_API_KEY'), raw.omdb_api_key];
	const tmdbApiKey = choose(
		origins,
		'TMDB key',
		'TMDB_API_KEY',
		apiKey('TMDB key', 'TMDB_API_KEY', tmdbCandidates[0]),
		apiKey('TMDB key', 'config.yaml', tmdbCandidates[1]),
		''
	);
	const omdbApiKey = choose(
		origins,
		'OMDb key',
		'OMDB_API_KEY',
		apiKey('OMDb key', 'OMDB_API_KEY', omdbCandidates[0]),
		apiKey('OMDb key', 'config.yaml', omdbCandidates[1]),
		''
	);

	cached = {
		title: choose(
			origins,
			'Title',
			'PV_TITLE',
			env('PV_TITLE'),
			raw.title == null ? undefined : String(raw.title).trim() || undefined,
			DEFAULT_TITLE
		),
		members,
		// Check validity before choosing the source, otherwise the origin table names
		// a source whose value was never used at all.
		tokenAmount: choose(
			origins,
			'Tokens per credit',
			'PV_TOKEN_AMOUNT',
			wholeNumber('Tokens per credit', 'PV_TOKEN_AMOUNT', env('PV_TOKEN_AMOUNT'), 1, 99),
			wholeNumber('Tokens per credit', 'config.yaml', token.amount, 1, 99),
			1
		),
		tokenWeekday: choose(
			origins,
			'Credit weekday',
			'PV_TOKEN_WEEKDAY',
			weekday('Credit weekday', 'PV_TOKEN_WEEKDAY', env('PV_TOKEN_WEEKDAY')),
			weekday('Credit weekday', 'config.yaml', token.weekday),
			0
		),
		tokenHour: choose(
			origins,
			'Credit hour',
			'PV_TOKEN_HOUR',
			wholeNumber('Credit hour', 'PV_TOKEN_HOUR', env('PV_TOKEN_HOUR'), 0, 23),
			wholeNumber('Credit hour', 'config.yaml', token.hour, 0, 23),
			8
		),
		tokenCap: choose(
			origins,
			'Token cap',
			'PV_TOKEN_CAP',
			wholeNumber('Token cap', 'PV_TOKEN_CAP', env('PV_TOKEN_CAP'), 1, 99),
			wholeNumber('Token cap', 'config.yaml', token.cap, 1, 99),
			5
		),
		tokenStart: choose(
			origins,
			'Starting balance',
			'PV_START_TOKENS',
			wholeNumber('Starting balance', 'PV_START_TOKENS', env('PV_START_TOKENS'), 0, 99),
			wholeNumber('Starting balance', 'config.yaml', token.start, 0, 99),
			3
		),
		sources,
		interfaceLanguage: choose(
			origins,
			'Interface language',
			'PV_INTERFACE_LANGUAGE',
			interfaceLocale('Interface language', 'PV_INTERFACE_LANGUAGE', env('PV_INTERFACE_LANGUAGE')),
			interfaceLocale('Interface language', 'config.yaml (language.interface)', languageFile.interface),
			DEFAULT_LOCALE
		),
		language: choose(
			origins,
			'Film language',
			'PV_LANGUAGE',
			languageTag('Film language', 'PV_LANGUAGE', env('PV_LANGUAGE'), [ORIGINAL, LATIN]),
			languageTag('Film language', 'config.yaml (language.primary)', languageFile.primary, [ORIGINAL, LATIN]),
			LATIN
		),
		// `original` is forbidden here: this value goes to TMDB as a real language
		// parameter and has to be resolvable.
		languageFallback: choose(
			origins,
			'Fallback language',
			'PV_LANGUAGE_FALLBACK',
			languageTag('Fallback language', 'PV_LANGUAGE_FALLBACK', env('PV_LANGUAGE_FALLBACK'), []),
			languageTag('Fallback language', 'config.yaml (language.fallback)', languageFile.fallback, []),
			'en-US'
		),
		certificationCountry: choose(
			origins,
			'Certification country',
			'PV_CERTIFICATION_COUNTRY',
			countryCode('Certification country', 'PV_CERTIFICATION_COUNTRY', env('PV_CERTIFICATION_COUNTRY')),
			countryCode(
				'Certification country',
				'config.yaml (language.certification_country)',
				languageFile.certification_country
			),
			'DE'
		),
		trailerLanguages: choose(
			origins,
			'Trailer languages',
			'PV_TRAILER_LANGS',
			trailerLanguageList('Trailer languages', 'PV_TRAILER_LANGS', env('PV_TRAILER_LANGS')),
			trailerLanguageList('Trailer languages', 'config.yaml (language.trailer)', languageFile.trailer),
			[ORIGINAL, 'en', 'de']
		),
		timezone: choose(
			origins,
			'Timezone',
			'PV_TIMEZONE',
			timezoneValue('Timezone', 'PV_TIMEZONE', env('PV_TIMEZONE')),
			timezoneValue('Timezone', 'config.yaml', raw.timezone),
			'Europe/Berlin'
		),
		backupHour: choose(
			origins,
			'Backup hour',
			'PV_BACKUP_HOUR',
			wholeNumber('Backup hour', 'PV_BACKUP_HOUR', env('PV_BACKUP_HOUR'), 0, 23),
			wholeNumber('Backup hour', 'config.yaml', backupBlock.hour, 0, 23),
			3
		),
		backupKeep: choose(
			origins,
			'Backups kept',
			'PV_BACKUP_KEEP',
			wholeNumber('Backups kept', 'PV_BACKUP_KEEP', env('PV_BACKUP_KEEP'), 1, 999),
			wholeNumber('Backups kept', 'config.yaml', backupBlock.keep, 1, 999),
			14
		),
		sessionTimeout: choose(
			origins,
			'Session timeout',
			'PV_SESSION_TIMEOUT',
			wholeNumber('Session timeout', 'PV_SESSION_TIMEOUT', env('PV_SESSION_TIMEOUT'), 300, 31_536_000),
			wholeNumber(
				'Session timeout',
				'config.yaml (security.session_timeout)',
				securityBlock.session_timeout,
				300,
				31_536_000
			),
			31_536_000
		),
		demoData: choose(
			origins,
			'Demo content',
			'PV_DEMO_DATA',
			toggle('Demo content', 'PV_DEMO_DATA', env('PV_DEMO_DATA')),
			toggle('Demo content', 'config.yaml', raw.demo_data),
			false
		),
		dailyBuild: choose(
			origins,
			'Daily build link',
			'PV_DAILY_BUILD',
			toggle('Daily build link', 'PV_DAILY_BUILD', env('PV_DAILY_BUILD')),
			toggle('Daily build link', 'config.yaml', dailyBuildBlock.show),
			false
		),
		dailyBuildUrl: choose(
			origins,
			'Daily build address',
			'PV_DAILY_BUILD_URL',
			webAddress('Daily build address', 'PV_DAILY_BUILD_URL', env('PV_DAILY_BUILD_URL')),
			webAddress('Daily build address', 'config.yaml', dailyBuildBlock.url),
			''
		),
		tmdbApiKey,
		omdbApiKey,
		tmdbKeyState: configuredKeyState(tmdbApiKey, tmdbCandidates),
		omdbKeyState: configuredKeyState(omdbApiKey, omdbCandidates),
		pin: choosePin(origins, raw),
		users,
		origins,
		configFile: file,
		dataDir: dir,
		httpsProof: chooseHttpsProof(origins)
	};

	// Recorded once at startup: where every setting came from. That explains in ten
	// seconds why a value from config.yaml does not take effect, without knowing the
	// precedence by heart.
	//
	// Deliberately without values: neither secrets nor the title, which can carry a
	// family name. Logs end up on the host, with the hosting provider and in
	// collectors that are readable more widely than the app itself.
	log.info('Configuration loaded', {
		members: cached.members.length,
		dataDir: dir,
		configFile: fs.existsSync(file) ? file : null,
		source: origins
	});
	// Said in words rather than left to the origin table, because it is the one
	// entry there whose consequence is not obvious from its name. Expected on an
	// installation reached over plain HTTP on the local network, hence info.
	if (cached.httpsProof.mode === 'none') {
		log.info(
			'No HTTPS proof configured, so cookies are not marked Secure. That is correct for plain HTTP on a local network. Behind an HTTPS proxy, set PROTOCOL_HEADER (the forwarding header, usually x-forwarded-proto) or ORIGIN.'
		);
	}
	// The one setting the app cannot check for itself. `ADDRESS_HEADER` is read by
	// the server adapter, never by this configuration, so it appears in no origin
	// table and nothing else would ever mention it. Whether it is right depends on
	// something only the operator can see: if a proxy in front overwrites the
	// header, the brake counts real senders; if the app is reached directly, the
	// header is written by whoever is calling, and a visitor can hand out a fresh
	// address for every attempt. Warned rather than noted, because the setting
	// looks like protection while providing none, and that is worse than an
	// absence somebody can see.
	if (env('ADDRESS_HEADER')) {
		log.warn(
			`ADDRESS_HEADER is set (${env('ADDRESS_HEADER')}), so the per-IP PIN brake counts the address from that header. That is correct only behind a reverse proxy that overwrites it. If the app can also be reached directly, a visitor can choose the address the brake counts against; unset it there.`
		);
	}
	return cached;
}

/** "Anna,Ben", or "Anna:#e63946:🦁,Ben:#457b9d", into a list of members. */
function parseMembersEnv(value: string): Member[] {
	return value
		.split(',')
		.map((entry, i) => {
			const [name, color, emoji] = entry.split(':').map((s) => s.trim());
			if (!name) return null;
			return {
				id: slugify(name),
				name,
				color: checkColour(color, FALLBACK_COLORS[i % FALLBACK_COLORS.length]),
				emoji: emoji || ''
			};
		})
		.filter((m): m is Member => m !== null);
}

/**
 * A stable id from the name; for PV_MEMBERS: change the name and it is a new
 * person.
 *
 * The umlaut replacements below are data, not prose: they turn "Müller" into
 * "mueller". Dropping them would change existing ids and orphan every token in
 * the database that belongs to them.
 */
function slugify(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/ä/g, 'ae')
			.replace(/ö/g, 'oe')
			.replace(/ü/g, 'ue')
			.replace(/ß/g, 'ss')
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.replace(/[^a-z0-9]/g, '') || 'person'
	);
}
