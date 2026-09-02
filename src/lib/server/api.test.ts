import { describe, it, expect, vi } from 'vitest';
import { json } from '@sveltejs/kit';
import { translator } from '$lib/i18n/translate';
import { handled, logFailure, requestJsonObject, requirePerson, shortPath } from './api';
import { RuleError } from './game';
import { log } from './log';

// `handled()` is where a broken rule turns into a sentence on the screen. Since
// RuleError carries a key rather than a finished sentence, this function alone
// decides which language the family reads its error message in.

/** Only the fields `handled()` and `requirePerson()` actually touch. */
function locals(locale: 'de' | 'en', personId: string | null = 'anna'): App.Locals {
	const config = {
		members: [
			{ id: 'anna', name: 'Anna', color: '#e63946', emoji: '' },
			{ id: 'ben', name: 'Ben', color: '#457b9d', emoji: '' },
			{ id: 'cleo', name: 'Cleo', color: '#2a9d8f', emoji: '' }
		]
	};
	return { locale, t: translator(locale), personId, config } as unknown as App.Locals;
}

describe('handled()', () => {
	it('passes through the answer of a call that did not fail', async () => {
		const res = await handled(locals('en'), () => json({ ok: true }));
		expect(res.status).toBe(200);
		await expect(res.json()).resolves.toEqual({ ok: true });
	});

	it('turns a broken rule into a 400 with the sentence of the request language', async () => {
		const broken = () => {
			throw new RuleError('rule.noFreeToken');
		};

		const german = await handled(locals('de'), broken);
		expect(german.status).toBe(400);
		await expect(german.json()).resolves.toEqual({ error: 'Du hast keine Stimmen mehr.' });

		const english = await handled(locals('en'), broken);
		await expect(english.json()).resolves.toEqual({ error: 'You have no votes left.' });
	});

	it('substitutes the parameters of a broken rule', async () => {
		const res = await handled(locals('de'), () => {
			throw new RuleError('rule.importTooMany', { max: 200 });
		});
		await expect(res.json()).resolves.toEqual({
			error: 'Höchstens 200 Filme auf einmal importieren.'
		});
	});

	it('turns person ids into names, in the language of the request', async () => {
		const broken = () => {
			throw new RuleError('rule.allBlocked', undefined, ['ben', 'cleo']);
		};

		const english = await handled(locals('en'), broken);
		expect((await english.json()).error).toContain('Ben and Cleo');

		const german = await handled(locals('de'), broken);
		expect((await german.json()).error).toContain('Ben und Cleo');
	});

	// A name that is no longer configured must not silently drop out of the
	// sentence, or the message blames fewer people than the rule actually did.
	it('leaves an id that belongs to nobody standing as the id', async () => {
		const res = await handled(locals('en'), () => {
			throw new RuleError('rule.blockedByAbsent', undefined, ['mia']);
		});
		expect((await res.json()).error).toContain('mia');
	});

	it('fills {names} in both rules that carry people', async () => {
		for (const key of ['rule.allBlocked', 'rule.blockedByAbsent'] as const) {
			const res = await handled(locals('en'), () => {
				throw new RuleError(key, undefined, ['ben']);
			});
			const { error } = await res.json();
			expect(error, key).toContain('Ben');
			expect(error, key).not.toContain('{names}');
		}
	});

	it('turns everything else into a 500 that does not leak the inner error', async () => {
		const spy = vi.spyOn(log, 'error').mockImplementation(() => {});
		try {
			const res = await handled(locals('de'), () => {
				throw new Error('SELECT * FROM movies failed');
			});
			expect(res.status).toBe(500);
			// The operator gets the cause in the log, the family only the notice .
			// plus a reference that says nothing in itself but finds the line.
			const body = await res.json();
			expect(body.error).toBe('Da ist etwas schiefgelaufen. Noch einmal versuchen.');
			expect(body.reference).toMatch(/^[0-9a-f]{8}$/);
			expect(JSON.stringify(body)).not.toContain('SELECT');
			expect(Object.keys(body).sort()).toEqual(['error', 'reference']);

			expect(spy).toHaveBeenCalledOnce();
			// The same reference has to be in the log, or it points nowhere.
			const [msg, fields] = spy.mock.calls[0] as [string, Record<string, unknown>];
			expect(msg).toContain('Unexpected error');
			expect(fields.reference).toBe(body.reference);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('requirePerson()', () => {
	it('returns the chosen person', () => {
		expect(requirePerson(locals('de', 'ben'))).toBe('ben');
	});

	it('throws a broken rule with a key when nobody is chosen', async () => {
		expect(() => requirePerson(locals('de', null))).toThrow(RuleError);
		// And through handled() that reaches the caller as a translated sentence.
		const res = await handled(locals('en', null), () => json({ ok: requirePerson(locals('en', null)) }));
		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({
			error: 'Choose who you are first.'
		});
	});
});

describe('requestJsonObject()', () => {
	it('returns an ordinary JSON object', async () => {
		const request = new Request('http://localhost/api/stake', {
			method: 'POST',
			body: JSON.stringify({ movieId: 7 })
		});
		await expect(requestJsonObject(request)).resolves.toEqual({ movieId: 7 });
	});

	it.each(['{', 'null', '[]', '"text"'])('turns body %j into a translated 400', async (body) => {
		const request = new Request('http://localhost/api/stake', { method: 'POST', body });
		const response = await handled(locals('en'), async () =>
			json({ body: await requestJsonObject(request) })
		);
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: 'The request is invalid.' });
	});
});

// `logFailure()` mints the reference and writes the line. Both ways into it --
// this file's `handled()` and `handleError` in hooks.server.ts -- share it, so
// that the reference on the screen and the one in the log cannot drift apart.
describe('logFailure()', () => {
	it('writes one error line for a 500 and hands back its reference', () => {
		const spy = vi.spyOn(log, 'error').mockImplementation(() => {});
		try {
			const reference = logFailure('It broke', 500, new Error('inner'), {
				method: 'POST',
				path: '/api/stake'
			});
			expect(reference).toMatch(/^[0-9a-f]{8}$/);
			expect(spy).toHaveBeenCalledOnce();
			const [msg, fields] = spy.mock.calls[0] as [string, Record<string, unknown>];
			expect(msg).toBe('It broke');
			expect(fields).toMatchObject({ reference, status: 500, method: 'POST', path: '/api/stake' });
		} finally {
			spy.mockRestore();
		}
	});

	// A mangled address arrives as a 400 and can be sent without a PIN. Recorded,
	// but not as an error -- otherwise anyone could fill the day's error filter
	// from outside.
	it('records anything below 500 as a warning instead', () => {
		const errors = vi.spyOn(log, 'error').mockImplementation(() => {});
		const warns = vi.spyOn(log, 'warn').mockImplementation(() => {});
		try {
			logFailure('Bad address', 400, new Error('Malformed URI'));
			expect(errors).not.toHaveBeenCalled();
			expect(warns).toHaveBeenCalledOnce();
		} finally {
			errors.mockRestore();
			warns.mockRestore();
		}
	});

	// `LOG_LEVEL=error` swallows the warnings. A reference read out to somebody
	// who then finds no line for it is worse than no reference at all, so none is
	// handed out.
	it('hands out no reference when the line would not be written', async () => {
		const saved = process.env.LOG_LEVEL;
		process.env.LOG_LEVEL = 'error';
		vi.resetModules();
		// Spying on the imported `log` would miss: after resetModules the fresh
		// `./api` reaches a freshly evaluated `./log`, a different object. The
		// console is the one thing both of them end up at.
		const written = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const fresh = await import('./api');
			expect(fresh.logFailure('Bad address', 400, new Error('Malformed URI'))).toBeUndefined();
			expect(written).not.toHaveBeenCalled();

			// An error still gets one: that level is written whatever the setting.
			expect(fresh.logFailure('It broke', 500, new Error('inner'))).toMatch(/^[0-9a-f]{8}$/);
			expect(written).toHaveBeenCalledOnce();
		} finally {
			if (saved === undefined) delete process.env.LOG_LEVEL;
			else process.env.LOG_LEVEL = saved;
			vi.resetModules();
			written.mockRestore();
		}
	});

	it('gives every failure its own reference', () => {
		const spy = vi.spyOn(log, 'error').mockImplementation(() => {});
		try {
			const seen = new Set(Array.from({ length: 50 }, () => logFailure('It broke', 500, new Error('inner'))));
			expect(seen.size).toBe(50);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('shortPath()', () => {
	it('leaves an ordinary address alone', () => {
		expect(shortPath('/api/movies/42')).toBe('/api/movies/42');
	});

	// `/favicon...` and `/_app/...` are open without a PIN and match by prefix, so
	// whatever follows is a stranger's choice and must not reach the log in full.
	it('shortens an address somebody padded out', () => {
		const padded = `/favicon${'x'.repeat(5000)}`;
		const short = shortPath(padded);
		expect(short.length).toBeLessThan(padded.length);
		expect(short.startsWith('/favicon')).toBe(true);
		expect(short.endsWith('\u2026')).toBe(true);
	});
});
