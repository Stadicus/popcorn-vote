<script lang="ts">
	import { goto } from '$app/navigation';
	import { call, errorText, redirectIfUnauthorized } from '$lib/client/api';
	import { getI18n, getLocale } from '$lib/i18n/context';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	interface Hit {
		tmdbId: number;
		title: string;
		year: number | null;
		posterUrl: string | null;
	}

	interface Duplicate {
		kind: string;
		title: string;
		proposedBy: string;
		watchedAt: string | null;
	}

	let { data } = $props();

	const t = getI18n();
	const locale = getLocale();

	interface Preview {
		tmdbId: number;
		title: string;
		year: number | null;
		overview: string | null;
		runtime: number | null;
		genres: string | null;
		certification: string | null;
		posterUrl: string | null;
	}

	let query = $state('');
	let hits: Hit[] = $state([]);
	let selected: Hit | null = $state(null);
	let preview: Preview | null = $state(null);
	let previewLoading = $state(false);
	let searching = $state(false);
	let searchError = $state('');
	let manual = $state(false);
	let manualTitle = $state('');
	let manualYear = $state('');
	let adding = $state(false);
	let error = $state('');
	let duplicates: Duplicate[] = $state([]);
	let pending: { tmdbId?: number; title?: string; year?: number } | null = $state(null);
	let dupOpen = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let searchInput: HTMLInputElement | undefined = $state();

	// The notice has two sources, and both are already finished sentences: what
	// the page was loaded with, and what a search has learned since. `undefined`
	// means nothing has been learned yet, a search that succeeds sets `null` and
	// clears a refusal the load still knew about.
	let learned: string | null | undefined = $state(undefined);
	const notice = $derived(
		learned !== undefined
			? learned
			: data.tmdbProblem
				? `${t('keys.tmdbSearch')} ${t(data.tmdbProblem)} ${t('keys.tmdbManual')}`
				: null
	);

	// Whoever opens "new" wants to type: focus the search field straight away.
	$effect(() => {
		searchInput?.focus();
	});

	function onInput() {
		selected = null;
		clearTimeout(timer);
		timer = setTimeout(search, 350);
	}

	// Answers can overtake each other: the debounce spaces the requests out, it
	// does not order the replies. Only the newest request may write hits, or a
	// slow answer to an abandoned query lands on top of a fresh one, hits
	// belonging to a title nobody is typing any more. Giving up on a search
	// counts as a newer request, or the abandoned answer would still be the
	// newest one.
	let newest = 0;

	// The notice is ordered separately, and only by what actually happened: this
	// counts the times a search came back working. A preview that set off before
	// the last of those must not put a refusal back afterwards, but merely
	// clearing the search field is no news about the key, and must not silence
	// a preview that is still on its way.
	let cleared = 0;

	async function search() {
		const q = query.trim();
		// Without a key the answer is known, so no request goes out. A refused key
		// is not in that group on purpose: the verdict is from an earlier request,
		// and only a new one can take it back.
		if (q.length < 2 || !data.tmdbSearchable) {
			newest++;
			hits = [];
			searching = false;
			searchError = '';
			return;
		}
		const mine = ++newest;
		searching = true;
		searchError = '';
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
			if (redirectIfUnauthorized(res)) return;
			const body = await res.json();
			if (mine !== newest) return;
			if (!res.ok) {
				hits = [];
				// The key gets the notice, not a second sentence under the field: one
				// cause, said once. The sentence comes from the server, which knows the
				// language of the request.
				if (body.keyProblem) learned = `${body.error} ${t('keys.tmdbManual')}`;
				else searchError = body.error ?? t('propose.searchFailed');
			} else {
				hits = body.results;
				// It works, so whatever was refused before is not refused now.
				learned = null;
				cleared++;
			}
		} catch {
			if (mine !== newest) return;
			searchError = t('propose.searchFailedManual');
		}
		if (mine === newest) searching = false;
	}

	function personName(id: string): string {
		return data.members.find((m: { id: string }) => m.id === id)?.name ?? id;
	}

	async function select(hit: Hit) {
		selected = hit;
		duplicates = [];
		pending = null;
		preview = null;
		previewLoading = true;
		// Only a search that came back working overrules this preview about the
		// key. Hanging it on the request counter instead would swallow the notice
		// whenever somebody emptied the search field while the preview was in
		// flight, which is exactly the moment this is here for.
		const seen = cleared;
		try {
			const res = await fetch(`/api/preview?tmdbId=${hit.tmdbId}`);
			if (redirectIfUnauthorized(res)) return;
			const body = await res.json();
			if (res.ok) preview = body.preview;
			// A key refused since the search ran shows up here first. Without this
			// the preview would fall back to the data from the hit, the add button
			// would look ready, and only the tap after it would fail.
			else if (body.keyProblem && seen === cleared) learned = `${body.error} ${t('keys.tmdbManual')}`;
		} catch {
			// The preview is a convenience, without it, title, year and poster from the hit remain.
		}
		previewLoading = false;
	}

	async function propose(body: { tmdbId?: number; title?: string; year?: number }) {
		// Check for duplicates first, the hint blocks nothing.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- only builds the URL, not reactive
		const params = new URLSearchParams();
		if (body.tmdbId) params.set('tmdbId', String(body.tmdbId));
		if (body.title) params.set('title', body.title);
		if (body.year) params.set('year', String(body.year));
		const res = await fetch(`/api/movies?${params}`);
		if (redirectIfUnauthorized(res)) return;
		const { duplicates: found } = await res.json();
		if (found?.length > 0) {
			duplicates = found;
			pending = body;
			dupOpen = true;
			return;
		}
		await create(body);
	}

	async function create(body: { tmdbId?: number; title?: string; year?: number }) {
		adding = true;
		error = '';
		duplicates = [];
		pending = null;
		dupOpen = false;
		const result = await call<{ movieId: number }>('/api/movies', { body });
		adding = false;
		if (!result.ok) {
			// One cause, said once. A key problem goes into the notice above the
			// search field, where the same sentence may already be standing, rather
			// than into a second box repeating it in another frame.
			if (result.keyProblem) learned = errorText(result, t);
			else error = errorText(result, t);
			return;
		}
		await goto(`/movie/${result.data?.movieId}`);
	}

	function duplicateText(d: Duplicate): string {
		if (d.kind === 'archived' && d.watchedAt) {
			const date = new Date(d.watchedAt).toLocaleDateString(locale(), {
				day: 'numeric',
				month: 'long'
			});
			return t('propose.duplicateArchived', { title: d.title, date });
		}
		if (d.kind === 'winner') return t('propose.duplicateWinner', { title: d.title });
		return t('propose.duplicateList', { title: d.title, name: personName(d.proposedBy) });
	}
</script>

<svelte:head><title>{t('propose.title')}</title></svelte:head>

<h1>{t('propose.title')}</h1>

{#if error}<p class="error">{error}</p>{/if}

<!-- The search is the broken part, so the notice sits where it is: right above
     the field. The field stays visible either way, removing it would hide that
     this page has a search at all, and is only disabled where there is nothing
     to try, which is a key that is missing rather than one that was refused.
     `aria-live` because the notice can also appear mid-session, when a search
     comes back refused; `aria-describedby` so the field carries its reason. -->
<!-- The live region stays in the DOM whether or not there is anything to say .
     one that appears together with its message is announced by nothing. -->
<div aria-live="polite">
	{#if notice}<p class="keynotice" id="keynotice">{notice}</p>{/if}
</div>

<input
	type="search"
	placeholder={t('propose.searchPlaceholder')}
	bind:this={searchInput}
	bind:value={query}
	oninput={onInput}
	autocomplete="off"
	disabled={!data.tmdbSearchable}
	aria-describedby={notice ? 'keynotice' : undefined}
/>

{#if searching}<p class="muted">{t('propose.searching')}</p>{/if}
{#if searchError}<p class="error">{searchError}</p>{/if}

{#if selected}
	<!-- Preview: adding happens only through the button, never by a mere tap. -->
	<div class="card preview">
		<div class="ptop">
			{#if preview?.posterUrl ?? selected.posterUrl}
				<img
					class="pposter"
					src={preview?.posterUrl ?? selected.posterUrl}
					alt={t('poster.alt', { title: selected.title })}
				/>
			{:else}
				<div class="pposter noposter">🎞️</div>
			{/if}
			<div class="pinfo">
				<strong>{preview?.title ?? selected.title}</strong>
				<div class="muted">
					{[
						preview?.year ?? selected.year,
						preview?.runtime ? t('movie.runtimeValue', { n: preview.runtime }) : null,
						preview?.certification ? t('movie.certificationShort', { value: preview.certification }) : null
					]
						.filter(Boolean)
						.join(' · ')}
				</div>
				{#if preview?.genres}<div class="muted">{preview.genres}</div>{/if}
			</div>
		</div>

		<!-- Action first, the description below is optional scrolling. -->
		<div class="pbuttons">
			<button class="btn" disabled={adding} onclick={() => selected && propose({ tmdbId: selected.tmdbId })}>
				➕ {t('propose.add')}
			</button>
			<button class="btn secondary" onclick={() => ((selected = null), (preview = null))}
				>{t('propose.backToHits')}</button
			>
		</div>

		{#if previewLoading}
			<p class="muted">{t('propose.loadingDescription')}</p>
		{:else if preview?.overview}
			<p class="poverview">{preview.overview}</p>
		{/if}
	</div>
	{#if adding}<p class="muted">{t('propose.creating')}</p>{/if}
{:else if hits.length > 0}
	<div class="hits">
		{#each hits as hit (hit.tmdbId)}
			<button class="hit card" onclick={() => select(hit)}>
				{#if hit.posterUrl}
					<img src={hit.posterUrl} alt="" loading="lazy" />
				{:else}
					<div class="noposter">🎞️</div>
				{/if}
				<div>
					<strong>{hit.title}</strong>
					{#if hit.year}<div class="muted">{hit.year}</div>{/if}
				</div>
			</button>
		{/each}
	</div>
{/if}

<div class="manual">
	<button class="btn secondary" onclick={() => (manual = !manual)}>
		{t('propose.manualToggle')}
	</button>
	{#if manual}
		<div class="card form">
			<label>
				{t('propose.titleLabel')}
				<input bind:value={manualTitle} placeholder={t('propose.titleLabel')} />
			</label>
			<label>
				{t('propose.yearLabel')}
				<input bind:value={manualYear} inputmode="numeric" placeholder={t('propose.yearPlaceholder')} />
			</label>
			<button
				class="btn"
				disabled={adding || manualTitle.trim().length === 0}
				onclick={() => propose({ title: manualTitle.trim(), year: Number(manualYear) || undefined })}
			>
				{t('propose.create')}
			</button>
			<p class="muted">{t('propose.manualNote')}</p>
		</div>
	{/if}
</div>

<ConfirmDialog
	bind:open={dupOpen}
	title={t('propose.duplicateTitle')}
	confirmText={t('propose.duplicateConfirm')}
	busy={adding}
	onconfirm={() => pending && create(pending)}
>
	<ul class="duplist">
		{#each duplicates as d, i (i)}
			<li>{duplicateText(d)}</li>
		{/each}
	</ul>
</ConfirmDialog>

<style>
	.keynotice {
		background: var(--accent-soft);
		color: var(--accent);
		border-radius: 8px;
		padding: 0.7rem 0.8rem;
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
		line-height: 1.5;
	}

	.hits {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}

	.hit {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		text-align: left;
	}

	.hit img,
	.noposter {
		width: 3rem;
		aspect-ratio: 2 / 3;
		object-fit: cover;
		border-radius: 6px;
		background: var(--card2);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.preview {
		display: grid;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.ptop {
		display: flex;
		gap: 1rem;
	}

	.pposter {
		width: 7rem;
		aspect-ratio: 2 / 3;
		object-fit: cover;
		border-radius: 8px;
		background: var(--card2);
		flex-shrink: 0;
	}

	.pinfo {
		display: grid;
		gap: 0.3rem;
		align-content: start;
		flex: 1;
	}

	.pinfo strong {
		font-size: 1.05rem;
	}

	.poverview {
		margin: 0;
		line-height: 1.5;
		font-size: 0.92rem;
	}

	.pbuttons {
		display: grid;
		gap: 0.5rem;
	}

	.manual {
		margin-top: 1.25rem;
	}

	.form {
		margin-top: 0.75rem;
		display: grid;
		gap: 0.75rem;
	}

	label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.85rem;
		color: var(--muted);
	}

	.duplist {
		margin: 0.5rem 0;
		padding-left: 1.2rem;
	}
</style>
