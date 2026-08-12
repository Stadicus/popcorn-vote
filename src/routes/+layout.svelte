<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { clearCelebrations } from '$lib/client/celebrate';
	import { install } from '$lib/client/install.svelte';
	import { getI18n, setI18n } from '$lib/i18n/context';
	import InstallBanner from '$lib/components/InstallBanner.svelte';
	import PersonBadge from '$lib/components/PersonBadge.svelte';
	import PersonPicker from '$lib/components/PersonPicker.svelte';
	import { capReachedSentence } from '$lib/tokentext';

	let { data, children } = $props();

	// A celebration overlay is fixed to the viewport: left alone, a page change
	// would carry it — still popping — onto a page that never asked for it.
	beforeNavigate(() => clearCelebrations());

	// A getter rather than a value: on a language switch SvelteKit reloads the
	// data, and every t(…) in the tree follows along by itself.
	setI18n(() => data.locale);
	const t = getI18n();

	// The hook stamps `<html lang>` during server rendering (hooks.server.ts).
	// After an in-page switch there is no new document: every t(…) follows along,
	// but without this effect the attribute would keep the old language — and that
	// attribute is what a screen reader picks its voice from.
	$effect(() => {
		document.documentElement.lang = data.locale;
	});

	let pickerOpen = $state(false);

	// This belongs in the layout: Chrome offers the installation once per load, no
	// matter which page you happen to be on.
	onMount(() => install.listen());

	const me = $derived(data.members.find((m: { id: string }) => m.id === data.personId) ?? null);
	const needsPick = $derived(data.personId === null);

	$effect(() => {
		// Not on the PIN page and not on the TV stage: there the layout deliberately
		// hands out no person, and the PIN page navigates on from there on the
		// client — a `true` set here would pop the dialog open on the start page
		// even though somebody was chosen long ago.
		if (needsPick && !bare) pickerOpen = true;
	});

	// The TV stage is only in the bar on a monitor: on a phone the space is
	// budgeted for five entries, and there the way in is through "more". It is
	// hidden with CSS rather than with markup — otherwise the layout would have to
	// know the window width and would be guessing during server rendering.
	// The archive keeps its star; the other icons are navigation signposts.
	const tabs = [
		{ href: '/', label: 'nav.list', icon: '🎞️', desktopOnly: false },
		{ href: '/propose', label: 'nav.propose', icon: '➕', desktopOnly: false },
		{ href: '/evaluation', label: 'nav.movieNight', icon: '🍿', desktopOnly: false },
		{ href: '/archive', label: 'nav.archive', icon: '⭐', desktopOnly: false },
		{ href: '/tv', label: 'nav.tv', icon: '📺', desktopOnly: true },
		{ href: '/more', label: 'nav.more', icon: '⋯', desktopOnly: false }
	] as const;

	function isActive(href: string): boolean {
		if (href === '/') return page.url.pathname === '/';
		if (href === '/more') return ['/more', '/log', '/trash'].includes(page.url.pathname);
		// Includes '/tv'; the bar does not render there, but the rule should not
		// depend on that.
		return page.url.pathname.startsWith(href);
	}

	// Without the app frame: the PIN entry and the TV stage (for casting to a TV).
	const bare = $derived(page.url.pathname === '/pin' || page.url.pathname === '/tv');
</script>

{#if bare}
	{@render children()}
{:else}
	<header>
		<a class="title" href="/">{data.title}</a>
		{#if me}
			<button class="who" onclick={() => (pickerOpen = true)} title={t('nav.switchPerson')}>
				<PersonBadge member={me} size="medium" />
				<span class="name">{me.name}</span>
				<span class="tokens" class:full={data.balance >= data.tokenCap}>
					{data.balance}&thinsp;🍿
				</span>
			</button>
		{/if}
	</header>

	<!-- Only on the list: the notice belongs where the app first feels useful, not
	     above every sub-page. -->
	{#if page.url.pathname === '/'}
		<InstallBanner />
	{/if}

	{#if me && data.balance >= data.tokenCap}
		<div class="capnote">
			{capReachedSentence(t, data.locale, {
				amount: data.tokenAmount,
				weekday: data.tokenWeekday,
				hour: data.tokenHour,
				cap: data.tokenCap
			})}
		</div>
	{/if}

	<!-- The movie list is a poster grid and may use up a wide monitor; text pages
	     stay narrow so the lines remain short enough to read. -->
	<main class:wide={page.url.pathname === '/'}>
		{@render children()}
	</main>

	<nav>
		{#each tabs as tab (tab.href)}
			<a href={tab.href} class:active={isActive(tab.href)} class:desktopOnly={tab.desktopOnly}>
				<span class="icon">{tab.icon}</span>
				<span>{t(tab.label)}</span>
			</a>
		{/each}
	</nav>

	<PersonPicker members={data.members} balances={data.balances} bind:open={pickerOpen} required={needsPick} />
{/if}

<style>
	header {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: calc(0.6rem + env(safe-area-inset-top)) 1rem 0.6rem;
		background: var(--bg);
		border-bottom: 1px solid var(--line);
	}

	.title {
		font-weight: 700;
		font-size: 1.05rem;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 999px;
		padding: 0.25rem 0.6rem 0.25rem 0.3rem;
	}

	.name {
		font-weight: 600;
		font-size: 0.9rem;
	}

	.tokens {
		font-size: 0.85rem;
		background: var(--card2);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}

	.tokens.full {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 700;
	}

	.capnote {
		margin: 0.6rem 1rem 0;
		padding: 0.5rem 0.75rem;
		border-radius: 10px;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 0.85rem;
	}

	main {
		padding: 1rem 1rem calc(4.5rem + env(safe-area-inset-bottom));
		max-width: 720px;
		margin: 0 auto;
	}

	main.wide {
		max-width: 1600px;
	}

	/* On a monitor the content must not cling to the edges. On a phone it stays at
	   1 rem — there every millimetre of width is content. */
	@media (min-width: 900px) {
		main {
			padding: 2rem 2rem calc(4.5rem + env(safe-area-inset-bottom));
		}
	}

	nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 10;
		display: flex;
		justify-content: space-around;
		background: var(--card);
		border-top: 1px solid var(--line);
		padding: 0.3rem 0 calc(0.3rem + env(safe-area-inset-bottom));
	}

	nav a {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		font-size: 0.7rem;
		color: var(--muted);
		/* Narrower than before, so that even the long "Movie Night" fits on one line
		   next to the other four entries on small phones. */
		padding: 0.25rem 0.5rem;
		border-radius: 10px;
		white-space: nowrap;
	}

	nav a.active {
		color: var(--accent);
		font-weight: 700;
	}

	nav a.desktopOnly {
		display: none;
	}

	nav .icon {
		font-size: 1.15rem;
	}

	@media (min-width: 900px) {
		nav a.desktopOnly {
			display: flex;
		}
	}
</style>
