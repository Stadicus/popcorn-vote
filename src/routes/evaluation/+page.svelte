<script lang="ts">
	import { untrack } from 'svelte';
	import { afterNavigate, invalidateAll, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { call, errorText } from '$lib/client/api';
	import { supernova } from '$lib/client/celebrate';
	import { getI18n, getLocale } from '$lib/i18n/context';
	import { listNames } from '$lib/member';
	import { nightBoard, nightVerdict } from '$lib/standings';
	import AbsentPicker from '$lib/components/AbsentPicker.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import Wheel from '$lib/components/Wheel.svelte';

	interface WheelData {
		candidates: { movieId: number; title: string }[];
		winnerMovieId: number;
	}

	interface WinnerView {
		id: number;
		title: string;
		poster: string | null;
	}

	let { data } = $props();

	const t = getI18n();
	const locale = getLocale();

	let error = $state('');
	// Set when the message names a reference: the toast then waits to be
	// dismissed instead of taking those eight characters with it.
	let errorHolds = $state(false);
	let busy = $state(false);
	let confirmOpen = $state(false);
	let confirmRevert = $state(false);
	let confirmWatched = $state(false);
	let wheel: WheelData | null = $state(null);
	let reveal: WinnerView | null = $state(null);

	/**
	 * Who is not here tonight, shared with every other device through
	 * `/api/tonight`. Starts from what the server holds, so a second phone or a
	 * reload sees the same evening the television shows, rather than a full count
	 * that would then decide somebody's film without them.
	 */
	let absent: string[] = $state(untrack(() => data.absent));
	// The chips are dead while a change is on its way, which is all the ordering
	// this needs: never two requests in flight, so an older selection cannot
	// overtake a newer one.
	let publishing = $state(false);

	/**
	 * Tells the other devices who is away. Deliberately quiet about failure: this
	 * is a display hint, not a move in the game, and the next successful tap
	 * catches up. The timeout keeps a hanging network from freezing the whole chip
	 * row until the browser gives up, which on a phone is about a minute.
	 */
	async function publishAbsent(next: string[]) {
		publishing = true;
		const result = await call<{ absent: string[] }>('/api/tonight', {
			body: { absent: next },
			refresh: false,
			signal: AbortSignal.timeout(4000)
		});
		publishing = false;
		// The server tidies duplicates and refuses outright while a winner is on the
		// table. Either way, its answer is the truth about the evening.
		if (result.ok && result.data) absent = result.data.absent;
	}

	/** The same count the server will run, so the screen cannot promise otherwise. */
	const board = $derived(nightBoard(data.movies, absent));
	const verdict = $derived(nightVerdict(board, absent));

	/**
	 * A night nobody would be at. The verdict cannot see this on its own: votes of
	 * a person who has since left the configuration still count as present, so the
	 * board can read "ready" for an evening with nobody in the room. Same guard as
	 * the free-pick dialog on the movie page.
	 */
	const nobodyLeft = $derived(absent.length >= data.members.length);

	/** Highest token count among the candidates; the highlight follows it. */
	const highestCount = $derived(
		board.reduce((max, s) => (s.blockedBy.length > 0 ? max : Math.max(max, s.tokens)), 0)
	);

	const names = (ids: string[]) => listNames(data.members, ids, locale());

	async function evaluate() {
		confirmOpen = false;
		busy = true;
		error = '';
		const result = await call<{ winner: WinnerView; wheel: WheelData | null }>('/api/evaluate', {
			refresh: false,
			body: { absent }
		});
		busy = false;
		if (!result.ok || !result.data) {
			error = errorText(result, t);
			errorHolds = Boolean(result.reference);
			await invalidateAll();
			return;
		}
		if (result.data.wheel) {
			wheel = result.data.wheel;
			reveal = result.data.winner; // only shown after the wheel
		} else {
			await celebrate(result.data.winner);
		}
	}

	async function wheelDone() {
		const winner = reveal;
		wheel = null;
		if (winner) await celebrate(winner);
	}

	async function celebrate(winner: WinnerView) {
		reveal = winner;
		await invalidateAll();
		await supernova();
	}

	// The third way to a winner: a free pick on a movie page, which lands here
	// through a redirect and would otherwise arrive in silence.
	//
	// `goto` and nothing else. That is exactly how the free pick arrives, and it
	// is the only arrival where this parameter means "this click made the winner".
	// A fresh load carries `type: 'enter'`, a shared link, a restored session .
	// and a back-press carries `'popstate'`, which can reach a history entry from
	// before the parameter was stripped; neither says anything about who won, and
	// celebrating there would replay somebody else's moment on a button nobody
	// pressed for it. (It also keeps `replaceState` off the initial navigation,
	// where SvelteKit has not started its router yet and refuses it, but that is
	// a side effect, not the reason.)
	afterNavigate((navigation) => {
		if (navigation.type !== 'goto') return;
		if (page.url.searchParams.get('celebrate') !== '1') return;
		// Cleared as soon as it has been seen, before anything else can return:
		// left in the address it would sit in the history entry and come back on
		// the next reload or back-press.
		replaceState('/evaluation', {});
		// No winner to celebrate, somebody reverted the win from another device
		// between the redirect and this load.
		if (!data.winner) return;
		// Same framing as the other two paths, which set this inside `celebrate()`:
		// popcorn falling under the quiet "this is what we watch next" heading was
		// the giveaway that only half of that function had been carried over.
		reveal = data.winner;
		void supernova();
	});

	async function winnerAction(action: 'watched' | 'revert') {
		confirmRevert = false;
		confirmWatched = false;
		busy = true;
		error = '';
		const result = await call('/api/winner', { body: { action } });
		if (!result.ok) error = errorText(result, t);
		errorHolds = Boolean(result.reference);
		busy = false;
		// Only once it actually went through: an offline "watched" leaves the winner
		// pending, and the evening it belongs to is still this one.
		if (action === 'watched' && result.ok) {
			reveal = null;
			// The evening is over, so who missed it is over with it. A tablet that
			// never navigates away would otherwise open next week still counting
			// without Ben. A revert keeps the selection on purpose: that is the same
			// evening, being run again.
			absent = [];
		}
	}
</script>

<svelte:head><title>{t('evaluation.title')}</title></svelte:head>

<h1>🎬 {t('evaluation.title')}</h1>

<Toast bind:message={error} hold={errorHolds} />

{#if wheel}
	<div class="card center">
		<h2>{t('evaluation.tieWheel')}</h2>
		<Wheel
			labels={wheel.candidates.map((c) => c.title)}
			winnerIndex={wheel.candidates.findIndex((c) => c.movieId === wheel!.winnerMovieId)}
			ondone={wheelDone}
		/>
	</div>
{:else if data.winner}
	<div class="card center winner">
		{#if reveal}<h2>🎉 {t('evaluation.winnerRevealed')}</h2>{:else}<h2>{t('movie.nextUp')}</h2>{/if}
		<div class="wposter"><Poster src={data.winner.poster} title={data.winner.title} size="large" /></div>
		<strong class="wtitle"><a href="/movie/{data.winner.id}">{data.winner.title}</a></strong>
		{#if data.winner.wonVia === 'free_pick'}<p class="muted">✨ {t('evaluation.viaFreePick')}</p>{/if}
		{#if data.winner.wonVia === 'wheel'}<p class="muted">{t('evaluation.viaWheel')}</p>{/if}
		{#if data.winner.absent}
			<p class="muted">{t('evaluation.without', { names: names(data.winner.absent) })}</p>
		{/if}

		<div class="wactions">
			<button class="btn" disabled={busy} onclick={() => (confirmWatched = true)}
				>✅ {t('evaluation.watched')}</button
			>
			<button class="btn secondary" disabled={busy} onclick={() => (confirmRevert = true)}
				>{t('evaluation.revert')}</button
			>
		</div>
	</div>
	<p class="muted center">{t('evaluation.winnerPending')}</p>
{:else}
	{#if data.movies.length === 0}
		<div class="empty">
			<span class="big">🗳️</span>{t('evaluation.empty')}<br />
			<a href="/propose"><strong>{t('evaluation.emptyLink')}</strong></a>
		</div>
	{:else}
		<!-- Action first, the ranking below is optional scrolling. -->
		<div class="evalbox">
			<button
				class="btn big"
				disabled={busy || nobodyLeft || verdict.state !== 'ready'}
				onclick={() => (confirmOpen = true)}
			>
				🏆 {t('evaluation.run')}
			</button>
			<!-- Right under the big button, not below the ranking: whoever is missing
			     is the first thing to say about tonight, before anybody reads a
			     single count. Nobody ticked off means nothing changes anywhere. -->
			<AbsentPicker members={data.members} bind:absent busy={publishing} onchange={publishAbsent} />
			<!-- A disabled button always says why. "Nobody left" comes first: it is
			     the reason the verdict cannot see. -->
			{#if nobodyLeft}
				<p class="muted center">{t('rule.nobodyPresent')}</p>
			{:else if verdict.state === 'noTokens'}
				<p class="muted center">{t('evaluation.needTokens')}</p>
			{:else if verdict.state === 'allBlocked'}
				<p class="muted center">{t('evaluation.allBlocked')}</p>
			{/if}
		</div>

		<h2>{t('evaluation.standings')}</h2>
		<ol class="board card">
			{#each board as s (s.movieId)}
				<!-- Four levels: the lead in gold, movies with tokens normal, movies
				     without tokens stepped back, and movies waiting for somebody who is
				     not here out of the running altogether. On a tie several lead. -->
				{@const waiting = s.blockedBy.length > 0}
				{@const leads = !waiting && s.tokens > 0 && s.tokens === highestCount}
				<li class:leading={leads} class:noTokens={s.tokens === 0 && !waiting} class:blocked={waiting}>
					<a href="/movie/{s.movieId}">{s.title}</a>
					{#if leads}<span class="sr-only">{t('evaluation.leading')}</span>{/if}
					{#if waiting}
						<span class="waiting">{t('evaluation.waitingFor', { names: names(s.blockedBy) })}</span>
					{:else}
						<span class="tokens">{s.tokens} 🍿</span>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
{/if}

<ConfirmDialog
	bind:open={confirmOpen}
	title={absent.length > 0
		? t('evaluation.confirmRunTitleAbsent', { names: names(absent) })
		: t('evaluation.confirmRunTitle')}
	confirmText={t('evaluation.confirmRunButton')}
	{busy}
	onconfirm={evaluate}
>
	{#if absent.length > 0}
		{t('evaluation.confirmRunBodyAbsent', { names: names(absent) })}
	{:else}
		{t('evaluation.confirmRunBody')}
	{/if}
</ConfirmDialog>

<ConfirmDialog
	bind:open={confirmWatched}
	title={t('evaluation.confirmWatchedTitle')}
	confirmText={t('evaluation.confirmWatchedButton')}
	{busy}
	onconfirm={() => winnerAction('watched')}
>
	{t('evaluation.confirmWatchedBody')}
</ConfirmDialog>

<ConfirmDialog
	bind:open={confirmRevert}
	title={t('evaluation.confirmRevertTitle')}
	confirmText={t('evaluation.confirmRevertButton')}
	{busy}
	onconfirm={() => winnerAction('revert')}
>
	{t('evaluation.confirmRevertBody')}
</ConfirmDialog>

<style>
	.center {
		text-align: center;
	}

	.winner {
		border-color: var(--accent);
		margin-bottom: 0.75rem;
	}

	.wposter {
		max-width: 220px;
		margin: 0.75rem auto;
	}

	.wtitle {
		font-size: 1.2rem;
	}

	.wactions {
		display: grid;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	/* Separated rows rather than one continuous list with dividers: two adjacent
	   leaders no longer merge into a single gold stripe but stay two recognisable
	   movies. */
	.board {
		list-style: none;
		counter-reset: rank;
		margin: 0;
		padding: 0.5rem;
		display: grid;
		gap: 0.35rem;
	}

	.board li {
		counter-increment: rank;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.6rem;
		border-radius: 8px;
	}

	/* The lead: gold background, the same visual language as on the TV stage. */
	.board li.leading {
		background: rgb(var(--gold-rgb) / 0.14);
		box-shadow: inset 2px 0 0 rgb(var(--gold-rgb) / 0.9);
	}

	.board li.leading a {
		font-weight: 700;
	}

	/* Without tokens: nothing is on it, so it steps back. */
	.board li.noTokens a,
	.board li.noTokens .tokens {
		color: var(--muted);
		font-weight: 400;
	}

	/* Waiting for somebody who is not here: further back still, and out of the
	   running, but deliberately still on the list. It is not gone, it is waiting. */
	.board li.blocked a {
		color: var(--muted);
		font-weight: 400;
	}

	.waiting {
		color: var(--muted);
		font-size: 0.85rem;
		text-align: right;
	}

	.board li::before {
		content: counter(rank) '.';
		color: var(--muted);
		min-width: 1.4rem;
	}

	.board a {
		flex: 1;
		font-weight: 600;
	}

	.evalbox {
		margin: 0.25rem 0 1.25rem;
		display: grid;
		gap: 0.5rem;
	}

	.btn.big {
		padding: 0.9rem;
		font-size: 1.05rem;
	}
</style>
