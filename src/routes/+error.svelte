<script lang="ts">
	import { page } from '$app/state';
	import { getI18n } from '$lib/i18n/context';

	const t = getI18n();

	const notFound = $derived(page.status === 404);

	const message = $derived(page.error?.message);
	const explained = $derived(notFound && message && message !== 'Not Found' ? message : null);

	const heading = $derived(notFound ? t('error.notFound') : t('error.somethingWrong'));
	const hint = $derived(explained ?? (notFound ? t('error.notFoundHint') : t('error.somethingWrongHint')));

	const reference = $derived(page.error?.reference);
</script>

<svelte:head><title>{heading}</title></svelte:head>

<h1>{heading}</h1>

<p class="hint">{hint}</p>

<p><a class="btn" href="/">{t('error.backToList')}</a></p>

{#if reference}
	<p class="reference">{t('error.reference', { reference })}</p>
{/if}

<style>
	.reference {
		margin-top: 1.6rem;
		font-size: 0.8rem;
		color: var(--muted);
	}

	.hint {
		color: var(--muted);
		margin-bottom: 1.4rem;
	}
</style>
