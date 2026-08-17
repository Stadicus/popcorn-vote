import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, requestJsonObject, requirePerson } from '$lib/server/api';
import { stake, getBalance } from '$lib/server/game';

export const POST: RequestHandler = ({ request, locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		const { movieId, delta } = await requestJsonObject(request);
		stake(locals.db, locals.config, person, Number(movieId), delta === -1 ? -1 : 1);
		return json({ ok: true, balance: getBalance(locals.db, person) });
	});
