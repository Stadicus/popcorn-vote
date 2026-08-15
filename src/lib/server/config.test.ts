import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, DEFAULT_TITLE } from './config';
import { log } from './log';

// The configuration comes from two sources (the environment and config.yaml).
// These tests pin down that a well-kept file cannot be levered out by empty
// values or placeholders from a Compose stack.
//
// The configuration files sit ready in testdata/ and are addressed through
// PV_CONFIG. That way the suite needs no write access and runs where the file
// system is mounted read-only as well.

const TESTDATA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'testdata');

// Every variable the app knows belongs here, otherwise it leaks between test
// cases and one test hangs on the result of the previous one.
const SETTINGS = [
	'PIN',
	'TITLE',
	'MEMBERS',
	'SOURCES',
	'START_TOKENS',
	'TOKEN_AMOUNT',
	'TOKEN_WEEKDAY',
	'TOKEN_HOUR',
	'TOKEN_CAP',
	'INTERFACE_LANGUAGE',
	'LANGUAGE',
	'LANGUAGE_FALLBACK',
	'CERTIFICATION_COUNTRY',
	'TRAILER_LANGS',
	'TIMEZONE',
	'BACKUP_HOUR',
	'BACKUP_KEEP',
	'SESSION_TIMEOUT',
	'DEMO_DATA',
	'DAILY_BUILD',
	'DAILY_BUILD_URL',
	'CONFIG'
];

// The last three are adapter-node's rather than ours, but the HTTPS proof and
// the address warning are read from them, so they leak between cases exactly
// like the others.
const PV_VARS = [
	...SETTINGS.map((name) => `PV_${name}`),
	'TMDB_API_KEY',
	'OMDB_API_KEY',
	'DATA_DIR',
	'ORIGIN',
	'PROTOCOL_HEADER',
	'ADDRESS_HEADER'
];

const saved: Record<string, string | undefined> = {};

/** Reloads with the given test configuration (the cache would otherwise hold the first run). */
function load(file: string) {
	process.env.PV_CONFIG = path.join(TESTDATA, file);
	return loadConfig(true);
}

/**
 * The origin table from the "Configuration loaded" startup line. It is the only
 * place where you can read off which source actually delivered a value, which
 * is why it is checked as well, not just the result.
 */
function originsFor(file: string): Record<string, string> {
	const spy = vi.spyOn(log, 'info').mockImplementation(() => {});
	try {
		load(file);
		const line = spy.mock.calls.find(([msg]) => msg === 'Configuration loaded');
		return (line?.[1]?.source ?? {}) as Record<string, string>;
	} finally {
		spy.mockRestore();
	}
}

beforeEach(() => {
	for (const name of PV_VARS) {
		saved[name] = process.env[name];
		delete process.env[name];
	}
	process.env.DATA_DIR = '/tmp/pv-testdata';
});

afterEach(() => {
	for (const name of PV_VARS) {
		if (saved[name] === undefined) delete process.env[name];
		else process.env[name] = saved[name];
	}
});

describe('configuration from file and environment', () => {
	it('takes values from config.yaml when the environment is silent', () => {
		const config = load('complete.yaml');
		expect(config.pin).toBe('1234');
		expect(config.title).toBe('Familie Muster');
		expect(config.sources).toEqual(['Netflix']);
	});

	it('lets the environment win over the file', () => {
		process.env.PV_TITLE = 'From the environment';
		expect(load('title-from-file.yaml').title).toBe('From the environment');
	});

	// For `${VAR}` with no .env entry Compose writes an empty string into the
	// environment. That must not displace the file.
	it('treats empty environment variables as not set', () => {
		process.env.PV_TITLE = '';
		process.env.PV_PIN = '   ';
		process.env.PV_SOURCES = '';
		const config = load('complete.yaml');
		expect(config.title).toBe('Familie Muster');
		expect(config.pin).toBe('1234');
		expect(config.sources).toEqual(['Netflix']);
	});

	it('does not set the starting balance to zero for an empty PV_START_TOKENS', () => {
		process.env.PV_START_TOKENS = '';
		expect(load('pin-only.yaml').tokenStart).toBe(3);
	});

	it('falls back to the defaults without any source', () => {
		const config = load('pin-only.yaml');
		expect(config.title).toBe(DEFAULT_TITLE);
		expect(config.sources).toEqual(['Netflix', 'Google', 'Server']);
		expect(config.tokenStart).toBe(3);
	});

	it('comes up with demo people when there is no configuration file', () => {
		const config = load('does-not-exist.yaml');
		expect(config.members.length).toBeGreaterThan(0);
		expect(config.title).toBe(DEFAULT_TITLE);
	});

	// A broken template delivers values that are not empty but are empty in
	// substance. Those must not displace a well-kept file either.
	it('treats a list of nothing but separators as not set', () => {
		process.env.PV_SOURCES = ' , , ';
		expect(load('sources-and-balance.yaml').sources).toEqual(['Netflix', 'Server']);
	});

	it('treats a list of people made of nothing but separators as not set', () => {
		process.env.PV_MEMBERS = ',';
		const config = load('complete.yaml');
		// Without people in the file the demo people stay, not an empty list.
		expect(config.members.length).toBeGreaterThan(0);
	});

	// The interface measures the brightness of the colour to keep the text in the
	// person circle readable. A CSS name cannot be measured and would get white
	// text on a light background in case of doubt.
	it('ignores a person colour that is not hex', () => {
		process.env.PV_MEMBERS = 'Anna:gold,Ben:#123456';
		const [anna, ben] = load('complete.yaml').members;
		expect(anna.color).toMatch(/^#[0-9a-f]{6}$/i);
		expect(anna.color).not.toBe('gold');
		expect(ben.color).toBe('#123456');
	});

	// Otherwise the origin table claims a source whose value was discarded.
	it('ignores an unusable starting balance in favour of the file', () => {
		process.env.PV_START_TOKENS = 'three';
		expect(load('sources-and-balance.yaml').tokenStart).toBe(5);
	});

	it('ignores a starting balance outside the allowed range', () => {
		process.env.PV_START_TOKENS = '500';
		expect(load('sources-and-balance.yaml').tokenStart).toBe(5);
	});
});

describe('game values, language and timezone', () => {
	it('falls back to the built-in defaults without any source', () => {
		const config = load('pin-only.yaml');
		expect(config.tokenAmount).toBe(1);
		expect(config.tokenWeekday).toBe(0);
		expect(config.tokenHour).toBe(8);
		expect(config.tokenCap).toBe(5);
		expect(config.language).toBe('latin');
		expect(config.languageFallback).toBe('en-US');
		expect(config.certificationCountry).toBe('DE');
		expect(config.trailerLanguages).toEqual(['original', 'en', 'de']);
		expect(config.timezone).toBe('Europe/Berlin');
		expect(config.backupHour).toBe(3);
		expect(config.backupKeep).toBe(14);
		expect(config.demoData).toBe(false);
	});

	it('takes the game values from config.yaml', () => {
		const config = load('game-values.yaml');
		expect(config.tokenAmount).toBe(2);
		expect(config.tokenWeekday).toBe(6); // saturday
		expect(config.tokenHour).toBe(18);
		expect(config.tokenCap).toBe(8);
		expect(config.language).toBe('fr-FR');
		expect(config.languageFallback).toBe('it-IT');
		expect(config.certificationCountry).toBe('CH'); // the spelling is normalised
		expect(config.trailerLanguages).toEqual(['fr', 'en']);
		expect(config.timezone).toBe('America/New_York');
		expect(config.backupHour).toBe(5);
		expect(config.backupKeep).toBe(30);
	});

	it('understands the weekday as a number too', () => {
		process.env.PV_TOKEN_WEEKDAY = '3';
		expect(load('pin-only.yaml').tokenWeekday).toBe(3);
	});

	// The heart of the invariant: a typo in the environment must not throw a
	// well-kept value from the file back to the default.
	it('ignores unusable environment values in favour of the file', () => {
		process.env.PV_TOKEN_HOUR = 'eight';
		process.env.PV_TOKEN_WEEKDAY = 'freitagabend';
		process.env.PV_TOKEN_AMOUNT = '0';
		process.env.PV_TOKEN_CAP = '4.5';
		process.env.PV_LANGUAGE = 'deutsch';
		process.env.PV_CERTIFICATION_COUNTRY = 'Schweiz';
		process.env.PV_TIMEZONE = 'Mittelerde/Auenland';
		process.env.PV_BACKUP_HOUR = '99';
		process.env.PV_BACKUP_KEEP = '0';
		const config = load('game-values.yaml');
		expect(config.tokenHour).toBe(18);
		expect(config.tokenWeekday).toBe(6);
		expect(config.tokenAmount).toBe(2);
		expect(config.tokenCap).toBe(8);
		expect(config.language).toBe('fr-FR');
		expect(config.certificationCountry).toBe('CH');
		expect(config.timezone).toBe('America/New_York');
		expect(config.backupHour).toBe(5);
		expect(config.backupKeep).toBe(30);
	});

	// The plan demands both: the file value has to win, and the origin log has to
	// attribute it to the file. Naming the environment would send the next
	// investigation in the wrong direction.
	it('attributes an ignored environment value to the file', () => {
		process.env.PV_TOKEN_HOUR = 'eight';
		process.env.PV_LANGUAGE = 'deutsch';
		process.env.PV_TIMEZONE = 'Mittelerde/Auenland';
		const origins = originsFor('game-values.yaml');
		expect(origins['Credit hour']).toBe('config.yaml');
		expect(origins['Film language']).toBe('config.yaml');
		expect(origins['Timezone']).toBe('config.yaml');
	});

	it('names the environment when its value is usable', () => {
		process.env.PV_TOKEN_HOUR = '6';
		expect(originsFor('game-values.yaml')['Credit hour']).toBe('PV_TOKEN_HOUR');
	});

	it('names the default when no source says anything', () => {
		const origins = originsFor('pin-only.yaml');
		expect(origins['Tokens per credit']).toBe('default');
		expect(origins['Backups kept']).toBe('default');
		expect(origins['Demo content']).toBe('default');
	});

	it('lists every new setting in the origin table', () => {
		expect(Object.keys(originsFor('pin-only.yaml'))).toEqual(
			expect.arrayContaining([
				'Tokens per credit',
				'Credit weekday',
				'Credit hour',
				'Token cap',
				'Film language',
				'Fallback language',
				'Certification country',
				'Trailer languages',
				'Timezone',
				'Backup hour',
				'Backups kept',
				'Demo content'
			])
		);
	});

	it('lets valid environment values win over the file', () => {
		process.env.PV_TOKEN_WEEKDAY = 'wednesday';
		process.env.PV_TOKEN_HOUR = '6';
		process.env.PV_TRAILER_LANGS = 'de,original';
		const config = load('game-values.yaml');
		expect(config.tokenWeekday).toBe(3);
		expect(config.tokenHour).toBe(6);
		expect(config.trailerLanguages).toEqual(['de', 'original']);
	});

	// UTC is not in Intl.supportedValuesOf('timeZone') but Intl.DateTimeFormat
	// accepts it without complaint. Hence the practical test.
	it('accepts common timezone aliases such as UTC', () => {
		process.env.PV_TIMEZONE = 'UTC';
		expect(load('pin-only.yaml').timezone).toBe('UTC');
	});

	it('accepts "original" as the main language and in the trailer chain', () => {
		const config = load('language-original.yaml');
		expect(config.language).toBe('original');
		expect(config.trailerLanguages).toEqual(['original', 'ja']);
	});

	// The fallback language goes to TMDB unchanged as a language parameter and
	// therefore has to be resolvable.
	it('rejects "original" as the fallback language', () => {
		expect(load('language-original.yaml').languageFallback).toBe('en-US');
	});

	it('reduces trailer languages to the language part and drops duplicates', () => {
		process.env.PV_TRAILER_LANGS = 'de-DE, de, xx-yy-zz, en';
		expect(load('pin-only.yaml').trailerLanguages).toEqual(['de', 'en']);
	});

	it('turns the demo content on through the environment', () => {
		process.env.PV_DEMO_DATA = 'true';
		expect(load('pin-only.yaml').demoData).toBe(true);
	});

	// Turning it off has to be a value of its own: if it coincided with "not set",
	// a fresh production database would get demo content even though the
	// environment cancelled it explicitly.
	it('lets the environment turn the demo content explicitly off', () => {
		process.env.PV_DEMO_DATA = 'false';
		expect(load('demo-on.yaml').demoData).toBe(false);
	});

	it('takes the demo content from config.yaml as well', () => {
		expect(load('demo-on.yaml').demoData).toBe(true);
	});

	it('ignores an unusable switch value', () => {
		process.env.PV_DEMO_DATA = 'vielleicht';
		expect(load('demo-on.yaml').demoData).toBe(true); // the file wins
	});
});

// The link to a daily build. Two settings rather than one, because an address
// without a switch would leave no way to take the link down for a while, and a
// switch without an address nothing to point at. Both default to off: an
// installation must never advertise somebody else's instance.
describe('the daily build link', () => {
	it('is off and empty without any configuration', () => {
		const config = load('pin-only.yaml');
		expect(config.dailyBuild).toBe(false);
		expect(config.dailyBuildUrl).toBe('');
	});

	it('takes both halves from config.yaml', () => {
		const config = load('daily-build.yaml');
		expect(config.dailyBuild).toBe(true);
		expect(config.dailyBuildUrl).toBe('https://daily.example.com/');
	});

	it('takes both halves from the environment', () => {
		process.env.PV_DAILY_BUILD = 'true';
		process.env.PV_DAILY_BUILD_URL = 'https://from-env.example.com';
		const config = load('pin-only.yaml');
		expect(config.dailyBuild).toBe(true);
		expect(config.dailyBuildUrl).toBe('https://from-env.example.com/');
	});

	// The switch alone has to be able to take the link down without anyone having
	// to delete the address first, that is the point of keeping the two apart.
	it('lets the environment switch a configured link off, address untouched', () => {
		process.env.PV_DAILY_BUILD = 'false';
		const config = load('daily-build.yaml');
		expect(config.dailyBuild).toBe(false);
		expect(config.dailyBuildUrl).toBe('https://daily.example.com/');
	});

	it('accepts plain http as well', () => {
		process.env.PV_DAILY_BUILD_URL = 'http://192.168.1.50:3000';
		expect(load('pin-only.yaml').dailyBuildUrl).toBe('http://192.168.1.50:3000/');
	});

	// The value ends up in an href. Everything that is not navigation is dropped
	// the same way any other unusable value is: back to the default, with a line
	// in the log.
	it.each([
		['javascript:alert(1)', 'a scheme that executes'],
		['JavaScript:alert(1)', 'the same one in mixed case'],
		['  javascript:alert(1)  ', 'the same one behind whitespace'],
		['data:text/html;base64,PHNjcmlwdD4=', 'a document inlined in the address'],
		['//evil.example.com', 'a scheme-relative address'],
		['popcornvote.example.com', 'a host without any scheme'],
		['not a url at all', 'something that is not an address']
	])('refuses %s (%s)', (value) => {
		process.env.PV_DAILY_BUILD_URL = value;
		expect(load('pin-only.yaml').dailyBuildUrl).toBe('');
	});

	// The reason the parser decides instead of a pattern: a scheme can be broken
	// up by characters a browser then throws away again. This is the case a
	// hand-written check walks past, and the documentation names it as the reason,
	// so it is pinned here rather than only asserted in prose.
	it('refuses a scheme broken up by a control character', () => {
		process.env.PV_DAILY_BUILD_URL = 'java\tscript:alert(1)';
		expect(load('pin-only.yaml').dailyBuildUrl).toBe('');
		process.env.PV_DAILY_BUILD_URL = 'java\nscript:alert(1)';
		expect(load('pin-only.yaml').dailyBuildUrl).toBe('');
	});

	// What is stored is the parser's form, not what was written: the two must not
	// be able to disagree, whatever a later reader of this value does with it.
	it('stores the parsed form rather than the written one', () => {
		process.env.PV_DAILY_BUILD_URL = 'https://example.com/a b"c';
		expect(load('pin-only.yaml').dailyBuildUrl).toBe('https://example.com/a%20b%22c');
	});

	it('refuses an unusable address from the file too', () => {
		expect(load('daily-build-javascript.yaml').dailyBuildUrl).toBe('');
	});

	// A typo in the switch would otherwise leave the link absent while the file
	// reads as though it were on, the quietest kind of misconfiguration there is.
	it('names an unknown sub-key of the daily_build block', () => {
		const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
		try {
			const config = load('daily-build-unknown-key.yaml');
			expect(config.dailyBuild).toBe(false); // `shown` has no effect
			expect(config.dailyBuildUrl).toBe('https://daily.example.com/'); // the rest is read
			expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toContain('daily_build.shown');
		} finally {
			warn.mockRestore();
		}
	});

	// Hard rule: the startup line names where a setting came from, never what it
	// says. An address is not a secret, but the table is a table of origins.
	it('names the origin of both settings, and the table carries no address', () => {
		process.env.PV_DAILY_BUILD = 'true';
		process.env.PV_DAILY_BUILD_URL = 'https://from-env.example.com';
		const origins = originsFor('pin-only.yaml');
		expect(origins['Daily build link']).toBe('PV_DAILY_BUILD');
		expect(origins['Daily build address']).toBe('PV_DAILY_BUILD_URL');
		expect(JSON.stringify(origins)).not.toContain('from-env.example.com');
	});

	it('names config.yaml as the origin when the file supplies them', () => {
		const origins = originsFor('daily-build.yaml');
		expect(origins['Daily build link']).toBe('config.yaml');
		expect(origins['Daily build address']).toBe('config.yaml');
	});
});

// The interface language is deliberately a different setting from the language
// of the movie data: whoever uses the app in English does not necessarily want
// English movie titles. These tests keep the two apart.
describe('Interface language', () => {
	it('speaks English without any setting', () => {
		const config = load('pin-only.yaml');
		expect(config.interfaceLanguage).toBe('en');
		// The movie data stays on its own default regardless.
		expect(config.language).toBe('latin');
	});

	it('takes it from the language block of config.yaml', () => {
		expect(load('language-english.yaml').interfaceLanguage).toBe('de');
	});

	it('lets the environment win over the file', () => {
		process.env.PV_INTERFACE_LANGUAGE = 'en';
		expect(load('language-english.yaml').interfaceLanguage).toBe('en');
	});

	it('accepts it in an unusual spelling too', () => {
		process.env.PV_INTERFACE_LANGUAGE = ' PT-br ';
		expect(load('pin-only.yaml').interfaceLanguage).toBe('pt-BR');
	});

	// A language that is not shipped would leave half the interface blank.
	it('ignores an unknown language with a warning', () => {
		const spy = vi.spyOn(log, 'warn').mockImplementation(() => {});
		try {
			expect(load('interface-unknown.yaml').interfaceLanguage).toBe('en');
			expect(spy.mock.calls.some(([msg]) => String(msg).includes('Interface language'))).toBe(true);
		} finally {
			spy.mockRestore();
		}
	});

	it('ignores an unusable environment value in favour of the file', () => {
		process.env.PV_INTERFACE_LANGUAGE = 'klingon';
		expect(load('language-english.yaml').interfaceLanguage).toBe('de');
	});

	it('has a line of its own in the origin table', () => {
		expect(originsFor('pin-only.yaml')['Interface language']).toBe('default');
		expect(originsFor('language-english.yaml')['Interface language']).toBe('config.yaml');
	});

	// The environment variable of the movie data must not touch the interface:
	// exactly that mix-up would switch a running instance overnight.
	it('stays untouched by PV_LANGUAGE', () => {
		process.env.PV_LANGUAGE = 'en-US';
		const config = load('pin-only.yaml');
		expect(config.language).toBe('en-US');
		expect(config.interfaceLanguage).toBe('en'); // the default, not derived
	});
});

describe('language block in config.yaml', () => {
	it('reads the English keys', () => {
		const config = load('language-english.yaml');
		expect(config.language).toBe('fr-FR');
		expect(config.languageFallback).toBe('it-IT');
		expect(config.certificationCountry).toBe('CH');
		expect(config.trailerLanguages).toEqual(['en', 'original']);
	});

	it('reads the English keys from the rest of the file too', () => {
		const config = load('game-values.yaml');
		expect(config.language).toBe('fr-FR');
		expect(config.certificationCountry).toBe('CH');
		expect(config.timezone).toBe('America/New_York');
		expect(config.backupHour).toBe(5);
		expect(config.backupKeep).toBe(30);
	});

	// `latin` is the default and a value the film language resolves itself. The
	// origin has to be checked as well: the value alone would look the same if the
	// environment variable were rejected and the default stepped in behind it.
	it('takes latin as the film language', () => {
		process.env.PV_LANGUAGE = 'latin';
		expect(load('pin-only.yaml').language).toBe('latin');
		expect(originsFor('pin-only.yaml')['Film language']).toBe('PV_LANGUAGE');
	});

	// The fallback goes to TMDB as a real language parameter, so neither
	// placeholder may reach it.
	it('refuses latin and original as the fallback language', () => {
		process.env.PV_LANGUAGE_FALLBACK = 'latin';
		expect(load('pin-only.yaml').languageFallback).toBe('en-US');
		process.env.PV_LANGUAGE_FALLBACK = 'original';
		expect(load('pin-only.yaml').languageFallback).toBe('en-US');
	});

	// Since 2.5.0 an old key is no longer refused, only ignored, so it has to be
	// named, or a 1.x file degrades to defaults without a word anywhere. The
	// fixture carries `sprache:` and `zeitzone:` for exactly this.
	// The `token:` block is the one where a silent default hurts most: a misspelt
	// weekday moves the credit to another day, and that is noticed a week later at
	// the earliest, by which time nobody connects it to an edit.
	it('names an unknown sub-key of the token block', () => {
		const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
		load('retired-blocks.yaml');
		const said = warn.mock.calls.map((c) => String(c[0])).join('\n');
		expect(said).toContain('token.weekdey');
		warn.mockRestore();
	});

	it('names a top-level key it does not read', () => {
		const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
		load('retired-blocks.yaml');
		const said = warn.mock.calls.map((c) => String(c[0])).join('\n');
		expect(said).toContain('sprache');
		expect(said).toContain('zeitzone');
		warn.mockRestore();
	});

	// The third caller, and the one a shared placeholder flag would have missed:
	// `original` is a trailer language the app resolves per film, `latin` is a mode
	// for the film data and means nothing here.
	it('takes original but not latin as a trailer language', () => {
		process.env.PV_TRAILER_LANGS = 'latin, en';
		expect(load('pin-only.yaml').trailerLanguages).toEqual(['en']);
		process.env.PV_TRAILER_LANGS = 'original, en';
		expect(load('pin-only.yaml').trailerLanguages).toEqual(['original', 'en']);
	});

	// `language: de` instead of a block with `interface: de` is the obvious
	// misreading. It must not stay silent: the interface would be English, the log
	// would say nothing, and that setting is the whole point of this version.
	it('reports a language block written as a single value', () => {
		const spy = vi.spyOn(log, 'warn').mockImplementation(() => {});
		try {
			expect(load('language-scalar.yaml').interfaceLanguage).toBe('en');
			expect(spy.mock.calls.some(([msg]) => String(msg).includes('needs sub-keys'))).toBe(true);
		} finally {
			spy.mockRestore();
		}
	});

	it('reports an unknown sub-key in the new block', () => {
		const spy = vi.spyOn(log, 'warn').mockImplementation(() => {});
		try {
			const config = load('language-unknown-key.yaml');
			expect(config.interfaceLanguage).toBe('en'); // `ui` has no effect
			expect(config.language).toBe('fr-FR'); // the rest of the block does
			expect(spy.mock.calls.some(([msg]) => String(msg).includes('language.ui'))).toBe(true);
		} finally {
			spy.mockRestore();
		}
	});

	// Counter-check with the file that carries all five documented keys: a hole in
	// the list of known keys would otherwise tell the operator to remove exactly
	// the setting this version exists for.
	it('stays silent when every sub-key is known', () => {
		const spy = vi.spyOn(log, 'warn').mockImplementation(() => {});
		try {
			load('language-english.yaml');
			expect(spy.mock.calls.some(([msg]) => String(msg).includes('is unknown'))).toBe(false);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('PIN selection', () => {
	// The most expensive misconfiguration: a placeholder from a Compose default
	// must not displace a valid PIN from the file, or the whole family locks itself
	// out without anyone seeing the cause.
	it('ignores an unusable PIN from the environment in favour of the file', () => {
		process.env.PV_PIN = 'NNNN';
		expect(load('pin-only.yaml').pin).toBe('1234');
	});

	it('lets a valid PIN from the environment win', () => {
		process.env.PV_PIN = '9876';
		expect(load('pin-only.yaml').pin).toBe('9876');
	});

	it('locks the app when both sources are unusable', () => {
		process.env.PV_PIN = 'NNNN';
		expect(load('pin-invalid.yaml').pin).toBe('');
	});

	it('locks the app without any PIN', () => {
		expect(load('without-pin.yaml').pin).toBe('');
	});
});

describe('named users', () => {
	it('ignores ambiguous login identifiers from hand-edited YAML', () => {
		const spy = vi.spyOn(log, 'warn').mockImplementation(() => {});
		try {
			const config = load('users-colliding.yaml');
			expect(config.users.map(({ id }) => id)).toEqual(['anna', 'carla', 'david']);
			expect(spy.mock.calls.some(([message]) => String(message).includes('login identifier'))).toBe(true);
			expect(spy.mock.calls.some(([message]) => String(message).includes('must be true or false'))).toBe(
				true
			);
		} finally {
			spy.mockRestore();
		}
	});
});

// The keys for the movie databases had no shape to be checked against, any
// string can be a valid key, so our own placeholders walked straight through
// and travelled to TMDB, which answered 401. What the family then read was that
// the film could not be found, and what the log claimed was that the key came
// from config.yaml.
describe('movie database keys', () => {
	it('treats the placeholders from the example as not set', () => {
		const config = load('placeholder-keys.yaml');
		expect(config.tmdbApiKey).toBe('');
		expect(config.omdbApiKey).toBe('');
	});

	it('names the placeholder as the reason, so the interface can say which one it is', () => {
		const config = load('placeholder-keys.yaml');
		expect(config.tmdbKeyState).toBe('placeholder');
		expect(config.omdbKeyState).toBe('placeholder');
	});

	it('tells a placeholder apart from no key at all', () => {
		const config = load('pin-only.yaml');
		expect(config.tmdbKeyState).toBe('missing');
		expect(config.omdbKeyState).toBe('missing');
	});

	it('does not claim config.yaml as the origin of a key it discarded', () => {
		const origins = originsFor('placeholder-keys.yaml');
		expect(origins['TMDB key']).toBe('default');
		expect(origins['OMDb key']).toBe('default');
	});

	it('lets a real key through', () => {
		const config = load('keys-in-file.yaml');
		expect(config.tmdbApiKey).toBe('tmdb-from-file');
		expect(config.tmdbKeyState).toBe('ok');
	});

	// Same reasoning as the PIN: an unusable value from the environment must not
	// throw away a usable one from the file.
	it('keeps the key from the file when the environment holds a placeholder', () => {
		process.env.TMDB_API_KEY = 'YOUR-TMDB-KEY';
		const config = load('keys-in-file.yaml');
		expect(config.tmdbApiKey).toBe('tmdb-from-file');
		expect(config.tmdbKeyState).toBe('ok');
	});

	it('reports a discarded placeholder', () => {
		const spy = vi.spyOn(log, 'warn').mockImplementation(() => {});
		try {
			load('placeholder-keys.yaml');
			const warnings = spy.mock.calls.map(([msg]) => String(msg));
			expect(warnings).toContain(
				'TMDB key from config.yaml is still the placeholder from the example and is ignored'
			);
			expect(warnings).toContain(
				'OMDb key from config.yaml is still the placeholder from the example and is ignored'
			);
		} finally {
			spy.mockRestore();
		}
	});
});

// What may prove a request arrived over HTTPS. Neither variable is ours, both
// belong to adapter-node, but the cookie flag hangs on them, so the startup
// line has to name which one spoke.
describe('the HTTPS proof', () => {
	it('is nothing at all when neither variable is set', () => {
		expect(load('complete.yaml').httpsProof).toEqual({ mode: 'none' });
		expect(originsFor('complete.yaml')['HTTPS proof']).toBe('none');
	});

	it('keeps the header name the operator chose', () => {
		process.env.PROTOCOL_HEADER = 'X-Scheme';
		expect(load('complete.yaml').httpsProof).toEqual({ mode: 'header', header: 'x-scheme' });
		expect(originsFor('complete.yaml')['HTTPS proof']).toBe('PROTOCOL_HEADER');
	});

	it('takes an https ORIGIN as proof for every request', () => {
		process.env.ORIGIN = 'https://popcornvote.example.com';
		expect(load('complete.yaml').httpsProof).toEqual({ mode: 'origin' });
		expect(originsFor('complete.yaml')['HTTPS proof']).toBe('ORIGIN');
	});

	it('does not take an http ORIGIN as proof of anything', () => {
		process.env.ORIGIN = 'http://popcorn.local:8300';
		expect(load('complete.yaml').httpsProof).toEqual({ mode: 'none' });
	});

	// A header name has to be a token. `Headers.get()` throws on anything else
	// rather than answering, and that throw would land on every request that
	// writes a cookie, which after one sign-in is every request. adapter-node
	// looks the name up on a plain object and stays quiet about the same typo.
	it('refuses a header name that is not a header name, and says so', () => {
		const spy = vi.spyOn(log, 'warn').mockImplementation(() => {});
		try {
			// Outer whitespace is trimmed by `env()` and is therefore not a case
			// here; what has to be caught is a name that is not a token at all.
			for (const bad of ['X-Forwarded-Proto: https', 'x forwarded proto', 'x-forwarded/proto']) {
				process.env.PROTOCOL_HEADER = bad;
				expect(loadConfig(true).httpsProof).toEqual({ mode: 'none' });
			}
			expect(spy.mock.calls.map(([msg]) => String(msg))).toContain(
				'PROTOCOL_HEADER is unusable (a header name such as x-forwarded-proto) and is ignored'
			);
		} finally {
			spy.mockRestore();
		}
	});

	it('falls back to ORIGIN when the header name is unusable', () => {
		vi.spyOn(log, 'warn').mockImplementation(() => {});
		process.env.PROTOCOL_HEADER = 'not a header';
		process.env.ORIGIN = 'https://popcornvote.example.com';
		expect(load('complete.yaml').httpsProof).toEqual({ mode: 'origin' });
		vi.restoreAllMocks();
	});

	// adapter-node ignores PROTOCOL_HEADER once ORIGIN is set; this app does the
	// opposite. Whoever sets both should not have to find that out by experiment.
	it('warns when both are set, because the two disagree about which wins', () => {
		const spy = vi.spyOn(log, 'warn').mockImplementation(() => {});
		try {
			process.env.PROTOCOL_HEADER = 'x-forwarded-proto';
			process.env.ORIGIN = 'https://popcornvote.example.com';
			load('complete.yaml');
			expect(spy.mock.calls.map(([msg]) => String(msg)).join(' ')).toContain(
				'PROTOCOL_HEADER and ORIGIN are both set'
			);
		} finally {
			spy.mockRestore();
		}
	});

	// The header is the more precise of the two: it judges each request on what it
	// carries, while ORIGIN speaks for all of them at once.
	it('prefers the header over ORIGIN when both are set', () => {
		process.env.PROTOCOL_HEADER = 'x-forwarded-proto';
		process.env.ORIGIN = 'https://popcornvote.example.com';
		expect(load('complete.yaml').httpsProof).toEqual({
			mode: 'header',
			header: 'x-forwarded-proto'
		});
	});

	it('says in words that cookies stay unmarked when nothing is configured', () => {
		const spy = vi.spyOn(log, 'info').mockImplementation(() => {});
		try {
			load('complete.yaml');
			const lines = spy.mock.calls.map(([msg]) => String(msg));
			expect(lines.some((line) => line.includes('not marked Secure'))).toBe(true);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('the address header warning', () => {
	/** Everything said through log.warn while the configuration is loaded. */
	function warningsFor(file: string): string {
		const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
		try {
			load(file);
			return warn.mock.calls.map((c) => String(c[0])).join('\n');
		} finally {
			warn.mockRestore();
		}
	}

	it('says so when ADDRESS_HEADER is set, because the app cannot tell whether a proxy is in front', () => {
		process.env.ADDRESS_HEADER = 'x-forwarded-for';
		const said = warningsFor('pin-only.yaml');
		expect(said).toContain('ADDRESS_HEADER');
		// The consequence has to be named, not just the setting: whoever reads
		// this needs to know what to check, not that something is configured.
		expect(said).toContain('reverse proxy');
	});

	it('names the header it found, so a wrong one is recognisable', () => {
		process.env.ADDRESS_HEADER = 'cf-connecting-ip';
		expect(warningsFor('pin-only.yaml')).toContain('cf-connecting-ip');
	});

	it('stays quiet when it is unset, which is right for a direct install', () => {
		delete process.env.ADDRESS_HEADER;
		expect(warningsFor('pin-only.yaml')).not.toContain('ADDRESS_HEADER');
	});
});
