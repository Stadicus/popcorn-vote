import { describe, expect, it } from 'vitest';
import { badgeCharacter, textColour, unknownMember } from './member';

/** Contrast ratio of two colours per WCAG, for the checks below. */
function contrast(front: string, back: string): number {
	const luminance = (colour: string) => {
		const hex = colour.slice(1);
		const pairs =
			hex.length === 3 ? [...hex].map((c) => c + c) : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)];
		const [r, g, b] = pairs.map((pair) => {
			const channel = parseInt(pair, 16) / 255;
			return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
		});
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	};
	const [high, low] = [luminance(front), luminance(back)].sort((a, b) => b - a);
	return (high + 0.05) / (low + 0.05);
}

describe('text colour in the person circle', () => {
	// The default colours from config.ts plus the grey for removed people.
	const palette = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#9b5de5', '#f4845f', '#6b7280'];

	it.each(palette)('reaches at least 4.5:1 on %s', (colour) => {
		expect(contrast(textColour(colour), colour)).toBeGreaterThanOrEqual(4.5);
	});

	it('takes dark text on light sand yellow', () => {
		// The case from the review: white on it sat at 1.7:1.
		expect(textColour('#e9c46a')).toBe('#000');
		expect(contrast('#fff', '#e9c46a')).toBeLessThan(2);
	});

	it('takes white text on dark blue', () => {
		expect(textColour('#457b9d')).toBe('#fff');
	});

	it('understands the short notation', () => {
		expect(textColour('#FFC')).toBe(textColour('#ffffcc'));
	});

	it('always takes the larger contrast around the boundary', () => {
		// A fixed brightness measure would make the wrong choice here.
		for (const colour of ['#767676', '#777777', '#787878', '#797979', '#7a7a7a']) {
			const chosen = textColour(colour);
			const other = chosen === '#000' ? '#fff' : '#000';
			expect(contrast(chosen, colour)).toBeGreaterThanOrEqual(contrast(other, colour));
		}
	});

	// The actual promise: there is no colour on which the initial becomes
	// unreadable. With a dark text colour just above black, a narrow band around
	// luminance 0.19 would be left where neither colour carries enough contrast.
	//
	// The limit is the square root of 21 and not a rounded wish: for black and
	// white the product of the two contrasts is exactly 21 on every colour, so the
	// better of the two is never smaller than that root. A black that came out too
	// light fails here immediately.
	it('stays above 4.58:1 across the whole colour space', () => {
		const steps = [0, 51, 102, 153, 204, 255];
		let worst = Infinity;
		for (const r of steps) {
			for (const g of steps) {
				for (const b of steps) {
					const colour = '#' + [r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('');
					worst = Math.min(worst, contrast(textColour(colour), colour));
				}
			}
		}
		expect(worst).toBeGreaterThanOrEqual(Math.sqrt(21));
	});

	it('stays with white for values that cannot be measured', () => {
		// Cannot happen for configured people, config.ts checks the colour.
		expect(textColour('gold')).toBe('#fff');
		expect(textColour('rgb(233, 196, 106)')).toBe('#fff');
		expect(textColour('var(--muted)')).toBe('#fff');
		expect(textColour('')).toBe('#fff');
	});
});

describe('character in the person circle', () => {
	const person = (name: string, emoji = '') => ({ name, color: '#457b9d', emoji });

	it('takes the emoji when one is configured', () => {
		expect(badgeCharacter(person('Anna', '🦁'), 'de')).toBe('🦁');
	});

	it('leaves composed emoji whole', () => {
		expect(badgeCharacter(person('Familie', '👨‍👩‍👧'), 'de')).toBe('👨‍👩‍👧');
	});

	it('cuts several emoji down to one so the circle does not overflow', () => {
		expect(badgeCharacter(person('Anna', '🦁🐸🦄'), 'de')).toBe('🦁');
	});

	it('otherwise takes the uppercased initial', () => {
		expect(badgeCharacter(person('anna'), 'de')).toBe('A');
		expect(badgeCharacter(person('Émile'), 'de')).toBe('É');
	});

	it('does not split a name that starts with an emoji', () => {
		expect(badgeCharacter(person('🦊 Finn'), 'de')).toBe('🦊');
	});

	it('stays at one character even when uppercasing makes two of it', () => {
		expect(badgeCharacter(person('ßeta'), 'de')).toBe('S');
	});

	it('uppercases by the rules of the active language', () => {
		// This is exactly why the language is in the signature: in Turkish the
		// capital "i" is "İ", and someone called "ilker" should not sit in the
		// circle as "I". In German it stays "I".
		expect(badgeCharacter(person('ilker'), 'tr')).toBe('İ');
		expect(badgeCharacter(person('ilker'), 'de')).toBe('I');
	});

	it('shows a question mark instead of an empty circle', () => {
		expect(badgeCharacter(person(''), 'de')).toBe('?');
		expect(badgeCharacter(person('   '), 'de')).toBe('?');
	});

	it('makes something readable out of an id without a person too', () => {
		const placeholder = unknownMember('lisa-mueller');
		expect(badgeCharacter(placeholder, 'de')).toBe('L');
		expect(contrast(textColour(placeholder.color), placeholder.color)).toBeGreaterThanOrEqual(4.5);
	});
});
