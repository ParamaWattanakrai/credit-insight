<script lang="ts">
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';

	// A saved Tableau view: anything published to Tableau Public, Tableau Cloud or Tableau Server.
	interface View {
		name: string;
		url: string;
	}

	const STORAGE_KEY = 'credit-insight.tableau-views';
	const defaultUrl = (env.PUBLIC_TABLEAU_URL ?? '').trim();

	let views = $state<View[]>(defaultUrl ? [{ name: 'Dashboard', url: defaultUrl }] : []);
	let current = $state(0);
	let draftName = $state('');
	let draftUrl = $state('');
	let formError = $state('');
	let showAdd = $state(false);
	let reloadKey = $state(0);
	let scriptReady = $state(false);
	let scriptError = $state('');
	// Connected-App JWT: fetched from our server for views hosted on the configured Tableau site.
	let token = $state('');
	let tokenReady = $state(false);
	let tokenError = $state('');
	let tokenSeq = 0;

	const view = $derived(views[current]);

	/** Accept a share link, a view URL or a pasted embed code, and return a clean view URL. */
	function normalize(input: string): string | null {
		let s = input.trim();
		const fromEmbed = s.match(/src=["']([^"']+)["']/) ?? s.match(/name=["']name["']\s+value=["']([^"']+)["']/);
		if (fromEmbed) s = fromEmbed[1].replace(/&#47;/g, '/').replace(/&amp;/g, '&');
		// Tableau Public legacy embed: value='Workbook/Sheet'
		if (/^[\w-]+\/[\w-]+$/.test(s)) s = `https://public.tableau.com/views/${s}`;
		try {
			const u = new URL(s);
			if (!/^https?:$/.test(u.protocol)) return null;
			u.hash = '';
			// keep Tableau server params that matter, drop share/tracking params
			const keep = new URLSearchParams();
			for (const [k, v] of u.searchParams) if (!/origin|display_count|language|showVizHome|embed/.test(k)) keep.set(k, v);
			u.search = keep.toString();
			return u.toString().replace(/\?$/, '');
		} catch {
			return null;
		}
	}

	function apiScriptFor(url: string) {
		const u = new URL(url);
		return u.hostname.endsWith('public.tableau.com')
			? 'https://public.tableau.com/javascripts/api/tableau.embedding.3.latest.min.js'
			: `${u.origin}/javascripts/api/tableau.embedding.3.latest.min.js`;
	}

	const loadedScripts = new Set<string>();
	function ensureScript(url: string) {
		const src = apiScriptFor(url);
		if (loadedScripts.has(src) || customElements.get('tableau-viz')) {
			scriptReady = true;
			return;
		}
		scriptReady = false;
		scriptError = '';
		const el = document.createElement('script');
		el.type = 'module';
		el.src = src;
		el.onload = () => {
			loadedScripts.add(src);
			scriptReady = true;
		};
		el.onerror = () => (scriptError = `Couldn't load the Tableau Embedding API from ${new URL(src).host}. Check your network or the server URL.`);
		document.head.appendChild(el);
	}

	/** Ask our server for a fresh JWT when this view lives on the Tableau site the Connected App belongs to. */
	async function loadToken(url: string) {
		const seq = ++tokenSeq;
		tokenReady = false;
		tokenError = '';
		token = '';
		try {
			const res = await fetch('/api/tableau/token', { cache: 'no-store' });
			const info = await res.json();
			if (seq !== tokenSeq) return;
			if (info.enabled && new URL(url).origin === info.origin) token = info.token;
		} catch {
			if (seq !== tokenSeq) return;
			tokenError = 'Couldn’t get an access token from the server — showing the view with normal Tableau login.';
		}
		if (seq === tokenSeq) tokenReady = true;
	}

	function persist() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
		} catch {
			/* storage unavailable — views still work for this visit */
		}
	}

	function addView(e: SubmitEvent) {
		e.preventDefault();
		const url = normalize(draftUrl);
		if (!url) {
			formError = 'That doesn’t look like a Tableau view URL or embed code.';
			return;
		}
		views = [...views, { name: draftName.trim() || `View ${views.length + 1}`, url }];
		current = views.length - 1;
		draftName = draftUrl = formError = '';
		showAdd = false;
		persist();
	}

	function removeView(i: number) {
		views = views.filter((_, j) => j !== i);
		current = Math.max(0, Math.min(current, views.length - 1));
		persist();
	}

	onMount(() => {
		try {
			const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
			if (Array.isArray(saved) && saved.length) views = saved.filter((v) => v && typeof v.url === 'string');
		} catch {
			/* ignore */
		}
		if (!views.length) showAdd = true;
	});

	$effect(() => {
		if (view) ensureScript(view.url);
	});

	// A token is single-use, so fetch a new one whenever the view changes or is reloaded.
	$effect(() => {
		reloadKey;
		if (view) loadToken(view.url);
	});
</script>

<svelte:head><title>Dashboard · Credit Insight</title></svelte:head>

<div class="page-head">
	<div>
		<h1>Tableau Dashboard</h1>
	</div>
	<div class="actions">
		<a class="btn" href="/api/export/data.xlsx" data-sveltekit-reload>Download data for Tableau</a>
		<button class="btn primary" onclick={() => (showAdd = !showAdd)}>{showAdd ? 'Close' : '+ Add view'}</button>
	</div>
</div>

{#if showAdd}
	<form class="card add" onsubmit={addView}>
		<h2>Add a Tableau view</h2>
		<p class="sub">Paste the link from Tableau's <b>Share</b> button (or the embed code). Tableau Public, Tableau Cloud and Tableau Server all work.</p>
		<div class="add-row">
			<input placeholder="Name (e.g. Spending overview)" bind:value={draftName} aria-label="View name" />
			<input class="url" placeholder="https://public.tableau.com/views/Workbook/Dashboard" bind:value={draftUrl} aria-label="View URL" required />
			<button class="btn primary" type="submit">Add</button>
		</div>
		{#if formError}<p class="err">{formError}</p>{/if}
	</form>
{/if}

{#if views.length}
	<div class="tabs" role="tablist">
		{#each views as v, i}
			<div class="tab" class:active={i === current}>
				<button role="tab" aria-selected={i === current} onclick={() => (current = i)}>{v.name}</button>
				<button class="x" title="Remove view" aria-label="Remove {v.name}" onclick={() => removeView(i)}>×</button>
			</div>
		{/each}
		<button class="btn small reload" onclick={() => reloadKey++} title="Re-load the view to pick up refreshed data">↻ Reload view</button>
	</div>

	<div class="card viz">
		{#if scriptError}
			<p class="err">{scriptError}</p>
		{:else if !scriptReady || !tokenReady}
			<p class="muted loading">Loading Tableau…</p>
		{:else}
			{#if tokenError}<p class="err">{tokenError}</p>{/if}
			{#key `${view.url}#${reloadKey}`}
				{#if token}
					<tableau-viz src={view.url} {token} toolbar="bottom" width="100%" height="820" device="default"></tableau-viz>
				{:else}
					<tableau-viz src={view.url} toolbar="bottom" width="100%" height="820" device="default"></tableau-viz>
				{/if}
			{/key}
		{/if}
	</div>
	<p class="muted note">Source: <a href={view.url} target="_blank" rel="noreferrer">{view.url}</a></p>
{:else}
	<div class="card empty">
		<h2>No Tableau view connected yet</h2>
		<ol>
			<li><a href="/api/export/data.xlsx" data-sveltekit-reload>Download the current data</a> (or point Tableau at <code>data/credit_card_customers.xlsx</code> directly).</li>
			<li>Build the worksheets and dashboard described in <code>tableau/TABLEAU_GUIDE.md</code>.</li>
			<li>Publish to Tableau Public (free) or Tableau Cloud/Server, click <b>Share</b>, copy the link.</li>
			<li>Click <b>+ Add view</b> above and paste it — or set <code>PUBLIC_TABLEAU_URL</code> in <code>.env</code> so it shows for everyone.</li>
		</ol>
	</div>
{/if}

<style>
	.actions {
		display: flex;
		gap: 8px;
	}
	.add {
		margin-bottom: 16px;
		display: grid;
		gap: 8px;
	}
	.add-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.add-row input {
		flex: 1 1 200px;
	}
	.add-row .url {
		flex: 3 1 320px;
	}
	.err {
		color: var(--danger);
		font-size: 0.88rem;
	}
	.tabs {
		display: flex;
		gap: 6px;
		align-items: center;
		flex-wrap: wrap;
		margin-bottom: 10px;
	}
	.tab {
		display: flex;
		align-items: center;
		border: 1px solid var(--border);
		background: var(--surface);
		border-radius: 8px;
	}
	.tab.active {
		border-color: var(--accent);
		box-shadow: inset 0 -2px 0 var(--accent);
	}
	.tab button {
		border: 0;
		background: none;
		font: inherit;
		color: var(--ink);
		cursor: pointer;
		padding: 6px 4px 6px 12px;
		font-size: 0.88rem;
	}
	.tab .x {
		padding: 6px 10px 6px 6px;
		color: var(--muted);
	}
	.tab .x:hover {
		color: var(--danger);
	}
	.reload {
		margin-left: auto;
	}
	.viz {
		padding: 8px;
		min-height: 400px;
		overflow: hidden;
	}
	.loading {
		padding: 40px;
		text-align: center;
	}
	.note {
		font-size: 0.78rem;
		margin-top: 8px;
		word-break: break-all;
	}
	.empty ol {
		margin: 12px 0 0;
		padding-left: 1.3em;
		display: grid;
		gap: 8px;
		color: var(--ink-2);
	}
	code {
		font-family: var(--mono);
		font-size: 0.85em;
		background: var(--surface-2);
		padding: 1px 5px;
		border-radius: 4px;
	}
	.how {
		margin-top: 16px;
	}
	.flow {
		display: flex;
		align-items: stretch;
		gap: 10px;
		margin-top: 12px;
		flex-wrap: wrap;
	}
	.flow div {
		flex: 1 1 160px;
		background: var(--surface-2);
		border-radius: 8px;
		padding: 10px 12px;
		display: grid;
		gap: 2px;
		font-size: 0.85rem;
	}
	.flow span {
		color: var(--ink-2);
	}
	.flow i {
		align-self: center;
		font-style: normal;
		color: var(--muted);
	}
	@media (max-width: 760px) {
		.flow i {
			display: none;
		}
	}
</style>
