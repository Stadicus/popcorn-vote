import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, metaGet, metaSet, type DB } from './db';
import type { AppConfig } from './config';
import { cookieValue, isAuthed, delaySeconds, tryPin, checkAttempt } from './auth';

const config: AppConfig = {
	title: 'Movie Night',
	members: [{ id: 'anna', name: 'Anna', color: '#e63946', emoji: '' }],
	tokenAmount: 1,
	tokenWeekday: 0,
	tokenHour: 8,
	tokenCap: 5,
	tokenStart: 0,
	sources: [],
	interfaceLanguage: 'de',
	language: 'de-DE',
	languageFallback: 'en-US',
	certificationCountry: 'DE',
	trailerLanguages: ['original', 'en', 'de'],
	timezone: 'Europe/Berlin',
	backupHour: 3,
	backupKeep: 14,
	demoData: false,
	dailyBuild: false,
	dailyBuildUrl: '',
	tmdbApiKey: '',
	omdbApiKey: '',
	tmdbKeyState: 'missing',
	omdbKeyState: 'missing',
	pin: '4711',
	dataDir: '/tmp/pv-test',
	httpsProof: { mode: 'none' }
};

let db: DB;

beforeEach(() => {
	db = createDb(':memory:');
});

describe('device PIN', () => {
	it('accepts the right PIN and resets the counter', () => {
		tryPin(db, config, '0000', 'ip1');
		const result = tryPin(db, config, '4711', 'ip1');
		expect(result.ok).toBe(true);
		expect(checkAttempt(db, 'ip1').allowed).toBe(true);
	});

	it('rejects wrong PINs', () => {
		expect(tryPin(db, config, '1234', 'ip1').ok).toBe(false);
		expect(tryPin(db, config, '', 'ip1').ok).toBe(false);
		expect(tryPin(db, config, '47110', 'ip1').ok).toBe(false);
	});

	it('refuses a PIN outside ASCII instead of throwing, and counts the attempt', () => {
		// The comparison runs on bytes, and 'e' with an accent is one character but
		// two of them. Padding to a fixed number of characters therefore handed the
		// comparison two different byte lengths and it threw: the caller saw a 500
		// instead of "wrong PIN", and the counters below never saw the attempt at
		// all, so no amount of repetition ever tripped the brake.
		expect(tryPin(db, config, 'é', 'ip1').ok).toBe(false);
		expect(tryPin(db, config, 'éééé', 'ip1').ok).toBe(false);
		expect(tryPin(db, config, 'é', 'ip1').ok).toBe(false);
		expect(checkAttempt(db, 'ip1').allowed).toBe(false);
	});

	it('rejects everything when no PIN is configured', () => {
		const open = { ...config, pin: '' };
		expect(tryPin(db, open, '', 'ip1').ok).toBe(false);
		expect(isAuthed(db, open, cookieValue(db, open))).toBe(false);
	});

	it('validates the cookie only for the current PIN', () => {
		const cookie = cookieValue(db, config);
		expect(isAuthed(db, config, cookie)).toBe(true);
		expect(isAuthed(db, config, 'forged')).toBe(false);
		// PIN changed → old cookies are no longer valid
		expect(isAuthed(db, { ...config, pin: '9999' }, cookie)).toBe(false);
	});
});

describe('brute-force protection', () => {
	it('raises the wait from the third failure up to five minutes at most', () => {
		expect(delaySeconds(1)).toBe(0);
		expect(delaySeconds(2)).toBe(0);
		expect(delaySeconds(3)).toBe(2);
		expect(delaySeconds(4)).toBe(4);
		expect(delaySeconds(5)).toBe(8);
		expect(delaySeconds(10)).toBe(256);
		expect(delaySeconds(11)).toBe(300);
		expect(delaySeconds(50)).toBe(300);
	});

	it('blocks attempts during the wait and releases them afterwards', () => {
		const t0 = new Date('2026-08-01T20:00:00Z');
		tryPin(db, config, '0000', 'ip1', t0);
		tryPin(db, config, '0001', 'ip1', t0);
		const third = tryPin(db, config, '0002', 'ip1', t0);
		expect(third.waitSeconds).toBe(2);

		const during = checkAttempt(db, 'ip1', new Date(t0.getTime() + 1000));
		expect(during.allowed).toBe(false);
		const blocked = tryPin(db, config, '4711', 'ip1', new Date(t0.getTime() + 1000));
		expect(blocked.ok).toBe(false);

		const after = new Date(t0.getTime() + 3000);
		expect(checkAttempt(db, 'ip1', after).allowed).toBe(true);
		expect(tryPin(db, config, '4711', 'ip1', after).ok).toBe(true);
	});

	it('brakes per sender IP: a stranger does not lock out the family', () => {
		const t0 = new Date('2026-08-01T20:00:00Z');
		// An attacker from ip-stranger collects five failures
		for (const wrong of ['0000', '0001', '0002', '0003', '0004'])
			tryPin(db, config, wrong, 'ip-stranger', t0);
		expect(checkAttempt(db, 'ip-stranger', t0).allowed).toBe(false);
		// A family member from another IP may go straight through, successfully
		expect(checkAttempt(db, 'ip-family', t0).allowed).toBe(true);
		expect(tryPin(db, config, '4711', 'ip-family', t0).ok).toBe(true);
	});

	it('has a global safety net against distributed attempts', () => {
		const t0 = new Date('2026-08-01T20:00:00Z');
		// 21 failures from 21 different IPs → the global brake applies
		for (let i = 0; i < 21; i++) tryPin(db, config, '0000', `ip${i}`, t0);
		expect(checkAttempt(db, 'ip-brand-new', t0).allowed).toBe(false);
	});

	it('lets the global net go again as the minutes pass', () => {
		const t0 = new Date('2026-08-01T20:00:00Z');
		for (let i = 0; i < 21; i++) tryPin(db, config, '0000', `ip${i}`, t0);
		expect(checkAttempt(db, 'ip-brand-new', t0).allowed).toBe(false);

		// Five minutes on, the lock has run out and five failures have run off the
		// count with it, so a single further failure cannot put the lock straight back.
		const later = new Date(t0.getTime() + 300_000);
		expect(checkAttempt(db, 'ip-brand-new', later).allowed).toBe(true);
		tryPin(db, config, '0000', 'ip-stranger', later);
		expect(checkAttempt(db, 'ip-brand-new', later).allowed).toBe(true);
	});

	it('does not let one stranger hold the PIN page shut for the family', () => {
		// The count used to fall only on a success, which the lock itself refuses.
		// One wrong PIN every five minutes, the fastest a single IP is allowed .
		// therefore kept the door shut for everybody, for good.
		const t0 = new Date('2026-08-01T20:00:00Z');
		let now = t0;
		for (let i = 0; i < 40; i++) {
			now = new Date(t0.getTime() + i * 300_000);
			tryPin(db, config, '0000', 'ip-stranger', now);
			expect(checkAttempt(db, 'ip-family', now).allowed).toBe(true);
		}
		// The attempts really did land: the stranger's own brake is the one biting.
		expect(checkAttempt(db, 'ip-stranger', now).allowed).toBe(false);
		expect(tryPin(db, config, '4711', 'ip-family', now).ok).toBe(true);
	});

	it('survives counters edited by hand in the data file', () => {
		// Number('nonsense') is NaN, and a NaN written back would switch the net off
		// for good without saying so.
		const t0 = new Date('2026-08-01T20:00:00Z');
		metaSet(db, 'pin_global_failures', 'nonsense');
		metaSet(db, 'pin_global_failed_at', 'the day before yesterday');
		for (let i = 0; i < 21; i++) tryPin(db, config, '0000', `ip${i}`, t0);
		expect(checkAttempt(db, 'ip-brand-new', t0).allowed).toBe(false);
	});

	it('does not carry a count that would take an age to run off', () => {
		// Two ways to arrive at one. A hand-edited 1e20 is no safe integer and
		// starts over at zero; a plain 900000000 is one, and would need seventeen
		// centuries to run off, so it is cut to the ceiling instead. Above the
		// ceiling the wait already sits at its cap, so neither loses any severity.
		// A count left by a release before the decay existed is the same case.
		const t0 = new Date('2026-08-01T20:00:00Z');
		metaSet(db, 'pin_global_failures', '1e20');
		tryPin(db, config, '0000', 'ip-stranger', t0);
		expect(checkAttempt(db, 'ip-family', t0).allowed).toBe(true);

		// 900000000 is a safe integer, so only the ceiling catches it. What it costs
		// is not one lock but every following one: while a stranger keeps failing at
		// the fastest rate a single IP is allowed, each failure re-arms the lock, and
		// uncut the count would need seventeen centuries to fall back under the
		// threshold. Cut to the ceiling it drains within the hour and the door opens
		// again even though the stranger never stops.
		const later = new Date(t0.getTime() + 3_600_000);
		metaSet(db, 'pin_global_failures', '900000000');
		metaSet(db, 'pin_global_failed_at', '');
		let last = later;
		for (let i = 0; i < 20; i++) {
			last = new Date(later.getTime() + i * 300_000);
			tryPin(db, config, '0000', 'ip-stranger2', last);
		}
		// Asked in the very moment of the stranger's latest failure, so an armed lock
		// would still be standing rather than having just run out.
		expect(checkAttempt(db, 'ip-family', last).allowed).toBe(true);
	});

	it('resets the wait after a success', () => {
		const t0 = new Date('2026-08-01T20:00:00Z');
		for (const wrong of ['0000', '0001', '0002']) tryPin(db, config, wrong, 'ip1', t0);
		tryPin(db, config, '4711', 'ip1', new Date(t0.getTime() + 10_000));
		// After the success the next failure counts from the start again.
		const fresh = tryPin(db, config, '0000', 'ip1', new Date(t0.getTime() + 20_000));
		expect(fresh.waitSeconds).toBe(0);
	});

	it('ignores a lock longer than any it writes itself', () => {
		// Only a clock that ran fast can leave one behind, and the correction back
		// leaves the date standing. Honoured, it would shut the family out until
		// that date and no amount of waiting would help.
		const t0 = new Date('2026-08-01T20:00:00Z');
		metaSet(db, 'pin_global_locked_until', '2027-01-01T00:00:00.000Z');
		expect(checkAttempt(db, 'ip1', t0).allowed).toBe(true);
		expect(tryPin(db, config, '4711', 'ip1', t0).ok).toBe(true);
	});

	it('still honours a lock inside that bound', () => {
		// This one passes against the old code too, deliberately. It guards the
		// boundary against being written the other way round, so that a wait of
		// exactly five minutes stays a wait rather than becoming a leftover.
		const t0 = new Date('2026-08-01T20:00:00Z');
		metaSet(db, 'pin_global_locked_until', new Date(t0.getTime() + 120_000).toISOString());
		expect(checkAttempt(db, 'ip1', t0).waitSeconds).toBe(120);
		metaSet(db, 'pin_global_locked_until', new Date(t0.getTime() + 300_000).toISOString());
		expect(checkAttempt(db, 'ip1', t0).waitSeconds).toBe(300);
	});

	it('does not block on a timestamp it cannot read', () => {
		const t0 = new Date('2026-08-01T20:00:00Z');
		metaSet(db, 'pin_global_locked_until', 'next Tuesday');
		expect(checkAttempt(db, 'ip1', t0).allowed).toBe(true);
	});

	it('does not let one unreadable timestamp cancel the other, living lock', () => {
		// The two waits are combined with Math.max, and Math.max(NaN, 250) is NaN,
		// which reads as no wait at all. So an unreadable value on one side used to
		// open the gate straight through a running lock on the other, a second way
		// out of the brake, and the one that actually let somebody in.
		const t0 = new Date('2026-08-01T20:00:00Z');
		for (const wrong of ['0000', '0001', '0002']) tryPin(db, config, wrong, 'ip1', t0);
		expect(checkAttempt(db, 'ip1', t0).allowed).toBe(false); // its own wait is running
		metaSet(db, 'pin_global_locked_until', 'next Tuesday');
		expect(checkAttempt(db, 'ip1', t0).allowed).toBe(false);
	});
});

describe('global PIN throttle', () => {
	/** Attackers who never waste an attempt: each fires the second its gate opens. */
	function siege(ips: number, minutes: number) {
		const fresh = createDb(':memory:');
		const t0 = Date.parse('2026-08-01T20:00:00Z');
		let peak = 0;
		let familyLocked = false;
		for (let second = 0; second <= minutes * 60; second++) {
			const now = new Date(t0 + second * 1000);
			// what a family member on an untouched IP would meet at this moment
			if (!checkAttempt(fresh, 'ip-family', now).allowed) familyLocked = true;
			for (let i = 0; i < ips; i++) {
				if (checkAttempt(fresh, `attacker${i}`, now).allowed)
					tryPin(fresh, config, '0000', `attacker${i}`, now);
			}
			peak = Math.max(peak, Number(metaGet(fresh, 'pin_global_failures') ?? '0'));
		}
		return { peak, familyLocked };
	}

	it('lets one sender reach nine of the twenty free attempts, and lock nobody out', () => {
		const { peak, familyLocked } = siege(1, 120);
		expect(peak).toBe(9);
		expect(familyLocked).toBe(false);
	});

	it('trips on three IPs together, and not on two', () => {
		expect(siege(2, 120).familyLocked).toBe(false);
		expect(siege(3, 120).familyLocked).toBe(true);
	});
});
