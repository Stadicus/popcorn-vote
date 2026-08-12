import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { handled, requirePerson } from '$lib/server/api';
import { deleteMovie, setProposer } from '$lib/server/game';

/**
 * Fields kept jointly, anyone may edit these: "where to find it" and who wanted
 * the movie. Only fields that were sent are changed, so that one call does not
 * empty the other field.
 */
export const PATCH: RequestHandler = ({ request, params, locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		const body = (await request.json()) as { sourceHint?: string | null; proposedBy?: string };
		const id = Number(params.id);
		if (body.sourceHint !== undefined) {
			// null and the empty string clear the field. Without the null check,
			// String(null) would write the text "null" into the database.
			const hint = body.sourceHint === null ? null : String(body.sourceHint).trim() || null;
			locals.db.prepare('UPDATE movies SET source_hint = ? WHERE id = ?').run(hint, id);
		}
		if (body.proposedBy !== undefined) {
			setProposer(locals.db, locals.config, person, id, String(body.proposedBy));
		}
		return json({ ok: true });
	});

export const DELETE: RequestHandler = ({ params, locals }) =>
	handled(locals, async () => {
		const person = requirePerson(locals);
		deleteMovie(locals.db, locals.config, person, Number(params.id));
		return json({ ok: true });
	});
