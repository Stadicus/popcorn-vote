<script lang="ts">
	import { call } from '$lib/client/api';
	import { getI18n } from '$lib/i18n/context';
	import PersonBadge from './PersonBadge.svelte';

	interface Member {
		id: string;
		name: string;
		color: string;
		emoji: string;
	}

	let {
		members,
		balances = {},
		open = $bindable(),
		required = false
	}: {
		members: Member[];
		balances?: Record<string, number>;
		open: boolean;
		required?: boolean;
	} = $props();

	const t = getI18n();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	async function choose(id: string) {
		await call('/api/person', { body: { personId: id } });
		open = false;
	}

	/**
	 * A click beside the window closes it, except in the mandatory case, when
	 * nobody has been chosen yet. The click on the backdrop lands on the <dialog>
	 * itself, so it is tested against that element's rectangle. `detail === 0`
	 * means it came from the keyboard; then there are no coordinates.
	 */
	function backdropClick(event: MouseEvent) {
		if (required || !dialog || event.detail === 0) return;
		const box = dialog.getBoundingClientRect();
		const inside =
			event.clientX >= box.left &&
			event.clientX <= box.right &&
			event.clientY >= box.top &&
			event.clientY <= box.bottom;
		if (!inside) open = false;
	}
</script>

<dialog
	bind:this={dialog}
	onclick={backdropClick}
	onclose={() => (open = required ? true : false)}
	oncancel={(e) => {
		if (required) e.preventDefault();
	}}
>
	<h1>{t('person.question')}</h1>
	<p class="muted">{t('person.hint')}</p>
	<div class="people">
		{#each members as m (m.id)}
			<button class="person" onclick={() => choose(m.id)}>
				<PersonBadge member={m} size="large" />
				<span class="pname">{m.name}</span>
				<span class="tokens" title={t('person.freeTokens', { name: m.name, n: balances[m.id] ?? 0 })}>
					{balances[m.id] ?? 0}&thinsp;🍿
				</span>
			</button>
		{/each}
	</div>
</dialog>

<style>
	.people {
		display: grid;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.person {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--line);
		border-radius: 12px;
		background: var(--card2);
		font-size: 1.05rem;
		text-align: left;
	}

	.pname {
		flex: 1;
		min-width: 0;
	}

	.tokens {
		flex-shrink: 0;
		font-size: 0.9rem;
		font-weight: 600;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
	}
</style>
