import type { AppConfig } from './config';
import type { DB } from './db';
import { metaGet } from './db';

export function authenticationMissing(config: AppConfig): boolean {
	return config.users.length === 0 && !config.pin;
}

/** Setup is safe only before this database has ever been used or authenticated. */
export function pristineForSetup(db: DB): boolean {
	if (metaGet(db, 'auth_secret')) return false;
	const movies = db.prepare('SELECT COUNT(*) AS count FROM movies').get() as { count: number };
	const events = db.prepare('SELECT COUNT(*) AS count FROM events').get() as { count: number };
	return movies.count === 0 && events.count === 0;
}
