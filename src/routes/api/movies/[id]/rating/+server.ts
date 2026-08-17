import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, requestJsonObject, requirePerson } from '$lib/server/api';
import { rate } from '$lib/server/game';

export const POST: RequestHandler = ({ request, params, locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		const { stars } = await requestJsonObject(request);
		rate(locals.db, locals.config, person, Number(params.id), Number(stars));
		return json({ ok: true });
	});
