<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { getI18n } from '$lib/i18n/context';
	import { LOCALES, LOCALE_NAMES } from '$lib/i18n/locales';

	// Per-device language choice. It sits on "more" and on the PIN page: someone
	// who cannot read the interface would otherwise never get as far as "more".
	//
	// The language names deliberately come from `locales.ts` rather than from the
	// catalogue, each written in its own language: "Deutsch" stays "Deutsch" on an
	// English screen, so that everyone recognises their own.
	let { chosen = null }: { chosen?: string | null } = $props();

	const t = getI18n();

	let busy = $state(false);
	let failed = $state(false);

	/**
	 * When the change fails, the select has to go back to the language that
	 * actually applies. Otherwise it reads "English" while the page stays German
	 *, and on the PIN page that leaves someone in front of an interface they
	 * cannot read, believing the matter is settled.
	 *
	 * Writing to the element directly is deliberate: `value={chosen}` only
	 * re-asserts itself when `chosen` changes, and on a failure it does not.
	 * Focus goes back too, because `disabled` dropped it while the request ran.
	 */
	async function change(select: HTMLSelectElement) {
		const wanted = select.value;
		busy = true;
		failed = false;
		try {
			const res = await fetch('/api/language', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ language: wanted === '' ? null : wanted })
			});
			if (!res.ok) throw new Error(`/api/language answered with ${res.status}`);
			// The server renders the page again in the new language; a second copy
			// of that state in the client would only be a second truth.
			await invalidateAll();
		} catch {
			failed = true;
			select.value = chosen ?? '';
			select.focus();
		} finally {
			busy = false;
		}
	}
</script>

<label class="langswitch">
	<span>{t('language.label')}</span>
	<select disabled={busy} value={chosen ?? ''} onchange={(event) => change(event.currentTarget)}>
		<option value="">{t('language.follow')}</option>
		{#each LOCALES as code (code)}
			<option value={code}>{LOCALE_NAMES[code]}</option>
		{/each}
	</select>
</label>
<!--
	role="alert" rather than the aria-live="polite" that Toast.svelte uses: this
	reports the failure of an action the reader just took, and the reader here may
	be the one who cannot read the screen at all.
-->
{#if failed}<p class="failed" role="alert">{t('language.changeFailed')}</p>{/if}

<style>
	.langswitch {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: 0.9rem;
	}

	.langswitch select {
		flex: 1;
		min-width: 0;
		max-width: 14rem;
	}

	.failed {
		margin: 0.4rem 0 0;
		font-size: 0.85rem;
		color: var(--danger);
	}
</style>
