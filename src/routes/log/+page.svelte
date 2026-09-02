<script lang="ts">
	import type { MessageKey } from '$lib/i18n/catalogues';
	import { getI18n, getLocale } from '$lib/i18n/context';
	import { listNames } from '$lib/member';
	import type { BlockedMovie } from '$lib/standings';

	let { data } = $props();

	const t = getI18n();
	const locale = getLocale();

	function personName(id: string): string {
		return data.members.find((m: { id: string }) => m.id === id)?.name ?? id;
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleString(locale(), {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Symbol and text kept apart: the emoji lives in the markup, only the word is translated.
	const headlines: Record<string, { icon: string; key: MessageKey }> = {
		evaluation: { icon: '🏆', key: 'log.evaluation' },
		free_pick: { icon: '✨', key: 'log.freePick' },
		reverted: { icon: '↩️', key: 'log.reverted' },
		watched: { icon: '✅', key: 'log.watched' },
		proposer_changed: { icon: '🔀', key: 'log.proposerChanged' }
	};

	function headline(type: string): string {
		const entry = headlines[type];
		return entry ? `${entry.icon} ${t(entry.key)}` : type;
	}

	/**
	 * The two fields a partial night adds to an evaluation or a free pick. Entries
	 * written before the feature existed simply carry neither, so both are read
	 * defensively, the way `standings` already is.
	 */
	function absentIn(payload: Record<string, unknown>): string[] {
		return Array.isArray(payload.absent) ? (payload.absent as string[]) : [];
	}

	function blockedIn(payload: Record<string, unknown>): BlockedMovie[] {
		return Array.isArray(payload.blocked) ? (payload.blocked as BlockedMovie[]) : [];
	}
</script>

<svelte:head><title>{t('log.title')}</title></svelte:head>

<h1>{t('log.title')}</h1>

{#if data.events.length === 0}
	<div class="empty">
		<span class="big">📜</span>{t('log.empty')}
	</div>
{:else}
	<div class="list">
		{#each data.events as event (event.id)}
			<div class="card">
				<div class="head">
					<strong>{headline(event.type)}</strong>
					<span class="muted">{formatDate(event.createdAt)}</span>
				</div>
				<div class="muted">{t('log.triggeredBy', { name: personName(event.actor) })}</div>

				{#if event.type === 'evaluation' || event.type === 'free_pick'}
					{@const absent = absentIn(event.payload)}
					{@const blocked = blockedIn(event.payload)}
					<div class="body">
						{#if event.type === 'free_pick'}
							<p>{t('log.freePickBody', { title: String(event.payload.winnerTitle) })}</p>
						{:else}
							<p>{t('log.winner', { title: String(event.payload.winnerTitle) })}</p>
						{/if}
						{#if absent.length > 0}
							<p class="muted">{t('log.without', { names: listNames(data.members, absent, locale()) })}</p>
						{/if}
						{#if blocked.length > 0}
							<p class="muted">
								{t('log.blocked', { titles: blocked.map((b) => b.title).join(', ') })}
							</p>
						{/if}
						{#if event.payload.wheel}
							{@const wheel = event.payload.wheel as { candidates: { title: string }[]; result: string }}
							<p class="muted">
								{t('log.wheelNote', {
									candidates: wheel.candidates.map((c) => c.title).join(', '),
									result: wheel.result
								})}
							</p>
						{/if}
						{#if Array.isArray(event.payload.standings) && event.payload.standings.length > 0}
							<details>
								<summary class="muted">{t('log.standingsAt')}</summary>
								<ul>
									<!-- Keyed on the position, not on the title: titles come from the family
									     and two films may carry the same one, which a keyed each answers by
									     throwing on every visit from then on. The order is fixed once the event
									     is written, so the position is the stable identity here. -->
									{#each event.payload.standings as { movieId, title, tokens }, i (i)}
										<!-- On a partial night these counts are the votes of whoever was there,
										     so a movie that waited has to be marked as such or its number reads
										     as a defeat it never suffered. -->
										{@const waited = blocked.find((b) => b.movieId === movieId)}
										<li class:waiting={waited}>
											{title}: {#if waited}{t('evaluation.waitingFor', {
													names: listNames(data.members, waited.byPersonIds, locale())
												})}{:else}{tokens} 🍿{/if}
										</li>
									{/each}
								</ul>
							</details>
						{/if}
					</div>
				{:else if event.type === 'proposer_changed'}
					<div class="body">
						<p>
							{t('log.proposerChangedBody', {
								title: String(event.payload.title),
								from: personName(String(event.payload.fromPersonId)),
								to: personName(String(event.payload.toPersonId))
							})}
						</p>
					</div>
				{:else}
					<div class="body"><p><strong>{String(event.payload.title)}</strong></p></div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.list {
		display: grid;
		gap: 0.75rem;
	}

	.head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 0.5rem;
	}

	.body {
		margin-top: 0.4rem;
	}

	.body p {
		margin: 0.25rem 0;
	}

	details {
		margin-top: 0.4rem;
	}

	details ul {
		margin: 0.4rem 0 0;
		padding-left: 1.2rem;
	}

	li.waiting {
		color: var(--muted);
	}
</style>
