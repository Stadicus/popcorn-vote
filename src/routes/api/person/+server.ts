import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deviceCookie } from '$lib/server/cookies';

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	const { personId } = (await request.json()) as { personId?: string };
	const person = locals.config.members.find((m) => m.id === personId);
	if (!person) return json({ error: locals.t('rule.unknownPerson') }, { status: 400 });
	cookies.set('pv_person', person.id, deviceCookie(locals.config, request.headers, { httpOnly: false }));
	return json({ ok: true });
};
