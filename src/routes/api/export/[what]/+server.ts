import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { archiveCsv, listCsv } from '$lib/server/csv';

export const GET: RequestHandler = async ({ params, locals }) => {
	let csv: string;
	let name: string;
	if (params.what === 'archive') {
		csv = archiveCsv(locals.db);
		name = 'popcorn-vote-archive.csv';
	} else if (params.what === 'list') {
		csv = listCsv(locals.db);
		name = 'popcorn-vote-list.csv';
	} else {
		throw error(404, 'Unknown export');
	}
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${name}"`
		}
	});
};
