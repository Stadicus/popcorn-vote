<script lang="ts">
	import { goto } from '$app/navigation';
	import { getI18n } from '$lib/i18n/context';

	const t = getI18n();
	let name = $state('');
	let pin = $state('');
	let confirmPin = $state('');
	let error = $state('');
	let busy = $state(false);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		busy = true;
		error = '';
		const response = await fetch('/api/setup', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, pin, confirmPin })
		});
		const body = await response.json().catch(() => ({}));
		if (response.ok) return goto('/', { invalidateAll: true });
		error = body.error ?? t('setup.failed');
		busy = false;
	}
</script>

<svelte:head><title>{t('setup.welcome')} · Popcorn Vote</title></svelte:head>

<main class="setup-shell">
	<section class="welcome">
		<div class="mark" aria-hidden="true">P</div>
		<p class="eyebrow">POPCORN VOTE</p>
		<h1>{t('setup.headline')}</h1>
		<p>{t('setup.intro')}</p>
	</section>
	<form class="ticket" onsubmit={submit}>
		<div class="ticket-head">
			<span>01</span><strong>{t('setup.createAdmin')}</strong>
		</div>
		<label
			>{t('settings.displayName')}<input
				bind:value={name}
				minlength="2"
				maxlength="80"
				autocomplete="name"
				required
			/></label
		>
		<label
			>PIN <input
				bind:value={pin}
				type="password"
				inputmode="numeric"
				pattern="[0-9]+"
				minlength="4"
				maxlength="4"
				autocomplete="new-password"
				required
			/></label
		>
		<label
			>{t('settings.confirmPin')}<input
				bind:value={confirmPin}
				type="password"
				inputmode="numeric"
				pattern="[0-9]+"
				minlength="4"
				maxlength="4"
				autocomplete="new-password"
				required
			/></label
		>
		<p class="hint">
			{t('setup.pinHint')}
		</p>
		{#if error}<p class="error" role="alert">{error}</p>{/if}
		<button class="btn" disabled={busy}>{busy ? '…' : t('setup.createAccount')} <span>→</span></button>
	</form>
</main>

<style>
	:global(body) {
		background: radial-gradient(circle at 15% 10%, var(--accent-soft), transparent 38%), var(--bg);
	}
	.setup-shell {
		min-height: 100vh;
		max-width: 940px;
		margin: auto;
		padding: clamp(2rem, 8vw, 6rem) 1.25rem;
		display: grid;
		gap: 3rem;
		align-items: center;
	}
	.welcome {
		max-width: 34rem;
	}
	.mark {
		display: grid;
		place-items: center;
		width: 3.25rem;
		height: 3.25rem;
		border: 3px solid var(--text);
		border-radius: 50%;
		background: var(--gold);
		font-family: Georgia, serif;
		font-size: 1.8rem;
		font-weight: 800;
		box-shadow: 0.35rem 0.35rem 0 var(--accent);
	}
	.eyebrow {
		letter-spacing: 0.18em;
		font-size: 0.72rem;
		font-weight: 800;
		color: var(--accent);
	}
	h1 {
		font-family: Georgia, serif;
		font-size: clamp(2.4rem, 8vw, 5rem);
		line-height: 0.95;
		letter-spacing: -0.04em;
		margin: 0.5rem 0 1.25rem;
	}
	.welcome > p:last-child {
		color: var(--muted);
		line-height: 1.65;
		max-width: 29rem;
	}
	.ticket {
		position: relative;
		display: grid;
		gap: 1rem;
		padding: 1.3rem;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 1.2rem;
		box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 0.12);
	}
	.ticket::before,
	.ticket::after {
		content: '';
		position: absolute;
		top: 4.1rem;
		width: 1.2rem;
		height: 1.2rem;
		border-radius: 50%;
		background: var(--bg);
	}
	.ticket::before {
		left: -0.65rem;
	}
	.ticket::after {
		right: -0.65rem;
	}
	.ticket-head {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding-bottom: 1rem;
		border-bottom: 1px dashed var(--line);
	}
	.ticket-head span {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		background: var(--accent);
		color: white;
		font-weight: 800;
	}
	label {
		display: grid;
		gap: 0.4rem;
		font-size: 0.82rem;
		font-weight: 750;
	}
	.hint {
		margin: -0.3rem 0 0.2rem;
		color: var(--muted);
		font-size: 0.78rem;
		line-height: 1.45;
	}
	.btn {
		width: 100%;
		justify-content: space-between;
	}
	@media (min-width: 760px) {
		.setup-shell {
			grid-template-columns: 1.15fr 0.85fr;
		}
	}
</style>
