import { describe, it, expect } from 'vitest';
import { applySchema, createDb, metaGet, metaSet } from './db';

// The schema is created with `CREATE TABLE IF NOT EXISTS`, which does nothing at
// all to a table that already exists. Every column added after an installation
// has shipped therefore needs its own catch-up, and this is where that is
// checked, against a database built the way an older version left it.

/** The `movies` table as it looked before `tmdb_rating` and `absent` existed. */
const MOVIES_BEFORE = `
CREATE TABLE movies (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	status TEXT NOT NULL DEFAULT 'list',
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
	poster_file TEXT,
	trailer_youtube_id TEXT,
	source_hint TEXT,
	proposed_by TEXT NOT NULL,
	created_at TEXT NOT NULL,
	won_at TEXT,
	won_via TEXT,
	watched_at TEXT,
	deleted_at TEXT,
	deleted_by TEXT,
	trash_stakes TEXT
)`;

/**
 * A database at the old state: written out rather than trimmed with
 * `ALTER TABLE … DROP COLUMN`, which needs SQLite 3.35 and would end up testing
 * the SQLite version instead of our own catch-up.
 */
function databaseFromBefore() {
	const db = createDb(':memory:');
	db.exec('DROP TABLE movies');
	db.exec(MOVIES_BEFORE);
	db.prepare(
		`INSERT INTO movies (title, imdb_rating, proposed_by, created_at)
		 VALUES ('Das Boot', 7.9, 'anna', '2026-01-01T00:00:00.000Z')`
	).run();
	return db;
}

function columns(db: ReturnType<typeof createDb>): string[] {
	return (db.prepare('PRAGMA table_info(movies)').all() as { name: string }[]).map((c) => c.name);
}

describe('catching up an older database', () => {
	it('adds tmdb_rating and keeps the rows', () => {
		const db = databaseFromBefore();
		expect(columns(db)).not.toContain('tmdb_rating');

		applySchema(db);

		expect(columns(db)).toContain('tmdb_rating');
		const row = db.prepare('SELECT title, imdb_rating, tmdb_rating FROM movies').get() as {
			title: string;
			imdb_rating: number;
			tmdb_rating: number | null;
		};
		// The row survives, its old values untouched, and the new column is simply
		// empty until something fills it.
		expect(row.title).toBe('Das Boot');
		expect(row.imdb_rating).toBe(7.9);
		expect(row.tmdb_rating).toBeNull();
	});

	// It runs on every start, so running it twice has to be as harmless as once.
	it('does nothing the second time', () => {
		const db = databaseFromBefore();
		applySchema(db);
		expect(() => applySchema(db)).not.toThrow();
		expect(columns(db).filter((c) => c === 'tmdb_rating')).toHaveLength(1);
		expect(columns(db).filter((c) => c === 'absent')).toHaveLength(1);
		expect(db.prepare('SELECT count(*) AS n FROM movies').get()).toEqual({ n: 1 });
	});

	it('adds absent and leaves the existing rows on "everybody was there"', () => {
		const db = databaseFromBefore();
		expect(columns(db)).not.toContain('absent');

		applySchema(db);

		expect(columns(db)).toContain('absent');
		// NULL, not an empty array: every movie won before partial nights existed
		// was watched by whoever was around, and the app must not claim otherwise.
		const row = db.prepare('SELECT title, absent FROM movies').get() as {
			title: string;
			absent: string | null;
		};
		expect(row.title).toBe('Das Boot');
		expect(row.absent).toBeNull();
	});

	it('leaves a current database alone', () => {
		const db = createDb(':memory:');
		expect(columns(db)).toContain('tmdb_rating');
		expect(columns(db)).toContain('absent');
		applySchema(db);
		expect(columns(db)).toContain('tmdb_rating');
		expect(columns(db)).toContain('absent');
	});
});

describe('the meta table', () => {
	it('reads back what was written and overwrites on the second write', () => {
		const db = createDb(':memory:');
		expect(metaGet(db, 'nothing_here')).toBeNull();
		metaSet(db, 'cursor', '7');
		expect(metaGet(db, 'cursor')).toBe('7');
		metaSet(db, 'cursor', '9');
		expect(metaGet(db, 'cursor')).toBe('9');
	});
});
