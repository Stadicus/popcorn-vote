import type { PageServerLoad } from './$types';
import { keyProblem } from '$lib/server/keys';

/**
 * A missing OMDb key costs the IMDb rating and nothing else, movies can be
 * suggested, voted on and watched exactly as before. That is too little for a
 * banner in the middle of the game and too much to leave in the container log
 * alone, so it goes here, where the rest of the operator's small print lives.
 */
export const load: PageServerLoad = ({ locals }) => ({
	isAdmin: locals.user?.role === 'admin',
	omdbProblem: keyProblem(locals.config, 'omdb'),
	// Both, or nothing: the switch decides, and a link without an address would be
	// one that goes nowhere. The address has already been checked to be http or
	// https in config.ts, it ends up in an href.
	dailyBuildUrl: locals.config.dailyBuild ? locals.config.dailyBuildUrl : ''
});
