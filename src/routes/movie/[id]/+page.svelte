<script lang="ts">
	import { goto } from '$app/navigation';
	import { call, errorText, redirectIfUnauthorized, type ApiResult } from '$lib/client/api';
	import { supernova } from '$lib/client/celebrate';
	import { getI18n, getLocale } from '$lib/i18n/context';
	import AbsentPicker from '$lib/components/AbsentPicker.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import PersonBadge from '$lib/components/PersonBadge.svelte';
	import { listNames, unknownMember, type Member } from '$lib/member';
	import Poster from '$lib/components/Poster.svelte';
	import Toast from '$lib/components/Toast.svelte';

	let { data } = $props();

	const t = getI18n();
	const locale = getLocale();

	let error = $state('');
	// Set when the message names a reference: the toast then waits to be
	// dismissed instead of taking those eight characters with it.
	let errorHolds = $state(false);
	let busy = $state(false);
	let confirmPick = $state(false);
	let confirmDelete = $state(false);
	// Who is not here, for this one pick. Same row of chips as on the evaluation
	// page, and just as short-lived: closing the page forgets it.
	let absent: string[] = $state([]);
	let linking = $state(false);
	let linkQuery = $state('');
	let linkHits: { tmdbId: number; title: string; year: number | null; posterUrl: string | null }[] = $state(
		[]
	);

	const movie = $derived(data.movie);
	const mine = $derived(movie.proposedBy === data.personId);
	const myStake = $derived(movie.stakes.find((s) => s.personId === data.personId)?.count ?? 0);
	// In the active language: "German" on an English screen, "Deutsch" on a German
	// one. $derived, because a language switch happens without a reload.
	const languageNames = $derived(new Intl.DisplayNames([locale()], { type: 'language' }));

	/**
	 * A rating in the notation of the active language: `7,4` on a German screen,
	 * `7.4` on an English one. Always one decimal, so `8` does not sit in the list
	 * a digit shorter than everything around it. The star ratings and the archive
	 * average go through `toLocaleString` the same way.
	 */
	const rating = (value: number) =>
		value.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });

	/** Whoever is ticked off and still has a vote on this movie. */
	const blockedBy = $derived(
		absent.filter((id) => movie.stakes.some((s) => s.personId === id && s.count > 0))
	);

	/**
	 * A pick the server would refuse: the movie carries a vote of somebody who is
	 * away, or nobody would be left at the movie night at all. Said here rather
	 * than only in the error afterwards; the server checks both again regardless.
	 */
	const pickRefused = $derived(blockedBy.length > 0 || absent.length >= data.members.length);

	/** Person for an id; unknown ids (a removed person) stay renderable. */
	function member(id: string): Member {
		return data.members.find((m: { id: string }) => m.id === id) ?? unknownMember(id);
	}

	function personName(id: string): string {
		return member(id).name;
	}

	async function run(fn: () => Promise<ApiResult<Record<string, unknown>>>) {
		if (busy) return;
		busy = true;
		error = '';
		const result = await fn();
		if (!result.ok) error = errorText(result, t);
		errorHolds = Boolean(result.reference);
		busy = false;
		return result;
	}

	// `null` rather than `undefined`, matching the poster references on the list.
	let posterEl: HTMLElement | null = $state(null);

	async function vote(delta: 1 | -1) {
		const result = await run(() => call('/api/stake', { body: { movieId: movie.id, delta } }));
		// Fire and forget: the next vote must not wait for the popcorn to settle.
		if (result?.ok && delta === 1 && posterEl) void supernova({ target: posterEl });
	}

	async function saveSource(value: string) {
		await run(() => call(`/api/movies/${movie.id}`, { method: 'PATCH', body: { sourceHint: value } }));
	}

	async function saveProposer(value: string) {
		await run(() => call(`/api/movies/${movie.id}`, { method: 'PATCH', body: { proposedBy: value } }));
	}

	async function freePick() {
		confirmPick = false;
		const result = await run(() => call('/api/free-pick', { body: { movieId: movie.id, absent } }));
		// The parameter is what tells the evaluation page to celebrate: this click
		// made a winner, and the page it lands on cannot tell that by itself.
		if (result?.ok) await goto('/evaluation?celebrate=1');
	}

	async function remove() {
		confirmDelete = false;
		const result = await run(() => call(`/api/movies/${movie.id}`, { method: 'DELETE' }));
		if (result?.ok) await goto('/');
	}

	// The one action here that does not go through `run()`: the search answers
	// with its own sentence rather than through `handled()`. It therefore has to
	// clear `errorHolds` itself, otherwise a held message from an earlier failure
	// would keep a search error, which names no reference, standing for good.
	async function searchLink() {
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(linkQuery.trim())}`);
			if (redirectIfUnauthorized(res)) return;
			const body = await res.json();
			linkHits = res.ok ? body.results : [];
			if (!res.ok) {
				error = body.error ?? t('error.unexpected');
				errorHolds = false;
			}
		} catch {
			// No answer at all, so nothing was logged and there is nothing to quote.
			// The reverse proxy hands out an HTML page while the container restarts,
			// and reading that as JSON is the throw that lands here.
			linkHits = [];
			error = t('error.offline');
			errorHolds = false;
		}
	}

	const doLink = (tmdbId: number) =>
		run(() => call(`/api/movies/${movie.id}/link`, { body: { tmdbId } })).then(() => (linking = false));
</script>

<svelte:head><title>{movie.title}</title></svelte:head>

<Toast bind:message={error} hold={errorHolds} />

<div class="head">
	<div class="poster" bind:this={posterEl}>
		<Poster src={movie.poster} title={movie.title} size="large" />
	</div>
	<div>
		<h1>
			{movie.title}
			{#if movie.year}<span class="muted">({movie.year})</span>{/if}
		</h1>
		<dl>
			{#if movie.runtime}<div>
					<dt>{t('movie.runtime')}</dt>
					<dd>{t('movie.runtimeValue', { n: movie.runtime })}</dd>
				</div>{/if}
			{#if movie.genres}<div>
					<dt>{t('movie.genre')}</dt>
					<dd>{movie.genres}</dd>
				</div>{/if}
			{#if movie.tmdbId != null}
				<!-- Age rating only for database movies; for manual entries the row is dropped. -->
				<div>
					<dt>{t('movie.certification')}</dt>
					<dd>{movie.certification ?? '–'}</dd>
				</div>
			{/if}
			{#if movie.originalLanguage}
				<div>
					<dt>{t('movie.originalLanguage')}</dt>
					<dd>{languageNames.of(movie.originalLanguage) ?? movie.originalLanguage}</dd>
				</div>
			{/if}
			<!-- IMDb where we have it, TMDB where we do not, always labelled with
			     where the number came from, never silently swapped. -->
			{#if movie.imdbRating != null}<div>
					<dt>{t('movie.imdb')}</dt>
					<dd>★ {rating(movie.imdbRating)}</dd>
				</div>{:else if movie.tmdbRating != null}<div>
					<dt>{t('movie.tmdb')}</dt>
					<dd>★ {rating(movie.tmdbRating)}</dd>
				</div>{/if}
		</dl>
	</div>
</div>

{#if movie.status === 'winner'}
	<div class="card winnerbox">
		🏆 {t('movie.winnerNotice')}
		<a href="/evaluation"><strong>{t('movie.winnerNoticeLink')}</strong></a>
	</div>
{/if}

<h2>{t('movie.voting')}</h2>
<div class="card">
	{#if movie.stakes.length === 0}
		<p class="muted">{t('movie.noTokensHere')}</p>
	{:else}
		<ul class="stakes">
			{#each movie.stakes as s (s.personId)}
				{@const m = member(s.personId)}
				<li>
					<PersonBadge member={m} />
					{m.name}: {s.count} 🍿
				</li>
			{/each}
		</ul>
	{/if}
	{#if movie.status === 'list'}
		<div class="voterow">
			<button class="btn secondary" disabled={busy || myStake === 0} onclick={() => vote(-1)}
				>{t('movie.takeToken')}</button
			>
			<button class="btn" disabled={busy || data.balance < 1} onclick={() => vote(1)}
				>{t('movie.placeToken', { free: data.balance })}</button
			>
		</div>
	{/if}
</div>

{#if movie.overview}<p class="overview">{movie.overview}</p>{/if}

{#if movie.trailerYoutubeId}
	<h2>{t('movie.trailer')}</h2>
	<div class="trailer">
		<!--
			referrerpolicy is mandatory: the app sends "Referrer-Policy: no-referrer"
			globally (hooks.server.ts), and since late 2025 the YouTube player refuses
			to work with "Error 153 – Video player configuration error" when it cannot
			see the embedding origin. The exception applies to this iframe alone:
			YouTube gets the origin (https://host) but still not the full path, and
			every other request the app makes stays without a referrer.
		-->
		<iframe
			src="https://www.youtube-nocookie.com/embed/{movie.trailerYoutubeId}"
			title={t('movie.trailerTitle', { title: movie.title })}
			allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
			referrerpolicy="strict-origin-when-cross-origin"
			allowfullscreen
		></iframe>
	</div>
{/if}

<!-- Both fields describe the entry rather than the film or the game, so they sit
     together. Each carries a visible label, which is also what makes them
     reachable by name, no aria-label on top, that would replace the visible text
     for a screen reader instead of adding to it. -->
<h2>{t('movie.entryHeading')}</h2>
<div class="card entry">
	<!-- Switchable, so that a movie can be added on someone else's behalf. -->
	<label>
		<span class="muted">{t('movie.proposedBy')}</span>
		<select value={movie.proposedBy} disabled={busy} onchange={(e) => saveProposer(e.currentTarget.value)}>
			{#each data.members as m (m.id)}
				<option value={m.id}>{m.name}</option>
			{/each}
			{#if !data.members.some((m: { id: string }) => m.id === movie.proposedBy)}
				<!-- The person is no longer in the configuration, show them anyway. -->
				<option value={movie.proposedBy}>{personName(movie.proposedBy)}</option>
			{/if}
		</select>
	</label>
	<label>
		<span class="muted">{t('movie.whereToFind')}</span>
		<select
			value={movie.sourceHint ?? ''}
			disabled={busy}
			onchange={(e) => saveSource(e.currentTarget.value)}
		>
			<option value="">{t('movie.sourceNotSet')}</option>
			{#each data.sources as s (s)}
				<option value={s}>{s}</option>
			{/each}
			{#if movie.sourceHint && !data.sources.includes(movie.sourceHint)}
				<option value={movie.sourceHint}>{movie.sourceHint}</option>
			{/if}
		</select>
	</label>
</div>

{#if movie.status === 'list' && movie.tmdbId === null}
	<h2>{t('movie.linkHeading')}</h2>
	{#if linking}
		<div class="sourcerow">
			<input
				bind:value={linkQuery}
				placeholder={t('movie.searchPlaceholder')}
				onkeydown={(e) => e.key === 'Enter' && searchLink()}
			/>
			<button class="btn" onclick={searchLink}>{t('movie.search')}</button>
		</div>
		{#each linkHits as hit (hit.tmdbId)}
			<button class="card hit" disabled={busy} onclick={() => doLink(hit.tmdbId)}>
				<strong>{hit.title}</strong>{#if hit.year}&nbsp;<span class="muted">({hit.year})</span>{/if}
			</button>
		{/each}
	{:else}
		<button class="btn secondary" onclick={() => ((linkQuery = movie.title), (linking = true))}
			>{t('movie.findMatch')}</button
		>
	{/if}
{/if}

{#if movie.status === 'list'}
	<h2>{t('movie.actions')}</h2>
	<div class="actions">
		<button class="btn secondary" onclick={() => (confirmPick = true)}>✨ {t('movie.watchToday')}</button>
		{#if mine}
			<button class="btn danger" onclick={() => (confirmDelete = true)}>{t('movie.delete')}</button>
		{/if}
	</div>
{/if}

<ConfirmDialog
	bind:open={confirmPick}
	title={t('movie.confirmPickTitle')}
	confirmText={t('movie.confirmPickButton')}
	{busy}
	disabled={pickRefused}
	onconfirm={freePick}
>
	{t('movie.confirmPickBody')}
	{#if movie.tokens > 0}{t('movie.confirmPickTokens', { n: movie.tokens })}{/if}
	<div class="who">
		<AbsentPicker members={data.members} bind:absent />
		{#if blockedBy.length > 0}
			<p class="blocked">
				{t('movie.confirmPickBlocked', { names: listNames(data.members, blockedBy, locale()) })}
			</p>
		{/if}
	</div>
</ConfirmDialog>

<ConfirmDialog
	bind:open={confirmDelete}
	title={t('movie.confirmDeleteTitle')}
	confirmText={t('movie.confirmDeleteButton')}
	danger
	{busy}
	onconfirm={remove}
>
	{t('movie.confirmDeleteBody')}
	{#if movie.tokens > 0}
		{t('movie.confirmDeleteTokens', { n: movie.tokens, cap: data.tokenCap })}
	{/if}
</ConfirmDialog>

<style>
	.head {
		display: grid;
		grid-template-columns: minmax(110px, 150px) 1fr;
		gap: 1rem;
		align-items: start;
	}

	dl {
		margin: 0;
		display: grid;
		gap: 0.25rem;
		font-size: 0.9rem;
	}

	dl div {
		display: flex;
		gap: 0.5rem;
	}

	dt {
		color: var(--muted);
		min-width: 7.5rem;
	}

	dd {
		margin: 0;
	}

	.winnerbox {
		margin-top: 1rem;
		border-color: var(--accent);
	}

	.overview {
		line-height: 1.55;
	}

	.trailer {
		position: relative;
		aspect-ratio: 16 / 9;
		border-radius: var(--radius);
		overflow: hidden;
		background: #000;
	}

	.trailer iframe {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
	}

	/* Two labelled rows, aligned with each other and with the metadata list at the
	   top of the page: label left in the muted colour at a fixed width, field
	   filling the rest. */
	.entry {
		display: grid;
		gap: 0.6rem;
	}

	.entry label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
	}

	.entry label > span {
		min-width: 7.5rem;
	}

	/* The absence row inside the free-pick dialog, set off from the sentence above
	   it so the dialog reads as "this is what happens" and then "who is here". */
	.who {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.9rem;
	}

	.blocked {
		margin: 0;
		color: var(--danger);
		font-weight: 600;
	}

	.entry select {
		flex: 1;
		min-width: 0;
	}

	.sourcerow {
		display: flex;
		gap: 0.5rem;
	}

	.sourcerow input {
		flex: 1;
	}

	.stakes {
		list-style: none;
		margin: 0.5rem 0;
		padding: 0;
		display: grid;
		gap: 0.3rem;
	}

	.voterow {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.voterow .btn {
		flex: 1;
	}

	.actions {
		display: grid;
		gap: 0.5rem;
	}

	.hit {
		width: 100%;
		text-align: left;
		margin-top: 0.5rem;
	}
</style>
