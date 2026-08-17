<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { redirectIfUnauthorized } from '$lib/client/api';
	import { detectStandalone } from '$lib/client/install.svelte';
	import { supernova } from '$lib/client/celebrate';
	import { getI18n } from '$lib/i18n/context';
	import Poster from '$lib/components/Poster.svelte';
	import Wheel from '$lib/components/Wheel.svelte';

	interface Standing {
		movieId: number;
		title: string;
		tokens: number;
	}

	interface WinnerView {
		id: number;
		title: string;
		year: number | null;
		runtime: number | null;
		genres: string | null;
		poster: string | null;
		wonVia: string | null;
	}

	interface TvEvent {
		id: number;
		type: string;
		payload: {
			wheel?: { candidates: { movieId: number; title: string }[] } | null;
			winnerMovieId?: number;
		};
	}

	let { data } = $props();

	const t = getI18n();

	// State machine of the TV stage: standings → (wheel) → winner celebration.
	type Mode = 'board' | 'wheel' | 'reveal';
	let mode: Mode = $state(untrack(() => (data.winner ? 'reveal' : 'board')));
	let standings: Standing[] = $state(untrack(() => data.standings));
	let winner: WinnerView | null = $state(untrack(() => data.winner));
	let wheelData: { labels: string[]; winnerIndex: number } | null = $state(null);
	// Events already present when switching on count as seen, only new ones are celebrated.
	let seenEventId = $state(untrack(() => data.lastEvent?.id ?? 0));

	async function poll() {
		if (mode === 'wheel') return; // rebuild nothing while it spins
		try {
			const res = await fetch('/api/tv');
			if (redirectIfUnauthorized(res)) return;
			if (!res.ok) return;
			const body = (await res.json()) as {
				standings: Standing[];
				winner: WinnerView | null;
				lastEvent: TvEvent | null;
			};
			standings = body.standings;

			const fresh = body.lastEvent && body.lastEvent.id > seenEventId ? body.lastEvent : null;
			if (fresh) seenEventId = fresh.id;

			if (!body.winner) {
				winner = null;
				mode = 'board';
				return;
			}

			if (fresh && (fresh.type === 'evaluation' || fresh.type === 'free_pick')) {
				winner = body.winner;
				const candidates = fresh.payload.wheel?.candidates ?? [];
				if (candidates.length > 1) {
					// Replay the wheel on the big screen, the result is already decided.
					wheelData = {
						labels: candidates.map((c) => c.title),
						winnerIndex: candidates.findIndex((c) => c.movieId === fresh.payload.winnerMovieId)
					};
					mode = 'wheel';
				} else {
					mode = 'reveal';
					void celebrate();
				}
			} else if (mode === 'board') {
				// The winner was already decided (the TV came on later): show it calmly.
				winner = body.winner;
				mode = 'reveal';
			}
		} catch {
			// A network wobble: simply try again on the next tick.
		}
	}

	async function wheelDone() {
		wheelData = null;
		mode = 'reveal';
		await celebrate();
	}

	// Bigger pieces: the stage is watched from across the room, not from a
	// hand. zIndex clears the stage's own layers.
	async function celebrate() {
		await supernova({ scale: 1.2, zIndex: 50 });
	}

	$effect(() => {
		const timer = setInterval(poll, 2500);
		return () => clearInterval(timer);
	});

	// The ✕ should not disturb the stage: it sits pale in the corner and only turns
	// strong while somebody moves the mouse or types. After that it steps back.
	const AWAKE_MS = 3000;
	let awake = $state(false);
	let awakeTimer: ReturnType<typeof setTimeout> | undefined;

	function wakeUp() {
		awake = true;
		clearTimeout(awakeTimer);
		awakeTimer = setTimeout(() => (awake = false), AWAKE_MS);
	}

	function onKeydown(event: KeyboardEvent) {
		// While the wheel spins, Escape does nothing: cutting the ceremony off
		// mid-spin would be the exact opposite of what the stage is for.
		if (event.key === 'Escape' && mode !== 'wheel') {
			// In fullscreen this same press is the browser's "leave fullscreen"; the
			// stage has to survive it, or one Esc would close both at once. It still
			// counts as activity, the corner buttons should light up for it.
			if (document.fullscreenElement) {
				wakeUp();
				return;
			}
			void goto('/');
			return;
		}
		wakeUp();
	}

	$effect(() => () => clearTimeout(awakeTimer));

	// --- TV mode: fullscreen, landscape, and a screen that stays awake ---------
	// The stage is made to be mirrored to the television; without this block the
	// mirror shows a portrait phone and dies as soon as its screen sleeps.

	let fullscreenAvailable = $state(false);
	let tvMode = $state(false);
	// ↗ only in the installed app on Android, everywhere else the browser menu
	// is either already there or unable to reach a Chromecast. Both halves are
	// asked in this component's own mount: install.standalone would answer true
	// until the layout's listen() has run, and hanging on that timing could
	// flash the button at a plain Android browser.
	let breakoutVisible = $state(false);
	let wakeLock: WakeLockSentinel | null = null;
	// Not $state: read by async continuations, never by the template. Once the
	// teardown flips it, anything still in flight has to undo itself, an await
	// can outlive the stage (✕ sits one thumb-width from ⛶).
	let alive = true;

	// The platform may lack the API (plain http is not a secure context) or
	// refuse the lock (power saving); the mirror then simply ends with the
	// phone's own screen timeout.
	async function acquireWakeLock() {
		// Release-first: overlapping calls must converge on one sentinel, an
		// overwritten one would hold the screen for the rest of the app's life.
		releaseWakeLock();
		if (!('wakeLock' in navigator)) return;
		let sentinel: WakeLockSentinel;
		try {
			sentinel = await navigator.wakeLock.request('screen');
		} catch {
			return;
		}
		// The world may have moved on while the request ran: fullscreen already
		// gone, the stage left, or a parallel call got here first. Releasing an
		// unwanted sentinel cannot meaningfully fail, hence the bare catch.
		if (!alive || !document.fullscreenElement || wakeLock !== null) {
			void sentinel.release().catch(() => {});
			return;
		}
		// The platform may revoke the lock mid-hold (battery saver) without the
		// page ever hiding; the listener keeps the variable truthful, so the next
		// visibility change or ⛶ cycle starts from "none held" instead of a
		// dead reference.
		sentinel.addEventListener('release', () => {
			if (wakeLock === sentinel) wakeLock = null;
		});
		wakeLock = sentinel;
	}

	function releaseWakeLock() {
		// Releasing twice, or releasing an already-revoked sentinel, is a no-op
		// rejection with nothing to recover, silenced on purpose.
		void wakeLock?.release().catch(() => {});
		wakeLock = null;
	}

	function unlockOrientation() {
		try {
			screen.orientation.unlock();
		} catch {
			/* not on this platform */
		}
	}

	async function enterTvMode() {
		// documentElement rather than the stage: the supernova celebration lives in
		// an overlay on <body>, and fullscreening a smaller subtree would hide it.
		try {
			await document.documentElement.requestFullscreen();
		} catch {
			// Refused (permission policy, or no transient activation). The button
			// simply stays "Fullscreen"; a repeated tap is harmless. The warning is
			// for whoever debugs a kiosk device, the family never opens a console.
			console.warn('Fullscreen request refused; TV mode not entered.');
			return;
		}
		// The stage may have been left while the transition ran; then this
		// fullscreen belongs to nobody and has to undo itself.
		if (!alive) {
			exitTvMode();
			return;
		}
		// Landscape is what the television wants. Desktop and iOS reject the lock .
		// there the hand turns the phone. The rejection arrives asynchronously,
		// hence the await; without it this catch would silence nothing.
		try {
			await screen.orientation.lock('landscape');
		} catch {
			/* not on this platform */
		}
		// Both halves matter: the stage may have been left (alive), or the
		// fullscreen may have ended under the pending lock, a second tap, or the
		// back-gesture. In a browser tab the lock would simply have rejected
		// outside fullscreen, but the installed app may lock without fullscreen,
		// and this is the one feature built for the installed app.
		if (!alive || !document.fullscreenElement) {
			unlockOrientation();
			exitTvMode();
			return;
		}
		await acquireWakeLock();
	}

	// Idempotent on purpose: the teardown below also runs when TV mode was never
	// entered, and exitFullscreen without fullscreen would reject loudly. The
	// remaining catch covers a fullscreen that ended between check and call .
	// equally nothing to recover.
	function exitTvMode() {
		if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
	}

	function onFullscreenChange() {
		tvMode = document.fullscreenElement !== null;
		if (!tvMode) {
			releaseWakeLock();
			unlockOrientation();
		}
	}

	// The platform drops the wake lock whenever the page hides; coming back into a
	// running TV mode has to take it again, or the phone sleeps mid-evening.
	function onVisibilityChange() {
		if (document.visibilityState === 'visible' && document.fullscreenElement) void acquireWakeLock();
	}

	$effect(() => {
		fullscreenAvailable = document.fullscreenEnabled;
		breakoutVisible = /android/i.test(navigator.userAgent) && detectStandalone();
		document.addEventListener('fullscreenchange', onFullscreenChange);
		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			alive = false;
			document.removeEventListener('fullscreenchange', onFullscreenChange);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			// Leaving the stage ends TV mode: goto() never unloads the document, so
			// fullscreen, wake lock and orientation would all survive the ✕ otherwise.
			exitTvMode();
			releaseWakeLock();
			unlockOrientation();
		};
	});

	// Built from location, never from configuration, the app sits behind arbitrary
	// reverse proxies. The explicit Chrome package steps past the WebAPK, which owns
	// this scope at the OS level and would otherwise swallow the navigation; without
	// Chrome installed the fallback lands back on this page, unharmed.
	function openInBrowser() {
		const scheme = location.protocol.slice(0, -1);
		location.href =
			`intent://${location.host}/tv#Intent` +
			`;scheme=${scheme};package=com.android.chrome` +
			`;S.browser_fallback_url=${encodeURIComponent(location.href)};end`;
	}

	// On the screen only what actually carries tokens counts, movies at zero are
	// mere noise from across the living room.
	const board = $derived(standings.filter((s) => s.tokens > 0));

	// A crown only for an outright lead, on a tie there is no first place.
	const uniqueLeader = $derived(
		board.length > 0 && (board.length === 1 || board[0].tokens > board[1].tokens)
	);

	/** More than seven rows are no longer readable from the sofa. */
	const visible = $derived(board.slice(0, 7));

	// Where the fade starts: everything down to the end of the lead stays fully
	// opaque, only below that does it fade out. Otherwise the fade would take the
	// gold frame with it.
	const fadeStart = $derived(
		board.length > 0
			? (visible.filter((s) => s.tokens === board[0].tokens).length / visible.length) * 100
			: 100
	);

	// On a wide tie, leaders drop off the board. That has to be said, or the gold
	// list looks complete when it is not.
	const hiddenLeaders = $derived(
		board.length > 7 ? board.slice(7).filter((s) => s.tokens === board[0].tokens).length : 0
	);

	const winnerFacts = $derived(
		winner
			? [winner.year, winner.runtime ? t('movie.runtimeValue', { n: winner.runtime }) : null, winner.genres]
					.filter(Boolean)
					.join('  ·  ')
			: ''
	);
</script>

<svelte:head><title>{t('tv.title')}</title></svelte:head>

<svelte:window onkeydown={onKeydown} onpointermove={wakeUp} />

<div class="stage">
	<header>
		<p class="kicker">🎬 &nbsp;{t('app.name')}</p>
		{#if mode === 'wheel'}
			<h1>{t('evaluation.tieWheel')}</h1>
		{:else if mode === 'board'}
			<h1>{t('tv.standings')}</h1>
		{/if}
		<!-- Deliberately no <nav>: the stage stays without the app menu. In the corner
		     sit only the way back, TV mode, and, in the installed app on Android .
		     the way out into the browser, whose menu can cast this tab. -->
		<button class="corner" class:awake onclick={() => goto('/')} aria-label={t('tv.close')}>✕</button>
		{#if fullscreenAvailable}
			<button
				class="corner tvmode"
				class:awake
				onclick={() => (tvMode ? exitTvMode() : void enterTvMode())}
				aria-label={tvMode ? t('tv.exitFullscreen') : t('tv.enterFullscreen')}>⛶</button
			>
		{/if}
		{#if breakoutVisible}
			<button class="corner breakout" class:awake onclick={openInBrowser} aria-label={t('tv.openInBrowser')}
				>↗</button
			>
		{/if}
	</header>

	<main>
		{#if mode === 'wheel' && wheelData}
			<div class="bigwheel">
				<Wheel labels={wheelData.labels} winnerIndex={wheelData.winnerIndex} ondone={wheelDone} />
			</div>
		{:else if mode === 'reveal' && winner}
			<div class="reveal">
				<div class="rposter"><Poster src={winner.poster} title={winner.title} size="large" /></div>
				<div class="rinfo">
					<p class="rkicker">{t('tv.watchingToday')}</p>
					<h1 class="rtitle">{winner.title}</h1>
					{#if winnerFacts}<p class="rfacts">{winnerFacts}</p>{/if}
					{#if winner.wonVia === 'wheel'}
						<!-- Without a symbol: the sentence names the wheel, and the app keeps
						     no emoji for it. -->
						<p class="rvia">{t('tv.viaWheel')}</p>
					{:else if winner.wonVia === 'free_pick'}
						<p class="rvia">✨ &nbsp;{t('evaluation.viaFreePick')}</p>
					{:else}
						<p class="rvia">🏆 &nbsp;{t('tv.viaVote')}</p>
					{/if}
				</div>
			</div>
		{:else if board.length === 0}
			{#if standings.length === 0}
				<p class="empty-tv">{t('evaluation.empty')}<br />{t('tv.emptyListHint')}</p>
			{:else}
				<p class="empty-tv">{t('tv.noTokens')}<br />{t('tv.noTokensHint')}</p>
			{/if}
		{:else}
			<ol class="board" style="--fade-start: {fadeStart}%">
				{#each visible as s, i (s.movieId)}
					<!-- Whoever carries the highest count is in the lead, on a tie that is
					     several of them. The crown stays reserved for an outright lead. -->
					{@const leading = s.tokens === board[0].tokens}
					<li class:leader={leading} class:steppedBack={!leading}>
						<span class="rank">{i === 0 && uniqueLeader ? '👑' : i + 1}</span>
						<span class="title">{s.title}</span>
						<span class="tokens">{s.tokens}<span class="unit">🍿</span></span>
					</li>
				{/each}
			</ol>
			{#if hiddenLeaders > 0}
				<!-- Otherwise a board full of gold rows looks complete even though
				     equally placed leaders fall off it. -->
				<p class="more">{t('tv.moreTied', { n: hiddenLeaders })}</p>
			{/if}
		{/if}
	</main>

	<footer>
		{#if mode === 'reveal'}
			<p>{t('tv.enjoy')}</p>
		{:else if mode === 'board'}
			<p>{t('tv.voteOnPhone')}</p>
		{/if}
	</footer>
</div>

<style>
	.stage {
		position: relative;
		/* The background sits on the stage itself on purpose, not on the body .
		   otherwise the cinema dark would cling on the way back into the app. */
		background:
			radial-gradient(ellipse 120% 70% at 50% -10%, #2b3648 0%, transparent 60%),
			radial-gradient(ellipse 100% 60% at 50% 115%, #1a1206 0%, transparent 55%), #0b0f15;
		min-height: 100dvh;
		display: grid;
		grid-template-rows: auto 1fr auto;
		justify-items: center;
		padding: clamp(2rem, 5vh, 3.5rem) clamp(2rem, 6vw, 6rem);
		color: #eef1f5;
		text-align: center;
	}

	/* --- Head zone ------------------------------------------------------ */

	header {
		display: grid;
		gap: clamp(0.6rem, 1.6vh, 1.1rem);
		justify-items: center;
	}

	.kicker {
		margin: 0;
		font-size: clamp(0.85rem, 1.8vh, 1.15rem);
		font-weight: 700;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--gold);
	}

	h1 {
		margin: 0;
		font-size: clamp(1.7rem, 5.2vh, 3.1rem);
		font-weight: 800;
		letter-spacing: -0.015em;
		line-height: 1.12;
	}

	/* The corner cluster: the way back, TV mode, the way out. Barely visible at
	   rest so that they do not disturb the picture, whoever moves the mouse or
	   types sees them at once. */
	.corner {
		position: absolute;
		top: clamp(1rem, 2.5vh, 1.75rem);
		right: var(--corner-right, clamp(1rem, 3vw, 2.5rem));
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 50%;
		border: 1px solid rgb(255 255 255 / 0.14);
		background: rgb(255 255 255 / 0.05);
		color: #eef1f5;
		font-size: 1.1rem;
		line-height: 1;
		opacity: 0.12;
		transition: opacity 400ms ease;
	}

	.corner.awake,
	.corner:hover,
	.corner:focus-visible {
		opacity: 0.85;
	}

	/* The awake state lights all three at once, a keyboard or remote needs to
	   see which one actually holds the focus. */
	.corner:focus-visible {
		outline: 2px solid var(--gold);
		outline-offset: 2px;
	}

	/* The offsets assume the cluster fills right to left (✕, then ⛶, then ↗).
	   A device that is Android-standalone but without the fullscreen API would
	   leave a gap where ⛶ is missing, accepted: the buttons stay where a hand
	   has learnt them, and such a device is a museum piece. */
	.tvmode {
		--corner-right: calc(clamp(1rem, 3vw, 2.5rem) + 3.8rem);
	}

	.breakout {
		--corner-right: calc(clamp(1rem, 3vw, 2.5rem) + 7.6rem);
	}

	@media (prefers-reduced-motion: reduce) {
		.corner {
			transition: none;
		}
	}

	/* --- Stage ----------------------------------------------------------- */

	main {
		display: grid;
		place-items: center;
		width: 100%;
		padding: clamp(1.5rem, 4vh, 3rem) 0;
	}

	.bigwheel {
		--wheel-size: min(56vh, 44vw, 540px);
	}

	.empty-tv {
		font-size: clamp(1.2rem, 3.2vh, 1.9rem);
		line-height: 1.6;
		color: #8d99ab;
	}

	/* Standings */

	/* Steplessly weaker from top to bottom. The fade only starts below the lead
	   (--fade-start comes from the component) and does not run out to zero:
	   "faded" means weaker, not gone. The floor sits at 0.6, chosen for the
	   weakest colour in the row, not the strongest: masked gold (.tokens) against
	   this stage's darkest tone (#0b0f15) clears roughly 4.9:1 there, #eef1f5
	   (.title, .rank) roughly 6.5:1. Both are lower bounds, since the mask's own
	   6px offset keeps every row a little above the floor alpha, never exactly on
	   it. That bound depends on the faded zone staying clear of the brighter head
	   glow (#2b3648): today the glow has faded to the base tone by the row above
	   where the fade begins, one row of margin, not a wide one, and nothing
	   enforces it; recheck this number if the header shrinks or the glow widens.
	   .rank shares .title's colour rather than its own muted tone for the same
	   reason .steppedBack below leaves colour alone: dimming twice over would
	   undercut this floor for exactly the text it exists to keep readable. */
	.board {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: clamp(0.7rem, 1.8vh, 1.1rem);
		width: min(88vw, 46rem);
		/* The few extra pixels absorb the fact that the share is computed in rows
		   while the mask works in height: the gold row carries a border 2px thicker
		   than the rest and so juts marginally past its computed share. */
		-webkit-mask-image: linear-gradient(
			to bottom,
			#000 calc(var(--fade-start, 100%) + 6px),
			rgb(0 0 0 / 0.6) 100%
		);
		mask-image: linear-gradient(to bottom, #000 calc(var(--fade-start, 100%) + 6px), rgb(0 0 0 / 0.6) 100%);
	}

	/* Whoever has asked their system for more contrast, less transparency or
	   forced colours gets the full board: a decorative fade is exactly the kind
	   of de-emphasis those settings exist to override, and a mask survives
	   forced-colors mode untouched otherwise, the one setting meant to catch
	   this leaves it standing. Written after .board on purpose and relying on
	   that order to win: same selector specificity, so a later rule that moves
	   this block earlier (next to the prefers-reduced-motion one above, say)
	   would silently stop overriding it. */
	@media (prefers-contrast: more), (prefers-reduced-transparency: reduce), (forced-colors: active) {
		.board {
			-webkit-mask-image: none;
			mask-image: none;
		}
	}

	.board li {
		display: flex;
		align-items: center;
		gap: clamp(1rem, 2.5vw, 1.6rem);
		background: rgb(255 255 255 / 0.045);
		border: 1px solid rgb(255 255 255 / 0.09);
		border-radius: 16px;
		padding: clamp(0.75rem, 2vh, 1.15rem) clamp(1.2rem, 3vw, 1.8rem);
		font-size: clamp(1.05rem, 2.8vh, 1.55rem);
	}

	/* A gold frame for the lead, from across the room it should be clear at a
	   glance who is in front. */
	.board li.leader {
		background: rgb(var(--gold-rgb) / 0.12);
		border: 2px solid rgb(var(--gold-rgb) / 0.85);
		box-shadow:
			0 0 34px rgb(var(--gold-rgb) / 0.2),
			inset 0 0 0 1px rgb(var(--gold-rgb) / 0.15);
	}

	/* Everything below steps back: whoever sits in fifth place is no longer
	   information for the evening but does distract from what matters. The fade
	   above does the grading on its own, an extra drop in colour would dampen
	   twice over and make the lower rows unreadable. */
	.board li.steppedBack {
		background: transparent;
		border-color: rgb(255 255 255 / 0.06);
	}

	.more {
		margin: clamp(0.6rem, 1.6vh, 1rem) 0 0;
		font-size: clamp(0.9rem, 2vh, 1.15rem);
		color: #8d99ab;
	}

	.rank {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2em;
		height: 2em;
		flex-shrink: 0;
		border-radius: 50%;
		border: 1px solid rgb(255 255 255 / 0.14);
		font-size: 0.72em;
		/* 600, not 700: on a tie several rows carry .leader at once, unmasked and at
		   full size (see below), at 700 and this row's own text colour the rank
		   digit reads louder than the title it indexes. */
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.leader .rank {
		border-color: transparent;
		font-size: 1em;
	}

	.title {
		flex: 1;
		text-align: left;
		font-weight: 650;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tokens {
		font-weight: 800;
		color: var(--gold);
		font-variant-numeric: tabular-nums;
	}

	.unit {
		font-size: 0.8em;
		margin-left: 0.35em;
	}

	/* Winner celebration */

	.reveal {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: clamp(2.5rem, 6vw, 5.5rem);
		flex-wrap: wrap;
		max-width: 68rem;
	}

	.rposter {
		width: clamp(190px, 30vh, 320px);
		border-radius: 18px;
		overflow: hidden;
		box-shadow:
			0 24px 70px rgb(0 0 0 / 0.6),
			0 0 0 1px rgb(255 255 255 / 0.08),
			0 0 60px rgb(var(--gold-rgb) / 0.1);
	}

	.rinfo {
		display: grid;
		gap: clamp(0.7rem, 1.8vh, 1.2rem);
		justify-items: start;
		text-align: left;
		max-width: 32rem;
	}

	.rkicker {
		margin: 0;
		font-size: clamp(0.85rem, 1.8vh, 1.15rem);
		font-weight: 700;
		letter-spacing: 0.28em;
		text-transform: uppercase;
		color: var(--gold);
	}

	.rtitle {
		font-size: clamp(2.2rem, 8vh, 4.4rem);
		line-height: 1.04;
		letter-spacing: -0.02em;
		text-align: left;
	}

	.rfacts {
		margin: 0;
		font-size: clamp(0.95rem, 2.2vh, 1.3rem);
		color: #8d99ab;
	}

	.rvia {
		margin: 0;
		padding: 0.5em 1em;
		border-radius: 999px;
		border: 1px solid rgb(var(--gold-rgb) / 0.4);
		background: rgb(var(--gold-rgb) / 0.08);
		font-size: clamp(0.9rem, 2vh, 1.2rem);
		font-weight: 600;
		color: var(--gold);
	}

	/* --- Footer ----------------------------------------------------------- */

	footer {
		min-height: 1.5em;
	}

	footer p {
		margin: 0;
		font-size: clamp(0.85rem, 1.9vh, 1.1rem);
		/* #66707e read 3.83:1 against the stage, under AA at this size, and this is
		   the one line that says how to vote at all. #828d9d clears 5.7:1 and still
		   reads as a quiet footer, not a second heading. */
		color: #828d9d;
		letter-spacing: 0.02em;
	}
</style>
