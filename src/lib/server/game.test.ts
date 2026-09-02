import { describe, it, expect, beforeEach } from 'vitest';
import { createDb, type DB } from './db';
import type { AppConfig } from './config';
import {
	ensureBalances,
	creditOnce,
	getBalance,
	stake,
	evaluate,
	freePick,
	revertWinner,
	confirmWatched,
	deleteMovie,
	restoreMovie,
	purgeMovie,
	rate,
	reproposeFromArchive,
	findDuplicates,
	currentWinner,
	setProposer,
	standings,
	requireAbsent,
	validAbsent,
	RuleError
} from './game';
import { tonightAbsent } from './tonight';
import { missedCredits, runCreditTick, backupDue } from './schedule';
import { metaSet, metaGet } from './db';

const config: AppConfig = {
	title: 'Movie Night',
	members: [
		{ id: 'anna', name: 'Anna', color: '#e63946', emoji: '🦊' },
		{ id: 'ben', name: 'Ben', color: '#457b9d', emoji: '🐻' },
		{ id: 'cleo', name: 'Cleo', color: '#2a9d8f', emoji: '🐸' }
	],
	tokenAmount: 1,
	tokenWeekday: 0,
	tokenHour: 8,
	tokenCap: 5,
	tokenStart: 0, // The tests deliberately start at zero; the starting balance has tests of its own
	sources: ['Netflix', 'Google', 'Server'],
	interfaceLanguage: 'de',
	language: 'de-DE',
	languageFallback: 'en-US',
	certificationCountry: 'DE',
	trailerLanguages: ['original', 'en', 'de'],
	timezone: 'Europe/Berlin',
	backupHour: 3,
	backupKeep: 14,
	demoData: false,
	dailyBuild: false,
	dailyBuildUrl: '',
	tmdbApiKey: '',
	omdbApiKey: '',
	tmdbKeyState: 'missing',
	omdbKeyState: 'missing',
	pin: '1234',
	dataDir: '/tmp/pv-test',
	httpsProof: { mode: 'none' },
	sessionTimeout: 31_536_000,
	users: [],
	origins: {},
	configFile: '/tmp/config.yaml'
};

let db: DB;

function addMovie(title: string, proposedBy: string, extra: Record<string, unknown> = {}): number {
	const result = db
		.prepare(
			`INSERT INTO movies (status, title, year, tmdb_id, proposed_by, created_at)
			 VALUES ('list', ?, ?, ?, ?, ?)`
		)
		.run(
			title,
			(extra.year as number) ?? 2020,
			(extra.tmdbId as number) ?? null,
			proposedBy,
			new Date().toISOString()
		);
	return Number(result.lastInsertRowid);
}

function give(personId: string, tokens: number) {
	db.prepare('UPDATE balances SET free_tokens = ? WHERE person_id = ?').run(tokens, personId);
}

beforeEach(() => {
	db = createDb(':memory:');
	ensureBalances(db, config);
});

describe('starting balance', () => {
	it('gives new people the configured starting balance', () => {
		const fresh = createDb(':memory:');
		ensureBalances(fresh, { ...config, tokenStart: 3 });
		expect(getBalance(fresh, 'anna')).toBe(3);
	});

	it('does not reset existing balances on restart', () => {
		const fresh = createDb(':memory:');
		ensureBalances(fresh, { ...config, tokenStart: 3 });
		fresh.prepare('UPDATE balances SET free_tokens = 1 WHERE person_id = ?').run('anna');
		ensureBalances(fresh, { ...config, tokenStart: 3 });
		expect(getBalance(fresh, 'anna')).toBe(1);
	});

	it('gives a person added later the starting balance as well', () => {
		const fresh = createDb(':memory:');
		ensureBalances(fresh, { ...config, tokenStart: 3 });
		const extended = {
			...config,
			tokenStart: 3,
			members: [...config.members, { id: 'neu', name: 'Neu', color: '#000', emoji: '' }]
		};
		ensureBalances(fresh, extended);
		expect(getBalance(fresh, 'neu')).toBe(3);
	});
});

describe('token credit', () => {
	it('credits one token to every person', () => {
		creditOnce(db, config);
		expect(getBalance(db, 'anna')).toBe(1);
		expect(getBalance(db, 'ben')).toBe(1);
	});

	it('caps at the limit and catches nothing up', () => {
		give('anna', 5);
		creditOnce(db, config);
		expect(getBalance(db, 'anna')).toBe(5); // expires with nothing in return
		expect(getBalance(db, 'ben')).toBe(1);
	});

	it('does not count tokens on movies towards the balance', () => {
		give('anna', 5);
		const movie = addMovie('Film', 'anna');
		stake(db, config, 'anna', movie, 1); // 4 free, 1 on the film
		creditOnce(db, config);
		expect(getBalance(db, 'anna')).toBe(5);
	});

	it('credits the configured amount', () => {
		creditOnce(db, { ...config, tokenAmount: 3 });
		expect(getBalance(db, 'anna')).toBe(3);
		expect(getBalance(db, 'ben')).toBe(3);
	});

	// A partial credit rather than all-or-nothing: whoever sits at cap minus one
	// gets exactly one of three tokens, the rest expires.
	it('caps a larger amount at the limit', () => {
		give('anna', 4);
		creditOnce(db, { ...config, tokenAmount: 3 });
		expect(getBalance(db, 'anna')).toBe(5);
	});

	it('leaves a balance above the cap untouched', () => {
		give('anna', 7); // for instance by taking tokens back after a rule change
		creditOnce(db, { ...config, tokenAmount: 3 });
		expect(getBalance(db, 'anna')).toBe(7);
	});
});

describe('placing and taking back tokens', () => {
	it('places and spreads freely, including on your own suggestion', () => {
		give('anna', 3);
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config, 'anna', a, 1);
		stake(db, config, 'anna', b, 1);
		stake(db, config, 'anna', b, 1);
		expect(getBalance(db, 'anna')).toBe(0);
	});

	it('refuses placing without a balance', () => {
		const a = addMovie('A', 'anna');
		expect(() => stake(db, config, 'anna', a, 1)).toThrow(RuleError);
	});

	it('gives tokens taken back immediately and uncapped', () => {
		give('anna', 5);
		const a = addMovie('A', 'anna');
		stake(db, config, 'anna', a, 1);
		stake(db, config, 'anna', a, 1);
		give('anna', 5); // balance full again, 2 sit on the film
		stake(db, config, 'anna', a, -1);
		stake(db, config, 'anna', a, -1);
		expect(getBalance(db, 'anna')).toBe(7); // taking back is never capped
	});

	it('refuses taking back tokens that belong to somebody else', () => {
		give('anna', 1);
		const a = addMovie('A', 'anna');
		stake(db, config, 'anna', a, 1);
		expect(() => stake(db, config, 'ben', a, -1)).toThrow(RuleError);
	});
});

describe('evaluation', () => {
	it('needs at least one token', () => {
		addMovie('A', 'anna');
		expect(() => evaluate(db, config, 'anna')).toThrow('rule.noTokensPlaced');
	});

	it('crowns the movie with the most tokens, without the wheel', () => {
		give('anna', 2);
		give('ben', 1);
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config, 'anna', a, 1);
		stake(db, config, 'anna', a, 1);
		stake(db, config, 'ben', b, 1);
		const result = evaluate(db, config, 'ben');
		expect(result.winner.id).toBe(a);
		expect(result.wheel).toBeNull();
		expect(currentWinner(db)?.id).toBe(a);
	});

	it('lets the wheel decide a tie with equal chances', () => {
		give('anna', 1);
		give('ben', 1);
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config, 'anna', a, 1);
		stake(db, config, 'ben', b, 1);
		const result = evaluate(db, config, 'anna', () => 0.9); // Zufall fest verdrahtet
		expect(result.wheel).not.toBeNull();
		expect(result.wheel?.candidates.map((c) => c.movieId).sort()).toEqual([a, b].sort());
		expect(result.winner.id).toBe(b);
	});

	it('blocks a second evaluation while a winner is pending', () => {
		give('anna', 1);
		const a = addMovie('A', 'anna');
		stake(db, config, 'anna', a, 1);
		evaluate(db, config, 'anna');
		expect(() => evaluate(db, config, 'ben')).toThrow('rule.winnerPending');
	});

	it('leaves the tokens of the losers where they are', () => {
		give('anna', 1);
		give('ben', 2);
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config, 'anna', a, 1);
		stake(db, config, 'ben', b, 1);
		stake(db, config, 'ben', a, 1);
		evaluate(db, config, 'anna'); // A wins with 2
		const stakesOnB = db.prepare('SELECT count FROM stakes WHERE movie_id = ?').get(b) as { count: number };
		expect(stakesOnB.count).toBe(1);
		expect(getBalance(db, 'ben')).toBe(0); // nothing comes back
	});

	it('takes no new tokens on the winner, but does on the others', () => {
		give('anna', 2);
		give('ben', 1);
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config, 'anna', a, 1);
		evaluate(db, config, 'anna');
		expect(() => stake(db, config, 'anna', a, 1)).toThrow(RuleError);
		stake(db, config, 'ben', b, 1);
		expect(getBalance(db, 'ben')).toBe(0);
	});
});

describe('after movie night', () => {
	function winWith(tokens: number): number {
		give('anna', tokens);
		const a = addMovie('A', 'anna');
		for (let i = 0; i < tokens; i++) stake(db, config, 'anna', a, 1);
		evaluate(db, config, 'anna');
		return a;
	}

	it('archives only after "watched" is confirmed, and spends the tokens', () => {
		const a = winWith(2);
		confirmWatched(db, config, 'ben');
		const movie = db.prepare('SELECT status FROM movies WHERE id = ?').get(a) as { status: string };
		expect(movie.status).toBe('archived');
		expect(db.prepare('SELECT COUNT(*) AS n FROM stakes WHERE movie_id = ?').get(a)).toEqual({ n: 0 });
		expect(getBalance(db, 'anna')).toBe(0);
	});

	it('brings the movie back with all its tokens when the win is reverted', () => {
		const a = winWith(3);
		revertWinner(db, config, 'ben');
		expect(currentWinner(db)).toBeNull();
		const stakes = db.prepare('SELECT count FROM stakes WHERE movie_id = ?').get(a) as { count: number };
		expect(stakes.count).toBe(3); // may win again straight away
		const again = evaluate(db, config, 'anna');
		expect(again.winner.id).toBe(a);
	});

	it('prevents deleting the winner, even by whoever suggested it', () => {
		const a = winWith(1);
		expect(() => deleteMovie(db, config, 'anna', a)).toThrow('rule.winnerNotDeletable');
	});
});

describe('free pick', () => {
	it('makes any movie the movie of the night directly, tokens expire with "watched"', () => {
		give('anna', 3);
		give('ben', 1);
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		for (let i = 0; i < 3; i++) stake(db, config, 'anna', a, 1);
		stake(db, config, 'ben', b, 1);
		const { winner } = freePick(db, config, 'cleo', b); // B has fewer tokens, no matter
		expect(winner.id).toBe(b);
		expect(winner.won_via).toBe('free_pick');
		confirmWatched(db, config, 'cleo');
		// Tokens on A stay untouched
		const stakesOnA = db.prepare('SELECT count FROM stakes WHERE movie_id = ?').get(a) as { count: number };
		expect(stakesOnA.count).toBe(3);
		expect(getBalance(db, 'ben')).toBe(0);
	});

	it('is blocked while a winner is pending', () => {
		give('anna', 1);
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config, 'anna', a, 1);
		evaluate(db, config, 'anna');
		expect(() => freePick(db, config, 'ben', b)).toThrow('rule.winnerPending');
	});

	it('is marked as a free pick in the log', () => {
		const b = addMovie('B', 'ben');
		freePick(db, config, 'cleo', b);
		const event = db.prepare("SELECT * FROM events WHERE type = 'free_pick'").get() as { actor: string };
		expect(event.actor).toBe('cleo');
	});
});

describe('movie night when someone is away', () => {
	/** Anna on A, Ben on B, so "without Ben" has something to change. */
	function twoCamps(): { a: number; b: number } {
		give('anna', 1);
		give('ben', 3);
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config, 'anna', a, 1);
		for (let i = 0; i < 3; i++) stake(db, config, 'ben', b, 1);
		return { a, b };
	}

	function storedAbsent(movieId: number): string | null {
		return (db.prepare('SELECT absent FROM movies WHERE id = ?').get(movieId) as { absent: string | null })
			.absent;
	}

	it('counts only the votes of the people who are there', () => {
		const { a } = twoCamps();
		// B leads three to one, and every one of those three is Ben's.
		const result = evaluate(db, config, 'anna', undefined, ['ben']);
		expect(result.winner.id).toBe(a);
	});

	it('keeps a movie out of the running even when someone present voted for it too', () => {
		give('anna', 5);
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		for (let i = 0; i < 4; i++) stake(db, config, 'anna', b, 1); // four of Anna's on B
		stake(db, config, 'anna', a, 1);
		give('ben', 1);
		stake(db, config, 'ben', b, 1); // one of Ben's is enough
		const result = evaluate(db, config, 'anna', undefined, ['ben']);
		expect(result.winner.id).toBe(a);
		expect(result.blocked).toEqual([{ movieId: b, title: 'B', byPersonIds: ['ben'] }]);
	});

	it('spins the wheel among the candidates only', () => {
		give('anna', 2);
		give('ben', 2);
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		const c = addMovie('C', 'cleo');
		stake(db, config, 'anna', a, 1);
		stake(db, config, 'anna', c, 1);
		for (let i = 0; i < 2; i++) stake(db, config, 'ben', b, 1); // B would lead
		const result = evaluate(db, config, 'anna', () => 0.9, ['ben']);
		expect(result.wheel?.candidates.map((x) => x.movieId).sort()).toEqual([a, c].sort());
		expect(result.winner.id).toBe(c);
	});

	// The four states of the board, which must never overlap and never fall back
	// to the full count.
	it('still asks for a vote when the list carries none at all', () => {
		addMovie('A', 'anna');
		expect(() => evaluate(db, config, 'anna', undefined, ['ben'])).toThrow('rule.noTokensPlaced');
	});

	it('names who everything is waiting for when only the absent have voted', () => {
		give('ben', 1);
		const b = addMovie('B', 'ben');
		stake(db, config, 'ben', b, 1);
		try {
			evaluate(db, config, 'anna', undefined, ['ben']);
			expect.unreachable('the evaluation should have stopped');
		} catch (err) {
			expect(err).toBeInstanceOf(RuleError);
			expect((err as RuleError).key).toBe('rule.allBlocked');
			expect((err as RuleError).personIds).toEqual(['ben']);
		}
	});

	it('stops just the same when the votes of the present sit on blocked movies only', () => {
		give('anna', 1);
		give('ben', 1);
		const b = addMovie('B', 'ben');
		addMovie('A', 'anna'); // on the list, but nobody voted for it
		stake(db, config, 'anna', b, 1);
		stake(db, config, 'ben', b, 1);
		expect(() => evaluate(db, config, 'anna', undefined, ['ben'])).toThrow('rule.allBlocked');
	});

	it('goes ahead as soon as one candidate carries a vote of somebody present', () => {
		const { a } = twoCamps();
		expect(evaluate(db, config, 'anna', undefined, ['ben']).winner.id).toBe(a);
	});

	it('refuses a night nobody would be at', () => {
		twoCamps();
		expect(() => evaluate(db, config, 'anna', undefined, ['anna', 'ben', 'cleo'])).toThrow(
			'rule.nobodyPresent'
		);
	});

	it('refuses an id that is nobody', () => {
		twoCamps();
		expect(() => evaluate(db, config, 'anna', undefined, ['mia'])).toThrow('rule.unknownPerson');
	});

	it('refuses more absentees than there are people, before looking any of them up', () => {
		twoCamps();
		expect(() => evaluate(db, config, 'anna', undefined, ['a', 'b', 'c', 'd'])).toThrow(
			'error.invalidRequest'
		);
	});

	it('counts a name given twice once', () => {
		const { a } = twoCamps();
		const result = evaluate(db, config, 'anna', undefined, ['ben', 'ben']);
		expect(result.winner.id).toBe(a);
		expect(result.absent).toEqual(['ben']);
	});

	it('remembers on the movie who was away, and forgets it again on a revert', () => {
		const { a } = twoCamps();
		evaluate(db, config, 'anna', undefined, ['ben']);
		expect(JSON.parse(storedAbsent(a)!)).toEqual(['ben']);

		revertWinner(db, config, 'anna');
		expect(storedAbsent(a)).toBeNull();
	});

	it('keeps it through "watched" and does not carry it into a fresh suggestion', () => {
		const { a } = twoCamps();
		evaluate(db, config, 'anna', undefined, ['ben']);
		confirmWatched(db, config, 'anna');
		expect(JSON.parse(storedAbsent(a)!)).toEqual(['ben']);

		const again = reproposeFromArchive(db, config, 'anna', a);
		expect(storedAbsent(again)).toBeNull();
	});

	it('stores nothing at all for a full night', () => {
		const { b } = twoCamps();
		evaluate(db, config, 'anna');
		expect(storedAbsent(b)).toBeNull();
	});

	/**
	 * The invariant behind `confirmWatched()` staying untouched: a winner of a
	 * partial night carries no vote of anybody who was away, and nobody can put one
	 * there afterwards, so there is never anything to hand back.
	 */
	it('leaves the absent no way onto the winner, so nothing has to be refunded', () => {
		const { a, b } = twoCamps();
		evaluate(db, config, 'anna', undefined, ['ben']); // A wins, Ben has nothing on it
		give('ben', 1);
		expect(() => stake(db, config, 'ben', a, 1)).toThrow('rule.stakeNotPossible');

		confirmWatched(db, config, 'anna');
		expect(getBalance(db, 'anna')).toBe(0); // Anna's vote is spent
		expect(getBalance(db, 'ben')).toBe(1); // untouched, and B still carries his three
		const onB = db.prepare('SELECT SUM(count) AS n FROM stakes WHERE movie_id = ?').get(b);
		expect(onB).toEqual({ n: 3 });
	});

	it('writes who was away and what waited into the log', () => {
		const { a, b } = twoCamps();
		evaluate(db, config, 'anna', undefined, ['ben']);
		const event = db.prepare("SELECT payload FROM events WHERE type = 'evaluation'").get() as {
			payload: string;
		};
		const payload = JSON.parse(event.payload);
		expect(payload.absent).toEqual(['ben']);
		expect(payload.blocked).toEqual([{ movieId: b, title: 'B', byPersonIds: ['ben'] }]);
		// The standings in the payload are the count of the evening, not of everybody.
		expect(payload.standings).toEqual([
			{ movieId: a, title: 'A', tokens: 1 },
			{ movieId: b, title: 'B', tokens: 0 }
		]);
	});

	it('writes empty fields for a full night rather than leaving them out', () => {
		twoCamps();
		evaluate(db, config, 'anna');
		const event = db.prepare("SELECT payload FROM events WHERE type = 'evaluation'").get() as {
			payload: string;
		};
		const payload = JSON.parse(event.payload);
		expect(payload.absent).toEqual([]);
		expect(payload.blocked).toEqual([]);
	});

	describe('free pick', () => {
		it('refuses a movie somebody absent voted for', () => {
			const { b } = twoCamps();
			try {
				freePick(db, config, 'anna', b, ['ben']);
				expect.unreachable('the free pick should have been refused');
			} catch (err) {
				expect((err as RuleError).key).toBe('rule.blockedByAbsent');
				expect((err as RuleError).personIds).toEqual(['ben']);
			}
		});

		it('allows any other movie and remembers who was away', () => {
			const { a, b } = twoCamps();
			const result = freePick(db, config, 'anna', a, ['ben']);
			expect(result.winner.id).toBe(a);
			expect(result.absent).toEqual(['ben']);
			expect(result.blocked).toEqual([{ movieId: b, title: 'B', byPersonIds: ['ben'] }]);
			expect(JSON.parse(storedAbsent(a)!)).toEqual(['ben']);
		});

		it('refuses a night nobody would be at', () => {
			const { a } = twoCamps();
			expect(() => freePick(db, config, 'anna', a, ['anna', 'ben', 'cleo'])).toThrow('rule.nobodyPresent');
		});

		it('stores nothing and blocks nothing for a full night', () => {
			const { b } = twoCamps();
			const result = freePick(db, config, 'anna', b);
			expect(result.absent).toEqual([]);
			expect(result.blocked).toEqual([]);
			expect(storedAbsent(b)).toBeNull();
		});
	});

	// The whole point of a single code path: with nobody named, every one of the
	// three ways to call this has to behave exactly as it did before the feature.
	describe('a full night, however it is called', () => {
		it('gives the same winner with three, four and five arguments', () => {
			const expected = () => {
				const { b } = twoCamps();
				return b;
			};
			const b = expected();
			const three = evaluate(db, config, 'anna');
			expect(three.winner.id).toBe(b);
			expect(three.absent).toEqual([]);
			expect(three.blocked).toEqual([]);
			revertWinner(db, config, 'anna');

			const four = evaluate(db, config, 'anna', () => 0);
			expect(four.winner.id).toBe(b);
			revertWinner(db, config, 'anna');

			const five = evaluate(db, config, 'anna', undefined, []);
			expect(five.winner.id).toBe(b);
		});

		it('ranks exactly like the plain standings', () => {
			twoCamps();
			addMovie('C', 'cleo');
			// Read before the evaluation: the winner leaves the list, and `standings()`
			// would then have one movie fewer to compare against.
			const before = standings(db);
			expect(evaluate(db, config, 'anna').standings).toEqual(before);
		});
	});
});

describe('the evening every device shares', () => {
	function twoCamps(): { a: number; b: number } {
		give('anna', 1);
		give('ben', 3);
		const a = addMovie('A', 'anna');
		const b = addMovie('B', 'ben');
		stake(db, config, 'anna', a, 1);
		for (let i = 0; i < 3; i++) stake(db, config, 'ben', b, 1);
		return { a, b };
	}

	it('publishes what actually decided the night', () => {
		twoCamps();
		evaluate(db, config, 'anna', undefined, ['ben']);
		expect(tonightAbsent(db)).toEqual(['ben']);
	});

	it('publishes an empty evening for a full night, rather than leaving the last one standing', () => {
		twoCamps();
		evaluate(db, config, 'anna', undefined, ['ben']);
		revertWinner(db, config, 'anna');
		evaluate(db, config, 'anna');
		expect(tonightAbsent(db)).toEqual([]);
	});

	it('publishes from a free pick too, which the film page never does itself', () => {
		const { a } = twoCamps();
		freePick(db, config, 'anna', a, ['ben']);
		expect(tonightAbsent(db)).toEqual(['ben']);
	});

	// A revert re-runs the same evening, so the shared selection has to survive
	// it — the phones keep theirs as well.
	it('keeps the evening through a revert', () => {
		twoCamps();
		evaluate(db, config, 'anna', undefined, ['ben']);
		revertWinner(db, config, 'anna');
		expect(tonightAbsent(db)).toEqual(['ben']);
	});

	it('ends the evening with "watched"', () => {
		twoCamps();
		evaluate(db, config, 'anna', undefined, ['ben']);
		confirmWatched(db, config, 'anna');
		expect(tonightAbsent(db)).toEqual([]);
	});
});

describe('validAbsent() against requireAbsent()', () => {
	// The whole reason for the split: /api/tonight has to be able to record
	// "everybody is away" while somebody is still tapping chips.
	it('lets validAbsent record an evening nobody would attend', () => {
		expect(validAbsent(config, ['anna', 'ben', 'cleo'])).toEqual(['anna', 'ben', 'cleo']);
	});

	it('still refuses to evaluate such a night', () => {
		expect(() => requireAbsent(config, ['anna', 'ben', 'cleo'])).toThrow('rule.nobodyPresent');
	});

	it('agrees with requireAbsent on everything else', () => {
		expect(validAbsent(config, ['ben', 'ben'])).toEqual(['ben']);
		expect(requireAbsent(config, ['ben', 'ben'])).toEqual(['ben']);
		expect(() => validAbsent(config, ['mia'])).toThrow('rule.unknownPerson');
		expect(() => validAbsent(config, ['a', 'b', 'c', 'd'])).toThrow('error.invalidRequest');
	});
});

describe('deleting and trash', () => {
	it('allows deleting only to whoever suggested it', () => {
		const a = addMovie('A', 'anna');
		expect(() => deleteMovie(db, config, 'ben', a)).toThrow('rule.deleteOnlyOwn');
		deleteMovie(db, config, 'anna', a);
	});

	it('gives tokens back to their owners, capped at five', () => {
		give('anna', 4);
		give('ben', 4);
		const a = addMovie('A', 'anna');
		for (let i = 0; i < 4; i++) stake(db, config, 'ben', a, 1);
		give('ben', 4); // Ben has 4 free again plus 4 on the film
		stake(db, config, 'anna', a, 1);
		deleteMovie(db, config, 'anna', a);
		expect(getBalance(db, 'ben')).toBe(5); // 4 + 4 → capped at 5
		expect(getBalance(db, 'anna')).toBe(4); // 3 + 1 back
	});

	it('remembers the token distribution in the trash', () => {
		give('ben', 2);
		const a = addMovie('A', 'anna');
		stake(db, config, 'ben', a, 1);
		stake(db, config, 'ben', a, 1);
		deleteMovie(db, config, 'anna', a);
		const row = db.prepare('SELECT trash_stakes, deleted_by FROM movies WHERE id = ?').get(a) as {
			trash_stakes: string;
			deleted_by: string;
		};
		expect(row.deleted_by).toBe('anna');
		expect(JSON.parse(row.trash_stakes)).toEqual([{ personId: 'ben', count: 2 }]);
	});

	it('restores without tokens, and anyone may do it', () => {
		give('ben', 1);
		const a = addMovie('A', 'anna');
		stake(db, config, 'ben', a, 1);
		deleteMovie(db, config, 'anna', a);
		restoreMovie(db, config, 'cleo', a);
		const row = db.prepare('SELECT status FROM movies WHERE id = ?').get(a) as { status: string };
		expect(row.status).toBe('list');
		expect(db.prepare('SELECT COUNT(*) AS n FROM stakes WHERE movie_id = ?').get(a)).toEqual({ n: 0 });
	});

	it('removes permanently', () => {
		const a = addMovie('A', 'anna');
		deleteMovie(db, config, 'anna', a);
		purgeMovie(db, config, 'ben', a);
		expect(db.prepare('SELECT * FROM movies WHERE id = ?').get(a)).toBeUndefined();
	});
});

describe('who wanted the movie', () => {
	function proposer(movieId: number): string {
		return (db.prepare('SELECT proposed_by FROM movies WHERE id = ?').get(movieId) as { proposed_by: string })
			.proposed_by;
	}

	it('can be switched to another person', () => {
		const a = addMovie('A', 'anna');
		setProposer(db, config, 'anna', a, 'ben');
		expect(proposer(a)).toBe('ben');
	});

	it('rejects unknown people', () => {
		const a = addMovie('A', 'anna');
		expect(() => setProposer(db, config, 'anna', a, 'niemand')).toThrow(RuleError);
		expect(proposer(a)).toBe('anna');
	});

	it('rejects an unknown actor too', () => {
		const a = addMovie('A', 'anna');
		expect(() => setProposer(db, config, 'niemand', a, 'ben')).toThrow(RuleError);
		expect(proposer(a)).toBe('anna');
	});

	it('leaves placed tokens untouched', () => {
		give('ben', 2);
		const a = addMovie('A', 'anna');
		stake(db, config, 'ben', a, 1);
		setProposer(db, config, 'anna', a, 'cleo');
		expect(db.prepare('SELECT count FROM stakes WHERE movie_id = ?').get(a)).toEqual({ count: 1 });
		expect(getBalance(db, 'ben')).toBe(1);
	});

	it('moves the right to delete along with it', () => {
		const a = addMovie('A', 'anna');
		setProposer(db, config, 'anna', a, 'ben');
		expect(() => deleteMovie(db, config, 'anna', a)).toThrow('rule.deleteOnlyOwn');
		deleteMovie(db, config, 'ben', a);
	});

	it('refuses movies in the trash', () => {
		const a = addMovie('A', 'anna');
		deleteMovie(db, config, 'anna', a);
		expect(() => setProposer(db, config, 'anna', a, 'ben')).toThrow('rule.trashedNotEditable');
	});

	it('reports an unknown movie', () => {
		expect(() => setProposer(db, config, 'anna', 999, 'ben')).toThrow(RuleError);
	});

	it('is not restricted to the current proposer, and leaves a log entry', () => {
		const a = addMovie('A', 'anna');
		// Ben triggers the change even though the suggestion is Anna's, allowed on
		// a shared device, and the reason the log entry exists at all.
		setProposer(db, config, 'ben', a, 'cleo');
		expect(proposer(a)).toBe('cleo');
		const event = db.prepare("SELECT * FROM events WHERE type = 'proposer_changed'").get() as {
			actor: string;
			payload: string;
		};
		expect(event.actor).toBe('ben');
		expect(JSON.parse(event.payload)).toEqual({
			movieId: a,
			title: 'A',
			fromPersonId: 'anna',
			toPersonId: 'cleo'
		});
	});

	it('does nothing on a no-op reassignment, not even a log entry', () => {
		const a = addMovie('A', 'anna');
		setProposer(db, config, 'ben', a, 'anna');
		expect(proposer(a)).toBe('anna');
		const count = db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'proposer_changed'").get() as {
			n: number;
		};
		expect(count.n).toBe(0);
	});
});

describe('rating and archive', () => {
	function archived(): number {
		give('anna', 1);
		const a = addMovie('A', 'anna');
		stake(db, config, 'anna', a, 1);
		evaluate(db, config, 'anna');
		confirmWatched(db, config, 'anna');
		return a;
	}

	it('allows half stars from 1 to 5, and changing them', () => {
		const a = archived();
		rate(db, config, 'ben', a, 3.5);
		rate(db, config, 'ben', a, 5);
		const row = db
			.prepare('SELECT stars FROM ratings WHERE movie_id = ? AND person_id = ?')
			.get(a, 'ben') as {
			stars: number;
		};
		expect(row.stars).toBe(5);
	});

	it('rejects invalid values', () => {
		const a = archived();
		expect(() => rate(db, config, 'ben', a, 0.5)).toThrow(RuleError);
		expect(() => rate(db, config, 'ben', a, 5.5)).toThrow(RuleError);
		expect(() => rate(db, config, 'ben', a, 3.2)).toThrow(RuleError);
	});

	it('creates a new entry for "suggest again" and keeps the old one', () => {
		const a = archived();
		const fresh = reproposeFromArchive(db, config, 'cleo', a);
		expect(fresh).not.toBe(a);
		const old = db.prepare('SELECT status FROM movies WHERE id = ?').get(a) as { status: string };
		const clone = db.prepare('SELECT status, proposed_by FROM movies WHERE id = ?').get(fresh) as {
			status: string;
			proposed_by: string;
		};
		expect(old.status).toBe('archived');
		expect(clone.status).toBe('list');
		expect(clone.proposed_by).toBe('cleo');
	});
});

describe('duplicates', () => {
	it('finds movies on the list and in the archive, but not in the trash', () => {
		const a = addMovie('Vaiana', 'anna', { tmdbId: 277834, year: 2016 });
		expect(findDuplicates(db, 277834, 'x', null)).toHaveLength(1);
		expect(findDuplicates(db, null, 'VAIANA', 2016)).toHaveLength(1);
		expect(findDuplicates(db, null, 'Vaiana', 1999)).toHaveLength(0);
		deleteMovie(db, config, 'anna', a);
		expect(findDuplicates(db, 277834, 'x', null)).toHaveLength(0);
	});
});

const WEEK_MS = 7 * 86_400_000;

describe('schedule', () => {
	it('counts missed Sunday credits correctly', () => {
		// Fr 1.8.2026 10:00 Berlin bis Mo 17.8.2026 10:00 Berlin: 3 Sonntage (2.8., 9.8., 16.8.)
		const from = new Date('2026-08-01T08:00:00Z');
		const to = new Date('2026-08-17T08:00:00Z');
		expect(missedCredits(from, to, 0, 8, 'Europe/Berlin')).toBe(3);
	});

	it('counts no credit when the moment has not been reached yet', () => {
		const from = new Date('2026-08-01T08:00:00Z'); // saturday
		const to = new Date('2026-08-02T05:00:00Z'); // sunday, 7:00 in Berlin
		expect(missedCredits(from, to, 0, 8, 'Europe/Berlin')).toBe(0);
	});

	// The same span, a different timezone: in Auckland Sunday 8am is already past
	// when it is only just beginning in Berlin.
	it('follows the configured timezone', () => {
		const from = new Date('2026-08-01T08:00:00Z');
		const to = new Date('2026-08-02T05:00:00Z');
		expect(missedCredits(from, to, 0, 8, 'Pacific/Auckland')).toBe(1);
	});

	// Sampling runs on whole UTC hours. In zones with a half-hour offset the credit
	// moment therefore does not land on a sample, but the local hour being looked
	// for lasts a full hour and so always contains exactly one. Neither the catch-up
	// nor the minute tick loses anything; the credit is merely noticed up to 59
	// minutes later.
	for (const tz of ['Asia/Kolkata', 'Australia/Adelaide', 'Pacific/Chatham', 'Europe/Berlin']) {
		it(`counts exactly one credit in a week in ${tz}`, () => {
			const from = new Date('2026-08-01T00:00:00Z');
			expect(missedCredits(from, new Date(from.getTime() + WEEK_MS), 0, 8, tz)).toBe(1);
		});

		it(`loses nothing when sampled minute by minute in ${tz}`, () => {
			// This is how the scheduler really runs: one tick a minute, resetting
			// last_credit_check every time.
			let total = 0;
			let last = new Date('2026-08-01T00:00:00Z');
			const end = last.getTime() + WEEK_MS;
			while (last.getTime() < end) {
				const now = new Date(last.getTime() + 60_000);
				total += missedCredits(last, now, 0, 8, tz);
				last = now;
			}
			expect(total).toBe(1);
		});
	}

	it('follows the configured weekday', () => {
		// Sa 1.8.2026 10:00 bis Mo 17.8.2026 10:00 Berlin: 3 Samstage um 18 Uhr
		// (1, 8 and 15 August), the first falls on the same day, after `from`.
		const from = new Date('2026-08-01T08:00:00Z');
		const to = new Date('2026-08-17T08:00:00Z');
		expect(missedCredits(from, to, 6, 18, 'Europe/Berlin')).toBe(3);
	});

	it('catches up every missed week at startup, capped', () => {
		metaSet(db, 'last_credit_check', '2026-07-01T00:00:00Z');
		const credited = runCreditTick(db, config, new Date('2026-08-03T12:00:00Z')); // 5.7., 12.7., 19.7., 26.7., 2.8.
		expect(credited).toBe(5);
		expect(getBalance(db, 'anna')).toBe(5);
	});

	// The case a plain "backed up today already?" check fails at: the new hour lies
	// later in the day than the last backup. Without a scheduled moment only the
	// 24-hour net would be left, and the backup would drift a minute further each
	// day instead of arriving at 22:00.
	it('lets a backup hour later in the day take effect immediately', () => {
		const late = { ...config, backupHour: 22 };
		const yesterday = '2026-08-05T01:00:00Z'; // 03:00 Berlin
		expect(backupDue(yesterday, new Date('2026-08-05T20:00:00Z'), late)).toBe(true); // 22:00 Berlin
	});

	it('backs up exactly once a day at the configured hour', () => {
		const late = { ...config, backupHour: 22 };
		let last: string | null = null;
		const moments: string[] = [];
		// A minute tick across five days, the way the scheduler really runs.
		for (let m = 0; m < 5 * 24 * 60; m++) {
			const now = new Date(Date.parse('2026-08-05T00:00:00Z') + m * 60_000);
			if (backupDue(last, now, late)) {
				last = now.toISOString();
				moments.push(last);
			}
		}
		// One straight away at startup on an empty instance, then one a day.
		expect(moments).toHaveLength(6);
		// And from the second on it sits firmly at 22:00 Berlin (20:00 UTC), without
		// the daily drift the plain 24-hour net would have produced.
		for (const t of moments.slice(1)) expect(t.slice(11, 16)).toBe('20:00');
	});

	it('catches up a slept-through backup at the next start', () => {
		const threeDaysAgo = '2026-08-02T01:00:00Z';
		expect(backupDue(threeDaysAgo, new Date('2026-08-05T08:00:00Z'), config)).toBe(true);
	});

	it('does not back up twice at the same moment', () => {
		const earlyToday = '2026-08-05T01:05:00Z'; // shortly after 03:00 Berlin
		expect(backupDue(earlyToday, new Date('2026-08-05T12:00:00Z'), config)).toBe(false);
	});

	it('backs up immediately on a fresh instance', () => {
		expect(backupDue(null, new Date('2026-08-05T08:00:00Z'), config)).toBe(true);
	});

	it('floods nothing retroactively on first run', () => {
		const credited = runCreditTick(db, config, new Date('2026-08-03T12:00:00Z'));
		expect(credited).toBe(0);
		expect(metaGet(db, 'last_credit_check')).not.toBeNull();
	});
});
