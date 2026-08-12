import fs from 'node:fs';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * Exactly what `downloadPoster` writes: sixteen hex characters and one of the
 * four extensions it stores. Case-insensitive on the extension, because it used
 * to be taken from TMDB's poster path unchanged — a cover saved before that was
 * lowercased and clamped must keep being served.
 *
 * This is a guard, not a fix for a reachable fault: the URL layer normalises
 * `..` and `.` out of the path long before the handler sees it, so no request
 * can walk out of the covers folder. What it does buy is that a name this app
 * could never have written is answered without touching the file system.
 */
const COVER_NAME = /^[a-f0-9]{16}\.(jpg|jpeg|png|webp)$/i;

export const GET: RequestHandler = async ({ params, locals }) => {
	const name = path.basename(params.file);
	if (!COVER_NAME.test(name)) throw error(404, 'Cover not found');
	const file = path.join(locals.config.dataDir, 'covers', name);
	if (!fs.existsSync(file)) throw error(404, 'Cover not found');
	const ext = path.extname(name).toLowerCase();
	const type = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
	return new Response(fs.readFileSync(file), {
		headers: {
			'Content-Type': type,
			// A short browser cache keeps every copy safely inside TMDB's six-month
			// retention limit; the server removes expired source files daily.
			'Cache-Control': 'private, max-age=86400'
		}
	});
};
