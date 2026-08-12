<script lang="ts">
	// A coloured circle for one person: the configured emoji, otherwise the
	// initial. An empty circle would be nothing but colour and unattributable
	// without a legend, so something is always in it. The rules behind that live
	// in $lib/member, where they can be checked without a component test.
	import { getLocale } from '$lib/i18n/context';
	import { badgeCharacter, textColour, type Member } from '$lib/member';

	let {
		member,
		size = 'small',
		title = undefined
	}: { member: Member; size?: 'small' | 'medium' | 'large'; title?: string } = $props();

	const locale = getLocale();

	const character = $derived(badgeCharacter(member, locale()));
	const colour = $derived(textColour(member.color));
</script>

<span class="badge {size}" style:background={member.color} style:color={colour} title={title || undefined}
	>{character}</span
>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		font-weight: 700;
		line-height: 1;
		flex-shrink: 0;
	}

	.small {
		width: 1.15rem;
		height: 1.15rem;
		font-size: 0.62rem;
	}

	.medium {
		width: 1.7rem;
		height: 1.7rem;
		font-size: 0.85rem;
	}

	.large {
		width: 2.2rem;
		height: 2.2rem;
		font-size: 1rem;
	}
</style>
