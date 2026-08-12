<!--
	The Safari instructions appear in two places: in the banner on the list and in
	the recall on "more". A component of their own, so that both show the same
	wording and it cannot go stale in one of them.

	Until the interface became multilingual this sentence carried four <strong>
	elements in the markup. It is now a single catalogue entry with no emphasis:
	cutting a sentence into fragments so that a translation can reorder the markup
	is the one i18n mistake that gets worse with every language added.
-->
<script lang="ts">
	import { getI18n } from '$lib/i18n/context';

	const t = getI18n();
</script>

<div class="howto">{t('install.howto')}</div>

<style>
	.howto {
		padding: 0.7rem 0.85rem;
		border-radius: var(--radius);
		background: var(--accent-soft);
		color: var(--text);
		font-size: 0.85rem;
		line-height: 1.5;
	}
</style>
