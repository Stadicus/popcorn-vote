import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDb, metaSet, type DB } from './db';
import { clearTonightAbsent, setTonightAbsent, tonightAbsent } from './tonight';

const family = [{ id: 'anna' }, { id: 'ben' }, { id: 'cleo' }];

// The shared "who is away tonight" row. Everything here is about it being
// impossible to break: it hangs off the TV poll and off loading two pages, so a
// mangled row has to read as "everybody is here", never as an exception.

let db: DB;

beforeEach(() => {
	db = createDb(':memory:');
});

afterEach(() => {
	vi.useRealTimers();
});

describe('who is away tonight', () => {
	it('reads back what was written', () => {
		setTonightAbsent(db, ['ben', 'cleo']);
		expect(tonightAbsent(db, family)).toEqual(['ben', 'cleo']);
	});

	it('is empty when nothing was ever written', () => {
		expect(tonightAbsent(db, family)).toEqual([]);
	});

	it('stores an empty list as its own answer', () => {
		setTonightAbsent(db, ['ben']);
		setTonightAbsent(db, []);
		expect(tonightAbsent(db, family)).toEqual([]);
	});

	it('is empty after the evening was cleared', () => {
		setTonightAbsent(db, ['ben']);
		clearTonightAbsent(db);
		expect(tonightAbsent(db, family)).toEqual([]);
	});
});

describe('a row that cannot be trusted', () => {
	// Every one of these has to answer "everybody is here" rather than throw:
	// the worst case of being wrong is a board that counts every vote, which is
	// what the app did before this existed. An exception would take the TV down.
	it.each([
		['broken JSON', '{not json'],
		['an empty string', ''],
		['a bare array', '["ben"]'],
		['null', 'null'],
		['a number', '42'],
		['no absent field', '{"at":"2026-09-02T19:00:00.000Z"}'],
		['absent that is not an array', '{"absent":"ben","at":"2026-09-02T19:00:00.000Z"}'],
		['absent holding a number', '{"absent":[7],"at":"2026-09-02T19:00:00.000Z"}'],
		['no timestamp', '{"absent":["ben"]}'],
		['an unparseable timestamp', '{"absent":["ben"],"at":"whenever"}']
	])('reads %s as nobody being away', (_label, raw) => {
		metaSet(db, 'tonight_absent', raw);
		expect(() => tonightAbsent(db, family)).not.toThrow();
		expect(tonightAbsent(db, family)).toEqual([]);
	});
});

describe('the twelve hours', () => {
	it('still counts an evening from eleven hours ago', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-02T20:00:00.000Z'));
		setTonightAbsent(db, ['ben']);

		vi.setSystemTime(new Date('2026-09-03T07:00:00.000Z'));
		expect(tonightAbsent(db, family)).toEqual(['ben']);
	});

	it('forgets an evening from thirteen hours ago', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-02T20:00:00.000Z'));
		setTonightAbsent(db, ['ben']);

		vi.setSystemTime(new Date('2026-09-03T09:00:00.000Z'));
		expect(tonightAbsent(db, family)).toEqual([]);
	});

	// Every write restarts the twelve hours, which is what makes a late POST
	// after a finished evening carry as far as it does (see Entscheid 6).
	it('starts the clock again on every write', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-02T20:00:00.000Z'));
		setTonightAbsent(db, ['ben']);

		vi.setSystemTime(new Date('2026-09-03T06:00:00.000Z'));
		setTonightAbsent(db, ['ben']);

		vi.setSystemTime(new Date('2026-09-03T17:00:00.000Z'));
		expect(tonightAbsent(db, family)).toEqual(['ben']);
	});
});

describe('somebody who left the family', () => {
	// A stored id nobody is configured for any more must not come back: the chip
	// row would not show them, so there would be no way to untick them, and the
	// evening would be refused with `rule.unknownPerson` from a screen that marks
	// nobody as away.
	it('is dropped from the stored evening', () => {
		setTonightAbsent(db, ['ben', 'cleo']);
		expect(tonightAbsent(db, [{ id: 'anna' }, { id: 'ben' }])).toEqual(['ben']);
	});

	it('leaves nothing behind when they were the only one away', () => {
		setTonightAbsent(db, ['cleo']);
		expect(tonightAbsent(db, [{ id: 'anna' }, { id: 'ben' }])).toEqual([]);
	});
});
