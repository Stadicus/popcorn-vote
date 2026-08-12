import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AppConfig } from './config';
import { forgetRejections, keyState } from './keys';
import {
	fetchDetails,
	fetchPreview,
	fetchTmdbRating,
	isLatinScript,
	searchMovies,
	extractCertification,
	trailerChain,
	trailerRequestLanguages,
	pickTrailer
} from './tmdb';

// No network: `fetch` is stubbed and the answers come as fixtures from this
// file. What is checked is the mapping, which language is requested, what
// arrives as title and description, which trailer wins.

const base: AppConfig = {
	title: 'Movie Night',
	members: [{ id: 'anna', name: 'Anna', color: '#e63946', emoji: '' }],
	tokenAmount: 1,
	tokenWeekday: 0,
	tokenHour: 8,
	tokenCap: 5,
	tokenStart: 3,
	sources: [],
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
	tmdbApiKey: 'test-key',
	omdbApiKey: '',
	tmdbKeyState: 'ok',
	omdbKeyState: 'missing',
	pin: '1234',
	dataDir: '/tmp/pv-test',
	httpsProof: { mode: 'none' },
	sessionTimeout: 31_536_000,
	users: [],
	origins: {},
	configFile: '/tmp/config.yaml'
};

interface Call {
	path_: string;
	language: string | null;
	params: URLSearchParams;
}

let calls: Call[] = [];

/** Stubs `fetch` and answers every request from the mapping handed in. */
function answerWith(routes: (call: Call) => Record<string, unknown>) {
	calls = [];
	vi.stubGlobal('fetch', async (input: URL | string) => {
		const url = new URL(String(input));
		const call: Call = {
			path_: url.pathname,
			language: url.searchParams.get('language'),
			params: url.searchParams
		};
		calls.push(call);
		return { ok: true, json: async () => routes(call) } as Response;
	});
}

afterEach(() => vi.unstubAllGlobals());

/** Answer of the movie endpoint; poster_path stays empty, or the test would download an image. */
function movieResponse(fields: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 42,
		title: 'Chihiros Reise ins Zauberland',
		original_title: 'Sen to Chihiro no Kamikakushi',
		original_language: 'ja',
		release_date: '2001-07-20',
		runtime: 125,
		genres: [{ name: 'Animation' }],
		poster_path: null,
		...fields
	};
}

describe('language of the movie data', () => {
	it('requests in the configured language', async () => {
		answerWith(() => movieResponse({ overview: 'Deutscher Text' }));
		const details = await fetchDetails({ ...base, language: 'fr-FR' }, 42);
		expect(calls[0].language).toBe('fr-FR');
		expect(details.title).toBe('Chihiros Reise ins Zauberland');
		expect(details.overview).toBe('Deutscher Text');
	});

	it('falls back to the fallback language for a missing description', async () => {
		answerWith((a) =>
			a.language === 'en-US' ? movieResponse({ overview: 'English text' }) : movieResponse({ overview: '' })
		);
		const details = await fetchDetails(base, 42);
		expect(details.overview).toBe('English text');
		expect(calls.map((a) => a.language)).toContain('en-US');
	});

	// TMDB knows no language value `original`: the request runs in the fallback
	// language, the title comes from original_title and the description from a
	// second request with the movieResponse's real original language.
	it('fetches title and text in the movieResponse\'s language for "original"', async () => {
		answerWith((a) =>
			a.language === 'ja'
				? movieResponse({ overview: 'Japanischer Text' })
				: movieResponse({ overview: 'English text' })
		);
		const details = await fetchDetails({ ...base, language: 'original' }, 42);
		expect(calls[0].language).toBe('en-US'); // first request in the fallback language
		expect(calls.map((a) => a.language)).toContain('ja');
		expect(details.title).toBe('Sen to Chihiro no Kamikakushi');
		expect(details.overview).toBe('Japanischer Text');
	});

	it('keeps the fallback language for "original" when the original text is missing', async () => {
		answerWith((a) =>
			a.language === 'ja' ? movieResponse({ overview: '' }) : movieResponse({ overview: 'English text' })
		);
		const details = await fetchDetails({ ...base, language: 'original' }, 42);
		expect(details.title).toBe('Sen to Chihiro no Kamikakushi');
		expect(details.overview).toBe('English text');
	});

	it('does not request twice when language and fallback are the same', async () => {
		answerWith(() => movieResponse({ overview: '' }));
		await fetchDetails({ ...base, language: 'en-US' }, 42);
		expect(calls.filter((a) => a.path_.endsWith('/movie/42'))).toHaveLength(1);
	});
});

describe('age rating', () => {
	const releaseDates = {
		results: [
			{ iso_3166_1: 'DE', release_dates: [{ certification: '6' }] },
			{ iso_3166_1: 'CH', release_dates: [{ certification: '10' }] }
		]
	};

	it('takes the rating of the configured country', () => {
		expect(extractCertification(releaseDates, 'DE')).toBe('6');
		expect(extractCertification(releaseDates, 'CH')).toBe('10');
	});

	it('delivers nothing when the country carries no rating', () => {
		expect(extractCertification(releaseDates, 'JP')).toBeNull();
		expect(extractCertification(undefined, 'DE')).toBeNull();
	});

	it('passes the configured country through into the movie data', async () => {
		answerWith(() => movieResponse({ overview: 'Text', release_dates: releaseDates }));
		const details = await fetchDetails({ ...base, certificationCountry: 'CH' }, 42);
		expect(details.certification).toBe('10');
	});
});

describe('trailer chain', () => {
	it("replaces the placeholder with the movieResponse's original language", () => {
		expect(trailerChain(base, 'ja')).toEqual(['ja', 'en', 'de']);
	});

	it('drops the placeholder when the movieResponse reports no original language', () => {
		expect(trailerChain(base, null)).toEqual(['en', 'de']);
	});

	// TMDB filters videos server-side: whatever is missing here never arrives.
	// That is why the original language is always part of the request, even when
	// it is not in the chain.
	it('requests the original language even when it is not in the chain', () => {
		const config = { ...base, trailerLanguages: ['de'] };
		expect(trailerRequestLanguages(config, 'ja')).toEqual(['de', 'ja']);
	});

	it('does not request a language twice', () => {
		expect(trailerRequestLanguages({ ...base, trailerLanguages: ['de', 'original'] }, 'de')).toEqual(['de']);
	});
});

describe('trailer choice', () => {
	const trailer = (key: string, iso: string | null, type = 'Trailer') => ({
		key,
		iso_639_1: iso,
		site: 'YouTube',
		type
	});

	it('takes the first language of the chain that exists', () => {
		const videos = [trailer('en1', 'en'), trailer('ja1', 'ja'), trailer('de1', 'de')];
		expect(pickTrailer(videos, ['ja', 'en', 'de'])).toBe('ja1');
	});

	it('prefers a real trailer over a teaser in the same language', () => {
		const videos = [trailer('teaser', 'de', 'Teaser'), trailer('real', 'de')];
		expect(pickTrailer(videos, ['de'])).toBe('real');
	});

	// The chain decides the preference, not the condition of existence. A movieResponse
	// whose only trailer exists in a language that is not listed keeps it .
	// otherwise it would disappear without a word.
	it('takes a trailer even in a language that is not in the chain', () => {
		const videos = [trailer('russianOnly', 'ru')];
		expect(pickTrailer(videos, ['en', 'de'])).toBe('russianOnly');
	});

	it('falls back to any usable video', () => {
		const videos = [trailer('teaserOhneSprache', null, 'Teaser')];
		expect(pickTrailer(videos, ['en'])).toBe('teaserOhneSprache');
	});

	it('ignores videos that are neither trailers nor from YouTube', () => {
		const videos = [
			{ key: 'vimeo', iso_639_1: 'de', site: 'Vimeo', type: 'Trailer' },
			{ key: 'featurette', iso_639_1: 'de', site: 'YouTube', type: 'Featurette' }
		];
		expect(pickTrailer(videos, ['de'])).toBeNull();
	});
});

// What happens when the movie database is not there. The family notices this as
// "adding a movie is broken", so the question each of these answers is how far
// the failure is allowed to travel: a missing cover is a missing cover, but it
// must not cost the movie, and a search that cannot reach anybody has to say so
// rather than hang.
describe('when the movie database fails', () => {
	/** Every request rejects, the way a name that does not resolve does. */
	function failWith(err: Error) {
		calls = [];
		vi.stubGlobal('fetch', async (input: URL | string) => {
			calls.push({ path_: new URL(String(input)).pathname, language: null, params: new URLSearchParams() });
			throw err;
		});
	}

	it('lets a lookup fail rather than inventing a movie', async () => {
		failWith(new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND api.themoviedb.org') }));
		await expect(fetchDetails(base, 42)).rejects.toThrow(/fetch failed/);
	});

	it('says which status came back when the database answers with one', async () => {
		vi.stubGlobal('fetch', async () => ({ ok: false, status: 503 }) as Response);
		await expect(fetchDetails(base, 42)).rejects.toThrow(/503/);
	});

	// The cover is the one part that may go missing quietly: an image server
	// having a bad minute must not stop a movie from reaching the list.
	it('keeps the movie when only the cover cannot be fetched', async () => {
		calls = [];
		vi.stubGlobal('fetch', async (input: URL | string) => {
			const url = new URL(String(input));
			if (url.hostname === 'image.tmdb.org') throw new Error('image server away');
			calls.push({
				path_: url.pathname,
				language: url.searchParams.get('language'),
				params: url.searchParams
			});
			return {
				ok: true,
				json: async () => movieResponse({ poster_path: '/poster.jpg', overview: 'Text' })
			} as Response;
		});

		const details = await fetchDetails(base, 42);
		expect(details.posterFile).toBeNull();
		expect(details.title).toBe('Chihiros Reise ins Zauberland');
		expect(details.runtime).toBe(125);
	});

	// The IMDb rating comes from a second service. It is decoration; the movie
	// stands without it.
	it('keeps the movie when only the rating service fails', async () => {
		calls = [];
		vi.stubGlobal('fetch', async (input: URL | string) => {
			const url = new URL(String(input));
			if (url.hostname === 'www.omdbapi.com') throw new Error('omdb away');
			return {
				ok: true,
				json: async () => movieResponse({ external_ids: { imdb_id: 'tt0245429' }, overview: 'Text' })
			} as Response;
		});

		const details = await fetchDetails({ ...base, omdbApiKey: 'test-key' }, 42);
		expect(details.imdbRating).toBeNull();
		expect(details.title).toBe('Chihiros Reise ins Zauberland');
	});

	// A try/catch does not catch a hang, so every request carries a deadline of
	// its own. Asserting that the signal exists and is not yet aborted would prove
	// nothing -- a controller nobody ever fires looks exactly the same at call
	// time. So the mechanism itself is watched.
	//
	// All three call sites have to fire, and each answer rejects after the signal
	// has been recorded: a poster that arrived would be written to disk, and no
	// test here touches the file system.
	it('arms a real deadline on every request it makes', async () => {
		const deadlines = vi.spyOn(AbortSignal, 'timeout');
		const signals: (AbortSignal | undefined)[] = [];
		try {
			vi.stubGlobal('fetch', async (input: URL | string, init?: RequestInit) => {
				signals.push(init?.signal ?? undefined);
				const url = new URL(String(input));
				if (url.hostname === 'api.themoviedb.org') {
					return {
						ok: true,
						json: async () =>
							movieResponse({
								poster_path: '/poster.jpg',
								external_ids: { imdb_id: 'tt0245429' },
								overview: 'Text'
							})
					} as Response;
				}
				// The poster server and the rating service, both refusing.
				throw new Error('away');
			});

			const details = await fetchDetails({ ...base, omdbApiKey: 'test-key' }, 42);
			// Reached in spite of both refusals.
			expect(details.title).toBe('Chihiros Reise ins Zauberland');

			// The movie endpoint, the videos endpoint, the poster and the rating --
			// four requests across three call sites, all of them signalled.
			expect(signals.length).toBeGreaterThanOrEqual(4);

			// Every one of them came from AbortSignal.timeout with a real duration.
			expect(deadlines.mock.calls.length).toBe(signals.length);
			for (const [ms] of deadlines.mock.calls) expect(ms).toBeGreaterThan(0);
			for (const signal of signals) expect(signal).toBeInstanceOf(AbortSignal);
		} finally {
			deadlines.mockRestore();
		}
	});

	// OMDb answers with a plain "N/A" for a movie nobody has rated yet. That is an
	// ordinary answer, not a failure, and it has to arrive as no rating rather
	// than as NaN on the screen.
	it('reads an unrated movie as having no rating', async () => {
		vi.stubGlobal('fetch', async (input: URL | string) => {
			const url = new URL(String(input));
			if (url.hostname === 'www.omdbapi.com') {
				return { ok: true, json: async () => ({ imdbRating: 'N/A' }) } as Response;
			}
			return {
				ok: true,
				json: async () => movieResponse({ external_ids: { imdb_id: 'tt0245429' }, overview: 'Text' })
			} as Response;
		});

		const details = await fetchDetails({ ...base, omdbApiKey: 'test-key' }, 42);
		expect(details.imdbRating).toBeNull();
	});
});

// A key the provider refuses looks exactly like a key that works, right up to
// the first answer. Whether that answer is read correctly decides whether the
// family is told "the movie database is not reachable", the one explanation
// that is wrong, or the truth. And a verdict that can never be taken back is
// worse than none: the notice would outlive the problem.
describe('a key the provider refuses', () => {
	const withOmdb = { ...base, omdbApiKey: 'omdb-key', omdbKeyState: 'ok' as const };

	/** TMDB answers the movie endpoint, OMDb whatever the test says. */
	function omdbAnswers(answer: { ok: boolean; status: number; body: Record<string, unknown> }) {
		vi.stubGlobal('fetch', async (input: URL | string) => {
			if (new URL(String(input)).hostname === 'www.omdbapi.com') {
				return { ok: answer.ok, status: answer.status, json: async () => answer.body } as Response;
			}
			return {
				ok: true,
				status: 200,
				json: async () => movieResponse({ external_ids: { imdb_id: 'tt0245429' }, overview: 'Text' })
			} as Response;
		});
	}

	beforeEach(() => forgetRejections());
	afterEach(() => forgetRejections());

	it('recognises a 401 from TMDB', async () => {
		vi.stubGlobal('fetch', async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response);
		await expect(searchMovies(base, 'Chihiro')).rejects.toThrow();
		expect(keyState(base, 'tmdb')).toBe('rejected');
	});

	it('leaves the key alone when TMDB is merely having a bad day', async () => {
		vi.stubGlobal('fetch', async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response);
		await expect(searchMovies(base, 'Chihiro')).rejects.toThrow();
		expect(keyState(base, 'tmdb')).toBe('ok');
	});

	/** Refuses the key once, so the next answer has something to take back. */
	async function afterARefusal() {
		vi.stubGlobal('fetch', async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response);
		await expect(searchMovies(base, 'Chihiro')).rejects.toThrow();
		expect(keyState(base, 'tmdb')).toBe('rejected');
	}

	// Not only a 200: TMDB looks the key up before it looks for the movie, so a
	// 404 is an answer the API itself gave and proves the key got through.
	it('takes the refusal back on a 404, which the API only reaches with a good key', async () => {
		await afterARefusal();
		vi.stubGlobal('fetch', async () => ({ ok: false, status: 404, json: async () => ({}) }) as Response);
		await expect(searchMovies(base, 'Chihiro')).rejects.toThrow();
		expect(keyState(base, 'tmdb')).toBe('ok');
	});

	// The expensive one to get wrong: TMDB enforces its rate limit per IP in a
	// layer in front of the API, so a 429 can come back without the key ever
	// being read. Counting it as proof would clear a refusal that was right.
	it('does not let a rate limit vouch for the key', async () => {
		await afterARefusal();
		vi.stubGlobal('fetch', async () => ({ ok: false, status: 429, json: async () => ({}) }) as Response);
		await expect(searchMovies(base, 'Chihiro')).rejects.toThrow();
		expect(keyState(base, 'tmdb')).toBe('rejected');
	});

	it('does not let an outage vouch for the key either', async () => {
		await afterARefusal();
		vi.stubGlobal('fetch', async () => ({ ok: false, status: 503, json: async () => ({}) }) as Response);
		await expect(searchMovies(base, 'Chihiro')).rejects.toThrow();
		expect(keyState(base, 'tmdb')).toBe('rejected');
	});

	// Without this the verdict would be a one-way street: the interface stops
	// sending the requests that could disprove it, so a key refused for an hour
	// would count as refused until the container is restarted.
	it('takes the refusal back when TMDB answers normally again', async () => {
		vi.stubGlobal('fetch', async () => ({ ok: false, status: 401, json: async () => ({}) }) as Response);
		await expect(searchMovies(base, 'Chihiro')).rejects.toThrow();
		expect(keyState(base, 'tmdb')).toBe('rejected');

		vi.stubGlobal(
			'fetch',
			async () => ({ ok: true, status: 200, json: async () => ({ results: [] }) }) as Response
		);
		await searchMovies(base, 'Chihiro');
		expect(keyState(base, 'tmdb')).toBe('ok');
	});

	// OMDb packs the same complaint into a 200 as readily as into a 401, so the
	// text decides rather than the status.
	it('recognises a refusal OMDb hides in a 200', async () => {
		omdbAnswers({ ok: true, status: 200, body: { Response: 'False', Error: 'Invalid API key!' } });
		await fetchDetails(withOmdb, 42);
		expect(keyState(withOmdb, 'omdb')).toBe('rejected');
	});

	it('recognises a 401 from OMDb', async () => {
		omdbAnswers({ ok: false, status: 401, body: { Response: 'False', Error: 'Invalid API key!' } });
		await fetchDetails(withOmdb, 42);
		expect(keyState(withOmdb, 'omdb')).toBe('rejected');
	});

	// The expensive confusion: OMDb reports an exhausted daily quota with the
	// same 401 as a bad key. Reading the status alone would send the operator
	// hunting for a new key while the old one starts working again at midnight.
	it('does not mistake a spent daily quota for a bad key', async () => {
		omdbAnswers({ ok: false, status: 401, body: { Response: 'False', Error: 'Request limit reached!' } });
		await fetchDetails(withOmdb, 42);
		expect(keyState(withOmdb, 'omdb')).toBe('ok');
	});

	it('does not mistake an unknown movie for a bad key', async () => {
		omdbAnswers({ ok: true, status: 200, body: { Response: 'False', Error: 'Movie not found!' } });
		await fetchDetails(withOmdb, 42);
		expect(keyState(withOmdb, 'omdb')).toBe('ok');
	});

	// Matching any sentence that mentions the key would be one word too generous:
	// a quota message naming it would put a working key out of action.
	it('does not read every mention of the key as a refusal', async () => {
		omdbAnswers({
			ok: false,
			status: 401,
			body: { Response: 'False', Error: 'Request limit reached for this API key today!' }
		});
		await fetchDetails(withOmdb, 42);
		expect(keyState(withOmdb, 'omdb')).toBe('ok');
	});

	it('reads the other refusal OMDb knows', async () => {
		omdbAnswers({ ok: false, status: 401, body: { Response: 'False', Error: 'No API key provided.' } });
		await fetchDetails(withOmdb, 42);
		expect(keyState(withOmdb, 'omdb')).toBe('rejected');
	});

	it('takes an OMDb refusal back when a rating arrives again', async () => {
		omdbAnswers({ ok: false, status: 401, body: { Response: 'False', Error: 'Invalid API key!' } });
		await fetchDetails(withOmdb, 42);
		expect(keyState(withOmdb, 'omdb')).toBe('rejected');

		omdbAnswers({ ok: true, status: 200, body: { Response: 'True', imdbRating: '8.6' } });
		const details = await fetchDetails(withOmdb, 42);
		expect(details.imdbRating).toBe(8.6);
		expect(keyState(withOmdb, 'omdb')).toBe('ok');
	});

	// Nothing to send, nothing to learn: the answer is already known from the
	// configuration, and a round trip would only confirm it. All three entry
	// points, because each is reached from a different page.
	it('does not call TMDB at all without a key', async () => {
		const calls_ = vi.fn();
		vi.stubGlobal('fetch', async () => {
			calls_();
			return { ok: true, status: 200, json: async () => ({}) } as Response;
		});
		const noKey = { ...base, tmdbApiKey: '', tmdbKeyState: 'missing' as const };
		await expect(fetchDetails(noKey, 42)).rejects.toThrow(/No TMDB key/);
		await expect(fetchPreview(noKey, 42)).rejects.toThrow(/No TMDB key/);
		await expect(searchMovies(noKey, 'Chihiro')).rejects.toThrow(/No TMDB key/);
		expect(calls_).not.toHaveBeenCalled();
	});
});

describe('Latin script detection', () => {
	// Letters decide, nothing else: digits, spaces, punctuation and symbols are
	// not letters and must never make a readable title fail.
	it('accepts anything whose letters are Latin', () => {
		const titles = ['Das Boot', 'Amélie', 'WALL·E', 'Blade Runner 2049', '9', '2001: A Space Odyssey'];
		for (const title of titles) expect(isLatinScript(title)).toBe(true);
	});

	it('rejects a title with letters from another script', () => {
		for (const title of ['千と千尋の神隠し', 'Оно', 'الرسالة', '기생충']) {
			expect(isLatinScript(title)).toBe(false);
		}
	});

	// Half a title nobody can read is no better than a whole one, so a mixed
	// title counts as non-Latin and falls back to the English one.
	it('rejects a title mixing both scripts', () => {
		expect(isLatinScript('Akira アキラ')).toBe(false);
	});
});

describe('the latin mode', () => {
	const latin = { ...base, language: 'latin' };

	// A Japanese film: the original title is unreadable here, so the English one
	// wins, and everything else stays English too, one request, no second look.
	it('takes the English title and text for a non-Latin original', async () => {
		answerWith(() =>
			movieResponse({
				title: 'Spirited Away',
				original_title: '千と千尋の神隠し',
				overview: 'English text'
			})
		);
		const details = await fetchDetails(latin, 42);
		expect(calls[0].language).toBe('en-US');
		expect(details.title).toBe('Spirited Away');
		expect(details.overview).toBe('English text');
	});

	// A French film: the original title is readable and stays, but the text is
	// English, French is not a language this household reads by default.
	it('keeps a Latin original title but takes the English text', async () => {
		answerWith(() =>
			movieResponse({
				title: 'Amelie',
				original_title: 'Le Fabuleux Destin d’Amélie Poulain',
				original_language: 'fr',
				overview: 'English text'
			})
		);
		const details = await fetchDetails(latin, 42);
		expect(details.title).toBe('Le Fabuleux Destin d’Amélie Poulain');
		expect(details.overview).toBe('English text');
	});

	// A German film gets a second look, and every localised field comes from it .
	// a German description next to English genres and an English poster was the
	// bug this rule exists for.
	it('fetches a German film in German, description, genres and poster together', async () => {
		answerWith((a) =>
			a.language === 'de'
				? movieResponse({
						title: 'Das Boot',
						original_title: 'Das Boot',
						original_language: 'de',
						overview: 'Deutscher Text',
						genres: [{ name: 'Kriegsfilm' }],
						poster_path: '/deutsch.jpg'
					})
				: movieResponse({
						title: 'The Boat',
						original_title: 'Das Boot',
						original_language: 'de',
						overview: 'English text',
						genres: [{ name: 'War' }],
						poster_path: '/english.jpg'
					})
		);
		const preview = await fetchPreview(latin, 42);
		expect(calls[0].language).toBe('en-US');
		expect(calls.map((a) => a.language)).toContain('de');
		expect(preview.title).toBe('Das Boot');
		expect(preview.overview).toBe('Deutscher Text');
		expect(preview.genres).toBe('Kriegsfilm');
		expect(preview.posterUrl).toContain('/deutsch.jpg');
	});

	// A gap in the German answer must not blank the film: each field falls back
	// to the English one on its own.
	it('falls back field by field when the German answer is incomplete', async () => {
		answerWith((a) =>
			a.language === 'de'
				? movieResponse({ original_language: 'de', overview: '', genres: [], poster_path: null })
				: movieResponse({
						title: 'The Boat',
						original_title: 'Das Boot',
						original_language: 'de',
						overview: 'English text',
						genres: [{ name: 'War' }],
						poster_path: '/english.jpg'
					})
		);
		const preview = await fetchPreview(latin, 42);
		expect(preview.overview).toBe('English text');
		expect(preview.genres).toBe('War');
		expect(preview.posterUrl).toContain('/english.jpg');
	});

	// The search stays one request: `original_language` is in every hit, so the
	// script rule applies without a second look per result.
	it('applies the script rule to search hits', async () => {
		answerWith(() => ({
			results: [
				{ id: 1, title: 'Spirited Away', original_title: '千と千尋の神隠し', original_language: 'ja' },
				{ id: 2, title: 'The Boat', original_title: 'Das Boot', original_language: 'de' }
			]
		}));
		const hits = await searchMovies(latin, 'x');
		expect(hits.map((h) => h.title)).toEqual(['Spirited Away', 'Das Boot']);
		expect(calls).toHaveLength(1);
	});
});

describe('the original mode is unchanged by the latin mode', () => {
	// The guard against the latin rule leaking into the mode that came before it:
	// title and description in the original language, genres and poster from the
	// fallback answer. A Japanese film must not arrive with Japanese genre names.
	it('takes genres and poster from the fallback answer', async () => {
		answerWith((a) =>
			a.language === 'ja'
				? movieResponse({
						overview: 'Japanischer Text',
						genres: [{ name: 'Anime' }],
						poster_path: '/japanisch.jpg'
					})
				: movieResponse({
						overview: 'English text',
						genres: [{ name: 'Animation' }],
						poster_path: '/english.jpg'
					})
		);
		const preview = await fetchPreview({ ...base, language: 'original' }, 42);
		expect(preview.title).toBe('Sen to Chihiro no Kamikakushi');
		expect(preview.overview).toBe('Japanischer Text');
		expect(preview.genres).toBe('Animation');
		expect(preview.posterUrl).toContain('/english.jpg');
	});
});

describe('the TMDB rating', () => {
	it('comes from the answer already fetched', async () => {
		answerWith(() => movieResponse({ vote_average: 8.2 }));
		expect((await fetchDetails(base, 42)).tmdbRating).toBe(8.2);
	});

	// TMDB answers 0 for "nobody has rated this yet". Showing "★ 0.0" would read
	// as a verdict rather than as an absence.
	it('is null when nobody has rated the movie', async () => {
		answerWith(() => movieResponse({ vote_average: 0 }));
		expect((await fetchDetails(base, 42)).tmdbRating).toBeNull();
	});

	// The backfill reads the rating and nothing else, re-fetching the details
	// would rewrite the title of every movie in the archive.
	it('can be fetched on its own for the backfill', async () => {
		answerWith(() => movieResponse({ vote_average: 7.4 }));
		expect(await fetchTmdbRating(base, 42)).toBe(7.4);
		expect(calls).toHaveLength(1);
		expect(calls[0].language).toBeNull();
	});
});
