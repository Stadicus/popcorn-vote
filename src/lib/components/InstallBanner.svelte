<script lang="ts">
	import { install } from '$lib/client/install.svelte';
	import InstallHowto from '$lib/components/InstallHowto.svelte';
	import { getI18n } from '$lib/i18n/context';

	const t = getI18n();

	let howto = $state(false);

	// Once installed there is nothing left to do; otherwise we show either the
	// real install button (Chrome) or the instructions (iPhone/iPad). Whoever
	// dismissed the notice does not get it back here — it can be recalled from
	// "more".
	const show = $derived(
		!install.standalone && !install.dismissed && (install.prompt !== null || install.iosSafari)
	);
</script>

{#if show}
	<div class="installbar">
		<span class="icon">📲</span>
		<span class="text">
			<strong>{t('install.headline')}</strong>
			<span class="sub">{t('install.sub')}</span>
		</span>
		{#if install.prompt}
			<button class="go" onclick={() => install.run()}>{t('install.action')}</button>
		{:else}
			<button class="go" onclick={() => (howto = !howto)} aria-expanded={howto}
				>{t('install.howtoAction')}</button
			>
		{/if}
		<button class="zu" onclick={() => install.dismiss()} aria-label={t('install.dismiss')}>✕</button>
	</div>

	{#if howto && !install.prompt}
		<div class="howto"><InstallHowto /></div>
	{/if}
{/if}

<style>
	.installbar {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin: 0.6rem 1rem 0;
		padding: 0.7rem 0.85rem;
		border-radius: var(--radius);
		background: var(--accent);
		color: #fff;
		box-shadow: var(--shadow);
	}

	@media (prefers-color-scheme: dark) {
		.installbar {
			color: #1c1400;
		}

		/* The button has a white surface: var(--accent) would be yellow on white
		   in dark mode, and practically unreadable. */
		.go {
			color: #1c1400;
		}
	}

	.icon {
		font-size: 1.5rem;
		line-height: 1;
	}

	.text {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
		flex: 1;
		font-size: 0.9rem;
	}

	.sub {
		font-size: 0.78rem;
		opacity: 0.85;
	}

	.go {
		flex: none;
		background: #fff;
		color: var(--accent);
		border-radius: 999px;
		padding: 0.45rem 0.9rem;
		font-weight: 700;
		font-size: 0.85rem;
		box-shadow: var(--shadow);
	}

	/* Restrained next to the install button, but with a full touch target. */
	.zu {
		flex: none;
		/* The same touch target as the round buttons in the movie list. */
		width: 2.2rem;
		height: 2.2rem;
		margin-right: -0.35rem;
		border-radius: 50%;
		font-size: 0.9rem;
		line-height: 1;
		opacity: 0.7;
	}

	.zu:hover {
		opacity: 1;
	}

	.howto {
		margin: 0.4rem 1rem 0;
	}
</style>
