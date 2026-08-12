import crypto from 'node:crypto';
import type { DB } from './db';
import { metaGet, metaSet } from './db';
import type { AppConfig } from './config';

export const AUTH_COOKIE = 'pv_auth';

export interface AuthUser {
	id: string;
	name: string;
	role: 'admin' | 'user';
}

const DUMMY_PIN_SALT = Buffer.from('cG9wY29ybi12b3RlLWR1bW15LXNlZWQ=', 'base64');
const DUMMY_PIN_HASH = Buffer.from('6m8yRnkU7Oj8FSoZ6XBMKI2Ht6Jrf4voOzCqleCp0RQ=', 'base64');

export function hashPin(pin: string): string {
	const salt = crypto.randomBytes(16);
	const hash = crypto.scryptSync(pin, salt, 32);
	return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPin(pin: string, encoded: string): boolean {
	const [algorithm, salt64, hash64] = encoded.split('$');
	let salt = DUMMY_PIN_SALT;
	let expected = DUMMY_PIN_HASH;
	let valid = false;
	try {
		if (algorithm === 'scrypt' && salt64 && hash64) {
			const parsedSalt = Buffer.from(salt64, 'base64');
			const parsedHash = Buffer.from(hash64, 'base64');
			if (parsedSalt.length >= 16 && parsedHash.length === 32) {
				salt = parsedSalt;
				expected = parsedHash;
				valid = true;
			}
		}
	} catch {
		// Malformed input takes the same dummy-scrypt path as a missing account.
	}
	const actual = crypto.scryptSync(pin, salt, expected.length);
	return valid && crypto.timingSafeEqual(actual, expected);
}

/** Random per-installation secret; created on first access. */
function authSecret(db: DB): string {
	let secret = metaGet(db, 'auth_secret');
	if (!secret) {
		secret = crypto.randomBytes(32).toString('hex');
		metaSet(db, 'auth_secret', secret);
	}
	return secret;
}

/** Cookie value for the current PIN. Change the PIN and every device is signed out. */
export function cookieValue(db: DB, config: AppConfig, issuedAt = Math.floor(Date.now() / 1000)): string {
	return legacyCookieValue(db, config, issuedAt);
}

export function isAuthed(db: DB, config: AppConfig, cookie: string | undefined): boolean {
	return authenticatedUser(db, config, cookie) !== null;
}

export function userCookieValue(
	db: DB,
	userId: string,
	pinHash: string,
	issuedAt = Math.floor(Date.now() / 1000)
): string {
	const signature = crypto
		.createHmac('sha256', authSecret(db))
		.update(`user:${userId}:${pinHash}:${issuedAt}`)
		.digest('hex');
	return `${userId}.${issuedAt}.${signature}`;
}

function legacyCookieValue(db: DB, config: AppConfig, issuedAt: number): string {
	const signature = crypto
		.createHmac('sha256', authSecret(db))
		.update(`pin:${config.pin}:${issuedAt}`)
		.digest('hex');
	return `legacy.${issuedAt}.${signature}`;
}

export function authenticatedUser(
	db: DB,
	config: AppConfig,
	cookie: string | undefined,
	now = Math.floor(Date.now() / 1000)
): AuthUser | null {
	if (!cookie) return null;
	const [id, issuedRaw, signature, extra] = cookie.split('.');
	if (!id || !issuedRaw || !signature || extra !== undefined) return null;
	const issuedAt = Number(issuedRaw);
	if (!Number.isSafeInteger(issuedAt) || issuedAt > now + 300 || now - issuedAt > config.sessionTimeout) {
		return null;
	}
	if (id !== 'legacy') {
		const user = config.users.find((candidate) => candidate.id === id && candidate.enabled);
		if (!user) return null;
		const expected = Buffer.from(userCookieValue(db, user.id, user.pinHash, issuedAt));
		const got = Buffer.from(cookie);
		if (got.length === expected.length && crypto.timingSafeEqual(got, expected)) {
			return { id: user.id, name: user.name, role: user.role };
		}
		return null;
	}
	if (!config.pin) return null;
	const expected = Buffer.from(legacyCookieValue(db, config, issuedAt));
	const got = Buffer.from(cookie);
	return got.length === expected.length && crypto.timingSafeEqual(got, expected)
		? { id: 'legacy', name: 'Administrator', role: 'admin' }
		: null;
}

// --- Brute-force protection: rising wait per sender IP ------------------------
//
// The brake applies per IP, so that a stranger entering wrong PINs cannot lock
// out the whole family. As a safety net against distributed attempts there is
// also an installation-wide brake that only kicks in after considerably more
// failures. A success resets both, and the global count runs off with time on
// its own, see GLOBAL_DECAY_SECONDS.

/** No lock written here is longer than this, per IP or installation-wide. */
const MAX_LOCK_SECONDS = 300;

/** Wait after the nth failure: from the third on 2 s, then doubling, at most 5 minutes. */
export function delaySeconds(failures: number): number {
	if (failures < 3) return 0;
	return Math.min(MAX_LOCK_SECONDS, 2 ** (failures - 2));
}

/** This many failures across all IPs are free before the global brake applies. */
const GLOBAL_FREE_ATTEMPTS = 20;

/** The global wait doubles this many times before it sits at its five-minute cap. */
const GLOBAL_MAX_STEP = 9;

/** The global count loses one failure every two minutes. */
const GLOBAL_DECAY_SECONDS = 120;

export interface AttemptGate {
	allowed: boolean;
	waitSeconds: number;
}

export function checkAttempt(db: DB, ip: string, now: Date = new Date()): AttemptGate {
	const wait = Math.max(
		lockWait(rowLock(db, ip), now),
		lockWait(metaGet(db, 'pin_global_locked_until'), now)
	);
	return wait > 0 ? { allowed: false, waitSeconds: wait } : { allowed: true, waitSeconds: 0 };
}

/** Checks the PIN in constant time and keeps the failure counters (per IP and global). */
export function tryPin(
	db: DB,
	config: AppConfig,
	pin: string,
	ip: string,
	now: Date = new Date()
): AttemptGate & { ok: boolean } {
	const gate = checkAttempt(db, ip, now);
	if (!gate.allowed) return { ok: false, ...gate };

	// Compared as SHA-256 digests, because those are 32 bytes whatever went in.
	// Padding to a fixed number of *characters* did not hold: timingSafeEqual
	// measures bytes, so a single non-ASCII character made it throw instead of
	// answering "wrong PIN", before the counters below had seen the attempt.
	//
	// The candidate is cut first, as the old code also did: /api/pin is open, and
	// without a bound the work would follow whatever the sender posts. Cutting can
	// never turn a wrong PIN into a right one, a configured PIN is four digits,
	// and even a longer one could only ever fail against a cut candidate.
	const digest = (value: string) => crypto.createHash('sha256').update(value, 'utf8').digest();
	const candidate = String(pin).slice(0, 256);
	const ok = config.pin.length > 0 && crypto.timingSafeEqual(digest(candidate), digest(config.pin));

	if (ok) {
		db.prepare('DELETE FROM pin_attempts WHERE ip = ?').run(ip);
		metaSet(db, 'pin_global_failures', '0');
		metaSet(db, 'pin_global_failed_at', '');
		metaSet(db, 'pin_global_locked_until', '');
		return { ok: true, allowed: true, waitSeconds: 0 };
	}

	// Cleanup: entries untouched for more than a day are done with.
	db.prepare('DELETE FROM pin_attempts WHERE updated_at < ?').run(
		new Date(now.getTime() - 86_400_000).toISOString()
	);

	const row = db.prepare('SELECT failures FROM pin_attempts WHERE ip = ?').get(ip) as
		{ failures: number } | undefined;
	const failures = (row?.failures ?? 0) + 1;
	const wait = delaySeconds(failures);
	db.prepare(
		'INSERT INTO pin_attempts (ip, failures, locked_until, updated_at) VALUES (?, ?, ?, ?) ' +
			'ON CONFLICT(ip) DO UPDATE SET failures = excluded.failures, locked_until = excluded.locked_until, updated_at = excluded.updated_at'
	).run(
		ip,
		failures,
		wait > 0 ? new Date(now.getTime() + wait * 1000).toISOString() : null,
		now.toISOString()
	);

	const globalFailures = nextGlobalFailures(db, now);
	const over = globalFailures - GLOBAL_FREE_ATTEMPTS;
	const globalWait = over <= 0 ? 0 : Math.min(MAX_LOCK_SECONDS, 2 ** Math.min(over, GLOBAL_MAX_STEP));
	metaSet(db, 'pin_global_failures', String(globalFailures));
	metaSet(db, 'pin_global_failed_at', now.toISOString());
	metaSet(
		db,
		'pin_global_locked_until',
		globalWait > 0 ? new Date(now.getTime() + globalWait * 1000).toISOString() : ''
	);

	return { ok: false, allowed: true, waitSeconds: Math.max(wait, globalWait) };
}

export function tryUserPin(
	db: DB,
	config: AppConfig,
	userId: string,
	pin: string,
	ip: string,
	now: Date = new Date()
): (AttemptGate & { ok: false }) | (AttemptGate & { ok: true; user: AuthUser; cookie: string }) {
	const login = userId.trim().toLocaleLowerCase('en');
	const matchingUsers = config.users.filter(
		(candidate) =>
			candidate.enabled &&
			(candidate.id.toLocaleLowerCase('en') === login || candidate.name.toLocaleLowerCase('en') === login)
	);
	const user = matchingUsers.length === 1 ? matchingUsers[0] : undefined;
	const candidate = String(pin).slice(0, 256);
	// A missing, disabled, or malformed account still pays for one real scrypt
	// verification. Otherwise response time would disclose configured names.
	const hashMatches = verifyPin(candidate, user?.pinHash ?? '');
	const verified = Boolean(user) && hashMatches;
	// Reuse the same per-IP and installation-wide brake as legacy authentication.
	const comparisonPin = verified ? candidate : crypto.randomBytes(32).toString('hex');
	const result = tryPin(db, { ...config, pin: comparisonPin }, candidate, ip, now);
	if (!result.ok || !user) return { ...result, ok: false };
	return {
		...result,
		ok: true,
		user: { id: user.id, name: user.name, role: user.role },
		cookie: userCookieValue(db, user.id, user.pinHash)
	};
}

/** The global count with the elapsed time run off it, plus the failure just made. */
function nextGlobalFailures(db: DB, now: Date): number {
	// Two ways a stored count could quietly break this, both silent: something
	// unreadable would poison the arithmetic with NaN and switch the net off for
	// good, and a number far above the ceiling would take longer to run off than
	// anyone would wait, which is the deadlock the decay exists to prevent,
	// reached from the data file instead of from an attacker. A count from a
	// release before this one is exactly that case, because nothing ever ran it
	// off. Above the ceiling nothing changes anyway: the wait already sits at its
	// five-minute cap there, so cutting the count to it costs no severity and
	// bounds the time it needs to drain.
	const ceiling = GLOBAL_FREE_ATTEMPTS + GLOBAL_MAX_STEP;
	const stored = Number(metaGet(db, 'pin_global_failures') ?? '0');
	const failures = Number.isSafeInteger(stored) && stored > 0 ? Math.min(stored, ceiling) : 0;
	// Missing before the very first failure, and unreadable if someone edited the
	// file by hand, both mean "nothing to run off this time".
	const last = Date.parse(metaGet(db, 'pin_global_failed_at') ?? '');
	const elapsed = Number.isFinite(last) ? Math.max(0, now.getTime() - last) : 0;
	return Math.max(0, failures - Math.floor(elapsed / (GLOBAL_DECAY_SECONDS * 1000))) + 1;
}

function rowLock(db: DB, ip: string): string | null {
	const row = db.prepare('SELECT locked_until FROM pin_attempts WHERE ip = ?').get(ip) as
		{ locked_until: string | null } | undefined;
	return row?.locked_until ?? null;
}

function lockWait(lockedUntil: string | null, now: Date): number {
	if (!lockedUntil) return 0;
	const seconds = Math.ceil((new Date(lockedUntil).getTime() - now.getTime()) / 1000);
	// A lock longer than any this file writes is not a lock, it is what a clock
	// that once ran fast left behind, and the correction back leaves the date
	// standing. Honoured, it shuts everyone out until that date arrives: the right
	// PIN never reaches the comparison, because the gate turns it away first, so
	// nothing but an edit to the data file opens the app again. A timestamp that
	// cannot be read at all is treated the same way, rather than being compared
	// and quietly coming out as no wait.
	if (!Number.isFinite(seconds) || seconds > MAX_LOCK_SECONDS) return 0;
	return Math.max(0, seconds);
}
