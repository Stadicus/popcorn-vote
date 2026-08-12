import { browser } from '$app/environment';

/**
 * The celebration: a popcorn supernova. A giant piece of popcorn grows, pops,
 * and bursts into kernels and popped corn flying in every direction.
 *
 * One module rather than a copy per page, because five places celebrate with
 * the same gesture: a vote landing on a poster (list and movie page), the
 * evaluation page after a run, the same page after a free pick, and the TV
 * stage. They differ in where the burst comes from and how big it has to be —
 * a poster, a phone screen, a television across the room.
 *
 * The particles live in a fixed overlay of their own (styles in app.css, the
 * elements are created here and never see Svelte's style scoping). The overlay
 * clips to the viewport, so a burst near an edge cannot grow the page a
 * scrollbar, and it takes no pointer events and no screen-reader attention.
 */
export interface SupernovaOptions {
	/**
	 * Element the burst grows out of; without one it fills the screen from the
	 * middle. The element only lends its position and size — the particles
	 * never touch its layout.
	 */
	target?: HTMLElement;
	/** Multiplier on piece sizes; 1 is phone-sized, the TV stage hands in more. */
	scale?: number;
	/** Only the TV stage needs this — it has layers of its own to clear. */
	zIndex?: number;
}

/** The giant piece growing in the middle, before it pops. */
const GROW_MS = 620;
/** Its pop at the moment the burst leaves. */
const VANISH_MS = 180;
/** Flight time of a single piece; each piece draws from this range. */
const FLIGHT_MS: [number, number] = [950, 1350];

/**
 * Lifetime of one supernova, from the call to the overlay's removal. Exported
 * for the film list, whose re-sort delay has to outlive it — the overlay is
 * fixed to the viewport, so a tile re-sorting away mid-burst would leave its
 * popcorn hanging where the poster used to be.
 */
export const SUPERNOVA_MS = GROW_MS + FLIGHT_MS[1] + 100;

/** Overlays still alive, for clearing on a page change. */
const active = new Set<HTMLElement>();

/**
 * Remove every running celebration. The overlays are fixed to the viewport, so
 * a navigation would otherwise carry them — still popping — onto a page that
 * never asked for them; the layout calls this before every navigation.
 */
export function clearCelebrations() {
	for (const overlay of active) overlay.remove();
	active.clear();
}

function rand(min: number, max: number): number {
	return Math.random() * (max - min) + min;
}

/** A kernel (golden teardrop) or a popped piece (white lobed blob). */
function makePiece(kind: 'kernel' | 'pop', size: number): HTMLElement {
	const el = document.createElement('div');
	el.className = kind === 'kernel' ? 'krn' : 'pop';
	el.style.width = `${size}px`;
	el.style.height = `${kind === 'kernel' ? size * 0.8 : size}px`;
	return el;
}

function makeEmoji(size: number): HTMLElement {
	const el = document.createElement('span');
	el.className = 'emo';
	el.textContent = '🍿';
	el.style.fontSize = `${size}px`;
	return el;
}

function place(
	overlay: HTMLElement,
	el: HTMLElement,
	x: number,
	y: number,
	vars: Record<string, string>,
	animation: string
) {
	el.style.left = `${x}px`;
	el.style.top = `${y}px`;
	for (const [key, value] of Object.entries(vars)) el.style.setProperty(key, value);
	el.style.animation = animation;
	overlay.appendChild(el);
}

export async function supernova({ target, scale = 1, zIndex }: SupernovaOptions = {}): Promise<void> {
	// Nothing to celebrate on the server, and nothing to celebrate for anyone
	// who has asked their system for less movement. The movie list already
	// honours the same preference for its reordering animation.
	if (!browser) return;
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

	// Where the burst starts, in viewport coordinates, and how big it is. The
	// piece sizes hang off the width of what is celebrated: the poster when a
	// vote lands on one, the screen for the winner.
	let cx: number;
	let cy: number;
	let base: number;
	let reach: [number, number];
	let count: number;
	if (target) {
		const r = target.getBoundingClientRect();
		cx = r.left + r.width / 2;
		cy = r.top + r.height / 2;
		base = r.width * scale;
		reach = [Math.min(r.width, r.height) * 0.45, Math.max(r.width, r.height) * 0.75];
		// Enough to surround a poster without burying it.
		count = 20;
	} else {
		const w = window.innerWidth;
		const h = window.innerHeight;
		cx = w / 2;
		cy = h / 2;
		base = Math.min(w, h) * 0.76 * scale;
		// From the middle to past the corners, so the pieces leave the screen
		// rather than dying visibly on it.
		const halfDiagonal = Math.hypot(w, h) / 2;
		reach = [halfDiagonal * 0.5, halfDiagonal * 1.05];
		// More than on a poster, but far from proportional to the area: the
		// pieces are bigger too, and a screen full of popcorn would bury the
		// winner it is there to celebrate.
		count = 36;
	}

	const overlay = document.createElement('div');
	overlay.className = 'nova';
	overlay.setAttribute('aria-hidden', 'true');
	if (zIndex !== undefined) overlay.style.zIndex = String(zIndex);
	document.body.appendChild(overlay);
	active.add(overlay);

	const big = makeEmoji(base * 0.5);
	place(overlay, big, cx, cy, {}, `nova-grow ${GROW_MS}ms cubic-bezier(0.3, 1.4, 0.5, 1) both`);

	await new Promise((resolve) => setTimeout(resolve, GROW_MS));
	big.style.animation = `nova-vanish ${VANISH_MS}ms ease-out both`;

	for (let i = 0; i < count; i++) {
		const popped = Math.random() < 0.6;
		const size = popped ? rand(base * 0.1, base * 0.17) : rand(base * 0.06, base * 0.09);
		const el =
			Math.random() < 0.25
				? makeEmoji(rand(base * 0.1, base * 0.16))
				: makePiece(popped ? 'pop' : 'kernel', size);
		// Directions fanned evenly around the circle with some jitter, so the
		// whole surrounding area gets covered without visible spokes.
		const theta = (i / count) * Math.PI * 2 + rand(-0.2, 0.2);
		const dist = rand(reach[0], reach[1]);
		const tx = Math.cos(theta) * dist;
		const ty = Math.sin(theta) * dist;
		const rot = rand(-360, 360);
		const dur = rand(FLIGHT_MS[0], FLIGHT_MS[1]);
		place(
			overlay,
			el,
			cx,
			cy,
			{ '--tx': `${tx}px`, '--ty': `${ty}px`, '--rot': `${rot}deg` },
			`nova-burst ${dur}ms cubic-bezier(0.15, 0.8, 0.4, 1) both, nova-fade ${dur}ms linear both`
		);
	}

	// One removal for everything: the overlay takes its particles with it once
	// the slowest piece has faded, whether or not their animationend ever fired.
	// A navigation may have taken it down early; the work after the awaits then
	// lands in a detached overlay, and this removal is a no-op.
	await new Promise((resolve) => setTimeout(resolve, FLIGHT_MS[1] + 100));
	overlay.remove();
	active.delete(overlay);
}
