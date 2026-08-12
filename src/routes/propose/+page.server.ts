import type { PageServerLoad } from './$types';
import { keyProblem, keyState } from '$lib/server/keys';

/**
 * Whether the movie search works at all — this is the page that breaks when the
 * TMDB key does not, so this is where it has to be said. Only the catalogue key
 * travels to the browser, never the configured key itself, and this route sits
 * behind the PIN like every other one.
 */
export const load: PageServerLoad = ({ locals }) => {
	const state = keyState(locals.config, 'tmdb');
	return {
		tmdbProblem: keyProblem(locals.config, 'tmdb'),
		// A key that is simply not there cannot be talked round, so the field is
		// disabled rather than failing on every keystroke. A refusal is different:
		// it is a verdict from an earlier request, and only a new one can overturn
		// it. Disabling the field there would seal the notice in until the next
		// restart.
		tmdbSearchable: state !== 'missing' && state !== 'placeholder'
	};
};
