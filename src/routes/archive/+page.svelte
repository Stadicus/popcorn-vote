<script lang="ts">
	import { call, errorText } from '$lib/client/api';
	import Poster from '$lib/components/Poster.svelte';
	import Stars from '$lib/components/Stars.svelte';
	import { getI18n, getLocale } from '$lib/i18n/context';

	let { data } = $props();

	const t = getI18n();
	const locale = getLocale();

	let error = $state('');
	let reproposed: Record<number, boolean> = $state({});

	function personName(id: string): string {
		return data.members.find((m: { id: string }) => m.id === id)?.name ?? id;
	}

	function myRating(entry: { ratings: { personId: string; stars: number }[] }): number | null {
		return entry.ratings.find((r) => r.personId === data.personId)?.stars ?? null;
	}

	function formatDate(iso: string | null): string {
		return iso
			? new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
			: '';
	}

	async function rateMovie(movieId: number, stars: number) {
		error = '';
		const result = await call(`/api/movies/${movieId}/rating`, { body: { stars } });
		if (!result.ok) error = errorText(result, t);
	}

	async function repropose(movieId: number) {
		error = '';
		const result = await call(`/api/movies/${movieId}/repropose`);
		if (!result.ok) error = errorText(result, t);
		else reproposed = { ...reproposed, [movieId]: true };
	}
</script>

<svelte:head><title>{t('archive.title')}</title></svelte:head>

<h1>{t('archive.title')}</h1>

{#if error}<p class="error">{error}</p>{/if}

{#if data.archive.length === 0}
	<div class="empty">
		<span class="big">⭐</span>{t('archive.empty')}
	</div>
{:else}
	<div class="list">
		{#each data.archive as entry (entry.id)}
			<div class="card entry">
				<div class="top">
					<Poster src={entry.poster} title={entry.title} size="small" />
					<div class="info">
						<strong>{entry.title}</strong>
						<div class="muted">{t('archive.watchedOn', { date: formatDate(entry.watchedAt) })}</div>
						{#if entry.average != null}
							<div class="avg">
								<Stars value={entry.average} size="1rem" />
								<span class="muted"
									>{t('archive.average', { value: entry.average.toLocaleString(locale()) })}</span
								>
							</div>
						{:else}
							<div class="muted">{t('archive.noRating')}</div>
						{/if}
					</div>
				</div>

				<div class="ratings">
					{#each entry.ratings as r (r.personId)}
						{#if r.personId !== data.personId}
							<div class="rrow muted">
								<span>{personName(r.personId)}</span>
								<Stars value={r.stars} size="0.95rem" />
							</div>
						{/if}
					{/each}
					<div class="rrow mine">
						<span>{t('archive.myRating')}</span>
						<Stars value={myRating(entry)} size="1.35rem" onchange={(stars) => rateMovie(entry.id, stars)} />
					</div>
				</div>

				<div class="foot">
					{#if reproposed[entry.id]}
						<span class="muted"><a href="/"><strong>{t('archive.reproposed')}</strong></a> ✔</span>
					{:else}
						<button class="btn secondary" onclick={() => repropose(entry.id)}
							>↻ {t('archive.repropose')}</button
						>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.list {
		display: grid;
		gap: 0.75rem;
	}

	.top {
		display: flex;
		gap: 0.75rem;
	}

	.info {
		display: grid;
		gap: 0.2rem;
		align-content: start;
	}

	.avg {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.ratings {
		margin-top: 0.75rem;
		display: grid;
		gap: 0.35rem;
	}

	.rrow {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.9rem;
	}

	.rrow.mine {
		border-top: 1px solid var(--line);
		padding-top: 0.5rem;
		font-weight: 600;
	}

	.foot {
		margin-top: 0.75rem;
		display: flex;
		justify-content: flex-end;
	}
</style>
