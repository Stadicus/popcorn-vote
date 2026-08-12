import type { LayoutServerLoad } from './$types';
import { isLocale, LANG_COOKIE } from '$lib/i18n/locales';
import { DEFAULT_TITLE } from '$lib/server/config';
import { getBalance } from '$lib/server/game';
import { balances, winnerMovie } from '$lib/server/views';

export const load: LayoutServerLoad = async ({ cookies, locals }) => {
	// What this device chose for itself, or null for "follow the instance". The
	// switcher has to tell the two apart, and the cookie is httpOnly — the client
	// cannot look it up itself. Like the language, this says nothing about the
	// family and may therefore cross the PIN boundary.
	const cookie = cookies.get(LANG_COOKIE);
	const languageChoice = isLocale(cookie) ? cookie : null;

	// This load also runs on the PIN page, which is deliberately open. Anything
	// that gives away something about the family is therefore withheld until the
	// PIN has been entered — otherwise anyone who knows the address reads names
	// and token counts straight out of the delivered HTML.
	if (!locals.authed) {
		return {
			// The language gives away nothing about the family and may therefore go
			// out before the PIN — the PIN page itself needs it.
			locale: locals.locale,
			languageChoice,
			// The title can carry the family name too — only after the PIN.
			title: DEFAULT_TITLE,
			members: [],
			personId: null,
			balance: 0,
			balances: {},
			// The credit rules are no secret, they are in every example
			// configuration. The texts that mention them need these in both
			// branches.
			tokenCap: locals.config.tokenCap,
			tokenAmount: locals.config.tokenAmount,
			tokenWeekday: locals.config.tokenWeekday,
			tokenHour: locals.config.tokenHour,
			hasWinner: false
		};
	}

	return {
		locale: locals.locale,
		languageChoice,
		title: locals.config.title,
		members: locals.config.members,
		personId: locals.personId,
		balance: locals.personId ? getBalance(locals.db, locals.personId) : 0,
		// Everyone's balance for the picker — so you can see who still has tokens
		// left before switching.
		balances: balances(locals.db, locals.config),
		tokenCap: locals.config.tokenCap,
		tokenAmount: locals.config.tokenAmount,
		tokenWeekday: locals.config.tokenWeekday,
		tokenHour: locals.config.tokenHour,
		hasWinner: winnerMovie(locals.db) !== null
	};
};
