import { describe, expect, it } from 'vitest';
import { translator } from '$lib/i18n/translate';
import { hasUsableAdmin, loginIdentifierTaken, requireAdmin } from './settings';

describe('settings authorization and identities', () => {
	it('rejects non-administrators with a localized 403', () => {
		expect(() =>
			requireAdmin({ locals: { user: { id: 'alice', role: 'user' }, t: translator('de') } } as never)
		).toThrow(
			expect.objectContaining({ status: 403, body: { message: 'Administratorzugriff erforderlich.' } })
		);
	});

	it('protects the last enabled administrator', () => {
		expect(hasUsableAdmin([{ id: 'admin', name: 'Admin', role: 'admin', enabled: false }])).toBe(false);
		expect(hasUsableAdmin([{ id: 'admin', name: 'Admin', role: 'admin', enabled: true }])).toBe(true);
	});

	it('treats names and generated IDs as one login namespace', () => {
		const users = [{ id: 'anna-2', name: 'Anna', role: 'user' as const, enabled: true }];
		expect(loginIdentifierTaken(users, 'ANNA-2')).toBe(true);
		expect(loginIdentifierTaken(users, 'anna')).toBe(true);
		expect(loginIdentifierTaken(users, 'Anna', 'anna-2')).toBe(false);
	});
});
