import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { LANG_COOKIE, parseLocale } from '$lib/i18n/locales';
import { deviceCookie } from '$lib/server/cookies';

/**
 * Sets the interface language for this device.
 *
 * Open without a PIN (see `OPEN_PATHS` in `hooks.server.ts`): a household that
 * cannot read the lock screen has to be able to change it from there. The
 * endpoint holds no server state and accepts nothing but a name from the list of
 * shipped languages, or `null` to drop the device's own choice and follow the
 * instance again.
 *
 * The visible control is `LanguageSwitch.svelte`, on the PIN page and on "more".
 */
export const POST: RequestHandler = async ({ request, cookies, locals }) => {
	// `JSON.parse` also succeeds for a body that is nothing but `null` or `"de"` —
	// the catch clause does not cover that. Without this check such a call would
	// crash while unpacking, and the open endpoint would answer 500 instead of the
	// intended 400.
	const body = await request.json().catch(() => null);
	const language =
		body !== null && typeof body === 'object' ? (body as { language?: unknown }).language : undefined;

	// `null` hands the device back to the instance setting. Without this way out, a
	// device switched once would stay on its language forever — even when the
	// operator edits config.yaml. On a television browser, "clear your cookies" is
	// not a usable answer to that.
	if (language === null) {
		// The same options as the set below: SvelteKit deletes by setting with
		// `maxAge: 0` over its own defaults, so leaving them out would put a
		// `Secure` flag on the deletion that a device on plain HTTP cannot store —
		// and the language override would be unclearable there.
		cookies.delete(LANG_COOKIE, deviceCookie(locals.config, request.headers));
		return json({ ok: true });
	}

	// Treat the spelling as the configuration does: " DE " is valid there, and a
	// difference between the two routes would only be a trap.
	const requested = parseLocale(language);
	if (!requested) {
		return json({ error: locals.t('language.unknown') }, { status: 400 });
	}

	// Only the server reads the language; the interface gets it through
	// `data.locale` from the layout, so the helper's `httpOnly` default stands.
	cookies.set(LANG_COOKIE, requested, deviceCookie(locals.config, request.headers));
	return json({ ok: true });
};
