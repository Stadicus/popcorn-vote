import type { AppConfig } from './config';
import { log } from './log';

/**
 * The options every cookie this app sets is written with — and the one question
 * they turn on: does this connection deserve the `Secure` flag?
 *
 * It exists because the answer cannot be read off the request. Behind a reverse
 * proxy the app sees plain HTTP, and adapter-node fills the gap by *assuming*
 * `https` whenever neither `ORIGIN` nor `PROTOCOL_HEADER` is set, so
 * `event.url.protocol` says `https:` even for a request that arrived over plain
 * HTTP on the container's own port. SvelteKit then defaults `secure` to true for
 * every host but `localhost`, the browser refuses to store a `Secure` cookie
 * from an untrustworthy origin, and the sign-in fails silently: the PIN is
 * accepted, the cookie is dropped, the next page lands back on `/pin`.
 *
 * So the flag follows what the operator configured, resolved once at startup
 * (`config.httpsProof`), and never a guess.
 */

/** Type-level guard: every cookie this app writes goes through `deviceCookie`. */
export interface DeviceCookieOptions {
	path: '/';
	maxAge: number;
	httpOnly: boolean;
	sameSite: 'lax';
	secure: boolean;
}

/** A year. Long enough that a family tablet is not asked again every few weeks. */
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Whether this request demonstrably arrived over HTTPS.
 *
 * A gate **and** a value, and it needs both halves. The gate is
 * `config.httpsProof`: a forwarding header is believed only once the operator
 * has named it, the same way this app honours `x-forwarded-for` only because
 * `ADDRESS_HEADER` says to. The value is the header this request actually
 * carries — because adapter-node's `https` assumption applies per request, so a
 * request that bypasses the proxy on the mapped port would otherwise count as
 * HTTPS on an installation that serves both.
 *
 * No comma-splitting, and it costs nothing: the comparison is against the whole
 * value, so anything joined from two headers fails it and no cookie is marked.
 * It fails closed. In the ordinary case such a request does not even get this
 * far — the adapter builds its origin as `<protocol>://<host>`, and a joined
 * `https, http` makes a string `new URL` rejects. That guard is skipped when
 * `ORIGIN` is set, which is why the comparison here has to stand on its own.
 */
export function overHttps(config: AppConfig, headers: Headers): boolean {
	const proof = config.httpsProof;
	if (proof.mode === 'origin') return true;
	if (proof.mode === 'none') {
		warnAboutUnusedProxy(headers, null);
		return false;
	}
	const said = headers.get(proof.header);
	const proven = said?.trim().toLowerCase() === 'https';
	if (!proven) warnAboutUnusedProxy(headers, { name: proof.header, said });
	return proven;
}

/** Said once per container life, never per request. */
let proxyWarned = false;

/** The header a proxy in front of this app sends unless told otherwise. */
const USUAL_HEADER = 'x-forwarded-proto';

/**
 * The case that must not pass in silence: a proxy is forwarding its protocol and
 * the app is not listening to it.
 *
 * Two ways to get there, and both look fine from the outside. Nothing is
 * configured — which is what an existing HTTPS installation becomes after an
 * update, since the image carries code and not settings, so every cookie quietly
 * loses the `Secure` flag it had. Or something is configured but names a
 * different header than the one arriving: `x-forward-proto` for
 * `x-forwarded-proto` passes every check this app can make, the startup line
 * reports a proof, and no cookie is ever marked.
 *
 * The startup line cannot tell either of them from a purely local installation,
 * where the same state is exactly right. The arriving header can: nobody sends
 * `x-forwarded-proto` to an app reached directly. Warned once, without the value.
 *
 * The trigger is the **value**, not the name: something arriving says `https`
 * while this request came out unproven. That is what makes it a fault rather
 * than a plain HTTP visit — a proxy honestly reporting `http` for a visitor who
 * really came over http is nothing to report, whichever header it uses, and a
 * warning spent on that would be a warning not spent on the real thing.
 *
 * `configured` is the header in effect and what it said here, or `null` when
 * none is configured. It only shapes the wording: a name that never arrives
 * reads differently from one that arrives saying something else, and whoever
 * debugs the line needs to know which.
 */
function warnAboutUnusedProxy(
	headers: Headers,
	configured: { name: string; said: string | null } | null
): void {
	if (proxyWarned) return;
	// Whatever a proxy in front might be saying — the usual header, or the one
	// the operator named. Either claiming https is enough to make this a fault.
	//
	// The first entry counts, where `overHttps` above compares the whole value.
	// The asymmetry is deliberate: that comparison decides whether a cookie is
	// marked and therefore fails closed, while this one only decides whether to
	// say something out loud. A chained pair of proxies joins its headers into
	// `https, http`, which proves nothing — but it does mean somebody in front is
	// terminating TLS, and that is exactly what wants saying.
	const claimsHttps = [headers.get(USUAL_HEADER), configured?.said].some(
		(value) => value?.split(',')[0].trim().toLowerCase() === 'https'
	);
	if (!claimsHttps) return;
	proxyWarned = true;
	log.warn(
		configured
			? `A request arrived saying it came over https, but PROTOCOL_HEADER names ${configured.name}, which ${configured.said === null ? 'is absent' : 'says otherwise'} — so no cookie is marked Secure.`
			: `A request arrived saying it came over https, but PROTOCOL_HEADER is not in effect, so no cookie is marked Secure. Set PROTOCOL_HEADER=${USUAL_HEADER} if an HTTPS proxy is in front of this app.`
	);
}

/**
 * The options for a device cookie. `httpOnly` is the only one worth overriding:
 * `pv_person` is read by the interface, the other two are not.
 *
 * Used for deleting as well as for setting. SvelteKit implements `delete` as a
 * `set` with `maxAge: 0` over the same defaults, so a delete that leaves the
 * options out inherits the `secure: true` this function exists to decide — and
 * a device on plain HTTP could not clear the cookie at all.
 */
export function deviceCookie(
	config: AppConfig,
	headers: Headers,
	extra: { httpOnly?: boolean } = {}
): DeviceCookieOptions {
	return {
		path: '/',
		maxAge: ONE_YEAR,
		httpOnly: extra.httpOnly ?? true,
		sameSite: 'lax',
		secure: overHttps(config, headers)
	};
}
