import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { absentFromRequest, handled, requirePerson } from '$lib/server/api';
import { evaluate } from '$lib/server/game';
import { toView } from '$lib/server/views';

export const POST: RequestHandler = ({ request, locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		const absent = await absentFromRequest(request);
		const result = evaluate(locals.db, locals.config, person, undefined, absent);
		return json({
			winner: toView(locals.db, result.winner),
			wheel: result.wheel,
			standings: result.standings,
			absent: result.absent,
			blocked: result.blocked
		});
	});
