import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, requestJsonObject, requirePerson } from '$lib/server/api';
import { freePick } from '$lib/server/game';
import { toView } from '$lib/server/views';

export const POST: RequestHandler = ({ request, locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		const { movieId } = await requestJsonObject(request);
		const winner = freePick(locals.db, locals.config, person, Number(movieId));
		return json({ winner: toView(locals.db, winner) });
	});
