import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, requestJsonObject, requirePerson } from '$lib/server/api';
import { confirmWatched, revertWinner, RuleError } from '$lib/server/game';

export const POST: RequestHandler = ({ request, locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		const { action } = await requestJsonObject(request);
		if (action === 'watched') {
			const movie = confirmWatched(locals.db, locals.config, person);
			return json({ ok: true, movieId: movie.id });
		}
		if (action === 'revert') {
			const movie = revertWinner(locals.db, locals.config, person);
			return json({ ok: true, movieId: movie.id });
		}
		throw new RuleError('rule.unknownAction');
	});
