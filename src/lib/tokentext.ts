import type { Locale } from './i18n/locales';
import type { Translate } from './i18n/translate';

export interface TokenPlan {
	/** How many tokens there are per credit. */
	amount: number;
	/** 0 = Sunday … 6 = Saturday. */
	weekday: number;
	/** Whole hour, 0–23. */
	hour: number;
	/** Cap on unused tokens. */
	cap: number;
}

const ANCHOR_SUNDAY = Date.UTC(2024, 0, 7);
const DAY_MS = 86_400_000;

export function weekdayName(locale: Locale, weekday: number): string {
	const day = Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : 0;
	return new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(
		new Date(ANCHOR_SUNDAY + day * DAY_MS)
	);
}

/** "8:00" in German, "8:00 AM" in English — the catalogue sentence carries the "Uhr". */
export function hourName(locale: Locale, hour: number): string {
	const h = Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 0;
	return new Intl.DateTimeFormat(locale, {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: 'UTC'
	}).format(new Date(ANCHOR_SUNDAY + h * 3_600_000));
}

/** "Every Sunday at 8:00 AM there is one new vote, up to 5 in reserve." */
export function creditSentence(t: Translate, locale: Locale, plan: TokenPlan): string {
	return t('token.credit', {
		n: plan.amount,
		weekday: weekdayName(locale, plan.weekday),
		time: hourName(locale, plan.hour),
		cap: plan.cap
	});
}

/** Notice when the balance is full: the next credit would be lost. */
export function capReachedSentence(t: Translate, locale: Locale, plan: TokenPlan): string {
	return t('token.capReached', { n: plan.amount, weekday: weekdayName(locale, plan.weekday) });
}
