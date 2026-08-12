import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { log } from './log';

// The log is the only thing left of a failure once the container has been
// restarted. What it drops is gone for good, and a line it cannot write at all
// takes the failure it was describing with it.

/** Captures the one line an emit writes, already parsed. */
function captured(write: () => void): Record<string, unknown> {
	const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
	try {
		write();
		expect(spy).toHaveBeenCalledOnce();
		return JSON.parse(spy.mock.calls[0][0] as string);
	} finally {
		spy.mockRestore();
	}
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('log', () => {
	it('writes one parseable JSON line per event', () => {
		const line = captured(() => log.error('It broke', { where: 'here' }));
		expect(line.level).toBe('error');
		expect(line.msg).toBe('It broke');
		expect(line.where).toBe('here');
		expect(typeof line.ts).toBe('string');
	});

	// This is the common real failure on a home server: the network hiccups and
	// Node hands over a bare "fetch failed". The reason worth having sits one
	// level below, and used to be dropped on the floor.
	it('follows the chain of causes', () => {
		const inner = new Error('getaddrinfo ENOTFOUND api.themoviedb.org');
		const outer = new Error('fetch failed', { cause: inner });
		const line = captured(() => log.error('Movie search failed', { err: outer }));

		const err = line.err as Record<string, unknown>;
		expect(err.message).toBe('fetch failed');
		expect((err.cause as Record<string, unknown>).message).toContain('ENOTFOUND');
	});

	it('keeps the parts of an AggregateError', () => {
		const parts = new AggregateError([new Error('IPv6 refused'), new Error('IPv4 refused')], '');
		const line = captured(() => log.error('Everything refused', { err: parts }));

		const errors = (line.err as Record<string, unknown>).errors as Record<string, unknown>[];
		expect(errors).toHaveLength(2);
		expect(errors[0].message).toBe('IPv6 refused');
	});

	// Otherwise the chain would be walked as far as the objects reach.
	it('stops following causes at some depth', () => {
		let err = new Error('bottom');
		for (let i = 0; i < 10; i++) err = new Error(`level ${i}`, { cause: err });
		const line = captured(() => log.error('Deep', { err }));

		let node = line.err as Record<string, unknown>;
		let depth = 0;
		while (node.cause && typeof node.cause === 'object') {
			node = node.cause as Record<string, unknown>;
			depth++;
		}
		expect(depth).toBeLessThanOrEqual(3);
	});

	// A line that cannot be written must not take the failure with it. Inside
	// handleError that would be fatal: nobody catches a throw from there, and the
	// process would end instead of an error page appearing.
	it('still writes a line when a field cannot be serialised', () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		const line = captured(() => log.error('It broke', { circular }));
		expect(line.msg).toBe('It broke');
		expect(line.unserialisableFields).toBe(true);
	});

	// The screen names the reference whatever happens in here. One that leads to
	// no line is worse than none at all, so the plain values survive the fallback.
	it('keeps the plain fields when the rest cannot be serialised', () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;

		const line = captured(() =>
			log.error('It broke', { reference: '4f2a1b3c', status: 500, path: '/api/stake', circular })
		);
		expect(line.reference).toBe('4f2a1b3c');
		expect(line.status).toBe(500);
		expect(line.path).toBe('/api/stake');
		expect(line.unserialisableFields).toBe(true);
	});

	// A malformed address arrives as `Failed to decode URI: …` with the whole
	// path inside the message. Shortening the path field alone would leave the
	// same kilobytes sitting in the cause, so the text is cut as well.
	it('cuts a message somebody padded out', () => {
		const err = new Error(`Failed to decode URI: /favicon${'x'.repeat(5000)}`);
		const line = captured(() => log.error('Bad address', { err }));

		const message = (line.err as Record<string, unknown>).message as string;
		expect(message.length).toBeLessThan(500);
		expect(message.endsWith('\u2026')).toBe(true);
	});
});

// Building the line touches foreign objects. Inside handleError a throw from
// here is caught by nobody -- it would end the process instead of producing an
// error page, so every one of these has to come back as a line.
describe('a line that fights back', () => {
	it('survives a cause that cannot be turned into text', () => {
		const bare = Object.create(null);
		const line = captured(() => log.error('It broke', { err: new Error('outer', { cause: bare }) }));
		expect(line.msg).toBe('It broke');
		expect((line.err as Record<string, unknown>).message).toBe('outer');
	});

	it('survives a stack that throws when read', () => {
		const err = new Error('outer');
		Object.defineProperty(err, 'stack', {
			get() {
				throw new Error('no stack for you');
			}
		});
		const line = captured(() => log.error('It broke', { err }));
		expect((line.err as Record<string, unknown>).message).toBe('outer');
		expect((line.err as Record<string, unknown>).stack).toBe('[unreadable]');
	});

	it('survives a proxy whose traps throw', () => {
		const hostile = new Proxy(
			{},
			{
				getPrototypeOf() {
					throw new Error('no prototype for you');
				},
				get() {
					throw new Error('no properties for you');
				}
			}
		);
		const line = captured(() => log.error('It broke', { err: new Error('outer', { cause: hostile }) }));
		expect(line.msg).toBe('It broke');
	});

	// Depth alone bounds nothing sideways: a thousand parts at three levels is a
	// billion nodes, each carrying a stack.
	it('keeps only the first handful of an AggregateError', () => {
		const parts = Array.from({ length: 100 }, (_, i) => new Error(`part ${i}`));
		const line = captured(() => log.error('Everything refused', { err: new AggregateError(parts, '') }));

		const err = line.err as Record<string, unknown>;
		expect((err.errors as unknown[]).length).toBe(10);
		expect(err.errorsLeftOut).toBe(90);
	});

	it('cuts a cause that is a long piece of text rather than an error', () => {
		const err = new Error('outer', { cause: 'x'.repeat(5000) });
		const line = captured(() => log.error('It broke', { err }));
		expect(((line.err as Record<string, unknown>).cause as string).length).toBeLessThan(500);
	});
});

// The level is read once when the module loads, so each case needs its own.
describe('LOG_LEVEL', () => {
	const saved = process.env.LOG_LEVEL;

	beforeEach(() => {
		vi.resetModules();
	});

	afterEach(() => {
		if (saved === undefined) delete process.env.LOG_LEVEL;
		else process.env.LOG_LEVEL = saved;
	});

	async function debugWritten(value: string | undefined): Promise<boolean> {
		if (value === undefined) delete process.env.LOG_LEVEL;
		else process.env.LOG_LEVEL = value;
		// `vi.resetModules()` in beforeEach makes this a fresh evaluation.
		const fresh = await import('./log');
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		try {
			(fresh.log as typeof log).debug('quiet');
			return spy.mock.calls.length > 0;
		} finally {
			spy.mockRestore();
		}
	}

	// Compose writes an empty string for `${LOG_LEVEL}` with no .env entry, which
	// is the ordinary installation. Treated as a level it would let everything
	// through, including debug.
	it('treats an empty value as not set', async () => {
		expect(await debugWritten('')).toBe(false);
		expect(await debugWritten('   ')).toBe(false);
	});

	it('is silent about debug without any value', async () => {
		expect(await debugWritten(undefined)).toBe(false);
	});

	it('reads the level whatever case it is written in', async () => {
		expect(await debugWritten('DEBUG')).toBe(true);
		expect(await debugWritten('debug')).toBe(true);
	});

	it('falls back to the default for something unusable', async () => {
		expect(await debugWritten('chatty')).toBe(false);
	});
});
