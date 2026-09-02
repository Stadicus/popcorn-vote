<script lang="ts">
	// Who is not here tonight, as a row of people rather than a form. Tapping a
	// chip switches that person off; the chip dims and strikes through, which is
	// the whole feedback. Nobody is switched off to begin with, so a family where
	// everybody is present never has to touch this.
	//
	// The same row appears on the evaluation page and in the free-pick dialog, and
	// both mean exactly the same thing, so it lives in one component.
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

<div class="picker">
	<p class="hint muted">{t('evaluation.absentHint')}</p>
	<div class="chips">
		{#each members as m (m.id)}
			{@const here = !absent.includes(m.id)}
			<button type="button" class="chip" class:away={!here} aria-pressed={here} onclick={() => toggle(m.id)}>
				<PersonBadge member={m} />
				<span class="cname">{m.name}</span>
			</button>
		{/each}
	</div>
</div>

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

	/* Switched off: dimmed and struck through, so the row reads at a glance as
	   "these two are not here" without anybody having to count the bright ones. */
	.chip.away {
		opacity: 0.45;
	}

	.chip.away .cname {
		text-decoration: line-through;
	}
</style>
