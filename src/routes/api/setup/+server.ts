import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { AUTH_COOKIE, cookieValue } from '$lib/server/auth';
import { saveInitialSetup } from '$lib/server/config-service';
import { loadConfig } from '$lib/server/config';
import { authCookie } from '$lib/server/cookies';
import { authenticationMissing, pristineForSetup } from '$lib/server/setup';
import { seedDemoMovies } from '$lib/server/demo';
import { log } from '$lib/server/log';
import { ensureBalances } from '$lib/server/game';

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!authenticationMissing(locals.config))
		return json({ error: locals.t('setup.errorComplete') }, { status: 409 });
	if (!pristineForSetup(locals.db))
		return json({ error: locals.t('setup.errorExistingData') }, { status: 503 });
	const body = (await request.json().catch(() => ({}))) as {
		pin?: string;
		confirmPin?: string;
		title?: string;
		members?: unknown;
		tokenAmount?: unknown;
		tokenWeekday?: unknown;
		tokenHour?: unknown;
		tokenCap?: unknown;
		tokenStart?: unknown;
		timezone?: string;
		sources?: unknown;
		tmdbApiKey?: string;
		omdbApiKey?: string;
		interfaceLanguage?: string;
		movieLanguage?: string;
		movieFallbackLanguage?: string;
		certificationCountry?: string;
		trailerLanguages?: unknown;
	};
	const current = loadConfig(true);
	if (!authenticationMissing(current))
		return json({ error: locals.t('setup.errorComplete') }, { status: 409 });
	const pin = String(body.pin ?? '');
	if (!/^\d{4}$/.test(pin)) return json({ error: locals.t('settings.errorPin') }, { status: 400 });
	if (pin !== body.confirmPin) return json({ error: locals.t('settings.errorPinMismatch') }, { status: 400 });
	const title = String(body.title ?? '').trim();
	const members = Array.isArray(body.members)
		? body.members.map((member) => String(member).trim()).filter(Boolean)
		: [];
	const sources = Array.isArray(body.sources)
		? body.sources.map((source) => String(source).trim()).filter(Boolean)
		: [];
	const tokenAmount = Number(body.tokenAmount);
	const tokenWeekday = Number(body.tokenWeekday);
	const tokenHour = Number(body.tokenHour);
	const tokenCap = Number(body.tokenCap);
	const tokenStart = Number(body.tokenStart);
	const timezone = String(body.timezone ?? '').trim();
	const tmdbApiKey = String(body.tmdbApiKey ?? '').trim();
	const omdbApiKey = String(body.omdbApiKey ?? '').trim();
	const interfaceLanguage = String(body.interfaceLanguage ?? '').trim();
	const movieLanguage = String(body.movieLanguage ?? '').trim();
	const movieFallbackLanguage = String(body.movieFallbackLanguage ?? '').trim();
	const certificationCountry = String(body.certificationCountry ?? '')
		.trim()
		.toUpperCase();
	const trailerLanguages = Array.isArray(body.trailerLanguages)
		? body.trailerLanguages.map((language) => String(language).trim()).filter(Boolean)
		: [];
	if (title.length < 1 || title.length > 80)
		return json({ error: locals.t('settings.errorInstanceName') }, { status: 400 });
	if (
		members.length === 0 ||
		members.some((member) => member.length < 2 || member.length > 80) ||
		new Set(members.map((member) => member.toLocaleLowerCase('en'))).size !== members.length
	)
		return json({ error: locals.t('setup.errorMembers') }, { status: 400 });
	if (!sources.length || sources.some((source) => source.length > 80))
		return json({ error: locals.t('setup.errorSources') }, { status: 400 });
	const placeholderKey = (key: string) => /^YOUR-(?:TMDB|OMDB)-KEY$/i.test(key);
	if (
		(!tmdbApiKey && current.tmdbKeyState !== 'ok') ||
		tmdbApiKey.length > 512 ||
		omdbApiKey.length > 512 ||
		placeholderKey(tmdbApiKey) ||
		placeholderKey(omdbApiKey)
	)
		return json({ error: locals.t('setup.errorMovieKeys') }, { status: 400 });
	if (
		!['en', 'de', 'es', 'fr', 'pt-BR', 'it', 'pl', 'tr', 'ja'].includes(interfaceLanguage) ||
		![
			'latin',
			'original',
			'en-US',
			'de-DE',
			'es-ES',
			'fr-FR',
			'pt-BR',
			'it-IT',
			'pl-PL',
			'tr-TR',
			'ja-JP'
		].includes(movieLanguage) ||
		!['en-US', 'de-DE', 'es-ES', 'fr-FR', 'pt-BR', 'it-IT', 'pl-PL', 'tr-TR', 'ja-JP'].includes(
			movieFallbackLanguage
		) ||
		!/^[A-Z]{2}$/.test(certificationCountry) ||
		!trailerLanguages.length
	)
		return json({ error: locals.t('setup.errorMovieLanguages') }, { status: 400 });
	if (
		![tokenAmount, tokenCap].every((value) => Number.isInteger(value) && value >= 1 && value <= 99) ||
		!Number.isInteger(tokenStart) ||
		tokenStart < 0 ||
		tokenStart > 99 ||
		!Number.isInteger(tokenWeekday) ||
		tokenWeekday < 0 ||
		tokenWeekday > 6 ||
		!Number.isInteger(tokenHour) ||
		tokenHour < 0 ||
		tokenHour > 23
	)
		return json({ error: locals.t('setup.errorRules') }, { status: 400 });
	try {
		new Intl.DateTimeFormat('en', { timeZone: timezone });
	} catch {
		return json({ error: locals.t('settings.errorTimezone') }, { status: 400 });
	}
	saveInitialSetup({
		pin,
		title,
		members,
		tokenAmount,
		tokenWeekday,
		tokenHour,
		tokenCap,
		tokenStart,
		timezone,
		sources,
		tmdbApiKey: current.origins['TMDB key'] === 'TMDB_API_KEY' || !tmdbApiKey ? undefined : tmdbApiKey,
		omdbApiKey: current.origins['OMDb key'] === 'OMDB_API_KEY' || !omdbApiKey ? undefined : omdbApiKey,
		interfaceLanguage,
		movieLanguage,
		movieFallbackLanguage,
		certificationCountry,
		trailerLanguages
	});
	const config = loadConfig();
	ensureBalances(locals.db, config);
	cookies.set(AUTH_COOKIE, cookieValue(locals.db, config), authCookie(config, request.headers));
	void seedDemoMovies(locals.db, config).catch((err) =>
		log.warn('Demo content could not be created', { err })
	);
	return json({ ok: true });
};
