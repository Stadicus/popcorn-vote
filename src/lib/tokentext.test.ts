import { describe, it, expect } from 'vitest';
import { translator } from './i18n/translate';
import { capReachedSentence, creditSentence, hourName, weekdayName } from './tokentext';

const de = translator('de');
const en = translator('en');

describe('credit sentences', () => {
	it('names the weekdays from Sunday to Saturday in each language', () => {
		expect(weekdayName('de', 0)).toBe('Sonntag');
		expect(weekdayName('de', 6)).toBe('Samstag');
		expect(weekdayName('en', 0)).toBe('Sunday');
		expect(weekdayName('en', 6)).toBe('Saturday');
	});

	it('falls back to Sunday for an impossible weekday', () => {
		expect(weekdayName('de', 9)).toBe('Sonntag');
		expect(weekdayName('de', -1)).toBe('Sonntag');
	});

	it('writes the time the way the language writes it', () => {
		expect(hourName('de', 8)).toBe('8:00');
		expect(hourName('de', 20)).toBe('20:00');
		expect(hourName('en', 20)).toBe('8:00 PM');
	});

	it('names a single vote in the singular', () => {
		expect(creditSentence(de, 'de', { amount: 1, weekday: 0, hour: 8, cap: 5 })).toBe(
			'Jeden Sonntag um 8:00 Uhr kommt eine neue Stimme dazu, bis zu einem Guthaben von 5.'
		);
		expect(creditSentence(en, 'en', { amount: 1, weekday: 0, hour: 8, cap: 5 })).toBe(
			'Get one new vote every Sunday at 8:00 AM, up to a balance of 5.'
		);
	});

	it('names several votes with a number', () => {
		expect(creditSentence(de, 'de', { amount: 3, weekday: 6, hour: 18, cap: 8 })).toBe(
			'Jeden Samstag um 18:00 Uhr kommen 3 neue Stimmen dazu, bis zu einem Guthaben von 8.'
		);
		expect(creditSentence(en, 'en', { amount: 3, weekday: 6, hour: 18, cap: 8 })).toBe(
			'Get 3 new votes every Saturday at 6:00 PM, up to a balance of 8.'
		);
	});

	it('matches the full-balance notice to the amount', () => {
		expect(capReachedSentence(de, 'de', { amount: 1, weekday: 3, hour: 8, cap: 5 })).toContain(
			'die nächste am Mittwoch'
		);
		expect(capReachedSentence(de, 'de', { amount: 2, weekday: 3, hour: 8, cap: 5 })).toContain(
			'die nächsten 2 am Mittwoch'
		);
		expect(capReachedSentence(en, 'en', { amount: 1, weekday: 3, hour: 8, cap: 5 })).toContain(
			'the next one will be lost on Wednesday'
		);
	});
});
