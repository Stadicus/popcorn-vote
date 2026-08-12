<script lang="ts">
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { browser } from '$app/environment';
	import { call, errorText } from '$lib/client/api';
	import { supernova, SUPERNOVA_MS } from '$lib/client/celebrate';
	import { getI18n } from '$lib/i18n/context';
	import PersonBadge from '$lib/components/PersonBadge.svelte';
	import { unknownMember, type Member } from '$lib/member';
	import Poster from '$lib/components/Poster.svelte';
	import Toast from '$lib/components/Toast.svelte';

	let { data } = $props();

	const t = getI18n();

	let error = $state('');
	// Set when the message names a reference: the toast then waits to be
	// dismissed instead of taking those eight characters with it.
	let errorHolds = $state(false);
	let busy = $state(false);

	/** Quiet period after the last click, before the list is re-sorted. Longer
	 * than a supernova lives: the burst overlay is fixed to the viewport, so a
	 * tile re-sorting away mid-burst would leave its popcorn hanging where the
	 * poster used to be. (A scroll detaches it the same way, but a scroll is
	 * the user's own hand.) Under reduced motion there is no burst to outlive,
	 * so the delay stays what it always was — read live rather than frozen at
	 * load, because the burst itself asks live too: whoever switches the
	 * system setting off mid-session gets bursts, and must also get the delay
	 * that outlives them. */
	const reorderDelay = () =>
		window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1500 : SUPERNOVA_MS + 200;
	const FLIP_MS = browser && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350;

	const memberById = $derived(new Map(data.members.map((m: { id: string } & Member) => [m.id, m])));

	/** Person for an id, with a placeholder for people no longer configured. */
	function member(id: string): Member {
		return memberById.get(id) ?? unknownMember(id);
	}

	// The server list arrives sorted by tokens, but a separate order drives the
	// display here: whoever taps + several times in a row should not have the tile
	// slide out from under their finger. Only after a while of quiet does it move
	// to its new place — and then it animates.
	let orderIds: number[] = $state([]);
	let reorderTimer: ReturnType<typeof setTimeout> | undefined;

	const ordered = $derived.by(() => {
		const byId = new Map(data.movies.map((m: { id: number }) => [m.id, m]));
		const known = orderIds.map((id) => byId.get(id)).filter(Boolean) as typeof data.movies;
		const fresh = data.movies.filter((m: { id: number }) => !orderIds.includes(m.id));
		return [...known, ...fresh];
	});

	$effect(() => {
		const incoming = data.movies.map((m: { id: number }) => m.id);
		untrack(() => {
			const sameSet = incoming.length === orderIds.length && incoming.every((id) => orderIds.includes(id));
			// Take new or deleted movies immediately — a tile must not appear late.
			// Pure re-sorting waits for quiet.
			if (!sameSet) {
				orderIds = incoming;
			} else if (incoming.join() !== orderIds.join()) {
				reorderTimer = setTimeout(() => (orderIds = incoming), reorderDelay());
			}
		});
		return () => clearTimeout(reorderTimer);
	});

	// The posters, for the burst below; a keyed each keeps the elements stable.
	// Entries of deleted movies linger until the next full render, which costs
	// nothing — they are only ever read for a movie that was just voted on.
	const artEls: Record<number, HTMLElement | null> = {};

	async function vote(movieId: number, delta: 1 | -1) {
		if (busy) return;
		busy = true;
		error = '';
		const result = await call('/api/stake', { body: { movieId, delta } });
		if (!result.ok) error = errorText(result, t);
		errorHolds = Boolean(result.reference);
		busy = false;
		// Fire and forget: the next vote must not wait for the popcorn to settle.
		const art = artEls[movieId];
		if (result.ok && delta === 1 && art) void supernova({ target: art });
	}

	function myStake(movie: { stakes: { personId: string; count: number }[] }): number {
		return movie.stakes.find((s) => s.personId === data.personId)?.count ?? 0;
	}

	// Whoever carries the highest count is in the lead — on a tie that is several
	// of them. If everything is at zero nobody leads; the same rule as on the
	// evaluation page.
	const highestCount = $derived(
		data.movies.reduce((max: number, m: { tokens: number }) => Math.max(max, m.tokens), 0)
	);
</script>

<svelte:head><title>{t('list.title')}</title></svelte:head>

<Toast bind:message={error} hold={errorHolds} />

{#if data.winner}
	<a class="winner card" href="/evaluation">
		<Poster src={data.winner.poster} title={data.winner.title} size="small" />
		<div>
			<div class="muted">{t('movie.nextUp')}</div>
			<strong>{data.winner.title}</strong>
			<div class="muted">{t('list.confirmAfterwards')} →</div>
		</div>
	</a>
{/if}

{#if data.movies.length === 0}
	<div class="empty">
		<span class="big">📋</span>
		{t('list.empty')}<br />
		<a href="/propose"><strong>{t('list.emptyAction')}</strong></a>
	</div>
{:else}
	<div class="grid">
		{#each ordered as movie (movie.id)}
			{@const leading = movie.tokens > 0 && movie.tokens === highestCount}
			<!-- Poster, then title, then stepper. The steppers of a row line up
			     because the tile is a subgrid; the title track grows to what the
			     longest title of that row needs and the title sits at its foot, so
			     the stepper stands against the title it belongs to — see the style
			     block.
			     Rows can differ in height since the title track stopped being fixed,
			     and that costs something at `animate:flip` below. flip morphs each
			     tile's old rectangle into its new one, scale included — so a tile in
			     a row that gains or loses a title line is briefly squashed or
			     stretched, even when it does not move at all. How much depends on how
			     tall the tile is, so it grows as the column narrows: measured about
			     five per cent on a two-column phone, less on a monitor, none at all
			     where the column is so narrow that the grid falls back to one tile
			     per row. It lasts the 350ms of the animation, and whoever has reduced
			     motion switched on never sees it. Under the fixed track every tile
			     was the same height and flip never scaled; accepted here as the price
			     for the row being compact.
			     On re-sorting: every surviving tile is measured and animated, whether
			     or not it kept its place in the list — so a tile that moves only
			     because the row above it grew glides with the rest rather than
			     jumping. That holds for a re-sort alone. It does not hold when a film
			     is deleted while the re-sort is still waiting out its quiet period:
			     the removal and the new order then arrive as two reconciles in one
			     flush, the second measures a layout the first never painted, and a
			     tile can flash across the screen and sail back. That is older than
			     this layout — `ordered`, `orderIds` and the effect above are
			     untouched here — but it is the reason this note does not simply say
			     that tiles never jump. -->
			<div class="tile" animate:flip={{ duration: FLIP_MS }}>
				<a href="/movie/{movie.id}" class="art" class:leading bind:this={artEls[movie.id]}>
					<Poster src={movie.poster} title={movie.title} />
					<!-- The count and the circles are one column top right: the circles
					     break the count down, so they read after it rather than across
					     the poster from it. It also leaves the lower edge alone, which
					     is where most posters carry their own title.
					     One condition covers both halves: the count is the sum of the
					     stakes (views.ts) and taking back the last one deletes the row
					     rather than leaving a zero (game.ts), so "has votes" and "has
					     people" are the same question asked twice. -->
					{#if movie.tokens > 0}
						<div class="meta">
							<span class="count">{movie.tokens}&thinsp;🍿</span>
							<div class="dots">
								{#each movie.stakes as s (s.personId)}
									{@const m = member(s.personId)}
									<!-- The multiple goes to the left of its circle, or the
									     circles would no longer share a right edge. -->
									<span class="who">
										{#if s.count > 1}<span class="dcount">{s.count}</span>{/if}
										<PersonBadge member={m} title="{m.name}: {s.count}" />
									</span>
								{/each}
							</div>
						</div>
					{/if}
				</a>
				<a class="name" href="/movie/{movie.id}">{movie.title}</a>
				<!-- The stepper carries a ring of its own once you have tokens on this
				     movie: the number alone is easy to miss while scrolling a grid. -->
				<div class="actions" class:staked={myStake(movie) > 0}>
					<button
						class="round"
						disabled={busy || myStake(movie) === 0}
						onclick={() => vote(movie.id, -1)}
						aria-label={t('list.removeToken', { title: movie.title })}>−</button
					>
					<span class="mine" class:none={myStake(movie) === 0}>{myStake(movie)}</span>
					<button
						class="round plus"
						disabled={busy || data.balance < 1}
						onclick={() => vote(movie.id, 1)}
						aria-label={t('list.addToken', { title: movie.title })}>+</button
					>
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	/* The accent colour means "settled": the movie of the night is decided. Gold
	   stays reserved for the lead in the grid, which can still change. */
	.winner {
		display: flex;
		gap: 0.8rem;
		align-items: center;
		margin-bottom: 1rem;
		border: 2px solid var(--accent);
		box-shadow: 0 0 20px rgb(0 0 0 / 0.08);
	}

	/* auto-fill uses up the available width: two columns on a phone, correspondingly
	   more on a large monitor, without the tiles growing huge.
	   The gaps are deliberately not the same in both directions: sideways the hard
	   poster edges separate the tiles by themselves, downwards nothing does it but
	   the whitespace, and the title runs out into it. The row gap therefore has to
	   beat the gap inside a tile by a good margin, or the title reads as belonging
	   to the row below it. */
	.grid {
		--title-fs: 0.875rem;
		--title-lh: 1.3;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		column-gap: 0.75rem;
		row-gap: 1.75rem;
	}

	@media (min-width: 900px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(175px, 1fr));
			column-gap: 1.25rem;
			row-gap: 2.25rem;
		}
	}

	/* The tile spans three rows of the grid and takes their sizing from it, so
	   poster, title and stepper line up across the whole row. Its own row-gap
	   applies only between the tracks it spans — the gap to the next row of tiles
	   stays the grid's, which is how the inside stays tight while the outside
	   stays generous without either number being maintained by hand. */
	/* `minmax(0, 1fr)` rather than the implicit `auto` column: a grid track sized
	   `auto` never goes below the min-content width of what is in it, and the
	   stepper's is two 2.2rem buttons plus padding. At a large system font that
	   exceeds the width of the grid column, and since the tile is a grid rather
	   than the flex box it used to be, the children follow it out — the poster
	   grows past its column and into the neighbouring one. Allowing the track to
	   shrink to zero keeps everything at the column width. */
	.tile {
		grid-row: span 3;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		grid-template-rows: subgrid;
		row-gap: 0.5rem;
	}

	/* `.art`, not just `a`: the title is a direct <a> child of the tile too, and a
	   bare `.tile > a` used to win over `.name` on specificity — which quietly set
	   the title to `display: block` and switched its two-line clamp off.
	   It is also the container the overlays measure themselves against; see the
	   note on `--dot` below. */
	.tile > a.art {
		position: relative;
		display: block;
		border-radius: 10px;
		container-type: inline-size;
	}

	/* A gold ring around the poster: "in front". Around the poster only, not around
	   the whole tile — otherwise it would enclose the stepper, which is there for
	   operating the app and not for the statement. */
	.tile > a.art.leading {
		box-shadow:
			0 0 0 3px rgb(var(--gold-rgb) / 0.95),
			0 0 18px rgb(var(--gold-rgb) / 0.3);
	}

	/* Count above, circles below, both flush right. `bottom` is what keeps the
	   column inside the poster, and it is doing two jobs: without it the box is
	   only as tall as it needs to be, so a film with many voters would push its
	   circles out over the title — absolutely positioned, so nothing would clip
	   them — and it is also what gives the circles below a definite height to
	   break their column against.
	   The clip behind that is the last resort, for when even the wrapped columns
	   do not fit; what drives that is the number of voters against the root font
	   size, not the width of the window, since the grid column never goes below
	   150px. `clip` rather than `hidden` for the margin that goes with it: the
	   wrapped column ends flush with this box, and a circle's white ring and
	   shadow reach a few pixels past its own edge — without the margin the clip
	   would shave exactly the separation the ring is there to provide. Where
	   `overflow-clip-margin` is not supported it falls back to zero, which is the
	   behaviour without this line. */
	.meta {
		/* Everything on the poster is measured off `--dot` rather than off the root
		   font, and this is the reason: the poster's height follows the width of
		   the grid column, which is in pixels and does not grow when someone turns
		   the system font up. An overlay in `rem` alone does grow, so past a point
		   it no longer fits on the poster it sits on — and then a clip has to
		   decide what to drop, by geometry rather than by meaning. `min` keeps the
		   circles growing with the system font for as long as the poster can hold
		   them, and stops there. Which of the two binds depends on the column: from
		   168px of column width up — every column on a monitor — 1.05rem is the
		   smaller of the two, so nothing moves from what it was and a larger system
		   font still enlarges them. On the narrower columns of a phone the 10cqw
		   ceiling already binds at the default font, which costs up to a tenth of
		   the size there and holds it steady whatever the font is set to. */
		--dot: min(1.05rem, 10cqw);
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		bottom: 0.4rem;
		display: flex;
		flex-direction: column;
		align-items: end;
		gap: calc(var(--dot) * 0.34);
		overflow: clip;
		overflow-clip-margin: 4px;
	}

	/* How many votes a movie carries is the number on the tile, so it is allowed to
	   be the biggest thing on the poster. */
	.count {
		background: rgb(0 0 0 / 0.78);
		color: #fff;
		font-weight: 800;
		font-size: var(--dot);
		border-radius: 999px;
		padding: calc(var(--dot) * 0.19) calc(var(--dot) * 0.62);
	}

	/* The title track is as tall as the longest title in its row needs, and the
	   title sits at the bottom of it. Two lines were reserved here regardless up
	   to 2.7.0, which held every stepper in the list at the same distance below
	   its poster — but it also meant that a row of titles that all fit on one line
	   carried an empty line under each of them, and the stepper then sat as far
	   from its own title as from the poster of the row below: measured 27.4px
	   against 28px, which is no distance at all to tell them apart by. What the
	   steppers actually have to do is line up with each other across the row, and
	   the subgrid does that on its own.
	   `end` rather than `start` for the same reason: it keeps the stepper against
	   the title it belongs to in every row, mixed ones included, where `start`
	   leaves a short title stranded at the top of a two-line track. The cost is
	   that a short title beside a long one sits further from its poster; the row
	   then lines its titles up along their last line instead of their first.
	   Centred under a centred poster, and balanced so two lines come out roughly
	   even instead of leaving one word on the second. */
	.name {
		align-self: end;
		font-size: var(--title-fs);
		font-weight: 600;
		line-height: var(--title-lh);
		text-align: center;
		text-wrap: balance;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* The circles stack under the count. The 2px are optical, not arithmetic: a
	   circle touches its right edge at a single point and reads as sitting further
	   out than the long rounding of the pill above it.
	   No `pointer-events: none`: the circles are inside the link, so a click on
	   them lands on the detail page anyway. Turning it off would only take away the
	   name tooltip on hover, without protecting anything. */
	/* `end`, not `flex-end`: on a column, the cross axis runs sideways, and
	   `wrap-reverse` swaps which side flex-start and flex-end mean. The two
	   flex-relative keywords would therefore quietly turn into "left" the moment
	   the wrap was added — circles no longer sharing a right edge as soon as
	   somebody holds a multiple, and the clip below taking the column under the
	   count instead of the far one. `end` is writing-mode relative and is not
	   swapped.
	   `min-height: 0` is what makes the wrap work: a column only breaks against a
	   definite height, and this item only gets one by being allowed to shrink
	   below its content. The height itself comes from `.meta` having both `top`
	   and `bottom`. */
	.dots {
		display: flex;
		flex-direction: column;
		flex-wrap: wrap-reverse;
		align-content: end;
		align-items: end;
		gap: calc(var(--dot) * 0.24);
		margin-right: 2px;
		min-height: 0;
	}

	.who {
		display: flex;
		align-items: center;
		gap: calc(var(--dot) * 0.19);
	}

	/* Smaller than the badge's own `small`: these answer "who", which is the
	   question after the number, and they must not compete with it.
	   Ring plus drop shadow: there are posters that are white at this spot
	   themselves — then the shadow alone carries the separation. The ring is a
	   single pixel here, which is a deliberately thin one, so it keeps its full
	   opacity and the shadow stays at the strength it has everywhere else: the
	   circles moved to the top of the poster with this layout, and a sky or a
	   bright title band is more often white than the lower edge they used to sit
	   on. Thinner and fainter and smaller all at once would have been three
	   reductions pulling the same way. */
	.dots :global(.badge) {
		width: var(--dot);
		height: var(--dot);
		font-size: calc(var(--dot) * 0.55);
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 0.95),
			0 1px 3px rgb(0 0 0 / 0.5);
	}

	.dcount {
		font-size: calc(var(--dot) * 0.67);
		font-weight: 700;
		color: #fff;
		text-shadow: 0 1px 3px rgb(0 0 0 / 0.9);
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.2rem;
	}

	/* Your own tokens, made visible on the tile: accent border and a hint of accent
	   behind it. Deliberately not gold — that colour belongs to the lead, and a row
	   showing "I voted here" must not look like "this one is winning". */
	.actions.staked {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 10%, var(--card));
	}

	.round {
		width: 2.2rem;
		height: 2.2rem;
		border-radius: 50%;
		background: var(--card2);
		font-size: 1.2rem;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.round.plus {
		background: var(--accent);
		color: #fff;
	}

	@media (prefers-color-scheme: dark) {
		.round.plus {
			color: #1c1400;
		}
	}

	.round:disabled {
		opacity: 0.35;
	}

	.mine {
		font-weight: 700;
	}

	.mine.none {
		color: var(--muted);
		font-weight: 400;
	}
</style>
