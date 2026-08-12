import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { AppConfig, ConfiguredKeyState } from './config';
import { forgetRejections, keyProblem, keyState, noteAccepted, noteRejected } from './keys';
import { log } from './log';

// Three of the four states come from the configuration; the fourth only shows
// when the provider answers. What is checked here is that they never get mixed
// up, a rejected key must not be reported as missing, and a corrected key must
// not inherit the old verdict.

function configWith(tmdb: string, omdb = ''): AppConfig {
	const state = (key: string): ConfiguredKeyState => (key ? 'ok' : 'missing');
	return {
		tmdbApiKey: tmdb,
		omdbApiKey: omdb,
		tmdbKeyState: state(tmdb),
		omdbKeyState: state(omdb)
	} as AppConfig;
}

beforeEach(() => {
	forgetRejections();
});

afterEach(() => {
	forgetRejections();
});

describe('key state', () => {
	it('reports a configured key as usable until something says otherwise', () => {
		const config = configWith('a-real-key');
		expect(keyState(config, 'tmdb')).toBe('ok');
		expect(keyProblem(config, 'tmdb')).toBeNull();
	});

	it('passes the reason from the configuration through unchanged', () => {
		const config = { ...configWith(''), tmdbKeyState: 'placeholder' } as AppConfig;
		expect(keyState(config, 'tmdb')).toBe('placeholder');
		expect(keyProblem(config, 'tmdb')).toBe('keys.tmdbPlaceholder');
	});

	it('names a missing key', () => {
		expect(keyProblem(configWith(''), 'tmdb')).toBe('keys.tmdbMissing');
	});

	it('keeps the two providers apart', () => {
		const config = configWith('a-real-key');
		expect(keyProblem(config, 'tmdb')).toBeNull();
		expect(keyProblem(config, 'omdb')).toBe('keys.omdbMissing');
	});
});

describe('a key the provider refuses', () => {
	it('remembers the refusal', () => {
		const config = configWith('a-refused-key');
		noteRejected('tmdb', config.tmdbApiKey);
		expect(keyState(config, 'tmdb')).toBe('rejected');
		expect(keyProblem(config, 'tmdb')).toBe('keys.tmdbRejected');
	});

	// The verdict belongs to that one key, not to the provider. Otherwise a
	// corrected key would still count as refused, and the interface would keep
	// reporting a problem that has been fixed.
	it('does not hold it against a different key', () => {
		noteRejected('tmdb', 'the-old-key');
		expect(keyState(configWith('the-new-key'), 'tmdb')).toBe('ok');
	});

	it('does not spill from one provider to the other', () => {
		const config = configWith('same-key', 'same-key');
		noteRejected('tmdb', 'same-key');
		expect(keyState(config, 'tmdb')).toBe('rejected');
		expect(keyState(config, 'omdb')).toBe('ok');
	});

	// The operator gets one line, not one per request: the log would otherwise
	// bury everything else while somebody types in the search field.
	it('reports itself once', () => {
		const spy = vi.spyOn(log, 'warn').mockImplementation(() => {});
		try {
			noteRejected('tmdb', 'a-refused-key');
			noteRejected('tmdb', 'a-refused-key');
			noteRejected('tmdb', 'a-refused-key');
			expect(spy.mock.calls.filter(([msg]) => String(msg).includes('rejected'))).toHaveLength(1);
		} finally {
			spy.mockRestore();
		}
	});

	// Nothing to refuse, and nothing that could be told apart later: an empty key
	// is already `missing`, and marking it would make every empty key look refused.
	it('ignores an empty key', () => {
		noteRejected('tmdb', '');
		expect(keyState(configWith(''), 'tmdb')).toBe('missing');
	});
});

// The verdict has to have a way out. Without one, a provider having a bad hour
// leaves the app claiming a bad key until the container is restarted, and the
// interface stops sending the requests that could disprove it.
describe('a refusal taken back', () => {
	it('clears on the next good answer', () => {
		const config = configWith('a-key');
		noteRejected('tmdb', 'a-key');
		expect(keyState(config, 'tmdb')).toBe('rejected');
		noteAccepted('tmdb', 'a-key');
		expect(keyState(config, 'tmdb')).toBe('ok');
	});

	it('leaves the other provider where it was', () => {
		const config = configWith('same-key', 'same-key');
		noteRejected('tmdb', 'same-key');
		noteRejected('omdb', 'same-key');
		noteAccepted('tmdb', 'same-key');
		expect(keyState(config, 'tmdb')).toBe('ok');
		expect(keyState(config, 'omdb')).toBe('rejected');
	});

	// A good answer for one key says nothing about another one.
	it('does not clear a refusal that belongs to a different key', () => {
		noteRejected('tmdb', 'the-refused-key');
		noteAccepted('tmdb', 'some-other-key');
		expect(keyState(configWith('the-refused-key'), 'tmdb')).toBe('rejected');
	});

	it('says nothing when there was nothing to take back', () => {
		const spy = vi.spyOn(log, 'info').mockImplementation(() => {});
		try {
			noteAccepted('tmdb', 'a-key');
			expect(spy).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
		}
	});
});
