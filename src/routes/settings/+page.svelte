<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { untrack } from 'svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { getI18n } from '$lib/i18n/context';

	let { data } = $props();
	const t = getI18n();
	const initial = untrack(() => data.settings);
	let settings = $state(initial);
	let tab = $state<'general' | 'users' | 'security' | 'advanced'>('general');
	let title = $state(initial.general.title.value);
	let timezone = $state(initial.general.timezone.value);
	let sessionTimeout = $state(initial.security.sessionTimeout.value);
	let message = $state('');
	let error = $state('');
	let busy = $state(false);
	const standardTimeouts = [1800, 3600, 28800, 604800, 31536000];
	const customTimeout = $derived(!standardTimeouts.includes(Number(sessionTimeout)));

	type User = (typeof settings.users)[number];
	let editorOpen = $state(false);
	let editingId = $state<string | null>(null);
	let editName = $state('');
	let editRole = $state<'admin' | 'user'>('user');
	let editEnabled = $state(true);
	let editPin = $state('');
	let confirmPin = $state('');
	let deleteUser = $state<User | null>(null);
	let deleteOpen = $state(false);

	const labels = $derived({
		general: t('settings.general'),
		users: t('settings.users'),
		security: t('settings.security'),
		advanced: t('settings.advanced')
	});

	function envHint(source: string | undefined) {
		return t('settings.managedByEnv', { source: source ?? '' });
	}

	function timeoutLabel(seconds: number): string {
		if (seconds % 86400 === 0) return `${seconds / 86400} d`;
		if (seconds % 3600 === 0) return `${seconds / 3600} h`;
		return `${Math.round(seconds / 60)} min`;
	}

	async function request(url: string, method: string, body?: unknown) {
		busy = true;
		error = '';
		message = '';
		try {
			const response = await fetch(url, {
				method,
				headers: body ? { 'Content-Type': 'application/json' } : undefined,
				body: body ? JSON.stringify(body) : undefined
			});
			const result = await response.json().catch(() => ({}));
			if (response.status === 401) {
				await goto('/pin');
				return null;
			}
			if (!response.ok) {
				error = result.error ?? t('settings.saveFailed');
				return null;
			}
			await invalidateAll();
			const fresh = await fetch('/api/settings');
			if (fresh.ok) settings = await fresh.json();
			message = t('settings.saved');
			return result;
		} catch {
			error = t('error.offline');
			return null;
		} finally {
			busy = false;
		}
	}

	async function saveSettings() {
		await request('/api/settings', 'PUT', { title, timezone, sessionTimeout: Number(sessionTimeout) });
	}

	function addUser() {
		editingId = null;
		editName = '';
		editRole = 'user';
		editEnabled = true;
		editPin = '';
		confirmPin = '';
		editorOpen = true;
	}

	function editUser(user: User) {
		editingId = user.id;
		editName = user.name;
		editRole = user.role;
		editEnabled = user.enabled;
		editPin = '';
		confirmPin = '';
		editorOpen = true;
	}

	async function saveUser(event: SubmitEvent) {
		event.preventDefault();
		if (editPin !== confirmPin) {
			error = t('settings.errorPinMismatch');
			return;
		}
		const result = await request(
			editingId ? `/api/settings/users/${encodeURIComponent(editingId)}` : '/api/settings/users',
			editingId ? 'PUT' : 'POST',
			{ name: editName, role: editRole, enabled: editEnabled, pin: editPin || undefined }
		);
		if (result) editorOpen = false;
	}

	async function removeUser() {
		if (!deleteUser) return;
		const result = await request(`/api/settings/users/${encodeURIComponent(deleteUser.id)}`, 'DELETE');
		if (result) {
			deleteUser = null;
			deleteOpen = false;
		}
	}
</script>

<svelte:head><title>{t('settings.title')} · {data.title}</title></svelte:head>

<header class="settings-head">
	<div>
		<p class="kicker">POPCORN VOTE</p>
		<h1>{t('settings.title')}</h1>
	</div>
	<span class="reel" aria-hidden="true">⚙</span>
</header>

<Toast bind:message={error} hold />
{#if message}<p class="saved" role="status">✓ {message}</p>{/if}

<div class="settings-layout">
	<nav class="section-nav" aria-label={t('settings.sections')}>
		{#each Object.entries(labels) as [key, label] (key)}
			<button class:active={tab === key} onclick={() => (tab = key as typeof tab)}
				><span>{key === 'general' ? '⌂' : key === 'users' ? '♟' : key === 'security' ? '◇' : '⋯'}</span
				>{label}</button
			>
		{/each}
	</nav>

	<section class="panel">
		{#if tab === 'general'}
			<div class="section-title">
				<div>
					<h2>{labels.general}</h2>
					<p>{t('settings.generalHint')}</p>
				</div>
				<span>01</span>
			</div>
			<div class="form-grid">
				<label
					>{t('settings.instanceName')}<input
						bind:value={title}
						disabled={!settings.general.title.editable}
						maxlength="80"
					/>{#if !settings.general.title.editable}<small>{envHint(settings.general.title.source)}</small
						>{/if}</label
				>
				<label
					>{t('settings.timezone')}<input
						bind:value={timezone}
						disabled={!settings.general.timezone.editable}
						placeholder="Europe/Zurich"
					/>{#if !settings.general.timezone.editable}<small>{envHint(settings.general.timezone.source)}</small
						>{/if}</label
				>
			</div>
			<button class="btn save" onclick={saveSettings} disabled={busy}>{t('settings.saveChanges')}</button>
		{:else if tab === 'users'}
			<div class="section-title">
				<div>
					<h2>{labels.users}</h2>
					<p>{t('settings.usersHint')}</p>
				</div>
				<span>02</span>
			</div>
			<div class="user-list">
				{#each settings.users as user (user.id)}
					<article class="user-row">
						<div class="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
						<div>
							<strong>{user.name}</strong>
							<p>
								{user.role === 'admin' ? t('settings.administrator') : t('settings.user')} ·
								{user.enabled ? t('settings.enabled') : t('settings.disabled')}
							</p>
						</div>
						<div class="row-actions">
							<button class="btn secondary" onclick={() => editUser(user)}>{t('settings.edit')}</button
							><button
								class="icon-danger"
								aria-label={t('settings.deleteNamed', { name: user.name })}
								onclick={() => {
									deleteUser = user;
									deleteOpen = true;
								}}>×</button
							>
						</div>
					</article>
				{/each}
			</div>
			<button class="btn save" onclick={addUser}>＋ {t('settings.addUser')}</button>
		{:else if tab === 'security'}
			<div class="section-title">
				<div>
					<h2>{labels.security}</h2>
					<p>{t('settings.securityHint')}</p>
				</div>
				<span>03</span>
			</div>
			<label
				>{t('settings.logoutAfter')}<select
					bind:value={sessionTimeout}
					disabled={!settings.security.sessionTimeout.editable}
					>{#if customTimeout}<option value={Number(sessionTimeout)}
							>{timeoutLabel(Number(sessionTimeout))}</option
						>{/if}<option value={1800}>30 min</option><option value={3600}>1 h</option><option value={28800}
						>8 h</option
					><option value={604800}>{t('settings.oneWeek')}</option><option value={31536000}
						>{t('settings.oneYear')}</option
					></select
				>{#if !settings.security.sessionTimeout.editable}<small
						>{envHint(settings.security.sessionTimeout.source)}</small
					>{/if}</label
			>
			<p class="notice">
				◇ {t('settings.pinSecurity')}
			</p>
			<button class="btn save" onclick={saveSettings} disabled={busy}>{t('settings.saveChanges')}</button>
		{:else}
			<div class="section-title">
				<div>
					<h2>{labels.advanced}</h2>
					<p>{t('settings.advancedHint')}</p>
				</div>
				<span>04</span>
			</div>
			<div class="fact">
				<span>{t('settings.configFile')}</span><code>{settings.advanced.configFile}</code>
			</div>
			<div class="fact"><span>{t('settings.version')}</span><code>{data.version}</code></div>
			<h3>{t('settings.environmentOverrides')}</h3>
			{#if settings.advanced.environment.length}<div class="env-list">
					{#each settings.advanced.environment as item (item.variable)}<div>
							<code>{item.variable}</code><span>{item.setting}</span>
						</div>{/each}
				</div>{:else}<p class="muted">{t('settings.noOverrides')}</p>{/if}
			<p class="notice">
				{t('settings.advancedNotice')}
			</p>
		{/if}
	</section>
</div>

{#if editorOpen}
	<div
		class="editor-backdrop"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && (editorOpen = false)}
	>
		<form class="editor" onsubmit={saveUser}>
			<div class="editor-head">
				<div>
					<p class="kicker">
						{editingId ? t('settings.editAccount') : t('settings.newAccount')}
					</p>
					<h2>{editingId ? editName : t('settings.addUser')}</h2>
				</div>
				<button type="button" aria-label={t('settings.close')} onclick={() => (editorOpen = false)}>×</button>
			</div>
			<label
				>{t('settings.displayName')}<input
					bind:value={editName}
					minlength="2"
					maxlength="80"
					required
				/></label
			>
			<label
				>{t('settings.role')}<select bind:value={editRole}
					><option value="user">{t('settings.user')}</option><option value="admin"
						>{t('settings.administrator')}</option
					></select
				></label
			>
			<label class="check"
				><input type="checkbox" bind:checked={editEnabled} />
				{t('settings.accountEnabled')}</label
			>
			<label
				>{editingId ? t('settings.newPinOptional') : 'PIN'}<input
					bind:value={editPin}
					type="password"
					inputmode="numeric"
					pattern="[0-9]+"
					minlength="4"
					maxlength="4"
					required={!editingId}
					autocomplete="new-password"
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
					required={!editingId || editPin.length > 0}
					autocomplete="new-password"
				/></label
			>
			<div class="editor-actions">
				<button type="button" class="btn secondary" onclick={() => (editorOpen = false)}
					>{t('dialog.cancel')}</button
				><button class="btn" disabled={busy}>{t('settings.save')}</button>
			</div>
		</form>
	</div>
{/if}

<ConfirmDialog
	bind:open={deleteOpen}
	title={t('settings.deleteUserTitle')}
	confirmText={t('settings.delete')}
	danger
	{busy}
	onconfirm={removeUser}
	><p>
		{t('settings.deleteUserBody', { name: deleteUser?.name ?? '' })}
	</p></ConfirmDialog
>

<style>
	.settings-head {
		display: flex;
		justify-content: space-between;
		align-items: end;
		margin-bottom: 1.5rem;
		border-bottom: 3px solid var(--text);
		padding-bottom: 0.8rem;
	}
	.settings-head h1 {
		font-family: Georgia, serif;
		font-size: clamp(2rem, 7vw, 3.5rem);
		margin: 0;
		letter-spacing: -0.04em;
	}
	.kicker {
		margin: 0 0 0.25rem;
		color: var(--accent);
		font-size: 0.68rem;
		font-weight: 850;
		letter-spacing: 0.16em;
	}
	.reel {
		font-size: 2rem;
		color: var(--accent);
	}
	.saved {
		padding: 0.7rem 0.9rem;
		border-radius: 0.7rem;
		background: color-mix(in srgb, var(--ok) 12%, transparent);
		color: var(--ok);
	}
	.settings-layout {
		display: grid;
		gap: 1rem;
	}
	.section-nav {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
		padding-bottom: 0.3rem;
	}
	.section-nav button {
		display: flex;
		gap: 0.45rem;
		align-items: center;
		padding: 0.65rem 0.8rem;
		border: 1px solid var(--line);
		border-radius: 999px;
		white-space: nowrap;
		color: var(--muted);
	}
	.section-nav button.active {
		color: var(--text);
		background: var(--accent-soft);
		border-color: var(--accent);
		font-weight: 750;
	}
	.panel {
		min-width: 0;
		background: var(--card);
		border: 1px solid var(--line);
		border-radius: 1.1rem;
		padding: clamp(1rem, 4vw, 1.7rem);
		box-shadow: var(--shadow);
	}
	.section-title {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 1rem;
		margin-bottom: 1.2rem;
		border-bottom: 1px dashed var(--line);
	}
	.section-title h2 {
		font-family: Georgia, serif;
		font-size: 1.7rem;
		margin: 0;
	}
	.section-title p {
		margin: 0.35rem 0 0;
		color: var(--muted);
		line-height: 1.5;
	}
	.section-title > span {
		color: var(--accent);
		font-size: 1.7rem;
		font-weight: 800;
	}
	.form-grid {
		display: grid;
		gap: 1rem;
	}
	label {
		display: grid;
		gap: 0.42rem;
		font-size: 0.82rem;
		font-weight: 750;
	}
	label small {
		color: var(--accent);
		font-weight: 500;
	}
	.save {
		margin-top: 1.3rem;
	}
	.user-list {
		display: grid;
		gap: 0.55rem;
	}
	.user-row {
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 0.75rem;
		padding: 0.7rem;
		border: 1px solid var(--line);
		border-radius: 0.8rem;
	}
	.avatar {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--accent);
		font-family: Georgia, serif;
		font-size: 1.25rem;
		font-weight: 800;
	}
	.user-row p {
		margin: 0.15rem 0 0;
		color: var(--muted);
		font-size: 0.75rem;
	}
	.row-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.row-actions .btn {
		padding: 0.45rem 0.65rem;
		font-size: 0.75rem;
	}
	.icon-danger {
		font-size: 1.5rem;
		color: var(--danger);
		padding: 0.2rem 0.45rem;
	}
	.notice {
		padding: 0.8rem;
		border-left: 3px solid var(--accent);
		background: var(--accent-soft);
		font-size: 0.82rem;
		line-height: 1.5;
	}
	.fact {
		display: grid;
		gap: 0.25rem;
		padding: 0.75rem 0;
		border-bottom: 1px solid var(--line);
	}
	.fact span {
		color: var(--muted);
		font-size: 0.75rem;
	}
	code {
		overflow-wrap: anywhere;
	}
	h3 {
		font-size: 0.9rem;
		margin-top: 1.5rem;
	}
	.env-list {
		display: grid;
		border: 1px solid var(--line);
		border-radius: 0.7rem;
		overflow: hidden;
	}
	.env-list div {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.65rem 0.75rem;
		border-bottom: 1px solid var(--line);
	}
	.env-list div:last-child {
		border: 0;
	}
	.env-list span {
		color: var(--muted);
		font-size: 0.78rem;
	}
	.editor-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgb(0 0 0 / 0.5);
	}
	.editor {
		width: min(100%, 430px);
		max-height: 90vh;
		overflow: auto;
		display: grid;
		gap: 1rem;
		padding: 1.2rem;
		border-radius: 1rem;
		background: var(--card);
		box-shadow: 0 2rem 5rem rgb(0 0 0 / 0.35);
	}
	.editor-head {
		display: flex;
		justify-content: space-between;
		border-bottom: 1px dashed var(--line);
		padding-bottom: 0.8rem;
	}
	.editor-head h2 {
		margin: 0;
	}
	.editor-head > button {
		font-size: 1.8rem;
	}
	.check {
		display: flex;
		align-items: center;
	}
	.check input {
		width: auto;
	}
	.editor-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	@media (min-width: 760px) {
		.settings-layout {
			grid-template-columns: 150px 1fr;
			align-items: start;
		}
		.section-nav {
			display: grid;
			overflow: visible;
		}
		.section-nav button {
			border-radius: 0.7rem;
			border-color: transparent;
		}
		.form-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
