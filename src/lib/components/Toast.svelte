<script lang="ts">
	// A floating error message: shifts no layout, disappears by itself.
	//
	// Unless `hold` is set, which the caller does when the message names a
	// reference. Those are eight characters somebody is meant to pass on, and
	// four seconds is not enough to read them, let alone write them down. A
	// message that asks to be quoted waits to be dismissed.
	let { message = $bindable(), hold = false }: { message: string; hold?: boolean } = $props();

	$effect(() => {
		if (!message || hold) return;
		const t = setTimeout(() => (message = ''), 4000);
		return () => clearTimeout(t);
	});
</script>

<!-- The live region stays in the document and only its content changes. Mounted
     together with its text, most screen readers announce nothing at all — and
     since the message may now carry the one thing worth passing on, it has to be
     heard. -->
<div class="region" aria-live="polite">
	{#if message}
		<button class="toast" onclick={() => (message = '')}>
			{message}
		</button>
	{/if}
</div>

<style>
	/* The region itself takes no room and catches no clicks; only the message
	   inside it does, and that one places itself. */
	.region:empty {
		display: contents;
	}

	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(4.5rem + env(safe-area-inset-bottom));
		transform: translateX(-50%);
		z-index: 50;
		max-width: min(92vw, 480px);
		background: var(--danger);
		color: #fff;
		padding: 0.6rem 1rem;
		border-radius: 12px;
		box-shadow: 0 4px 20px rgb(0 0 0 / 0.35);
		font-size: 0.9rem;
		text-align: center;
	}
</style>
