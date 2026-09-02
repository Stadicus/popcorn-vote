import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, parseAbsent, requestJsonObject } from '$lib/server/api';
import { currentWinner, validAbsent } from '$lib/server/game';
import { setTonightAbsent, tonightAbsent } from '$lib/server/tonight';

/**
 * Who is not here tonight, for every device at once.
 *
 * Not a move in the game and therefore no actor: this only tells the television
 * what the phone already shows. The PIN gates it like everything else, and the
 * ids are checked against the family before anything is written.
 *
 * `validAbsent()` rather than `requireAbsent()`: while a finger is moving across
 * the chips, "everybody is away" is an ordinary in-between state that has to be
 * recordable. Refusing to *evaluate* such a night is a different question, and
 * `/api/evaluate` answers it.
 */
export const POST: RequestHandler = ({ request, locals }) =>
	handled(locals, async () => {
		const body = await requestJsonObject(request);
		const absent = validAbsent(locals.config, parseAbsent(body.absent));

		// A winner is on the table, so the evening is already decided and the phone
		// has nothing left to say about it. Not an error — the caller did nothing
		// wrong — so the stored evening goes back and the phone corrects itself.
		if (currentWinner(locals.db)) {
			return json({ ok: true, absent: tonightAbsent(locals.db) });
		}

		setTonightAbsent(locals.db, absent);
		return json({ ok: true, absent });
	});
