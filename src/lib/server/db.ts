import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './config';

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS balances (
	person_id TEXT PRIMARY KEY,
	free_tokens INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS movies (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	status TEXT NOT NULL DEFAULT 'list', -- list | winner | archived | trashed
	title TEXT NOT NULL,
	year INTEGER,
	tmdb_id INTEGER,
	imdb_id TEXT,
	overview TEXT,
	runtime INTEGER,
	genres TEXT,
	certification TEXT,
	original_language TEXT,
	imdb_rating REAL,
	tmdb_rating REAL,
	poster_file TEXT,
	trailer_youtube_id TEXT,
	source_hint TEXT,
	proposed_by TEXT NOT NULL,
	created_at TEXT NOT NULL,
	won_at TEXT,
	won_via TEXT,
	-- Who was not there when this movie won, as a JSON array of person ids. NULL
	-- is the normal case: everybody was there.
	absent TEXT,
	watched_at TEXT,
	deleted_at TEXT,
	deleted_by TEXT,
	trash_stakes TEXT
);
CREATE TABLE IF NOT EXISTS stakes (
	movie_id INTEGER NOT NULL,
	person_id TEXT NOT NULL,
	count INTEGER NOT NULL,
	PRIMARY KEY (movie_id, person_id)
);
CREATE TABLE IF NOT EXISTS ratings (
	movie_id INTEGER NOT NULL,
	person_id TEXT NOT NULL,
	stars REAL NOT NULL,
	rated_at TEXT NOT NULL,
	PRIMARY KEY (movie_id, person_id)
);
CREATE TABLE IF NOT EXISTS pin_attempts (
	ip TEXT PRIMARY KEY,
	failures INTEGER NOT NULL DEFAULT 0,
	locked_until TEXT,
	updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	type TEXT NOT NULL, -- evaluation | free_pick | reverted | watched | proposer_changed
	-- the first four are WINNER_LIFECYCLE_EVENT_TYPES in views.ts, which the TV stage acts on
	actor TEXT NOT NULL,
	created_at TEXT NOT NULL,
	payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_movies_status ON movies(status);
CREATE INDEX IF NOT EXISTS idx_stakes_movie ON stakes(movie_id);
`;

/** Adds a missing literal schema column. */
function ensureColumn(db: DB, table: string, column: string, type: string): void {
	const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
	if (columns.some((c) => c.name === column)) return;
	db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

/**
 * Creates what is missing and adds what an older database lacks.
 *
 * Separate from `createDb` so a test can apply it to a database it prepared
 * itself, `createDb` opens its own connection from a file name and could not
 * take one over.
 */
export function applySchema(db: DB): void {
	db.exec(SCHEMA);
	ensureColumn(db, 'movies', 'tmdb_rating', 'REAL');
	ensureColumn(db, 'movies', 'absent', 'TEXT');
}

export function createDb(file: string): DB {
	const db = new Database(file);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	applySchema(db);
	return db;
}

let instance: DB | null = null;

/** The one data file. Everything else in the data directory can be recreated. */
const DB_FILE = 'popcornvote.sqlite';

export function getDb(): DB {
	if (instance) return instance;
	const dir = dataDir();
	fs.mkdirSync(dir, { recursive: true });
	fs.mkdirSync(path.join(dir, 'covers'), { recursive: true });
	fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
	instance = createDb(path.join(dir, DB_FILE));
	return instance;
}

export function metaGet(db: DB, key: string): string | null {
	const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
	return row?.value ?? null;
}

export function metaSet(db: DB, key: string, value: string): void {
	db.prepare(
		'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
	).run(key, value);
}
