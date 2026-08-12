import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, requirePerson } from '$lib/server/api';
import { evaluate } from '$lib/server/game';
import { toView } from '$lib/server/views';

export const POST: RequestHandler = ({ locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		const result = evaluate(locals.db, locals.config, person);
		return json({
			winner: toView(locals.db, result.winner),
			wheel: result.wheel,
			standings: result.standings
		});
	});
