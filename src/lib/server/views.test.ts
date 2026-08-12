import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type DB } from './db';
import { standings } from './game';
import { listMovies, latestEvent } from './views';

let db: DB;

function addMovie(title: string, tokens: number): number {
	const result = db
		.prepare("INSERT INTO movies (status, title, proposed_by, created_at) VALUES ('list', ?, ?, ?)")
		.run(title, 'anna', new Date().toISOString());
	const id = Number(result.lastInsertRowid);
	if (tokens > 0) {
		db.prepare('INSERT INTO stakes (movie_id, person_id, count) VALUES (?, ?, ?)').run(id, 'anna', tokens);
	}
	return id;
}

const titles = () => listMovies(db).map((m) => m.title);

beforeEach(() => {
	db = createDb(':memory:');
});

describe('order of the movie list', () => {
	it('sorts by tokens, descending', () => {
		addMovie('Wenig', 1);
		addMovie('Viel', 5);
		addMovie('Mittel', 3);
		expect(titles()).toEqual(['Viel', 'Mittel', 'Wenig']);
	});

	it('sorts alphabetically on a tie, not by when it was added', () => {
		addMovie('Zorro', 2);
		addMovie('Batman', 2);
		addMovie('Amelie', 2);
		expect(titles()).toEqual(['Amelie', 'Batman', 'Zorro']);
	});

	it('treats case and umlauts by German rules', () => {
		addMovie('avatar', 1);
		addMovie('Ärger im Paradies', 1);
		addMovie('Bambi', 1);
		expect(titles()).toEqual(['Ärger im Paradies', 'avatar', 'Bambi']);
	});

	it('puts tokens above the title', () => {
		addMovie('Zorro', 4);
		addMovie('Amelie', 1);
		expect(titles()).toEqual(['Zorro', 'Amelie']);
	});

	it('shows movies without tokens at the bottom, alphabetical among themselves', () => {
		addMovie('Solaris', 0);
		addMovie('Nosferatu', 0);
		addMovie('Casablanca', 1);
		expect(titles()).toEqual(['Casablanca', 'Nosferatu', 'Solaris']);
	});

	// The phone list, the evaluation page and the TV board hang in the same living
	// room at the same time, on a tie they must not contradict each other.
	it('sorts exactly like the evaluation page and the TV board', () => {
		addMovie('Zorro', 2); // older, would come first if sorted by when it was added
		addMovie('Amelie', 2);
		addMovie('Über allen Gipfeln', 5);
		expect(titles()).toEqual(standings(db).map((s) => s.title));
		expect(titles()).toEqual(['Über allen Gipfeln', 'Amelie', 'Zorro']);
	});
});

function addEvent(type: string): void {
	db.prepare('INSERT INTO events (type, actor, created_at, payload) VALUES (?, ?, ?, ?)').run(
		type,
		'anna',
		new Date().toISOString(),
		'{}'
	);
}

describe('latest event for the TV', () => {
	it('is the newest event of any kind, when it belongs to the winner lifecycle', () => {
		addEvent('evaluation');
		addEvent('watched');
		expect(latestEvent(db)?.type).toBe('watched');
	});

	// The bug this guards: a movie's suggestion can be reassigned to another
	// person at any time, by anyone, independently of the evening, if that
	// event could become "the latest event", it would make the TV think the
	// evaluation right before it had already been shown, and skip the wheel
	// replay and the celebration for a win that just happened.
	it('is not shadowed by an event outside that lifecycle', () => {
		addEvent('evaluation');
		addEvent('proposer_changed');
		expect(latestEvent(db)?.type).toBe('evaluation');
	});
});
