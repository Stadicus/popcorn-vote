<script lang="ts">
	import { getI18n } from '$lib/i18n/context';

	let {
		src,
		title,
		size = 'grid'
	}: { src: string | null; title: string; size?: 'grid' | 'small' | 'large' } = $props();

	const t = getI18n();
</script>

{#if src}
	<img class={size} {src} alt={t('poster.alt', { title })} loading="lazy" />
{:else}
	<!-- role="img" belongs with it: without the role the aria-label does not
	     replace the title in the child element, it competes with it. -->
	<div class="placeholder {size}" role="img" aria-label={t('poster.none')}>
		<span>🎞️</span>
		<span class="t">{title}</span>
	</div>
{/if}

<style>
	img,
	.placeholder {
		width: 100%;
		aspect-ratio: 2 / 3;
		object-fit: cover;
		border-radius: 10px;
		background: var(--card2);
		display: block;
	}

	img.small,
	.placeholder.small {
		width: 3.4rem;
		border-radius: 6px;
	}

	.placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		color: var(--muted);
		font-size: 1.6rem;
		padding: 0.4rem;
	}

	.placeholder .t {
		font-size: 0.65rem;
		text-align: center;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
	}

	.placeholder.small .t {
		display: none;
	}

	.placeholder.small {
		font-size: 1.1rem;
	}
</style>
