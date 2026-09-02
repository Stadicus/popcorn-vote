/**
 * The ranking as a rule of arithmetic, in one place for both sides.
 *
 * The evaluation page and `game.ts` have to agree on who is a candidate and who
 * is waiting for somebody, down to the last token: the phone greys out a movie
 * before the tap, the server refuses it after. Two copies of that rule would
 * eventually disagree, and the family would read one answer on the screen and
 * get another from the button.
 *
 * No Node imports here on purpose. `game.ts` reaches for `node:crypto` and can
 * therefore never be imported by a page; this module can, the same way
 * `member.ts` and `tokentext.ts` are shared.
 */

/** One movie on the board of a night, counted for whoever is actually there. */
export interface NightStanding {
	movieId: number;
	title: string;
	/** Votes of the people who are there. This is what decides the night. */
	tokens: number;
	/** Votes of everybody, absent people included. Only `nightVerdict()` needs it. */
	allTokens: number;
	/** The absent people with a vote on this movie. Empty means it is a candidate. */
	blockedBy: string[];
}

/**
 * A movie that waits for somebody, as it travels: in the event payload, in the
 * answer of `/api/evaluate` and `/api/free-pick`, and in the log. Deliberately
 * not `NightStanding`: what leaves the server is the fact "this one waited for
 * these people", not the arithmetic that produced it.
 */
export interface BlockedMovie {
	movieId: number;
	title: string;
	byPersonIds: string[];
}

/** What a movie brings along for the count: who put how much on it. */
export interface StakeCount {
	personId: string;
	count: number;
}

/**
 * One order for the movie list, the evaluation page and the TV board: most
 * tokens at the top, on a tie alphabetically by German rules (umlauts sort with
 * their base letter, case ignored).
 *
 * Every view has to use the same comparison, otherwise, on a tie, the television
 * shows a different order than the phone beside it. SQLite cannot do this
 * (COLLATE knows no umlauts), so the sorting happens in JavaScript.
 */
export function byTokensThenTitle(
	a: { tokens: number; title: string },
	b: { tokens: number; title: string }
): number {
	return b.tokens - a.tokens || a.title.localeCompare(b.title, 'de', { sensitivity: 'base' });
}

/**
 * The board for one night: counts only the votes of the people who are there,
 * and marks every movie that carries a vote of somebody who is not.
 *
 * Blocked movies stay in the list rather than disappearing from it. A movie that
 * silently vanished the moment somebody was ticked off would read as "deleted",
 * and the point of the whole feature is the opposite: it is still there, it is
 * waiting.
 *
 * With `absent` empty nothing can be blocked, so the result is exactly the plain
 * count with an empty `blockedBy` on every row. That is not a coincidence to be
 * preserved by hand, it is the reason there is only one code path.
 */
export function nightBoard(
	movies: { id: number; title: string; stakes: StakeCount[] }[],
	absent: string[]
): NightStanding[] {
	const away = new Set(absent);
	return movies
		.map((movie) => {
			let tokens = 0;
			let allTokens = 0;
			const blockedBy: string[] = [];
			for (const stake of movie.stakes) {
				allTokens += stake.count;
				if (!away.has(stake.personId)) tokens += stake.count;
				else if (stake.count > 0) blockedBy.push(stake.personId);
			}
			return {
				movieId: movie.id,
				title: movie.title,
				tokens,
				allTokens,
				// In the order the night was entered rather than the order the stakes
				// happen to come out of the database, so two movies name the same two
				// people in the same sequence.
				blockedBy: absent.filter((id) => blockedBy.includes(id))
			};
		})
		.sort(byTokensThenTitle);
}

/** The waiting movies of a board, in the shape that gets stored and shown. */
export function toBlocked(board: NightStanding[]): BlockedMovie[] {
	return board
		.filter((s) => s.blockedBy.length > 0)
		.map((s) => ({ movieId: s.movieId, title: s.title, byPersonIds: s.blockedBy }));
}

/**
 * The board for the television: candidates first, whoever is waiting after
 * them.
 *
 * The phone leaves waiting movies where their votes put them — it is the
 * working surface, and the list is the list. The television is the stage, and
 * the stage shows what can win tonight. Sorting the waiting rows to the end is
 * what makes `board[0]` the leading candidate again, and with that the crown,
 * the fade and the seven visible rows all stay correct without a special case
 * of their own.
 *
 * The sort is stable (guaranteed since ES2019), so the order `nightBoard()`
 * produced survives inside both groups; the shared comparator still decides
 * ties exactly as it does on the phone.
 *
 * Rows nobody voted for are dropped, as before — from across the living room
 * they are noise. A blocked row with no votes of the people present is kept:
 * it has votes, they just belong to somebody who is not here, and it should be
 * visibly waiting rather than gone.
 */
export function tvBoard(standings: NightStanding[]): NightStanding[] {
	return standings
		.filter((s) => s.tokens > 0 || s.blockedBy.length > 0)
		.sort((a, b) => Number(a.blockedBy.length > 0) - Number(b.blockedBy.length > 0));
}

/**
 * What can be done with this board, as three states that cannot overlap.
 *
 * `noTokens` and `allBlocked` are kept apart because they need different words:
 * "add a vote first" is useless advice when there are plenty of votes and every
 * single one of them belongs to somebody who is not here.
 */
export type NightVerdict =
	{ state: 'noTokens' } | { state: 'allBlocked'; personIds: string[] } | { state: 'ready' };

/**
 * The one judgement the button on the phone and the rule on the server both
 * follow. Never a quiet fallback to the full count: if everything with a vote on
 * it is waiting for somebody, the night says so and stops.
 *
 * `absent` only fixes the order of the names, so the sentence reads the same on
 * both sides; which people block is already in the board.
 */
export function nightVerdict(board: NightStanding[], absent: string[]): NightVerdict {
	const totalAll = board.reduce((sum, s) => sum + s.allTokens, 0);
	if (totalAll === 0) return { state: 'noTokens' };
	const candidateTokens = board.filter((s) => s.blockedBy.length === 0).reduce((sum, s) => sum + s.tokens, 0);
	if (candidateTokens > 0) return { state: 'ready' };
	const blocking = new Set(board.flatMap((s) => s.blockedBy));
	return { state: 'allBlocked', personIds: absent.filter((id) => blocking.has(id)) };
}
