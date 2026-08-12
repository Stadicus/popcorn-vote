<script lang="ts">
	import { goto } from '$app/navigation';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';
	import { getI18n } from '$lib/i18n/context';

	let { data } = $props();

	const t = getI18n();

	let digits = $state('');
	let error = $state('');
	let wait = $state(0); // taken from data.waitSeconds in the $effect
	let busy = $state(false);
	let ticker: ReturnType<typeof setInterval> | undefined;

	function startCountdown(seconds: number) {
		wait = seconds;
		clearInterval(ticker);
		if (seconds <= 0) return;
		ticker = setInterval(() => {
			wait = Math.max(0, wait - 1);
			if (wait === 0) clearInterval(ticker);
		}, 1000);
	}

	$effect(() => {
		startCountdown(data.waitSeconds);
		return () => clearInterval(ticker);
	});

	function press(digit: string) {
		if (busy || wait > 0 || digits.length >= 4) return;
		error = '';
		digits += digit;
		if (digits.length === 4) submit();
	}

	/** ⌫: take back the last digit; with no digits nothing happens. */
	function backspace() {
		if (busy) return;
		digits = digits.slice(0, -1);
		error = '';
	}

	/**
	 * On a laptop, or with a keyboard attached, "2611" should simply be typeable.
	 * The number row and the numeric keypad both deliver event.key = "0".."9".
	 */
	function onKeydown(event: KeyboardEvent) {
		if (!data.pinConfigured || event.metaKey || event.ctrlKey || event.altKey) return;
		if (/^[0-9]$/.test(event.key)) {
			event.preventDefault();
			press(event.key);
		} else if (event.key === 'Backspace') {
			event.preventDefault();
			backspace();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			digits = '';
			error = '';
		}
	}

	async function submit() {
		busy = true;
		try {
			const res = await fetch('/api/pin', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pin: digits })
			});
			const body = await res.json().catch(() => ({}));
			if (res.ok) {
				await goto('/', { invalidateAll: true });
				return;
			}
			error = body.error ?? t('pin.failed');
			if (body.waitSeconds > 0) startCountdown(body.waitSeconds);
		} catch {
			error = t('error.offline');
		}
		digits = '';
		busy = false;
	}
</script>

<svelte:head><title>{t('pin.title')}</title></svelte:head>

<svelte:window onkeydown={onKeydown} />

<div class="wrap">
	<div class="logo">🍿</div>
	<h1>{t('app.name')}</h1>

	{#if !data.pinConfigured}
		<div class="card notice">
			{t('pin.notConfigured', { file: 'config.yaml', key: 'pin', env: 'PV_PIN' })}
		</div>
	{:else}
		<p class="muted">{t('pin.hint')}</p>

		<div class="dots" aria-label={t('pin.entryLabel')}>
			{#each [0, 1, 2, 3] as i (i)}
				<span class="pindot" class:filled={digits.length > i}></span>
			{/each}
		</div>

		{#if error}<p class="error">{error}</p>{/if}
		{#if wait > 0}<p class="error">{t('pin.retryIn', { n: wait })}</p>{/if}

		<div class="pad">
			{#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as d (d)}
				<button onclick={() => press(d)} disabled={busy || wait > 0}>{d}</button>
			{/each}
			<button class="ghost" onclick={backspace} disabled={busy}>⌫</button>
			<button onclick={() => press('0')} disabled={busy || wait > 0}>0</button>
			<span></span>
		</div>
	{/if}

	<!-- Has to be reachable before signing in: a household that does not read the
	     configured language would otherwise face a lock screen with no way past it
	     — exactly the problem the multilingual interface exists to solve. -->
	<div class="lang"><LanguageSwitch chosen={data.languageChoice} /></div>
</div>

<style>
	.wrap {
		min-height: 80vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		text-align: center;
		padding: 1rem;
	}

	.logo {
		font-size: 3rem;
	}

	.notice {
		max-width: 26rem;
		line-height: 1.6;
		text-align: left;
	}

	.dots {
		display: flex;
		gap: 0.9rem;
		margin: 0.75rem 0;
	}

	.pindot {
		width: 1rem;
		height: 1rem;
		border-radius: 50%;
		border: 2px solid var(--muted);
	}

	.pindot.filled {
		background: var(--accent);
		border-color: var(--accent);
	}

	.pad {
		display: grid;
		grid-template-columns: repeat(3, 4.4rem);
		gap: 0.6rem;
		margin-top: 0.5rem;
	}

	.pad button {
		height: 4.4rem;
		border-radius: 50%;
		background: var(--card);
		border: 1px solid var(--line);
		font-size: 1.5rem;
		font-weight: 600;
		box-shadow: var(--shadow);
	}

	.pad button:active {
		background: var(--card2);
	}

	.pad button:disabled {
		opacity: 0.4;
	}

	.pad .ghost {
		background: none;
		border: none;
		box-shadow: none;
	}

	/* Restrained, below the keypad: whoever needs the language finds it, and
	   whoever knows the PIN is not distracted by it. */
	.lang {
		margin-top: 2rem;
		opacity: 0.75;
		font-size: 0.85rem;
	}
</style>
