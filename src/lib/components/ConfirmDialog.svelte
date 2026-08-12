<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getI18n } from '$lib/i18n/context';

	// One confirmation modal for all of them: floats above the page, shifts no layout.
	let {
		open = $bindable(),
		title,
		confirmText,
		danger = false,
		busy = false,
		onconfirm,
		children
	}: {
		open: boolean;
		title: string;
		confirmText: string;
		danger?: boolean;
		busy?: boolean;
		onconfirm: () => void;
		children: Snippet;
	} = $props();

	const t = getI18n();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	/**
	 * A click beside the window cancels — like "cancel" and like the Esc key. The
	 * click on the backdrop lands on the <dialog> itself, so it is tested against
	 * that element's rectangle. `detail === 0` means it came from the keyboard;
	 * then there are no coordinates and nothing may be closed.
	 */
	function backdropClick(event: MouseEvent) {
		if (!dialog || event.detail === 0) return;
		const box = dialog.getBoundingClientRect();
		const inside =
			event.clientX >= box.left &&
			event.clientX <= box.right &&
			event.clientY >= box.top &&
			event.clientY <= box.bottom;
		if (!inside) open = false;
	}
</script>

<dialog bind:this={dialog} onclick={backdropClick} onclose={() => (open = false)}>
	<h1>{title}</h1>
	<div class="body">{@render children()}</div>
	<div class="row">
		<button class="btn secondary" onclick={() => (open = false)}>{t('dialog.cancel')}</button>
		<button class="btn" class:danger disabled={busy} onclick={onconfirm}>{confirmText}</button>
	</div>
</dialog>

<style>
	h1 {
		font-size: 1.1rem;
	}

	.body {
		line-height: 1.55;
	}

	.row {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
		margin-top: 1.25rem;
	}
</style>
