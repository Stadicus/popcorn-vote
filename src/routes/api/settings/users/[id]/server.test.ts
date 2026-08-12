import { beforeEach, describe, expect, it, vi } from 'vitest';
import { translator } from '$lib/i18n/translate';

const { replaceUsers, storedUsers } = vi.hoisted(() => ({
	replaceUsers: vi.fn(),
	storedUsers: vi.fn()
}));

vi.mock('$lib/server/config-service', () => ({ replaceUsers, storedUsers }));

import { PUT } from './+server';

const admin = {
	id: 'admin',
	name: 'Admin',
	role: 'admin' as const,
	enabled: true,
	pin_hash: 'scrypt$salt$hash'
};

function event(body: unknown) {
	return {
		params: { id: 'admin' },
		request: new Request('http://localhost/api/settings/users/admin', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: {
			user: { kind: 'user', id: 'admin', role: 'admin' },
			t: translator('en')
		}
	} as never;
}

describe('user settings update API', () => {
	beforeEach(() => {
		replaceUsers.mockReset();
		storedUsers.mockReset();
		storedUsers.mockReturnValue([{ ...admin }]);
	});

	it.each([{ enabled: 'false' }, { enabled: 0 }, { role: 'owner' }, { pin: 1234 }, { name: false }])(
		'rejects malformed account fields before writing: %j',
		async (body) => {
			const response = await PUT(event(body));
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: 'Invalid account data.' });
			expect(replaceUsers).not.toHaveBeenCalled();
		}
	);

	it('cannot bypass self-lockout with a string boolean', async () => {
		const response = await PUT(event({ enabled: 'false' }));
		expect(response.status).toBe(400);
		expect(storedUsers()).toEqual([admin]);
		expect(replaceUsers).not.toHaveBeenCalled();
	});
});
