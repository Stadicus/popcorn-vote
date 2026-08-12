import { describe, it, expect, vi } from 'vitest';
import { overHttps, deviceCookie } from './cookies';
import type { AppConfig, HttpsProof } from './config';

/** Only `httpsProof` matters here; the rest of the configuration is not read. */
function configWith(httpsProof: HttpsProof): AppConfig {
	return { httpsProof } as AppConfig;
}

const XFP = 'x-forwarded-proto';

describe('overHttps', () => {
	it('believes the named header when it says https', () => {
		const config = configWith({ mode: 'header', header: XFP });
		expect(overHttps(config, new Headers({ [XFP]: 'https' }))).toBe(true);
	});

	it('is unfazed by spacing and capitals in the header value', () => {
		const config = configWith({ mode: 'header', header: XFP });
		expect(overHttps(config, new Headers({ [XFP]: ' HTTPS ' }))).toBe(true);
	});

	it('does not believe the header when it says http', () => {
		const config = configWith({ mode: 'header', header: XFP });
		expect(overHttps(config, new Headers({ [XFP]: 'http' }))).toBe(false);
	});

	// The proxy-bypass case, and the reason this function reads the value of each
	// request rather than the protocol adapter-node put on the URL: an
	// installation can serve HTTPS through a proxy and plain HTTP on the LAN port
	// at the same time, and the LAN request arrives without the header.
	it('does not believe a missing header, even with the header mode configured', () => {
		const config = configWith({ mode: 'header', header: XFP });
		expect(overHttps(config, new Headers())).toBe(false);
	});

	it('reads the header the operator named, not a header of its own choosing', async () => {
		// Through a fresh copy with a mocked logger: the second case trips the
		// warning below (a named header that never arrives while the usual one
		// does), which would otherwise print a real line during `npm test`.
		const fresh = await freshModules();
		vi.spyOn(fresh.log, 'warn').mockImplementation(() => {});
		const config = configWith({ mode: 'header', header: 'x-scheme' });
		expect(fresh.overHttps(config, new Headers({ 'x-scheme': 'https' }))).toBe(true);
		expect(fresh.overHttps(config, new Headers({ [XFP]: 'https' }))).toBe(false);
		vi.restoreAllMocks();
	});

	// Documented restriction rather than an oversight: `origin` mode speaks for
	// every request at once, so it is only correct where the container cannot be
	// reached except through the HTTPS proxy. On an installation that also serves
	// plain HTTP this would mark a LAN cookie Secure and lock that path out.
	it('counts every request as https in origin mode, header or no header', () => {
		const config = configWith({ mode: 'origin' });
		expect(overHttps(config, new Headers())).toBe(true);
		expect(overHttps(config, new Headers({ [XFP]: 'http' }))).toBe(true);
	});

	// The regression this whole change exists for. adapter-node assumes `https`
	// when nothing is configured, so anything derived from the request URL would
	// answer true here — and every cookie would carry Secure over plain HTTP.
	it('proves nothing without configuration, whatever the request carries', async () => {
		// Through a fresh copy like the two below, so that the warning this
		// triggers goes to a mocked logger rather than the console, and so that
		// this test does not decide whether the flag is still unset when they run.
		const fresh = await freshModules();
		vi.spyOn(fresh.log, 'warn').mockImplementation(() => {});
		const config = configWith({ mode: 'none' });
		expect(fresh.overHttps(config, new Headers())).toBe(false);
		expect(fresh.overHttps(config, new Headers({ [XFP]: 'https' }))).toBe(false);
		vi.restoreAllMocks();
	});

	// The module remembers that it has warned, so every test touching that path
	// takes a fresh copy rather than depending on which test ran before it. The
	// logger is re-imported from the same fresh registry, or the spy would sit on
	// a different `log` object than the one the fresh module writes to.
	async function freshModules() {
		vi.resetModules();
		const [cookies, logging] = await Promise.all([import('./cookies'), import('./log')]);
		return { overHttps: cookies.overHttps, log: logging.log };
	}

	it('warns once when a proxy forwards its protocol and nothing was configured', async () => {
		const fresh = await freshModules();
		const spy = vi.spyOn(fresh.log, 'warn').mockImplementation(() => {});
		try {
			const config = configWith({ mode: 'none' });
			fresh.overHttps(config, new Headers({ [XFP]: 'https' }));
			fresh.overHttps(config, new Headers({ [XFP]: 'https' }));
			fresh.overHttps(config, new Headers({ [XFP]: 'http' }));
			expect(spy).toHaveBeenCalledTimes(1);
			expect(String(spy.mock.calls[0][0])).toContain('PROTOCOL_HEADER is not in effect');
		} finally {
			spy.mockRestore();
		}
	});

	it('stays quiet when no proxy is in front, which is the ordinary local case', async () => {
		const fresh = await freshModules();
		const spy = vi.spyOn(fresh.log, 'warn').mockImplementation(() => {});
		try {
			fresh.overHttps(configWith({ mode: 'none' }), new Headers());
			expect(spy).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
		}
	});

	// A typo that is still a valid token passes every check the configuration can
	// make: the startup line reports a proof, and no cookie is ever marked. Only
	// the arriving header shows it.
	it('warns when the configured header is not the one arriving', async () => {
		const fresh = await freshModules();
		const spy = vi.spyOn(fresh.log, 'warn').mockImplementation(() => {});
		try {
			const typo = configWith({ mode: 'header', header: 'x-forward-proto' });
			expect(fresh.overHttps(typo, new Headers({ [XFP]: 'https' }))).toBe(false);
			expect(spy).toHaveBeenCalledTimes(1);
			expect(String(spy.mock.calls[0][0])).toContain('x-forward-proto');
			// Names which of the two faults it is: a header that never arrives reads
			// differently from one that arrives saying the wrong thing.
			expect(String(spy.mock.calls[0][0])).toContain('is absent');
		} finally {
			spy.mockRestore();
		}
	});

	it('says so when the named header arrives but contradicts the other one', async () => {
		const fresh = await freshModules();
		const spy = vi.spyOn(fresh.log, 'warn').mockImplementation(() => {});
		try {
			// An inner hop sets its own header wrongly while an outer one still
			// reports https honestly. Nothing is proven, and the line has to say that
			// the named header was there rather than claim it was missing.
			const config = configWith({ mode: 'header', header: 'x-scheme' });
			expect(fresh.overHttps(config, new Headers({ 'x-scheme': 'http', [XFP]: 'https' }))).toBe(false);
			expect(spy).toHaveBeenCalledTimes(1);
			expect(String(spy.mock.calls[0][0])).toContain('says otherwise');
		} finally {
			spy.mockRestore();
		}
	});

	// No fault, whichever header it uses: a proxy honestly reporting that this
	// visitor came over http. A warning spent here is one not spent on the real
	// thing, since there is only ever one.
	//
	// Note these guard the quiet side, not the warning: with the whole warning
	// removed they would still pass. The test above is the tripwire for that.
	it('stays quiet when everything arriving honestly says http', async () => {
		const fresh = await freshModules();
		const spy = vi.spyOn(fresh.log, 'warn').mockImplementation(() => {});
		try {
			// Nothing configured and a proxy reporting http honestly: a plain HTTP
			// visitor on an installation that never asked for anything else. The
			// name-keyed version of this warning fired here, on no fault at all.
			expect(fresh.overHttps(configWith({ mode: 'none' }), new Headers({ [XFP]: 'http' }))).toBe(false);
			expect(
				fresh.overHttps(configWith({ mode: 'header', header: XFP }), new Headers({ [XFP]: 'http' }))
			).toBe(false);
			// The operator's own header and the usual one, both saying http through
			// one proxy — a correct configuration and a plain HTTP visit.
			expect(
				fresh.overHttps(
					configWith({ mode: 'header', header: 'x-scheme' }),
					new Headers({ 'x-scheme': 'http', [XFP]: 'http' })
				)
			).toBe(false);
			expect(spy).not.toHaveBeenCalled();
		} finally {
			spy.mockRestore();
		}
	});

	// Chained proxies join their headers. The value proves nothing — `overHttps`
	// compares the whole string and stays false — but something in front is
	// terminating TLS, and no cookie is being marked, so it has to be said.
	it('warns when a joined header shows a proxy in front that is being ignored', async () => {
		const fresh = await freshModules();
		const spy = vi.spyOn(fresh.log, 'warn').mockImplementation(() => {});
		try {
			const config = configWith({ mode: 'header', header: XFP });
			expect(fresh.overHttps(config, new Headers({ [XFP]: 'https, http' }))).toBe(false);
			expect(spy).toHaveBeenCalledTimes(1);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('deviceCookie', () => {
	it('marks the cookie Secure exactly when HTTPS is proven', () => {
		const proven = configWith({ mode: 'header', header: XFP });
		expect(deviceCookie(proven, new Headers({ [XFP]: 'https' })).secure).toBe(true);
		expect(deviceCookie(proven, new Headers()).secure).toBe(false);
	});

	it('keeps path, sameSite and lifetime the same for every cookie', () => {
		const options = deviceCookie(configWith({ mode: 'none' }), new Headers());
		expect(options.path).toBe('/');
		expect(options.sameSite).toBe('lax');
		expect(options.maxAge).toBe(60 * 60 * 24 * 365);
	});

	it('hides the cookie from the interface unless asked otherwise', () => {
		const config = configWith({ mode: 'none' });
		expect(deviceCookie(config, new Headers()).httpOnly).toBe(true);
		expect(deviceCookie(config, new Headers(), { httpOnly: false }).httpOnly).toBe(false);
	});

	// Whether the delete carries the same options as the set is not decidable
	// here — both would call this same function. It is pinned where the two calls
	// actually happen: `src/routes/api/language/server.test.ts` asserts that
	// `cookies.delete` is handed `secure`, and the plain-HTTP E2E switches the
	// language and switches it back on a non-loopback origin.
});
