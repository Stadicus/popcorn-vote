<script lang="ts">
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { getI18n } from '$lib/i18n/context';
	import LanguageSwitch from '$lib/components/LanguageSwitch.svelte';

	const t = getI18n();
	let { data } = $props();
	const weekdays = $derived(
		Array.from({ length: 7 }, (_, day) =>
			new Intl.DateTimeFormat(data.locale, { weekday: 'long', timeZone: 'UTC' }).format(
				new Date(Date.UTC(2024, 0, 7 + day))
			)
		)
	);
	let title = $state('Popcorn Vote');
	let members = $state(['']);
	let pin = $state('');
	let confirmPin = $state('');
	let tokenAmount = $state(1);
	let tokenWeekday = $state(0);
	let tokenHour = $state(8);
	let tokenCap = $state(5);
	let tokenStart = $state(3);
	let timezone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Zurich');
	let sources = $state('Netflix, Google, Server');
	let tmdbApiKey = $state('');
	let omdbApiKey = $state('');
	const localeDefaults: Record<string, { movie: string; country: string; trailers: string }> = {
		en: { movie: 'en-US', country: 'US', trailers: 'original,en' },
		de: { movie: 'de-DE', country: 'DE', trailers: 'original,de,en' },
		es: { movie: 'es-ES', country: 'ES', trailers: 'original,es,en' },
		fr: { movie: 'fr-FR', country: 'FR', trailers: 'original,fr,en' },
		'pt-BR': { movie: 'pt-BR', country: 'BR', trailers: 'original,pt,en' },
		it: { movie: 'it-IT', country: 'IT', trailers: 'original,it,en' },
		pl: { movie: 'pl-PL', country: 'PL', trailers: 'original,pl,en' },
		tr: { movie: 'tr-TR', country: 'TR', trailers: 'original,tr,en' },
		ja: { movie: 'ja-JP', country: 'JP', trailers: 'original,ja,en' }
	};
	const movieLanguages = [
		['en-US', 'English (en-US)'],
		['de-DE', 'Deutsch (de-DE)'],
		['es-ES', 'Español (es-ES)'],
		['fr-FR', 'Français (fr-FR)'],
		['pt-BR', 'Português (pt-BR)'],
		['it-IT', 'Italiano (it-IT)'],
		['pl-PL', 'Polski (pl-PL)'],
		['tr-TR', 'T\u00fcrk\u00e7e (tr-TR)'],
		['ja-JP', '日本語 (ja-JP)']
	] as const;
	const countries = [
		['US', 'United States (US)'],
		['DE', 'Deutschland (DE)'],
		['CH', 'Schweiz (CH)'],
		['AT', '\u00d6sterreich (AT)'],
		['ES', 'España (ES)'],
		['FR', 'France (FR)'],
		['BR', 'Brasil (BR)'],
		['IT', 'Italia (IT)'],
		['PL', 'Polska (PL)'],
		['TR', 'T\u00fcrkiye (TR)'],
		['JP', '日本 (JP)'],
		['GB', 'United Kingdom (GB)']
	] as const;
	function utcOffset(zone: string): string {
		const name =
			new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' })
				.formatToParts(new Date())
				.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
		return name.replace('GMT', 'UTC').replace(/^UTC$/, 'UTC+00:00');
	}
	const timezones = (
		typeof Intl.supportedValuesOf === 'function'
			? Intl.supportedValuesOf('timeZone')
			: ['UTC', 'Europe/Zurich', 'Europe/Berlin', 'America/New_York', 'Asia/Tokyo']
	)
		.map((zone) => ({ zone, offset: utcOffset(zone) }))
		.sort((a, b) => a.offset.localeCompare(b.offset) || a.zone.localeCompare(b.zone));
	const localeDefault = untrack(() => localeDefaults[data.locale] ?? localeDefaults.en);
	let movieLanguage = $state('latin');
	let movieFallbackLanguage = $state(localeDefault.movie);
	let certificationCountry = $state(localeDefault.country);
	let trailerLanguages = $state(localeDefault.trailers);
	let error = $state('');
	let busy = $state(false);

	function addMember() {
		members = [...members, ''];
	}

	function removeMember(index: number) {
		if (members.length > 1) members = members.filter((_, current) => current !== index);
	}

	function pinInput(event: Event, confirmation = false) {
		const input = event.currentTarget as HTMLInputElement;
		const digits = input.value.replace(/\D/g, '').slice(0, 4);
		input.value = digits;
		if (confirmation) confirmPin = digits;
		else pin = digits;
		const completeMismatch = confirmPin.length === 4 && pin.length === 4 && pin !== confirmPin;
		if (completeMismatch) error = t('settings.errorPinMismatch');
		else if (error === t('settings.errorPin') || error === t('settings.errorPinMismatch')) error = '';
	}

	function fail(message: string, selector: string): false {
		error = message;
		requestAnimationFrame(() => {
			const field = document.querySelector<HTMLElement>(selector);
			field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			field?.focus({ preventScroll: true });
		});
		return false;
	}

	function locallyValid(): boolean {
		if (!title.trim()) {
			return fail(t('settings.errorInstanceName'), '#setup-instance-name');
		}
		if (!/^\d{4}$/.test(pin)) {
			return fail(t('settings.errorPin'), '#setup-family-pin');
		}
		if (pin !== confirmPin) {
			return fail(t('settings.errorPinMismatch'), '#setup-confirm-pin');
		}
		const cleanedMembers = members.map((member) => member.trim());
		if (
			cleanedMembers.some((member) => member.length < 2) ||
			new Set(cleanedMembers.map((member) => member.toLocaleLowerCase('en'))).size !== cleanedMembers.length
		) {
			return fail(t('setup.errorMembers'), '[data-member-invalid="true"]');
		}
		if (!sources.split(',').some((source) => source.trim())) {
			return fail(t('setup.errorSources'), '#setup-sources');
		}
		if (!data.tmdbConfigured && !tmdbApiKey.trim()) {
			return fail(t('setup.errorMovieKeys'), '#setup-tmdb-key');
		}
		if (
			(movieLanguage === 'latin' && !movieFallbackLanguage) ||
			!/^[A-Za-z]{2}$/.test(certificationCountry) ||
			!trailerLanguages.trim()
		) {
			return fail(t('setup.errorMovieLanguages'), '#setup-movie-language');
		}
		return true;
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = '';
		if (!locallyValid()) return;
		busy = true;
		try {
			const response = await fetch('/api/setup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title,
					members,
					pin,
					confirmPin,
					tokenAmount,
					tokenWeekday,
					tokenHour,
					tokenCap,
					tokenStart,
					timezone,
					sources: sources.split(','),
					tmdbApiKey,
					omdbApiKey,
					interfaceLanguage: data.locale,
					movieLanguage,
					movieFallbackLanguage,
					certificationCountry,
					trailerLanguages: trailerLanguages.split(',')
				})
			});
			const body = await response.json().catch(() => ({}));
			if (response.ok) return goto('/', { invalidateAll: true });
			error = body.error ?? t('setup.failed');
		} catch {
			error = t('error.offline');
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head><title>{t('setup.welcome')} · Popcorn Vote</title></svelte:head>

<div class="setup-page">
	<header class="site-head">
		<div class="brand"><span aria-hidden="true">🍿</span><strong>Popcorn Vote</strong></div>
		<div class="language"><LanguageSwitch chosen={data.languageChoice} allowAppDefault={false} /></div>
	</header>

	<main class="setup-shell">
		<section class="welcome" aria-labelledby="setup-title">
			<p class="eyebrow">{t('setup.welcome')}</p>
			<h1 id="setup-title">{t('setup.headline')}</h1>
			<p>{t('setup.intro')}</p>
		</section>

		<form class="ticket" novalidate onsubmit={submit}>
			<fieldset>
				<legend><span>01</span>{t('setup.family')}</legend>
				<div class="form-grid two">
					<label
						>{t('settings.instanceName')}<input
							id="setup-instance-name"
							bind:value={title}
							maxlength="80"
						/></label
					>
					<label
						>{t('setup.familyPin')}<input
							id="setup-family-pin"
							value={pin}
							oninput={pinInput}
							type="password"
							inputmode="numeric"
							maxlength="4"
							autocomplete="new-password"
							aria-describedby="family-pin-hint setup-error"
							aria-invalid={error === t('settings.errorPin')}
						/></label
					>
					<label
						>{t('settings.confirmPin')}<input
							id="setup-confirm-pin"
							value={confirmPin}
							oninput={(event) => pinInput(event, true)}
							type="password"
							inputmode="numeric"
							maxlength="4"
							autocomplete="new-password"
							aria-describedby="family-pin-hint setup-error"
							aria-invalid={error === t('settings.errorPinMismatch')}
						/></label
					>
				</div>
				<p class="hint" id="family-pin-hint">{t('setup.pinHint')}</p>
				{#if error === t('settings.errorPin') || error === t('settings.errorPinMismatch')}
					<p class="inline-error" id="setup-error" role="alert">{error}</p>
				{/if}
			</fieldset>

			<fieldset>
				<legend><span>02</span>{t('setup.members')}</legend>
				<p class="hint">{t('setup.membersHint')}</p>
				{#each members as _, index (index)}
					<div class="member-row">
						<label
							>{t('setup.memberName')}
							<input
								bind:value={members[index]}
								data-member-invalid={members[index].trim().length < 2 ||
									members.some(
										(member, other) =>
											other !== index &&
											member.trim().toLocaleLowerCase('en') === members[index].trim().toLocaleLowerCase('en')
									)}
								minlength="2"
								maxlength="80"
							/></label
						>
						{#if members.length > 1}
							<button
								type="button"
								class="remove"
								aria-label={t('setup.removeMember')}
								onclick={() => removeMember(index)}>×</button
							>
						{/if}
					</div>
				{/each}
				<button type="button" class="add" onclick={addMember}>＋ {t('setup.addMember')}</button>
			</fieldset>

			<fieldset>
				<legend><span>03</span>{t('setup.movieData')}</legend>
				<p class="hint">{t('setup.movieDataHint')}</p>
				<div class="form-grid two key-grid">
					{#if data.tmdbConfigured}
						<p class="configured">✓ {t('setup.tmdbConfigured')}</p>
					{:else}
						<label
							>{t('setup.tmdbKey')}<input
								id="setup-tmdb-key"
								bind:value={tmdbApiKey}
								type="password"
								autocomplete="off"
								spellcheck="false"
							/></label
						>
					{/if}
					{#if data.omdbConfigured}
						<p class="configured">✓ {t('setup.omdbConfigured')}</p>
					{:else}
						<label
							>{t('setup.omdbKey')} <span class="optional">{t('setup.optional')}</span><input
								id="setup-omdb-key"
								bind:value={omdbApiKey}
								type="password"
								autocomplete="off"
								spellcheck="false"
							/></label
						>
					{/if}
				</div>
				<p class="key-links">
					<a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noreferrer"
						>{t('setup.getTmdbKey')} ↗</a
					>
					<a href="https://www.omdbapi.com/apikey.aspx" target="_blank" rel="noreferrer"
						>{t('setup.getOmdbKey')} ↗</a
					>
				</p>
				<hr />
				<section class="rule-group" aria-labelledby="movie-language-heading">
					<h3 id="movie-language-heading">{t('setup.movieLanguages')}</h3>
					<div class="form-grid two language-grid">
						<label
							>{t('setup.movieLanguage')}<select id="setup-movie-language" bind:value={movieLanguage}>
								<option value="latin">{t('setup.movieLanguageLatin')}</option>
								<option value="original">{t('setup.movieLanguageOriginal')}</option>
								{#each movieLanguages as [value, label] (value)}<option {value}>{label}</option>{/each}
							</select></label
						>
						<label class:inactive={movieLanguage !== 'latin'}
							>{t('setup.movieFallbackLanguage')}<select
								bind:value={movieFallbackLanguage}
								disabled={movieLanguage !== 'latin'}
							>
								{#each movieLanguages as [value, label] (value)}<option {value}>{label}</option>{/each}
							</select></label
						>
						<label>
							{t('setup.certificationCountry')}
							<select bind:value={certificationCountry}>
								{#each countries as [value, label] (value)}<option {value}>{label}</option>{/each}
							</select>
						</label>
						<label>{t('setup.trailerLanguages')}<input bind:value={trailerLanguages} /></label>
					</div>
					<p class="hint">{t('setup.movieLanguagesHint')}</p>
				</section>
			</fieldset>

			<fieldset>
				<legend><span>04</span>{t('setup.rules')}</legend>
				<section class="rule-group" aria-labelledby="rules-votes">
					<h3 id="rules-votes">{t('setup.rulesVotes')}</h3>
					<div class="form-grid three">
						<label
							>{t('setup.startTokens')}<input bind:value={tokenStart} type="number" min="0" max="99" /></label
						>
						<label
							>{t('setup.tokensPerCredit')}<input
								bind:value={tokenAmount}
								type="number"
								min="1"
								max="99"
							/></label
						>
						<label>{t('setup.tokenCap')}<input bind:value={tokenCap} type="number" min="1" max="99" /></label>
					</div>
				</section>
				<hr />
				<section class="rule-group" aria-labelledby="rules-schedule">
					<h3 id="rules-schedule">{t('setup.rulesSchedule')}</h3>
					<div class="form-grid three">
						<label
							>{t('setup.creditDay')}<select bind:value={tokenWeekday}
								>{#each weekdays as weekday, index (index)}<option value={index}>{weekday}</option
									>{/each}</select
							></label
						>
						<label
							>{t('setup.creditHour')}<input bind:value={tokenHour} type="number" min="0" max="23" /></label
						>
						<label>
							{t('settings.timezone')}
							<select bind:value={timezone}>
								{#each timezones as item (item.zone)}<option value={item.zone}
										>({item.offset}) {item.zone}</option
									>{/each}
							</select>
						</label>
					</div>
				</section>
				<hr />
				<section class="rule-group" aria-labelledby="rules-sources">
					<h3 id="rules-sources">{t('setup.rulesSources')}</h3>
					<label>{t('setup.sources')}<input id="setup-sources" bind:value={sources} /></label>
					<p class="hint">{t('setup.sourcesHint')}</p>
				</section>
			</fieldset>

			{#if error && error !== t('settings.errorPin') && error !== t('settings.errorPinMismatch')}
				<p class="inline-error" role="alert">{error}</p>
			{/if}
			<button class="btn" disabled={busy}>{busy ? '…' : t('setup.complete')} <span>→</span></button>
		</form>
	</main>
</div>

<style>
	.setup-page {
		color-scheme: light;
		background: #f7f4ed;
		color: #101923;
		min-height: 100vh;
	}
	.site-head {
		min-height: 4.5rem;
		max-width: 1120px;
		margin: auto;
		padding: 0 1.25rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid #e5ded2;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-size: 0.95rem;
		letter-spacing: -0.02em;
	}
	.brand span {
		font-size: 1.45rem;
		filter: drop-shadow(0 3px 0 rgb(199 93 9 / 0.18));
	}
	.language {
		min-width: min(18rem, 55vw);
		color: #34404a;
	}
	.language :global(select) {
		min-height: 2.5rem;
		border: 1px solid #b9b3a8;
		background: #fff;
		color: #101923;
	}
	.setup-shell {
		max-width: 920px;
		margin: auto;
		padding: clamp(2rem, 5vw, 4rem) 1.25rem 5rem;
	}
	.welcome {
		max-width: 42rem;
		margin-bottom: 2rem;
	}
	.eyebrow {
		margin: 0 0 0.65rem;
		color: #8f3b00;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	h1 {
		max-width: 38rem;
		margin: 0 0 0.8rem;
		color: #101923;
		font-family: inherit;
		font-size: clamp(2.35rem, 6vw, 4rem);
		font-weight: 800;
		line-height: 0.98;
		letter-spacing: -0.055em;
	}
	.welcome > p:last-child {
		max-width: 38rem;
		margin: 0;
		color: #59636c;
		font-size: 1rem;
		line-height: 1.6;
	}
	.ticket {
		display: grid;
		gap: 1.5rem;
		padding: clamp(1.15rem, 3vw, 2rem);
		background: #fffdf8;
		border: 1px solid #e5ded2;
		border-radius: 1rem;
		box-shadow: 0 12px 34px rgb(16 25 35 / 0.08);
	}
	fieldset {
		display: grid;
		gap: 0.85rem;
		border: 0;
		padding: 0 0 1.4rem;
		margin: 0;
		border-bottom: 1px dashed var(--line);
	}
	fieldset:last-of-type {
		padding-bottom: 0;
		border-bottom: 0;
	}
	legend {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		margin-bottom: 0.8rem;
		padding: 0;
		color: #101923;
		font-size: 1rem;
		font-weight: 800;
	}
	legend span {
		display: grid;
		place-items: center;
		width: 1.7rem;
		height: 1.7rem;
		border-radius: 50%;
		background: #f3e4b6;
		color: #55451e;
		font-size: 0.78rem;
	}
	label {
		display: grid;
		gap: 0.4rem;
		color: #34404a;
		font-size: 0.8rem;
		font-weight: 750;
	}
	.ticket :global(input),
	.ticket :global(select) {
		min-height: 2.8rem;
		padding: 0.65rem 0.75rem;
		border: 1px solid #b9b3a8;
		border-radius: 0.65rem;
		background: #fff;
		color: #101923;
		caret-color: #101923;
	}
	.ticket :global(input:focus),
	.ticket :global(select:focus) {
		outline: 3px solid #08736f;
		outline-offset: 2px;
		border-color: transparent;
	}
	.ticket :global(input[aria-invalid='true']) {
		border-color: #b91c1c;
		outline-color: #b91c1c;
	}
	.hint {
		margin: -0.15rem 0 0;
		color: #59636c;
		font-size: 0.78rem;
		line-height: 1.5;
	}
	.inline-error {
		margin: 0;
		padding: 0.7rem 0.8rem;
		border-left: 3px solid #b91c1c;
		background: #fff1f1;
		color: #8f1616;
		font-size: 0.82rem;
	}
	.form-grid {
		display: grid;
		gap: 0.85rem;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
	}
	.form-grid.two {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.form-grid.two label:first-child {
		grid-column: 1 / -1;
	}
	.form-grid.two.key-grid label:first-child {
		grid-column: auto;
	}
	.form-grid.two.language-grid label:first-child {
		grid-column: auto;
	}
	.form-grid.three {
		grid-template-columns: repeat(3, minmax(0, 1fr));
	}
	.rule-group {
		display: grid;
		gap: 0.85rem;
	}
	.rule-group h3 {
		margin: 0 0 0.25rem;
		color: #59636c;
		font-size: 0.72rem;
		line-height: 1;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	fieldset > hr {
		width: 100%;
		margin: 0.85rem 0;
		border: 0;
		border-top: 1px solid #e5ded2;
	}
	.inactive {
		opacity: 0.55;
	}
	.ticket :global(select:disabled) {
		cursor: not-allowed;
		background: #f0ede7;
	}
	.configured {
		align-self: end;
		margin: 0;
		padding: 0.75rem;
		color: #08736f;
		font-size: 0.82rem;
		font-weight: 750;
	}
	.key-links {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1.2rem;
		margin: 0;
		font-size: 0.78rem;
	}
	.key-links a {
		color: #8f3b00;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.key-links a:focus-visible {
		outline: 3px solid #08736f;
		outline-offset: 3px;
	}
	.optional {
		color: #65717b;
		font-weight: 500;
	}
	.member-row {
		display: grid;
		grid-template-columns: 1fr auto;
		align-items: end;
		gap: 0.6rem;
	}
	.add,
	.remove {
		width: fit-content;
		color: #8f3b00;
		background: transparent;
		border: 0;
		font: inherit;
		font-weight: 800;
		cursor: pointer;
	}
	.remove {
		min-width: 2.5rem;
		min-height: 2.5rem;
		font-size: 1.4rem;
	}
	.btn {
		width: 100%;
		min-height: 3rem;
		justify-content: space-between;
		background: #101923;
		color: #fff;
		box-shadow: none;
	}
	@media (max-width: 600px) {
		.form-grid.two {
			grid-template-columns: 1fr;
		}
		.form-grid.two label:first-child {
			grid-column: auto;
		}
		.form-grid.three {
			grid-template-columns: 1fr;
		}
		.site-head {
			align-items: flex-start;
			gap: 1rem;
			padding-block: 1rem;
		}
		.language {
			min-width: 0;
			width: 12rem;
		}
	}
</style>
