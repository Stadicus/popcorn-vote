import { describe, it, expect } from 'vitest';
import { byTokensThenTitle, nightBoard, nightVerdict, toBlocked, type NightStanding } from './standings';

// The rule both sides run. Whatever this file says is what the phone greys out
// and what the server refuses, so the cases here are written as nights rather
// than as calls: who put what on the list, and who is not there.

interface Movie {
	id: number;
	title: string;
	stakes: { personId: string; count: number }[];
}

function movie(id: number, title: string, stakes: Record<string, number> = {}): Movie {
	return {
		id,
		title,
		stakes: Object.entries(stakes).map(([personId, count]) => ({ personId, count }))
	};
}

describe('byTokensThenTitle()', () => {
	it('puts the most tokens first and breaks a tie alphabetically', () => {
		const list = [
			{ title: 'Zodiac', tokens: 1 },
			{ title: 'Amélie', tokens: 1 },
			{ title: 'Brazil', tokens: 4 }
		];
		expect([...list].sort(byTokensThenTitle).map((s) => s.title)).toEqual(['Brazil', 'Amélie', 'Zodiac']);
	});

	it('sorts umlauts with their base letter and ignores case', () => {
		const list = [
			{ title: 'Ödipus', tokens: 0 },
			{ title: 'oben', tokens: 0 },
			{ title: 'Ozean', tokens: 0 }
		];
		expect([...list].sort(byTokensThenTitle).map((s) => s.title)).toEqual(['oben', 'Ödipus', 'Ozean']);
	});
});

describe('nightBoard()', () => {
	it('counts only the votes of the people who are there', () => {
		const board = nightBoard([movie(1, 'A', { anna: 1, ben: 3 })], ['ben']);
		expect(board[0].tokens).toBe(1);
		expect(board[0].allTokens).toBe(4);
	});

	it('marks a movie that carries a vote of somebody who is away', () => {
		const board = nightBoard(
			[movie(1, 'A', { anna: 2 }), movie(2, 'B', { ben: 1, cleo: 1 })],
			['ben', 'cleo']
		);
		expect(board.find((s) => s.movieId === 1)!.blockedBy).toEqual([]);
		expect(board.find((s) => s.movieId === 2)!.blockedBy).toEqual(['ben', 'cleo']);
	});

	it('names the absent in the order of the night, whatever order the stakes arrive in', () => {
		const board = nightBoard([movie(1, 'A', { cleo: 1, ben: 1 })], ['ben', 'cleo']);
		expect(board[0].blockedBy).toEqual(['ben', 'cleo']);
	});

	it('keeps a blocked movie on the board instead of hiding it', () => {
		const board = nightBoard([movie(1, 'A', { ben: 5 }), movie(2, 'B', { anna: 1 })], ['ben']);
		expect(board.map((s) => s.movieId).sort()).toEqual([1, 2]);
	});

	it('counts exactly like a full night when nobody is away', () => {
		const movies = [movie(1, 'Amélie', { anna: 1 }), movie(2, 'Brazil', { anna: 2, ben: 1 })];
		const board = nightBoard(movies, []);
		expect(board.map((s) => [s.title, s.tokens])).toEqual([
			['Brazil', 3],
			['Amélie', 1]
		]);
		expect(board.every((s) => s.blockedBy.length === 0)).toBe(true);
		expect(board.every((s) => s.tokens === s.allTokens)).toBe(true);
	});

	it('sorts by the votes that count, not by all of them', () => {
		// B leads on paper with four, but three of them belong to Ben.
		const board = nightBoard([movie(1, 'A', { anna: 2 }), movie(2, 'B', { anna: 1, ben: 3 })], ['ben']);
		expect(board.map((s) => s.title)).toEqual(['A', 'B']);
	});
});

describe('toBlocked()', () => {
	it('keeps only what waits, in the shape that gets stored', () => {
		const board = nightBoard([movie(1, 'A', { anna: 1 }), movie(2, 'B', { ben: 1 })], ['ben']);
		expect(toBlocked(board)).toEqual([{ movieId: 2, title: 'B', byPersonIds: ['ben'] }]);
	});

	it('is empty for a full night', () => {
		expect(toBlocked(nightBoard([movie(1, 'A', { anna: 1 })], []))).toEqual([]);
	});
});

describe('nightVerdict()', () => {
	// The four cases the rule has to keep apart. Nothing may fall between them,
	// and nothing may quietly land back on the full count.
	it('asks for a vote when the list carries none at all', () => {
		const board = nightBoard([movie(1, 'A'), movie(2, 'B')], ['ben']);
		expect(nightVerdict(board, ['ben'])).toEqual({ state: 'noTokens' });
	});

	it('reports everything waiting when only the absent have voted', () => {
		const board = nightBoard([movie(1, 'A', { ben: 2 }), movie(2, 'B')], ['ben']);
		expect(nightVerdict(board, ['ben'])).toEqual({ state: 'allBlocked', personIds: ['ben'] });
	});

	it('reports everything waiting when the votes of the present sit on blocked movies only', () => {
		const board = nightBoard([movie(1, 'A', { anna: 2, ben: 1 }), movie(2, 'B')], ['ben']);
		expect(nightVerdict(board, ['ben'])).toEqual({ state: 'allBlocked', personIds: ['ben'] });
	});

	it('is ready as soon as one candidate carries a vote of somebody present', () => {
		const board = nightBoard([movie(1, 'A', { anna: 1 }), movie(2, 'B', { ben: 3 })], ['ben']);
		expect(nightVerdict(board, ['ben'])).toEqual({ state: 'ready' });
	});

	it('names only the absent who actually block', () => {
		const board = nightBoard([movie(1, 'A', { ben: 1 })], ['ben', 'cleo']);
		expect(nightVerdict(board, ['ben', 'cleo'])).toEqual({ state: 'allBlocked', personIds: ['ben'] });
	});

	it('can never say "everything waiting" when nobody is away', () => {
		const board = nightBoard([movie(1, 'A', { anna: 1 })], []);
		expect(nightVerdict(board, [])).toEqual({ state: 'ready' });
	});

	it('handles an empty list as "no votes"', () => {
		expect(nightVerdict([] as NightStanding[], [])).toEqual({ state: 'noTokens' });
	});
});
