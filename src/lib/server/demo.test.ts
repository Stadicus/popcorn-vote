import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type DB } from './db';
import type { AppConfig } from './config';
import { seedDemoMovies } from './demo';

// In-memory database, no network: without a TMDB key the seeding creates the
// movies from their titles alone, exactly the path a test instance without a
// key takes as well.

const config: AppConfig = {
	title: 'Movie Night',
	members: [
		{ id: 'anna', name: 'Anna', color: '#e63946', emoji: '🦊' },
		{ id: 'ben', name: 'Ben', color: '#457b9d', emoji: '🐻' },
		{ id: 'cleo', name: 'Cleo', color: '#2a9d8f', emoji: '🐸' },
		{ id: 'dario', name: 'Dario', color: '#e9c46a', emoji: '🦄' }
	],
	tokenAmount: 1,
	tokenWeekday: 0,
	tokenHour: 8,
	tokenCap: 5,
	tokenStart: 3,
	sources: ['Netflix'],
	interfaceLanguage: 'de',
	language: 'de-DE',
	languageFallback: 'en-US',
	certificationCountry: 'DE',
	trailerLanguages: ['original', 'en', 'de'],
	timezone: 'Europe/Berlin',
	backupHour: 3,
	backupKeep: 14,
	demoData: true,
	dailyBuild: false,
	dailyBuildUrl: '',
	tmdbApiKey: '',
	omdbApiKey: '',
	tmdbKeyState: 'missing',
	omdbKeyState: 'missing',
	pin: '1234',
	dataDir: '/tmp/pv-test',
	httpsProof: { mode: 'none' }
};

let db: DB;

function countRows(status: string): number {
	const { count } = db.prepare('SELECT COUNT(*) AS count FROM movies WHERE status = ?').get(status) as {
		count: number;
	};
	return count;
}

function oneNumber(sql: string): number {
	const row = db.prepare(sql).get() as Record<string, number>;
	return Object.values(row)[0];
}

beforeEach(() => {
	db = createDb(':memory:');
});

describe('demo content', () => {
	it('fills list, archive, log and trash', async () => {
		await seedDemoMovies(db, config);

		expect(countRows('list')).toBe(6);
		expect(countRows('archived')).toBe(3);
		expect(countRows('trashed')).toBe(2);
		expect(countRows('winner')).toBe(0); // no winner is left pending

		// One evaluation and one "watched" per archived film.
		expect(oneNumber("SELECT COUNT(*) AS n FROM events WHERE type = 'evaluation'")).toBe(3);
		expect(oneNumber("SELECT COUNT(*) AS n FROM events WHERE type = 'watched'")).toBe(3);
		expect(oneNumber('SELECT COUNT(*) AS n FROM ratings')).toBe(3 * config.members.length);
	});

	it('places tokens on the list movies and leaves balance over', async () => {
		await seedDemoMovies(db, config);

		expect(oneNumber('SELECT COALESCE(SUM(count), 0) AS n FROM stakes')).toBeGreaterThan(0);
		// The balances end on plausible values, not on the working value the
		// seeding used.
		const highest = oneNumber('SELECT MAX(free_tokens) AS n FROM balances');
		expect(highest).toBeLessThanOrEqual(config.tokenCap);
		expect(oneNumber('SELECT MIN(free_tokens) AS n FROM balances')).toBeGreaterThan(0);
	});

	// The tokens of an archived movie are spent, those of a deleted one given
	// back, the real flow does both, not the seeding.
	it('leaves tokens on neither archive nor trash movies', async () => {
		await seedDemoMovies(db, config);

		expect(
			oneNumber(
				"SELECT COUNT(*) AS n FROM stakes s JOIN movies m ON m.id = s.movie_id WHERE m.status IN ('archived', 'trashed')"
			)
		).toBe(0);
		// The trash remembers what was on the film.
		expect(
			oneNumber("SELECT COUNT(*) AS n FROM movies WHERE status = 'trashed' AND trash_stakes IS NOT NULL")
		).toBe(2);
	});

	// Archive, log and trash have to tell the same timeline.
	it('back-dates every timestamp into the past', async () => {
		await seedDemoMovies(db, config);
		const yesterday = new Date(Date.now() - 3_600_000).toISOString();

		expect(oneNumber(`SELECT COUNT(*) AS n FROM movies WHERE watched_at >= '${yesterday}'`)).toBe(0);
		expect(oneNumber(`SELECT COUNT(*) AS n FROM movies WHERE won_at >= '${yesterday}'`)).toBe(0);
		expect(oneNumber(`SELECT COUNT(*) AS n FROM movies WHERE deleted_at >= '${yesterday}'`)).toBe(0);
		expect(oneNumber(`SELECT COUNT(*) AS n FROM movies WHERE created_at >= '${yesterday}'`)).toBe(0);
		expect(oneNumber(`SELECT COUNT(*) AS n FROM events WHERE created_at >= '${yesterday}'`)).toBe(0);
		expect(oneNumber(`SELECT COUNT(*) AS n FROM ratings WHERE rated_at >= '${yesterday}'`)).toBe(0);
	});

	// A movie's log entry must not be newer than its archive entry, otherwise
	// the log would contradict the archive.
	it('puts the evaluation before the confirmed movie night', async () => {
		await seedDemoMovies(db, config);
		const evaluations = db
			.prepare("SELECT created_at FROM events WHERE type = 'evaluation' ORDER BY id")
			.all() as { created_at: string }[];
		const evenings = db
			.prepare("SELECT watched_at FROM movies WHERE status = 'archived' ORDER BY id")
			.all() as { watched_at: string }[];

		expect(evaluations).toHaveLength(evenings.length);
		evaluations.forEach((e, i) => expect(e.created_at < evenings[i].watched_at).toBe(true));
	});

	it('does nothing on a second run', async () => {
		await seedDemoMovies(db, config);
		const before = oneNumber('SELECT COUNT(*) AS n FROM movies');
		await seedDemoMovies(db, config);
		expect(oneNumber('SELECT COUNT(*) AS n FROM movies')).toBe(before);
	});

	it('does not touch a movie table that is not empty', async () => {
		db.prepare(
			"INSERT INTO movies (status, title, proposed_by, created_at) VALUES ('list', 'A real movie', 'anna', ?)"
		).run(new Date().toISOString());
		await seedDemoMovies(db, config);
		expect(oneNumber('SELECT COUNT(*) AS n FROM movies')).toBe(1);
	});

	it('stays idle without the setting', async () => {
		await seedDemoMovies(db, { ...config, demoData: false });
		expect(oneNumber('SELECT COUNT(*) AS n FROM movies')).toBe(0);
	});

	// The plans name people by index and wrap around: a family of two gets
	// complete demo content as well.
	it('gets by with two people', async () => {
		await seedDemoMovies(db, { ...config, members: config.members.slice(0, 2) });
		expect(countRows('list')).toBe(6);
		expect(countRows('archived')).toBe(3);
		expect(countRows('trashed')).toBe(2);
	});
});
