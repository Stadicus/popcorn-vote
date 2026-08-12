<script lang="ts">
	import type { PageData } from './$types';
	import { call, errorText } from '$lib/client/api';
	import { install } from '$lib/client/install.svelte';
	import InstallHowto from '$lib/components/InstallHowto.svelte';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { getI18n } from '$lib/i18n/context';
	import { creditSentence } from '$lib/tokentext';
	import { APP_VERSION } from '$lib/version';

	type MorePageData = PageData & { dailyBuildUrl: string };

	let { data }: { data: MorePageData } = $props();

	const t = getI18n();
	const me = $derived(data.members.find((m: { id: string }) => m.id === data.personId));

	// Recall for a dismissed install notice. Only shown when installing is
	// possible at all — otherwise this would be a button that can do nothing.
	let howtoRequested = $state(false);
	const installRecall = $derived(
		!install.standalone && install.dismissed && (install.prompt !== null || install.iosSafari)
	);

	function startInstall() {
		// The decision is taken back: from now on the notice is on the list again,
		// in case installing does not work out here.
		install.reset();
		if (install.prompt) void install.run();
		else howtoRequested = true;
	}

	let error = $state('');
	// Set when the message names a reference: the toast then waits to be
	// dismissed instead of taking those eight characters with it.
	let errorHolds = $state(false);
	let importing = $state(false);
	let importResult = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	async function importCsv(files: FileList | null) {
		const file = files?.[0];
		if (!file) return;
		importing = true;
		importResult = '';
		error = '';
		const csv = await file.text();
		const result = await call<{ created: number; enriched: number; manual: number; skipped: number }>(
			'/api/import',
			{ body: { csv } }
		);
		importing = false;
		if (fileInput) fileInput.value = '';
		if (!result.ok || !result.data) {
			error = errorText(result, t);
			errorHolds = Boolean(result.reference);
			return;
		}
		const r = result.data;
		importResult = t('more.importResult', {
			created: r.created,
			enriched: r.enriched,
			manual: r.manual,
			skipped: r.skipped
		});
	}
</script>

<svelte:head><title>{t('more.title')}</title></svelte:head>

<h1>{t('more.title')}</h1>

<Toast bind:message={error} hold={errorHolds} />

<div class="menu">
	<!-- On a monitor the TV stage is already in the main bar; here it would be the
	     same entry a second time. On a phone this is the only way in. -->
	<a class="card phoneOnly" href="/tv">
		📺 {t('more.tv')}
		<span class="muted">{t('more.tvHint')}</span>
	</a>
	<a class="card" href="/log">
		📜 {t('log.title')}
		<span class="muted">{t('more.logHint')}</span>
	</a>
	<a class="card" href="/trash">
		🗑️ {t('trash.title')}
		<span class="muted">{t('more.trashHint')}</span>
	</a>
	{#if installRecall}
		<button class="card" onclick={startInstall}>
			📲 {t('more.install')}
			<span class="muted">{t('more.installHint')}</span>
		</button>
	{/if}
</div>

{#if howtoRequested && !install.prompt}
	<div class="howto"><InstallHowto /></div>
{/if}

<h2>{t('language.label')}</h2>
<div class="card language"><LanguageSwitch chosen={data.languageChoice} /></div>

<h2>{t('more.data')}</h2>
<div class="card daten">
	<p class="muted explanation">{t('more.dataHint')}</p>
	<div class="databuttons">
		<a class="btn secondary" href="/api/export/list" download>⬇️ {t('more.exportList')}</a>
		<a class="btn secondary" href="/api/export/archive" download>⬇️ {t('more.exportArchive')}</a>
		<button class="btn secondary" disabled={importing} onclick={() => fileInput?.click()}
			>⬆️ {t('more.import')}</button
		>
	</div>
	<input
		type="file"
		accept=".csv,text/csv,text/plain"
		hidden
		bind:this={fileInput}
		onchange={(e) => importCsv(e.currentTarget.files)}
	/>
	{#if importing}<p class="muted note">{t('more.importing')}</p>{/if}
	{#if importResult}<p class="result">{importResult}</p>{/if}
</div>

{#if me}
	<p class="muted note">
		{creditSentence(t, data.locale, {
			amount: data.tokenAmount,
			weekday: data.tokenWeekday,
			hour: data.tokenHour,
			cap: data.tokenCap
		})}
	</p>
{/if}

<!-- Without an OMDb key the movies work and only the IMDb rating is missing.
     That is small print, not a banner, and it belongs where the rest of the
     operator's small print is. -->
{#if data.omdbProblem}
	<p class="muted keynote">{t('keys.omdbRatings')} {t(data.omdbProblem)}</p>
{/if}

<!-- A daily build, where an operator has configured one: a second instance on the
     newest code, with data that is thrown away. Nothing is shown without it, so
     no installation ever advertises somebody else's. -->
{#if data.dailyBuildUrl}
	<p class="muted testnote">
		🧪 <a href={data.dailyBuildUrl} target="_blank" rel="noreferrer">{t('more.testNoteLink')}</a>
		{t('more.testNote')}
	</p>
{/if}

<!-- Attribution. TMDB requires this notice and its logo in every application that
     uses the API, and the wording is prescribed — it therefore stays English in
     both catalogues instead of being translated. -->
<div class="attribution">
	<a href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
		<!-- Height only: keeps the wordmark at the source's aspect ratio instead of
		     squashing it by two percent. -->

		<img src="/tmdb.svg" alt="TMDB" height="18" loading="lazy" />
	</a>
	<p>{t('attribution.tmdb')}</p>
	<p>{t('attribution.omdb')}</p>
</div>

<!-- Right at the bottom and unobtrusive: the version is only visible if you look
     for it, and then it is there. It answers the first question of any problem,
     namely which build is actually running. -->
<p class="version">{t('more.version', { version: APP_VERSION })}</p>

<style>
	.menu {
		display: grid;
		gap: 0.75rem;
	}

	.menu a,
	.menu button {
		display: grid;
		gap: 0.2rem;
		font-weight: 600;
		text-align: left;
	}

	@media (min-width: 900px) {
		.menu a.phoneOnly {
			display: none;
		}
	}

	.howto {
		margin-top: 0.5rem;
	}

	/* One card rather than three row cards: saving and loading belong together,
	   and the explanation applies to all three buttons. */
	.daten {
		display: grid;
		gap: 0.7rem;
	}

	.language {
		display: grid;
	}

	.explanation {
		margin: 0;
		line-height: 1.5;
	}

	.databuttons {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.databuttons .btn {
		flex: 1;
		min-width: 8rem;
		padding: 0.55rem 0.7rem;
		font-size: 0.9rem;
	}

	.note {
		margin: 0;
	}

	.result {
		color: var(--ok);
		font-size: 0.9rem;
		margin: 0;
	}

	.note {
		margin-top: 1.5rem;
		line-height: 1.5;
	}

	.testnote {
		margin-top: 1.5rem;
		font-size: 0.8rem;
		line-height: 1.5;
	}

	.keynote {
		margin-top: 1.5rem;
		font-size: 0.8rem;
		line-height: 1.5;
	}

	.testnote a {
		text-decoration: underline;
	}

	.attribution {
		margin-top: 2rem;
		display: grid;
		justify-items: center;
		gap: 0.35rem;
		text-align: center;
	}

	.attribution img {
		height: 18px;
		width: auto;
	}

	.attribution p {
		margin: 0;
		font-size: 0.7rem;
		line-height: 1.4;
		color: var(--muted);
		max-width: 28rem;
	}

	.version {
		margin-top: 0.75rem;
		text-align: center;
		font-size: 0.75rem;
		color: var(--muted);
	}
</style>
