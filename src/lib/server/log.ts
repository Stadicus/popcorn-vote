// Structured logging: one JSON line per event, easy to filter in the container
// log. The level is set through LOG_LEVEL (debug | info | warn | error).
//
// This is the one setting that cannot go through `choose()` like the rest: the
// logger is imported by config.ts itself and has to work before any
// configuration exists. It therefore never appears in the "Configuration loaded"
// line either.

export type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Spelt in any case: `LOG_LEVEL=ERROR` used to fall back to info without a word.
// Empty counts as not set, as everywhere else, Compose writes an empty string
// for `${LOG_LEVEL}` with no .env entry, which is the ordinary installation.
const configured = process.env.LOG_LEVEL?.trim().toLowerCase() as Level | undefined;
const minLevel: number = (configured ? ORDER[configured] : undefined) ?? ORDER.info;

/** How deep a chain of causes is followed. Enough for fetch → network error. */
const CAUSE_DEPTH = 3;

/**
 * How much of a message or a stack is kept. A malformed address arrives as
 * `Failed to decode URI: …` with the whole path in it, and that path is a
 * stranger's choice, shortening the `path` field alone would leave the same
 * kilobytes sitting in the cause.
 */
const TEXT_LIMIT = 400;

function clip(text: string | undefined): string | undefined {
	if (text === undefined) return undefined;
	return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text;
}

/** At most this many parts of an `AggregateError`; the depth limit alone bounds nothing sideways. */
const PARTS_LIMIT = 10;

/**
 * Anything at all, as a string, without trusting it to have a `toString`. An
 * object from `Object.create(null)` throws on conversion, and a thrown value is
 * exactly where such an object turns up.
 */
function asText(value: unknown): string {
	try {
		return clip(String(value)) ?? '';
	} catch {
		return '[unprintable]';
	}
}

/** A property that may be a getter somebody wrote badly. */
function read(get: () => string | undefined): string | undefined {
	try {
		return clip(get());
	} catch {
		return '[unreadable]';
	}
}

/**
 * An error as it should read in the log. `cause` is followed because the most
 * common real failure here arrives as a bare `TypeError: fetch failed` from
 * undici, the reason anybody actually needs (ENOTFOUND, ECONNREFUSED) sits one
 * level down. An `AggregateError` keeps its parts for the same reason.
 *
 * Every step guards itself. This runs inside `handleError`, and a throw from
 * there is caught by nobody: it would end the process rather than produce an
 * error page, which is a heavier price than a missing field.
 */
function describe(err: Error, depth = 0): Record<string, unknown> {
	const out: Record<string, unknown> = {
		message: read(() => err.message),
		stack: read(() => err.stack)
	};
	if (depth >= CAUSE_DEPTH) return out;

	let cause: unknown;
	try {
		cause = err.cause;
	} catch {
		cause = '[unreadable]';
	}
	if (isError(cause)) out.cause = describe(cause, depth + 1);
	else if (cause !== undefined) out.cause = asText(cause);

	let parts: unknown;
	try {
		parts = (err as AggregateError).errors;
	} catch {
		parts = undefined;
	}
	if (Array.isArray(parts)) {
		out.errors = parts.slice(0, PARTS_LIMIT).map((e) => (isError(e) ? describe(e, depth + 1) : asText(e)));
		if (parts.length > PARTS_LIMIT) out.errorsLeftOut = parts.length - PARTS_LIMIT;
	}
	return out;
}

/** `instanceof` runs a proxy trap that can throw; this one cannot. */
function isError(value: unknown): value is Error {
	try {
		return value instanceof Error;
	} catch {
		return false;
	}
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>): void {
	if (ORDER[level] < minLevel) return;
	let line: string;
	try {
		// Building the entry belongs inside the guard, not before it: describing an
		// error touches foreign objects, and one of them throwing here would take
		// the same fatal route as a failed stringify.
		const entry: Record<string, unknown> = { ts: new Date().toISOString(), level, msg };
		for (const [key, value] of Object.entries(fields ?? {})) {
			entry[key] = isError(value) ? describe(value) : value;
		}
		line = JSON.stringify(entry);
	} catch {
		// A circular or otherwise unserialisable field must not take the log line
		// with it. That would be bad enough in `handled()`, where the original
		// cause would be lost, and fatal inside `handleError`, whose own throw
		// nobody catches and which would end the process instead of showing an
		// error page.
		//
		// The plain values are kept, above all the reference: the screen names it
		// whatever happens here, and a reference with no line behind it is worse
		// than none at all.
		const plain: Record<string, unknown> = { ts: new Date().toISOString(), level, msg };
		try {
			// Walking the fields is what threw a moment ago. Doing it again in the
			// same way would throw in the same place, and out of here there is no
			// third attempt, from `handleError` that ends the process.
			for (const [key, value] of Object.entries(fields ?? {})) {
				const kind = typeof value;
				if (kind === 'string' || kind === 'number' || kind === 'boolean') plain[key] = value;
			}
		} catch {
			plain.fieldsUnreadable = true;
		}
		plain.unserialisableFields = true;
		line = JSON.stringify(plain);
	}
	if (level === 'error' || level === 'warn') console.error(line);
	else console.log(line);
}

/**
 * Would a line at this level be written at all? Only whoever hands out a
 * reference needs to ask: `LOG_LEVEL=error` swallows the warnings, and a
 * reference on screen that no line answers to is worse than none.
 */
export function writes(level: Level): boolean {
	return ORDER[level] >= minLevel;
}

export const log = {
	debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
	info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
	warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
	error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields)
};
