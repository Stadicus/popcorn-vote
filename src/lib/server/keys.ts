import crypto from 'node:crypto';
import type { MessageKey } from '$lib/i18n/catalogues';
import type { AppConfig, ConfiguredKeyState } from './config';
import { log } from './log';

/** The two movie databases the app talks to. */
export type Provider = 'tmdb' | 'omdb';

/**
 * `rejected` is the fourth state, the one the configuration cannot see: the key
 * has the shape of a key, somebody meant it seriously, and the provider still
 * answers 401. The other three come straight from `config.ts`.
 */
export type KeyState = ConfiguredKeyState | 'rejected';

/**
 * Which key each provider has already turned down.
 *
 * Module state deliberately, and no contradiction to the rule about the
 * language: a rejected key belongs to the instance, not to the request, one
 * container serves one family with one pair of keys, and the answer would be the
 * same for everybody. What is kept is a fingerprint rather than the key itself,
 * so nothing here can ever hand it back out, and a corrected key counts as a
 * fresh one instead of inheriting the old verdict.
 *
 * Both writers below are synchronous, so two requests in flight cannot tear the
 * value between them, but the later answer wins, whichever was asked first. A
 * 401 that resolves after a 200 therefore leaves the key looking refused for a
 * moment. That corrects itself on the next real answer, and the alternative
 * (sequence numbers on a two-field record) buys accuracy nobody would notice.
 */
const rejected: Record<Provider, string | null> = { tmdb: null, omdb: null };

const NAMES: Record<Provider, string> = { tmdb: 'TMDB', omdb: 'OMDb' };

function fingerprint(key: string): string {
	return crypto.createHash('sha256').update(key).digest('hex');
}

/**
 * Records that the provider turned the key down. Noted once rather than logged
 * on every request, which would bury everything else while somebody types in the
 * search field.
 */
export function noteRejected(provider: Provider, key: string): void {
	if (!key) return;
	const mark = fingerprint(key);
	if (rejected[provider] === mark) return;
	rejected[provider] = mark;
	log.warn(`${NAMES[provider]} rejected the configured key`);
}

/**
 * Records that the provider answered normally, which takes an earlier refusal
 * back.
 *
 * Without this the verdict would be a one-way street: a key suspended for an
 * hour, or a provider having a bad afternoon, would count as refused until the
 * next restart, and the notice would seal itself in, because the interface
 * stops sending the very requests that could prove it wrong.
 */
export function noteAccepted(provider: Provider, key: string): void {
	if (!key || rejected[provider] === null) return;
	if (rejected[provider] !== fingerprint(key)) return;
	rejected[provider] = null;
	log.info(`${NAMES[provider]} accepted the configured key again`);
}

/** What is wrong with the key, or `ok`. Never the key itself. */
export function keyState(config: AppConfig, provider: Provider): KeyState {
	const configured = provider === 'tmdb' ? config.tmdbKeyState : config.omdbKeyState;
	if (configured !== 'ok') return configured;
	const key = provider === 'tmdb' ? config.tmdbApiKey : config.omdbApiKey;
	return rejected[provider] === fingerprint(key) ? 'rejected' : 'ok';
}

const MESSAGES: Record<Provider, Record<Exclude<KeyState, 'ok'>, MessageKey>> = {
	tmdb: {
		missing: 'keys.tmdbMissing',
		placeholder: 'keys.tmdbPlaceholder',
		rejected: 'keys.tmdbRejected'
	},
	omdb: {
		missing: 'keys.omdbMissing',
		placeholder: 'keys.omdbPlaceholder',
		rejected: 'keys.omdbRejected'
	}
};

/**
 * The catalogue key that names the problem, or `null` when there is none. A key
 * rather than a finished sentence, for the same reason `RuleError` carries one:
 * the language belongs to the request, and this travels to the browser as well.
 *
 * The sentence names the cause only, never the consequence. Whoever shows it
 * puts the consequence in front of it, the search on the suggestion page, the
 * IMDb rating under "More", because the same bad key means something different
 * depending on where you are standing when you meet it.
 */
export function keyProblem(config: AppConfig, provider: Provider): MessageKey | null {
	const state = keyState(config, provider);
	return state === 'ok' ? null : MESSAGES[provider][state];
}

/** Tests only: the module state would otherwise leak from one case into the next. */
export function forgetRejections(): void {
	rejected.tmdb = null;
	rejected.omdb = null;
}
