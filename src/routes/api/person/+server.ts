import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deviceCookie } from '$lib/server/cookies';
import { handled, requestJsonObject } from '$lib/server/api';

export const POST: RequestHandler = ({ request, cookies, locals }) =>
	handled(locals, async () => {
		const { personId } = await requestJsonObject(request);
		const person = locals.config.members.find((m) => m.id === personId);
		if (!person) return json({ error: locals.t('rule.unknownPerson') }, { status: 400 });
		cookies.set('pv_person', person.id, deviceCookie(locals.config, request.headers, { httpOnly: false }));
		return json({ ok: true });
	});
