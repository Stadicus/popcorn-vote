import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		locals.db.prepare('SELECT 1').get();
		return json({ status: 'ok' });
	} catch {
		return json({ status: 'error' }, { status: 500 });
	}
};
