import { json } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { randomUUID } from 'node:crypto';
import { listNames as joinNames } from '$lib/member';
import { RuleError } from './game';
import { log, writes } from './log';

/**
 * Which address and method produced an error. Fourteen endpoints hang behind
 * `handled()`, and a log line naming none of them is barely worth reading weeks
 * later.
 */
function requestContext(): { method?: string; path?: string } {
	try {
		const event = getRequestEvent();
		return { method: event.request.method, path: shortPath(event.url.pathname) };
	} catch {
		// Only reachable outside a request, which in practice means the unit tests:
		// they call handled() directly to check its answer, with no server around
		// it. The log line is then simply one field shorter.
		return {};
	}
}

/**
 * A path long enough to identify the route and no longer. Some paths are open
 * without a PIN (`/favicon…`, `/_app/…` match by prefix), so anybody who can
 * reach the app can put kilobytes of their own choosing in front of the log.
 * The route is in the first few dozen characters either way.
 */
export function shortPath(pathname: string): string {
	return pathname.length > 120 ? `${pathname.slice(0, 120)}…` : pathname;
}

/**
 * One log line for a failure, and the reference that finds it again.
 *
 * Both ways in use it, the API wrapper below and `handleError` in
 * hooks.server.ts, because a reference is only worth anything if the one on
 * screen is the one in the log. Minting it in two places would eventually mean
 * minting it differently in two places.
 *
 * Anything below 500 is somebody else's fault rather than the app's: a mangled
 * address that cannot even be decoded arrives as a 400, and unauthenticated at
 * that. Those are recorded, but as a warning, so that a filter for the day's
 * errors stays a filter for the app's own failures.
 */
export function logFailure(
	msg: string,
	status: number,
	err: unknown,
	where: { method?: string; path?: string } = {}
): string | undefined {
	const level = status >= 500 ? 'error' : 'warn';
	// Nothing to point at, so nothing to hand out. `LOG_LEVEL=error` swallows the
	// warnings, and a reference the family reads out to somebody who then finds no
	// line for it is worse than showing none at all.
	if (!writes(level)) return undefined;

	const reference = randomUUID().slice(0, 8);
	log[level](msg, { reference, status, ...where, err });
	return reference;
}

/**
 * Person ids as the language of the request names them. The same helper the
 * pages use, so an error message and the screen behind it join two names the
 * same way.
 */
export function listNames(locals: App.Locals, ids: string[]): string {
	return joinNames(locals.config.members, ids, locals.locale);
}

export function requirePerson(locals: App.Locals): string {
	if (!locals.personId) throw new RuleError('rule.pickPerson');
	return locals.personId;
}

/** Parses the JSON object every mutating API endpoint expects. */
export async function requestJsonObject(request: Request): Promise<Record<string, unknown>> {
	let value: unknown;
	try {
		value = await request.json();
	} catch {
		throw new RuleError('error.invalidRequest');
	}
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new RuleError('error.invalidRequest');
	}
	return value as Record<string, unknown>;
}

/**
 * The shape of an `absent` field, and nothing beyond it: a list of strings, or
 * nothing at all. Whether those strings are people, and whether anybody would be
 * left at home, is the rule's business in `requireAbsent()`.
 */
export function parseAbsent(value: unknown): string[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value) || value.some((id) => typeof id !== 'string')) {
		throw new RuleError('error.invalidRequest');
	}
	return value as string[];
}

/**
 * Who is not there tonight, for an endpoint whose body is optional.
 *
 * `/api/evaluate` took no body at all until partial nights arrived, and `call()`
 * in `$lib/client/api` sends neither a body nor a content type when it has
 * nothing to send, which `requestJsonObject()` would reject. Reading the body
 * only when there is one keeps a bodyless request meaning what it always meant:
 * everybody is here.
 */
export async function absentFromRequest(request: Request): Promise<string[]> {
	if (!request.headers.get('content-type')?.includes('application/json')) return [];
	return parseAbsent((await requestJsonObject(request)).absent);
}

/**
 * Wraps every API handler: a broken rule becomes a 400 carrying the sentence the
 * user reads, anything else a 500 plus a log line for whoever runs the container.
 *
 * `locals` is the first parameter because `RuleError` carries a catalogue key,
 * not a finished sentence, and only the request knows which language to render
 * it in. Rendering here rather than on the client keeps the JSON answer usable
 * for anything that is not our own page, and matches `/api/pin`, which has read
 * `locals.t` itself since the language scaffolding landed.
 */
export async function handled(locals: App.Locals, fn: () => Response | Promise<Response>): Promise<Response> {
	try {
		return await fn();
	} catch (err) {
		if (err instanceof RuleError) {
			// Ids become names here and nowhere earlier: the rules in game.ts carry
			// keys and ids, this is the first place that knows the language.
			const params = err.personIds ? { ...err.params, names: listNames(locals, err.personIds) } : err.params;
			return json({ error: locals.t(err.key, params) }, { status: 400 });
		}
		const reference = logFailure('Unexpected error in an API call', 500, err, requestContext());
		const body: Record<string, unknown> = { error: locals.t('error.unexpectedRetry') };
		if (reference) body.reference = reference;
		return json(body, { status: 500 });
	}
}
