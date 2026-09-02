import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, parseAbsent, requestJsonObject, requirePerson } from '$lib/server/api';
import { freePick } from '$lib/server/game';
import { toView } from '$lib/server/views';

export const POST: RequestHandler = ({ request, locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		const body = await requestJsonObject(request);
		const absent = parseAbsent(body.absent);
		const result = freePick(locals.db, locals.config, person, Number(body.movieId), absent);
		return json({
			winner: toView(locals.db, result.winner),
			absent: result.absent,
			blocked: result.blocked
		});
	});
