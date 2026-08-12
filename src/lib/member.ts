/** A person as the interface needs them: name, colour, optionally an emoji. */
export interface Member {
	name: string;
	color: string;
	emoji: string;
}

/**
 * Placeholder for an id that no longer has a person configured for it. Its
 * tokens are still in the database and still count towards the total, so its dot
 * has to stay visible too. If it vanished quietly, the row of dots would suddenly
 * add up to less than the number on the poster.
 *
 * The colour is deliberately a fixed grey rather than a theme variable: the
 * circle carries text, and the colour has to be measurable to keep it readable.
 */
export function unknownMember(id: string): Member {
	return { name: id, color: '#6b7280', emoji: '' };
}

const LIGHT = '#fff';
// Pure black, not #111: for colours around a luminance of 0.19 even the better
// of the two text colours sits at 4.34:1 with #111, and that is below the limit
// for readable text. With black at least 4.58:1 is left across every colour, and
// the hole disappears. This is not a measurement but an arithmetic rule: for
// black and white the product of the two contrasts is a constant 21 on every
// colour, so the better of the two never falls below its square root.
const DARK = '#000';

/**
 * Relative luminance of a hex colour per WCAG, or null for anything that cannot
 * be measured. The 0.04045 threshold belongs to the sRGB transfer curve and is
 * deliberately not the historically different 0.03928 from the WCAG text.
 */
function luminance(colour: string): number | null {
	const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim());
	if (!match) return null;
	const hex = match[1];
	const pairs =
		hex.length === 3 ? [...hex].map((c) => c + c) : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)];
	const [r, g, b] = pairs.map((pair) => {
		const channel = parseInt(pair, 16) / 255;
		return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(one: number, other: number): number {
	const [high, low] = one > other ? [one, other] : [other, one];
	return (high + 0.05) / (low + 0.05);
}

const L_LIGHT = luminance(LIGHT)!;
const L_DARK = luminance(DARK)!;

/**
 * Text on a coloured circle: whichever of the two stands out better. White on a
 * light colour such as #e9c46a sits at 1.7:1 and is unreadable as a letter.
 * Instead of a fixed brightness threshold both contrasts are computed and the
 * larger one wins, otherwise the choice flips around the boundary. That leaves
 * at least 4.58:1 on every colour, without exception.
 *
 * Unmeasurable values stay with white. For configured people that cannot happen,
 * `config.ts` checks their colour while loading.
 */
export function textColour(colour: string): string {
	const L = luminance(colour);
	if (L === null) return LIGHT;
	return contrast(L, L_DARK) >= contrast(L, L_LIGHT) ? DARK : LIGHT;
}

// Graphemes rather than characters: a name like "🦊 Finn" must not be cut in the
// middle of a character, or a replacement glyph ends up in the circle.
// Intl.Segmenter is missing on older devices (Safari before 16.4); there the
// first code point does the job.
//
// One per language rather than one fixed instance: building a segmenter costs a
// multiple of using one, and a list draws dozens of circles. This is not the
// module-wide language state the architecture forbids, the map knows no
// "current" language, only one entry per key.
const SEGMENTERS = new Map<string, Intl.Segmenter | null>();

function segmenter(locale: string): Intl.Segmenter | null {
	if (!SEGMENTERS.has(locale)) {
		SEGMENTERS.set(
			locale,
			typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(locale, { granularity: 'grapheme' }) : null
		);
	}
	return SEGMENTERS.get(locale) ?? null;
}

function firstCharacter(text: string, locale: string): string {
	const trimmed = text.trim();
	if (!trimmed) return '';
	const seg = segmenter(locale);
	if (!seg) return [...trimmed][0] ?? '';
	return seg.segment(trimmed)[Symbol.iterator]().next().value?.segment ?? '';
}

/**
 * What goes in the coloured circle: the emoji, otherwise the initial. The
 * question mark is the last resort, because an empty circle would be nothing but
 * colour and nobody could attribute it without a legend.
 *
 * The second pass over the uppercased value is not an oversight: uppercasing "ß"
 * yields "SS", and two letters burst the circle.
 *
 * The language is passed in because capitalisation depends on it: in Turkish an
 * "i" becomes "İ", not "I".
 */
export function badgeCharacter(member: Member, locale: string): string {
	const emoji = firstCharacter(member.emoji, locale);
	if (emoji) return emoji;
	const initial = firstCharacter(member.name, locale);
	return initial ? firstCharacter(initial.toLocaleUpperCase(locale), locale) : '?';
}
