<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';

	let { children, data } = $props();

	const nav = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/data', label: 'Data' }
	];

	const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
	let polled = $state<typeof data.saveStatus | null>(null);
	const status = $derived(polled && polled.version >= data.saveStatus.version ? polled : data.saveStatus);
	const pending = $derived(status.saving || status.version !== status.savedVersion || !!status.lastError);

	$effect(() => {
		if (!pending) return;
		const t = setInterval(async () => {
			try {
				polled = await (await fetch('/api/status')).json();
			} catch {
				/* ignore */
			}
		}, 1000);
		return () => clearInterval(t);
	});
</script>

<div class="shell">
	<header>
		<div class="bar">
			<a class="brand" href="/">
				<img src="/favicon.svg" alt="" width="24" height="24" />
				<span>Credit Insight</span>
			</a>
			<nav>
				{#each nav as item}
					<a href={item.href} class:active={active(item.href)}>{item.label}</a>
				{/each}
			</nav>
			<div class="status" title={status.lastError ?? `Excel file: ${status.file}`}>
				{#if status.lastError}
					<span class="dot err"></span> Save failed — retrying
				{:else if status.saving || status.version !== status.savedVersion}
					<span class="dot busy"></span> Saving to Excel…
				{:else}
					<span class="dot ok"></span>
					<span class="num">{status.rows.toLocaleString()}</span>&nbsp;rows in {status.file.split(/[\\/]/).pop()}
				{/if}
			</div>
		</div>
	</header>

	<main>
		{@render children()}
	</main>
</div>

<style>
	.shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	header {
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 0;
		z-index: 20;
	}
	.bar {
		max-width: 1280px;
		margin: 0 auto;
		padding: 0 24px;
		height: 56px;
		display: flex;
		align-items: center;
		gap: 28px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 9px;
		font-weight: 650;
		color: var(--ink);
		text-decoration: none;
		letter-spacing: -0.01em;
	}
	nav {
		display: flex;
		gap: 2px;
		height: 100%;
	}
	nav a {
		display: flex;
		align-items: center;
		padding: 0 12px;
		color: var(--ink-2);
		text-decoration: none;
		font-size: 0.92rem;
		font-weight: 520;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	nav a:hover {
		color: var(--ink);
	}
	nav a.active {
		color: var(--ink);
		border-bottom-color: var(--accent);
	}
	.status {
		margin-left: auto;
		font-size: 0.8rem;
		color: var(--muted);
		display: flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		display: inline-block;
	}
	.dot.ok {
		background: #0ca30c;
	}
	.dot.busy {
		background: #fab219;
	}
	.dot.err {
		background: #d03b3b;
	}
	main {
		flex: 1;
		width: 100%;
		max-width: 1280px;
		margin: 0 auto;
		padding: 28px 24px 48px;
	}
	@media (max-width: 760px) {
		.bar {
			height: auto;
			flex-wrap: wrap;
			gap: 4px 16px;
			padding: 10px 16px 0;
		}
		nav {
			order: 3;
			width: 100%;
			height: 40px;
			overflow-x: auto;
		}
		.status {
			margin-left: auto;
		}
		main {
			padding: 20px 16px 40px;
		}
	}
</style>
