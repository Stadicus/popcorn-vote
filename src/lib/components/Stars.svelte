<script lang="ts">
	// Shows, and optionally takes, 1–5 stars in half steps. Half stars come from a
	// width-clipped overlay row, that works on every device.
	import { getI18n, getLocale } from '$lib/i18n/context';

	let {
		value = null,
		onchange = null,
		size = '1.2rem'
	}: { value: number | null; onchange?: ((stars: number) => void) | null; size?: string } = $props();

	const t = getI18n();
	const locale = getLocale();

	const pct = $derived(value == null ? 0 : (value / 5) * 100);

	/** "4,5" in German, "4.5" in English, what is read out is what is written. */
	const number = (value: number) => value.toLocaleString(locale());
</script>

<span class="wrap" style:font-size={size}>
	<span class="base" aria-hidden="true">★★★★★</span>
	<span class="fill" style:width="{pct}%" aria-hidden="true">★★★★★</span>
	{#if onchange}
		<span class="hits">
			{#each [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as step (step)}
				<button
					aria-label={t('stars.label', { value: number(step) })}
					onclick={() => onchange?.(Math.max(1, step))}
				></button>
			{/each}
		</span>
	{/if}
	<span class="sr">{value == null ? t('stars.none') : t('stars.value', { value: number(value) })}</span>
</span>

<style>
	.wrap {
		position: relative;
		display: inline-block;
		line-height: 1;
		letter-spacing: 0.05em;
		white-space: nowrap;
	}

	.base {
		color: var(--line);
	}

	.fill {
		position: absolute;
		left: 0;
		top: 0;
		overflow: hidden;
		color: var(--accent);
		pointer-events: none;
	}

	.hits {
		position: absolute;
		inset: 0;
		display: flex;
	}

	.hits button {
		flex: 1;
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
