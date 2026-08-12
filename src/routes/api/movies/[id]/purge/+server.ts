import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, requirePerson } from '$lib/server/api';
import { purgeMovie } from '$lib/server/game';

export const POST: RequestHandler = ({ params, locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		purgeMovie(locals.db, locals.config, person, Number(params.id));
		return json({ ok: true });
	});
