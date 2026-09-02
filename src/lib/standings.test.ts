import { describe, it, expect } from 'vitest';
import {
	byTokensThenTitle,
	nightBoard,
	nightVerdict,
	toBlocked,
	tvBoard,
	type NightStanding
} from './standings';

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
			{ title: 'Arrival', tokens: 1 },
			{ title: 'Brazil', tokens: 4 }
		];
		expect([...list].sort(byTokensThenTitle).map((s) => s.title)).toEqual(['Brazil', 'Arrival', 'Zodiac']);
	});

	it('ignores case on a tie', () => {
		const list = [
			{ title: 'ocean', tokens: 0 },
			{ title: 'Nomad', tokens: 0 }
		];
		expect([...list].sort(byTokensThenTitle).map((s) => s.title)).toEqual(['Nomad', 'ocean']);
	});

	// Collation by German rules is asserted where the German test data already
	// lives, in views.test.ts, so this file stays free of umlauts.
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
		const movies = [movie(1, 'Arrival', { anna: 1 }), movie(2, 'Brazil', { anna: 2, ben: 1 })];
		const board = nightBoard(movies, []);
		expect(board.map((s) => [s.title, s.tokens])).toEqual([
			['Brazil', 3],
			['Arrival', 1]
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

describe('tvBoard()', () => {
	it('puts the candidates first and whoever is waiting after them', () => {
		// B leads on the phone with two of Anna's votes, but Ben has one on it too.
		const board = nightBoard([movie(1, 'A', { anna: 1 }), movie(2, 'B', { anna: 2, ben: 1 })], ['ben']);
		expect(board.map((s) => s.title)).toEqual(['B', 'A']);
		expect(tvBoard(board).map((s) => s.title)).toEqual(['A', 'B']);
	});

	it('leaves the order of the shared comparator intact inside both groups', () => {
		const board = nightBoard(
			[
				movie(1, 'Arrival', { anna: 1 }),
				movie(2, 'Brazil', { anna: 3 }),
				movie(3, 'Coco', { ben: 1, anna: 2 }),
				movie(4, 'Dune', { ben: 3, anna: 4 })
			],
			['ben']
		);
		// Inside each group the shared comparator still rules: candidates by their
		// votes, and the two waiting rows by theirs (four beats two), not by the
		// order they happened to arrive in.
		expect(tvBoard(board).map((s) => s.title)).toEqual(['Brazil', 'Arrival', 'Dune', 'Coco']);
	});

	it('drops movies nobody voted for but keeps one that is only waiting', () => {
		const board = nightBoard(
			[movie(1, 'A', { anna: 1 }), movie(2, 'Nobody'), movie(3, 'Waiting', { ben: 2 })],
			['ben']
		);
		expect(tvBoard(board).map((s) => s.title)).toEqual(['A', 'Waiting']);
	});

	// The case the whole sort rule exists for: seven waiting rows carrying more
	// votes than the leader must not push the leader off the seven visible rows.
	it('keeps the leading candidate inside the first seven rows', () => {
		const movies = [movie(99, 'Leader', { anna: 1 })];
		for (let i = 0; i < 8; i++) movies.push(movie(i, `Waiting ${i}`, { anna: 5, ben: 1 }));
		const board = tvBoard(nightBoard(movies, ['ben']));

		expect(board[0].title).toBe('Leader');
		expect(board.slice(0, 7).some((s) => s.title === 'Leader')).toBe(true);
		expect(board.slice(0, 7).filter((s) => s.blockedBy.length === 0)).toHaveLength(1);
	});

	it('is the plain board when nobody is away', () => {
		const board = nightBoard([movie(1, 'A', { anna: 1 }), movie(2, 'B', { anna: 2 })], []);
		expect(tvBoard(board)).toEqual(board);
	});
});
