import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { nightStandings } from '$lib/server/game';
import { tonightAbsent } from '$lib/server/tonight';
import { latestEvent, winnerMovie } from '$lib/server/views';

/** Data source of the TV view; polled every few seconds. */
export const GET: RequestHandler = async ({ locals }) => {
	// The one thing the television cannot know by itself: who is in the room.
	// With nobody named this is the plain count it always was. Not handed on as a
	// field of its own: every row carries its own `blockedBy`, which is what the
	// page renders from.
	const absent = tonightAbsent(locals.db, locals.config.members);
	return json({
		standings: nightStandings(locals.db, absent),
		winner: winnerMovie(locals.db),
		lastEvent: latestEvent(locals.db)
	});
};
