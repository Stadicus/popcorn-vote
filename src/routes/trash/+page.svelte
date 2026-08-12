<script lang="ts">
	import { call, errorText } from '$lib/client/api';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Poster from '$lib/components/Poster.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { getI18n, getLocale } from '$lib/i18n/context';

	let { data } = $props();

	const t = getI18n();
	const locale = getLocale();

	let error = $state('');
	// Set when the message names a reference: the toast then waits to be
	// dismissed instead of taking those eight characters with it.
	let errorHolds = $state(false);
	let confirmPurge: number | null = $state(null);
	let confirmOpen = $state(false);

	function personName(id: string): string {
		return data.members.find((m: { id: string }) => m.id === id)?.name ?? id;
	}

	function formatDate(iso: string | null): string {
		return iso
			? new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' })
			: '';
	}

	async function restore(movieId: number) {
		error = '';
		const result = await call(`/api/movies/${movieId}/restore`);
		if (!result.ok) error = errorText(result, t);
		errorHolds = Boolean(result.reference);
	}

	async function purge(movieId: number) {
		confirmOpen = false;
		confirmPurge = null;
		error = '';
		const result = await call(`/api/movies/${movieId}/purge`);
		if (!result.ok) error = errorText(result, t);
		errorHolds = Boolean(result.reference);
	}
</script>

<svelte:head><title>{t('trash.title')}</title></svelte:head>

<h1>{t('trash.title')}</h1>

<Toast bind:message={error} hold={errorHolds} />

{#if data.trash.length === 0}
	<div class="empty"><span class="big">🗑️</span>{t('trash.empty')}</div>
{:else}
	<div class="list">
		{#each data.trash as entry (entry.id)}
			<div class="card">
				<div class="top">
					<Poster src={entry.poster} title={entry.title} size="small" />
					<div>
						<strong>{entry.title}</strong>
						<div class="muted">
							{t('trash.deletedOn', {
								date: formatDate(entry.deletedAt),
								name: personName(entry.deletedBy ?? '')
							})}
						</div>
						{#if entry.trashStakes.length > 0}
							<div class="muted">
								{t('trash.tokensAtDeletion', {
									list: entry.trashStakes
										.map((s: { personId: string; count: number }) => `${personName(s.personId)} ${s.count}`)
										.join(', ')
								})}
							</div>
						{:else}
							<div class="muted">{t('trash.noTokensAtDeletion')}</div>
						{/if}
					</div>
				</div>
				<div class="row">
					<button class="btn secondary" onclick={() => restore(entry.id)}>{t('trash.restore')}</button>
					<button class="btn danger" onclick={() => ((confirmPurge = entry.id), (confirmOpen = true))}
						>{t('trash.purge')}</button
					>
				</div>
			</div>
		{/each}
	</div>

	<ConfirmDialog
		bind:open={confirmOpen}
		title={t('trash.confirmPurgeTitle')}
		confirmText={t('trash.confirmPurgeButton')}
		danger
		onconfirm={() => confirmPurge !== null && purge(confirmPurge)}
	>
		{t('trash.confirmPurgeBody')}
	</ConfirmDialog>
	<p class="muted">{t('trash.restoreNote')}</p>
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

	.row {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 0.75rem;
	}
</style>
