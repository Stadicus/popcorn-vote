import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, requirePerson } from '$lib/server/api';
import { restoreMovie } from '$lib/server/game';

export const POST: RequestHandler = ({ params, locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		restoreMovie(locals.db, locals.config, person, Number(params.id));
		return json({ ok: true });
	});
