<script lang="ts">
	import { getI18n } from '$lib/i18n/context';

	let { labels, winnerIndex, ondone }: { labels: string[]; winnerIndex: number; ondone: () => void } =
		$props();

	const t = getI18n();

	const COLORS = ['#e63946', '#1d7fbf', '#2a9d8f', '#e9a11b', '#9b5de5', '#f4845f', '#00b4d8', '#ef476f'];

	const n = $derived(labels.length);
	const repeats = $derived(Math.max(2, Math.ceil(8 / n)));
	const total = $derived(n * repeats);
	const seg = $derived(360 / total);
	const segments = $derived(Array.from({ length: total }, (_, s) => s % n));

	const winnerFields = $derived(segments.map((c, s) => ({ c, s })).filter((x) => x.c === winnerIndex));
	const targetField = $derived(winnerFields[Math.floor(Math.random() * winnerFields.length)].s);
	const finalAngle = $derived(360 * 7 + (360 - (targetField * seg + seg / 2)));

	let angle = $state(0);
	let spinning = $state(false);

	$effect(() => {
		const start = setTimeout(() => {
			spinning = true;
			angle = finalAngle;
		}, 400);
		const done = setTimeout(ondone, 400 + 5600);
		return () => {
			clearTimeout(start);
			clearTimeout(done);
		};
	});

	const R = 100;

	function point(angleDeg: number, radius: number): [number, number] {
		const rad = ((angleDeg - 90) * Math.PI) / 180; // 0° = top
		return [radius * Math.cos(rad), radius * Math.sin(rad)];
	}

	function wedgePath(s: number): string {
		const [x0, y0] = point(s * seg, R);
		const [x1, y1] = point((s + 1) * seg, R);
		return `M0,0 L${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} Z`;
	}

	function shade(hex: string, pct: number): string {
		const v = parseInt(hex.slice(1), 16);
		const t = pct < 0 ? 0 : 255;
		const p = Math.abs(pct);
		const mix = (c: number) => Math.round(c + (t - c) * p);
		const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map(mix);
		return `rgb(${r} ${g} ${b})`;
	}

	const LABEL_INNER = 24;
	const LABEL_OUTER = 96;
	const LABEL_LENGTH = LABEL_OUTER - LABEL_INNER;
	const MAX_FONT = $derived(total > 10 ? 7.5 : 9);
	const MIN_FONT = 5.4;

	const CHAR_WIDTH = 0.62; // estimated glyph width per 1 unit of font size
	const labelSpecs = $derived(
		labels.map((label) => {
			const fits = LABEL_LENGTH / (CHAR_WIDTH * Math.max(label.length, 1));
			const fontSize = Math.max(MIN_FONT, Math.min(MAX_FONT, fits));
			let text = label;
			if (fits < MIN_FONT) {
				const maxChars = Math.floor(LABEL_LENGTH / (CHAR_WIDTH * MIN_FONT));
				text = label.slice(0, maxChars - 1).trimEnd() + '…';
			}
			return { text, fontSize };
		})
	);

	const studs = $derived(Array.from({ length: total }, (_, i) => point(i * seg, 106.5)));
</script>

<div class="wrap">
	<svg viewBox="-120 -124 240 248" role="img" aria-label={t('wheel.label')}>
		<defs>
			<!-- A gradient per movie: rich and dark inside, lighting up towards the rim -->
			{#each labels as _, c (c)}
				<radialGradient id="wedge-{c}" cx="0" cy="0" r={R} gradientUnits="userSpaceOnUse">
					<stop offset="0%" stop-color={shade(COLORS[c % COLORS.length], -0.32)} />
					<stop offset="55%" stop-color={COLORS[c % COLORS.length]} />
					<stop offset="100%" stop-color={shade(COLORS[c % COLORS.length], 0.22)} />
				</radialGradient>
			{/each}
			<linearGradient id="rim" x1="0" y1="-110" x2="0" y2="110" gradientUnits="userSpaceOnUse">
				<stop offset="0%" stop-color="#9a6a24" />
				<stop offset="45%" stop-color="#5c3a10" />
				<stop offset="100%" stop-color="#7a4d16" />
			</linearGradient>
			<radialGradient id="stud" cx="0.35" cy="0.3" r="1">
				<stop offset="0%" stop-color="#ffe9a8" />
				<stop offset="70%" stop-color="#d4a017" />
				<stop offset="100%" stop-color="#a87a10" />
			</radialGradient>
			<radialGradient id="hub" cx="0.38" cy="0.32" r="1">
				<stop offset="0%" stop-color="#ffedb3" />
				<stop offset="60%" stop-color="#e9b93a" />
				<stop offset="100%" stop-color="#b8860b" />
			</radialGradient>
			<radialGradient id="shine" cx="0.5" cy="0.3" r="0.75">
				<stop offset="0%" stop-color="white" stop-opacity="0.3" />
				<stop offset="45%" stop-color="white" stop-opacity="0.08" />
				<stop offset="100%" stop-color="white" stop-opacity="0" />
			</radialGradient>
			<linearGradient id="ptr" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#ffdf80" />
				<stop offset="100%" stop-color="#c8920e" />
			</linearGradient>
			<filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
				<feDropShadow dx="0" dy="2.5" stdDeviation="3" flood-opacity="0.45" />
			</filter>
		</defs>

		<!-- Wooden rim with gold studs -->
		<circle r="112" fill="url(#rim)" filter="url(#soft)" />
		<circle r="112" fill="none" stroke="#3d2708" stroke-width="1.2" />
		<circle r="103" fill="#2a1a06" />

		<!-- The spinning disc -->
		<g class="rotor" class:spinning style:transform="rotate({angle}deg)">
			{#each segments as c, s (s)}
				<path d={wedgePath(s)} fill="url(#wedge-{c})" stroke="#2a1a06" stroke-width="1.1" />
			{/each}
			{#each segments as c, s (s)}
				<g transform="rotate({s * seg + seg / 2})">
					<text
						transform="translate(0,-{LABEL_INNER}) rotate(-90)"
						text-anchor="start"
						dominant-baseline="middle"
						font-size={labelSpecs[c].fontSize}
						font-weight="700"
						fill="#fff"
						stroke="rgb(0 0 0 / 0.45)"
						stroke-width="0.5"
						style="paint-order: stroke"
					>
						{labelSpecs[c].text}
					</text>
				</g>
			{/each}
			<!-- a fine gold ring around the segment tips -->
			<circle r="15" fill="none" stroke="rgb(0 0 0 / 0.25)" stroke-width="1" />
		</g>

		<!-- Light reflection (static, does not spin along) -->
		<circle r={R} fill="url(#shine)" pointer-events="none" />

		{#each studs as [x, y], i (i)}
			<circle cx={x} cy={y} r="3" fill="url(#stud)" stroke="#3d2708" stroke-width="0.5" />
		{/each}

		<!-- Hub. The clapperboard rather than the popcorn: the wheel only ever turns
		     on movie night, and popcorn is the value unit and belongs next to a
		     number. -->
		<circle r="17" fill="url(#hub)" filter="url(#soft)" />
		<circle r="17" fill="none" stroke="#8a6508" stroke-width="0.8" />
		<circle r="12.5" fill="none" stroke="rgb(255 255 255 / 0.35)" stroke-width="0.7" />
		<text y="1" text-anchor="middle" dominant-baseline="middle" font-size="13">🎬</text>

		<!-- Pointer -->
		<g filter="url(#soft)">
			<path d="M-11,-122 L11,-122 L0,-98 Z" fill="url(#ptr)" stroke="#8a6508" stroke-width="1" />
			<path d="M-5.5,-119 L5.5,-119 L0,-107 Z" fill="rgb(255 255 255 / 0.35)" />
		</g>
	</svg>

	<div class="legend">
		{#each labels as label, c (c)}
			<span class="chip" style:--chip-color={COLORS[c % COLORS.length]}>
				<span class="dot"></span>
				{label}
			</span>
		{/each}
	</div>
</div>

<style>
	.wrap {
		display: grid;
		justify-items: center;
		gap: 1rem;
		margin: 1rem auto;
	}

	svg {
		width: var(--wheel-size, min(86vw, 360px));
		overflow: visible;
	}

	.rotor {
		transform-origin: 0 0;
	}

	.rotor.spinning {
		transition: transform 5.6s cubic-bezier(0.1, 0.55, 0.03, 1);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.6rem;
		justify-content: center;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.3rem 0.8rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--chip-color) 55%, transparent);
		background: color-mix(in srgb, var(--chip-color) 14%, transparent);
	}

	.chip .dot {
		width: 0.65em;
		height: 0.65em;
		border-radius: 50%;
		background: var(--chip-color);
		box-shadow: inset 0 -1px 1px rgb(0 0 0 / 0.3);
	}
</style>
