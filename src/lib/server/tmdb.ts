import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { LATIN, LATIN_NATIVE, ORIGINAL, type AppConfig } from './config';
import { noteAccepted, noteRejected } from './keys';

const TMDB = 'https://api.themoviedb.org/3';

/**
 * A status TMDB answered with, carried on the error so a caller can tell a
 * permanent verdict about one film (404, the id is gone or was merged away)
 * from something worth retrying.
 */
export class TmdbError extends Error {
	constructor(readonly status: number) {
		super(`TMDB answered with ${status}`);
		this.name = 'TmdbError';
	}
}

/**
 * Language for the first request. TMDB knows neither `original` nor `latin` .
 * both are resolved per film afterwards (see `localised`), and both start from
 * the fallback language.
 */
function requestLanguage(config: AppConfig): string {
	return config.language === ORIGINAL || config.language === LATIN
		? config.languageFallback
		: config.language;
}

/**
 * True when no letter in the text comes from a non-Latin script.
 *
 * Digits, spaces, punctuation and symbols are not letters and are therefore
 * always fine, `Blade Runner 2049` and `WALL·E` pass, `千と千尋の神隠し` does
 * not. A title mixing both scripts counts as non-Latin: half a title nobody can
 * read is no better than a whole one.
 *
 * `Common` and `Inherited` count as fine as well. They carry the letters that
 * belong to no script of their own, the ʻokina in `Hawaiʻi` is one, and
 * rejecting those would throw away a perfectly readable title.
 */
export function isLatinScript(text: string): boolean {
	return ![...text].some(
		(c) => /\p{L}/u.test(c) && !/[\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(c)
	);
}

export interface Localised {
	title: string;
	overview: string | null;
	genres: string | null;
	posterPath: string | null;
}

function genreList(data: Record<string, unknown>): string | null {
	return (
		((data.genres as Record<string, unknown>[]) ?? [])
			.map((g) => str(g.name))
			.filter(Boolean)
			.join(', ') || null
	);
}

/** A second look at the same film in another language; failure is not an error. */
function detailsIn(config: AppConfig, tmdbId: number, language: string) {
	return tmdbGet(config, `/movie/${tmdbId}`, { language }).catch(() => null);
}

/**
 * The fields that depend on a language, resolved for the configured mode.
 *
 * Exported for the unit tests, the alternative would be testing it through
 * `fetchDetails()`, which talks to the network.
 *
 * The second request costs one round trip per film and happens only while a film
 * is being added or linked, never on a page view.
 */
export async function localised(
	config: AppConfig,
	tmdbId: number,
	data: Record<string, unknown>,
	originalLanguage: string | null
): Promise<Localised> {
	const genres = genreList(data);
	const posterPath = str(data.poster_path);

	// `original`: title and description in the film's own language, genres and
	// poster from the answer already in hand. That mix is deliberate and unchanged
	// since 1.2.0, a Japanese film would otherwise carry Japanese genre names.
	if (config.language === ORIGINAL) {
		const own = originalLanguage ? await detailsIn(config, tmdbId, originalLanguage) : null;
		return {
			title: str(data.original_title) ?? str(data.title) ?? '?',
			// The first answer already came in the fallback language.
			overview: (own ? str(own.overview) : null) ?? str(data.overview),
			genres,
			posterPath
		};
	}

	// `latin`: a German film comes back in German, every field of it, or a German
	// description would stand next to English genres and an English poster.
	// Everything else stays in the fallback language of the first answer. The title
	// follows the script rule instead, not the answer.
	if (config.language === LATIN) {
		const native = originalLanguage === LATIN_NATIVE ? await detailsIn(config, tmdbId, LATIN_NATIVE) : null;
		const own = str(data.original_title);
		// Field by field, so a gap in the German answer falls back to the English
		// one rather than blanking the film.
		//
		// One case this cannot rescue: a film with no English entry at TMDB gets
		// its original title back as `title` as well, so both candidates are the
		// same non-Latin string and it is stored that way. There is no third
		// source to fall to, inventing a transliteration would be worse than the
		// honest original.
		return {
			title:
				own && isLatinScript(own)
					? own
					: ((native ? str(native.title) : null) ?? str(data.title) ?? own ?? '?'),
			overview: (native ? str(native.overview) : null) ?? str(data.overview),
			genres: (native ? genreList(native) : null) ?? genres,
			posterPath: (native ? str(native.poster_path) : null) ?? posterPath
		};
	}

	// A real language code: one answer, and the fallback language only fills a
	// description the requested language does not have.
	let overview = str(data.overview);
	if (!overview && config.language !== config.languageFallback) {
		const details = await detailsIn(config, tmdbId, config.languageFallback);
		overview = details ? str(details.overview) : null;
	}
	return {
		title: str(data.title) ?? str(data.original_title) ?? '?',
		overview,
		genres,
		posterPath
	};
}

export interface SearchHit {
	tmdbId: number;
	title: string;
	year: number | null;
	posterUrl: string | null;
}

export interface MovieDetails {
	tmdbId: number;
	imdbId: string | null;
	title: string;
	year: number | null;
	overview: string | null;
	runtime: number | null;
	genres: string | null;
	certification: string | null;
	originalLanguage: string | null;
	imdbRating: number | null;
	tmdbRating: number | null;
	posterFile: string | null;
	trailerYoutubeId: string | null;
}

/**
 * TMDB's own average, or null when nobody has rated the film yet, TMDB answers
 * `0` for that, and `★ 0.0` on a new film would read as a verdict rather than as
 * an absence.
 */
function voteAverage(data: Record<string, unknown>): number | null {
	const rating = Number(data.vote_average);
	return Number.isFinite(rating) && rating > 0 ? rating : null;
}

async function tmdbGet(
	config: AppConfig,
	pathname: string,
	params: Record<string, string>
): Promise<Record<string, unknown>> {
	const url = new URL(`${TMDB}${pathname}`);
	url.searchParams.set('api_key', config.tmdbApiKey);
	for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
	// A key already known to be refused is deliberately **not** short-circuited
	// here. Skipping the request would save a round trip and cost the only way
	// back: nothing would ever answer, so `noteAccepted` could never fire and the
	// verdict would stand until the container restarts. The request is the retry.
	const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
	// 401 is the one status that says something about the configuration rather
	// than about the request: the key is wrong. Noted, so the interface can name
	// it instead of blaming the film, and taken back again, or a key that was
	// refused for an hour would count as refused until the next restart.
	//
	// What counts as taking it back is narrow on purpose: only an answer the API
	// itself gave, which means it checked the key first. A 200 and a 404 qualify
	//, TMDB looks up the key before it looks for the movie. A 429 does not: the
	// rate limit runs per IP through a layer in front of the API, so it can be
	// returned without the key ever being read, and treating it as proof would
	// quietly clear a refusal that was right. A 5xx says nothing either way.
	if (res.status === 401) noteRejected('tmdb', config.tmdbApiKey);
	else if (res.ok || res.status === 404) noteAccepted('tmdb', config.tmdbApiKey);
	if (!res.ok) throw new TmdbError(res.status);
	return (await res.json()) as Record<string, unknown>;
}

/**
 * The title for one search hit.
 *
 * `latin` applies its script rule here too, the hit carries `original_title`,
 * so it costs no second request, and the list stays one call. Every other mode,
 * `original` included, keeps the title of the requested language exactly as
 * before: the hit list is for recognising a film, and the detail fetch when it
 * is added decides what gets stored.
 */
export function searchTitle(config: AppConfig, hit: Record<string, unknown>): string {
	const own = str(hit.original_title);
	if (config.language === LATIN && own && isLatinScript(own)) return own;
	return str(hit.title) ?? own ?? '?';
}

export async function searchMovies(config: AppConfig, query: string): Promise<SearchHit[]> {
	if (!config.tmdbApiKey) throw new Error('No TMDB key configured.');
	const data = await tmdbGet(config, '/search/movie', {
		query,
		language: requestLanguage(config),
		include_adult: 'false'
	});
	const results = (data.results as Record<string, unknown>[]) ?? [];
	return results.slice(0, 12).map((r) => ({
		tmdbId: Number(r.id),
		title: searchTitle(config, r),
		year: r.release_date ? Number(String(r.release_date).slice(0, 4)) || null : null,
		posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : null
	}));
}

export interface MoviePreview {
	tmdbId: number;
	title: string;
	year: number | null;
	overview: string | null;
	runtime: number | null;
	genres: string | null;
	certification: string | null;
	originalLanguage: string | null;
	posterUrl: string | null;
}

/** A light preview before adding: read only, create nothing, download no cover. */
export async function fetchPreview(config: AppConfig, tmdbId: number): Promise<MoviePreview> {
	// Same guard as the search: without a key the answer is known, and sending
	// the request anyway would spend a round trip to be told so.
	if (!config.tmdbApiKey) throw new Error('No TMDB key configured.');
	const data = await tmdbGet(config, `/movie/${tmdbId}`, {
		language: requestLanguage(config),
		append_to_response: 'release_dates'
	});

	const originalLanguage = str(data.original_language);
	const { title, overview, genres, posterPath } = await localised(config, tmdbId, data, originalLanguage);

	return {
		tmdbId,
		title,
		year: data.release_date ? Number(String(data.release_date).slice(0, 4)) || null : null,
		overview,
		runtime: Number(data.runtime) || null,
		genres,
		// The age rating does not follow the request language: it is read out of
		// `release_dates` for the configured country, and only the first answer
		// carries that block.
		certification: extractCertification(
			data.release_dates as Record<string, unknown> | undefined,
			config.certificationCountry
		),
		originalLanguage,
		posterUrl: posterPath ? `https://image.tmdb.org/t/p/w342${posterPath}` : null
	};
}

/** Fetches every detail of a TMDB match, including the cover download and the OMDb rating. */
export async function fetchDetails(config: AppConfig, tmdbId: number): Promise<MovieDetails> {
	if (!config.tmdbApiKey) throw new Error('No TMDB key configured.');
	const data = await tmdbGet(config, `/movie/${tmdbId}`, {
		language: requestLanguage(config),
		append_to_response: 'release_dates,external_ids'
	});

	const originalLanguage = str(data.original_language);
	const { title, overview, genres, posterPath } = await localised(config, tmdbId, data, originalLanguage);
	const trailerYoutubeId = await findTrailer(config, tmdbId, originalLanguage);

	const external = (data.external_ids ?? {}) as Record<string, unknown>;
	const imdbId = str(external.imdb_id) ?? str(data.imdb_id);
	const imdbRating = imdbId ? await fetchImdbRating(config, imdbId) : null;

	const posterFile = posterPath ? await downloadPoster(config, posterPath) : null;

	return {
		tmdbId,
		imdbId,
		title,
		year: data.release_date ? Number(String(data.release_date).slice(0, 4)) || null : null,
		overview,
		runtime: Number(data.runtime) || null,
		genres,
		// Read out of `release_dates` for the configured country, independent of
		// the language the film data was requested in.
		certification: extractCertification(
			data.release_dates as Record<string, unknown> | undefined,
			config.certificationCountry
		),
		originalLanguage,
		imdbRating,
		tmdbRating: voteAverage(data),
		posterFile,
		trailerYoutubeId
	};
}

/**
 * Just the TMDB rating for one film, for the backfill that catches up the movies
 * added before this existed.
 *
 * Deliberately not `fetchDetails()`: that would rewrite title, description and
 * poster of every film in the archive along the current language rule, and the
 * whole point of storing them at fetch time is that they do not move afterwards.
 */
export async function fetchTmdbRating(config: AppConfig, tmdbId: number): Promise<number | null> {
	if (!config.tmdbApiKey) return null;
	const data = await tmdbGet(config, `/movie/${tmdbId}`, {});
	return voteAverage(data);
}

/**
 * The preference chain turned into real language codes: the placeholder
 * `original` becomes the film's actual original language, blanks fall away.
 */
export function trailerChain(config: AppConfig, originalLanguage: string | null): string[] {
	const chain: string[] = [];
	for (const entry of config.trailerLanguages) {
		const value = entry === ORIGINAL ? originalLanguage : entry;
		if (value && !chain.includes(value)) chain.push(value);
	}
	return chain;
}

/**
 * Which languages TMDB should deliver at all.
 *
 * Important: TMDB filters videos **server-side**. Whatever is missing here never
 * arrives, the selection below could not rescue it either. That is why the
 * film's original language is always part of the request, even when it is not in
 * the configured chain: otherwise a film whose only trailer exists in its own
 * language would lose it silently as soon as somebody narrowed
 * `language.trailer`. `null` additionally fetches the videos with no language
 * given.
 */
export function trailerRequestLanguages(config: AppConfig, originalLanguage: string | null): string[] {
	const requested = trailerChain(config, originalLanguage);
	if (originalLanguage && !requested.includes(originalLanguage)) requested.push(originalLanguage);
	return requested;
}

/**
 * Picks the fitting trailer out of the videos delivered.
 *
 * The chain decides the language *preference*, not the condition of existence:
 * if no language matches, some trailer is taken anyway, and finally some video.
 * So a film never loses its trailer merely because its language is not in the
 * chain.
 */
export function pickTrailer(videos: Record<string, unknown>[], chain: string[]): string | null {
	const brauchbar = videos.filter(
		(v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
	);
	const byLang = (lang: string) =>
		brauchbar.find((v) => v.type === 'Trailer' && v.iso_639_1 === lang) ??
		brauchbar.find((v) => v.iso_639_1 === lang);

	let pick: Record<string, unknown> | undefined;
	for (const lang of chain) {
		pick = byLang(lang);
		if (pick) break;
	}
	pick = pick ?? brauchbar.find((v) => v.type === 'Trailer') ?? brauchbar[0];
	return pick ? String(pick.key) : null;
}

async function findTrailer(
	config: AppConfig,
	tmdbId: number,
	originalLanguage: string | null
): Promise<string | null> {
	const requested = trailerRequestLanguages(config, originalLanguage);
	const data = await tmdbGet(config, `/movie/${tmdbId}/videos`, {
		include_video_language: [...requested, 'null'].join(',')
	}).catch(() => null);
	if (!data) return null;
	return pickTrailer(
		(data.results as Record<string, unknown>[]) ?? [],
		trailerChain(config, originalLanguage)
	);
}

/** The age rating of the configured country, and nothing else. */
export function extractCertification(
	releaseDates: Record<string, unknown> | undefined,
	country: string
): string | null {
	const entries = (releaseDates?.results as Record<string, unknown>[]) ?? [];
	const forCountry = entries.find((e) => e.iso_3166_1 === country);
	const releases = (forCountry?.release_dates as Record<string, unknown>[]) ?? [];
	const cert = releases.map((r) => str(r.certification)).find((c) => c && c.length > 0);
	return cert ?? null;
}

/**
 * The two complaints OMDb makes about the key itself: "Invalid API key!" and
 * "No API key provided.". Deliberately these two rather than any sentence
 * mentioning a key, a quota message that happens to name it would otherwise
 * put a working key out of action until the next restart.
 */
const OMDB_REFUSES_THE_KEY = /invalid api key|no api key/i;
const MAX_POSTER_BYTES = 8 * 1024 * 1024;
const POSTER_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function fetchImdbRating(config: AppConfig, imdbId: string): Promise<number | null> {
	if (!config.omdbApiKey) return null;
	try {
		const url = new URL('https://www.omdbapi.com/');
		url.searchParams.set('apikey', config.omdbApiKey);
		url.searchParams.set('i', imdbId);
		const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
		// The status alone decides nothing here. OMDb answers 401 for a key it
		// does not know **and** for a daily quota that has run out, and it packs
		// either complaint into a 200 with `Response: "False"` just as readily.
		// Only the text tells them apart, and a spent quota must not be recorded
		// as a bad key, or the operator goes hunting for a new one while the old
		// one starts working again at midnight. "Movie not found" arrives the same
		// way and is no verdict on the key either.
		const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
		const complaint = data?.Response === 'False' ? String(data.Error ?? '') : '';
		// `data` has to be there for a good answer to count as one: a 200 whose
		// body does not parse came from something that is not OMDb, a captive
		// portal, a proxy, and says nothing about the key.
		if (OMDB_REFUSES_THE_KEY.test(complaint)) noteRejected('omdb', config.omdbApiKey);
		else if (res.ok && data) noteAccepted('omdb', config.omdbApiKey);
		if (!res.ok || !data) return null;
		const rating = parseFloat(String(data.imdbRating));
		return Number.isFinite(rating) ? rating : null;
	} catch {
		return null;
	}
}

/** Reads only image responses that fit comfortably in the app's poster cache. */
export async function readPosterResponse(res: Response): Promise<Buffer | null> {
	const mediaType = res.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	if (!mediaType || !POSTER_MEDIA_TYPES.has(mediaType)) return null;
	const declaredRaw = res.headers.get('content-length');
	if (declaredRaw !== null) {
		const declared = Number(declaredRaw);
		if (!Number.isSafeInteger(declared) || declared < 1 || declared > MAX_POSTER_BYTES) return null;
	}
	if (!res.body) return null;

	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > MAX_POSTER_BYTES) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	return total > 0 ? Buffer.concat(chunks, total) : null;
}

async function downloadPoster(config: AppConfig, posterPath: string): Promise<string | null> {
	try {
		const res = await fetch(`https://image.tmdb.org/t/p/w500${posterPath}`, {
			signal: AbortSignal.timeout(15_000)
		});
		if (!res.ok) return null;
		const buffer = await readPosterResponse(res);
		if (!buffer) return null;
		// Clamped to what `/covers/[file]` will serve. TMDB delivers .jpg in
		// practice, but an extension outside that list would be stored and then
		// answered with a 404 by the guard there, the two ends belong together.
		const found = path.extname(posterPath).toLowerCase();
		const ext = ['.jpg', '.jpeg', '.png', '.webp'].includes(found) ? found : '.jpg';
		const name = `${crypto.createHash('sha1').update(posterPath).digest('hex').slice(0, 16)}${ext}`;
		const dir = path.join(config.dataDir, 'covers');
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, name), buffer);
		return name;
	} catch {
		return null;
	}
}

function str(v: unknown): string | null {
	return typeof v === 'string' && v.length > 0 ? v : null;
}
