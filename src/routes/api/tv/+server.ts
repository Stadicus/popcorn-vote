import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { standings } from '$lib/server/game';
import { latestEvent, winnerMovie } from '$lib/server/views';

/** Data source of the TV view; polled every few seconds. */
export const GET: RequestHandler = async ({ locals }) => {
	return json({
		standings: standings(locals.db),
		winner: winnerMovie(locals.db),
		lastEvent: latestEvent(locals.db)
	});
};
