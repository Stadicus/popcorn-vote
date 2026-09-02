<script lang="ts">
	// Who is not here tonight: a button that opens a row of people, and the row
	// itself. Tapping a chip marks that person as away; the chip dims and strikes
	// through, which is the whole feedback. Nobody is marked to begin with, so a
	// family where everybody is present never has to touch this.
	//
	// Button and row travel together on purpose. The evaluation page and the
	// free-pick dialog both need exactly this pair, and splitting them would leave
	// the same open-state and the same click handler copied into two places to be
	// kept in step by hand.
	import { getI18n } from '$lib/i18n/context';
	import PersonBadge from './PersonBadge.svelte';

	interface Person {
		id: string;
		name: string;
		color: string;
		emoji: string;
	}

	let { members, absent = $bindable() }: { members: Person[]; absent: string[] } = $props();

	const t = getI18n();

	// Whoever has ticked somebody off keeps the row in view: the selection has to
	// stay visible while the page around it recounts.
	let open = $state(false);
	const shown = $derived(open || absent.length > 0);

	/** Second tap on the button is "everybody is here" once anybody is marked. */
	function toggleRow() {
		if (absent.length > 0) {
			absent = [];
			open = false;
			return;
		}
		open = !open;
	}

	/**
	 * Kept in the order the family is configured in, not in the order the chips
	 * were tapped: the same two people then read the same way in the confirmation,
	 * in the ranking and in the archive.
	 */
	function toggle(id: string) {
		const away = absent.includes(id) ? absent.filter((other) => other !== id) : [...absent, id];
		absent = members.filter((m) => away.includes(m.id)).map((m) => m.id);
	}
</script>

<button type="button" class="btn secondary" aria-expanded={shown} onclick={toggleRow}>
	👥 {absent.length > 0 ? t('evaluation.everyoneHere') : t('evaluation.absentButton')}
</button>

{#if shown}
	<div class="picker">
		<p class="hint muted">{t('evaluation.absentHint')}</p>
		<div class="chips">
			{#each members as m (m.id)}
				{@const away = absent.includes(m.id)}
				<!-- Pressed means "marked as away", which is what tapping this button
				     does. The dimmed, struck-through chip is that state made visible. -->
				<button type="button" class="chip" class:away aria-pressed={away} onclick={() => toggle(m.id)}>
					<PersonBadge member={m} />
					<span class="cname">{m.name}</span>
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.hint {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.7rem 0.35rem 0.4rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		background: var(--card2);
		font-size: 0.9rem;
		font-weight: 600;
	}

	/* Marked as away: dimmed and struck through, so the row reads at a glance as
	   "these two are not here" without anybody having to count the bright ones. */
	.chip.away {
		opacity: 0.45;
	}

	.chip.away .cname {
		text-decoration: line-through;
	}
</style>
