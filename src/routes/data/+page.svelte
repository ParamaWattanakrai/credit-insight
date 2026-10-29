<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CARD_TYPES, OCCUPATIONS, COLUMNS, formatValue } from '$lib/schema';

	let { data, form } = $props();

	const GROUP_ORDER = ['Profile', 'Card', 'Spending', 'Balance & Payments', 'Engagement'] as const;
	// Customer_ID is shown separately as a frozen leading column, not grouped.
	const groups = GROUP_ORDER.map((name) => ({
		name,
		cols: COLUMNS.filter((c) => c.group === name && c.type !== 'id')
	}));
	const idCol = COLUMNS.find((c) => c.type === 'id')!;

	let collapsed = $state<Record<string, boolean>>({});
	const toggleGroup = (g: string) => (collapsed = { ...collapsed, [g]: !collapsed[g] });

	let search = $state('');
	$effect.pre(() => {
		search = data.query.q;
	});

	function href(changes: Record<string, string | number | null>) {
		const u = new URL(page.url);
		for (const k of ['created', 'updated', 'deleted']) u.searchParams.delete(k);
		for (const [k, v] of Object.entries(changes)) {
			if (v === null || v === '') u.searchParams.delete(k);
			else u.searchParams.set(k, String(v));
		}
		return u.pathname + u.search;
	}
	const nav = (changes: Record<string, string | number | null>) => goto(href(changes), { keepFocus: true, noScroll: true });

	function sortHref(key: string) {
		const dir = data.query.sort === key && data.query.dir === 'desc' ? 'asc' : 'desc';
		return href({ sort: key, dir, page: null });
	}

	let timer: ReturnType<typeof setTimeout>;
	function onSearch() {
		clearTimeout(timer);
		timer = setTimeout(() => nav({ q: search, page: null }), 250);
	}

	const flashText = $derived(
		form?.deleted
			? `Deleted ${form.deleted} from the Excel file.`
			: data.flash.created
				? `Created ${data.flash.created} — appended to the Excel file.`
				: data.flash.updated
					? `Saved changes to ${data.flash.updated}.`
					: data.flash.deleted
						? `Deleted ${data.flash.deleted} from the Excel file.`
						: null
	);
	const highlight = $derived(data.flash.created ?? data.flash.updated);
	const filtered = $derived(!!(data.query.q || data.query.card || data.query.occupation || data.query.gender));
	const totalCols = $derived(1 + groups.reduce((n, g) => n + (collapsed[g.name] ? 1 : g.cols.length), 0) + 1);
</script>

<svelte:head><title>Data · Credit Insight</title></svelte:head>

<div class="page-head">
	<div>
		<h1>Customer data</h1>
	</div>
	<div class="head-actions">
		<a class="btn" href="/api/export/data.xlsx" data-sveltekit-reload>Download .xlsx</a>
		<a class="btn" href="/api/export/data.csv" data-sveltekit-reload>Download .csv</a>
		<a class="btn primary" href="/data/new">+ New customer</a>
	</div>
</div>

{#if flashText}
	<div class="flash" role="status">{flashText}</div>
{/if}
{#if form?.message}
	<div class="flash err" role="alert">{form.message}</div>
{/if}

<div class="card">
	<div class="filters">
		<input type="search" placeholder="Search ID or occupation…" bind:value={search} oninput={onSearch} aria-label="Search" />
		<select value={data.query.card} onchange={(e) => nav({ card: e.currentTarget.value, page: null })} aria-label="Card type">
			<option value="">All card types</option>
			{#each CARD_TYPES as c}<option>{c}</option>{/each}
		</select>
		<select value={data.query.occupation} onchange={(e) => nav({ occupation: e.currentTarget.value, page: null })} aria-label="Occupation">
			<option value="">All occupations</option>
			{#each OCCUPATIONS as o}<option>{o}</option>{/each}
		</select>
		<select value={data.query.gender} onchange={(e) => nav({ gender: e.currentTarget.value, page: null })} aria-label="Gender">
			<option value="">Any sex</option>
			<option value="M">Male</option>
			<option value="F">Female</option>
		</select>
		{#if filtered}
			<a class="btn small" href="/data">Clear</a>
		{/if}
		<span class="count muted num">{data.total.toLocaleString()} {filtered ? 'matching' : ''} records</span>
	</div>

	<div class="table-wrap">
		<table class="full">
			<thead>
				<tr>
					<th rowspan="2" class="sticky-col">
						<a class="sort" href={sortHref(idCol.key)} data-sveltekit-noscroll>
							ID
							{#if data.query.sort === idCol.key}<span aria-hidden="true">{data.query.dir === 'asc' ? '▲' : '▼'}</span>{/if}
						</a>
					</th>
					{#each groups as g}
						<th
							class="group-head"
							colspan={collapsed[g.name] ? 1 : g.cols.length}
							rowspan={collapsed[g.name] ? 2 : 1}
						>
							<button type="button" class="group-toggle" onclick={() => toggleGroup(g.name)} title={collapsed[g.name] ? 'Expand' : 'Collapse'}>
								<span class="chev">{collapsed[g.name] ? '▸' : '▾'}</span>
								{g.name}
							</button>
						</th>
					{/each}
					<th rowspan="2" class="r sticky-actions"><span class="sr">Actions</span></th>
				</tr>
				<tr>
					{#each groups as g}
						{#if !collapsed[g.name]}
							{#each g.cols as c}
								<th class:r={c.type !== 'enum'}>
									<a class="sort" href={sortHref(c.key)} data-sveltekit-noscroll>
										{c.label}
										{#if data.query.sort === c.key}<span aria-hidden="true">{data.query.dir === 'asc' ? '▲' : '▼'}</span>{/if}
									</a>
								</th>
							{/each}
						{/if}
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each data.rows as row (row.Customer_ID)}
					<tr class:hl={row.Customer_ID === highlight}>
						<td class="sticky-col">
							<a href="/data/{row.Customer_ID}" class="mono">{row.Customer_ID}</a>
						</td>
						{#each groups as g}
							{#if collapsed[g.name]}
								<td class="collapsed-cell" title="{g.name} — click the header to expand">⋯</td>
							{:else}
								{#each g.cols as c}
									<td class:r={c.type !== 'enum'}>
										{#if c.key === 'Card_Type'}
											<span class="pill tier-{String(row.Card_Type).toLowerCase()}">{row.Card_Type}</span>
										{:else}
											{formatValue(c.key, row[c.key])}
										{/if}
									</td>
								{/each}
							{/if}
						{/each}
						<td class="r sticky-actions"><div class="row-actions">
							<a class="btn small" href="/data/{row.Customer_ID}">Edit</a>
							<form
								method="POST"
								action="?/delete"
								use:enhance={({ cancel }) => {
									if (!confirm(`Delete ${row.Customer_ID}? This removes the row from the Excel file.`)) cancel();
									return async ({ update }) => update({ reset: false, invalidateAll: true });
								}}
							>
								<input type="hidden" name="id" value={row.Customer_ID} />
								<button class="btn small danger" type="submit">Delete</button>
							</form>
						</div></td>
					</tr>
				{:else}
					<tr><td colspan={totalCols} class="empty">No customers match these filters.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="pager">
		<label class="muted">
			Rows
			<select value={String(data.pageSize)} onchange={(e) => nav({ size: e.currentTarget.value, page: null })}>
				{#each [10, 25, 50, 100] as n}<option value={String(n)}>{n}</option>{/each}
			</select>
		</label>
		<span class="muted num">Page {data.page.toLocaleString()} of {data.pages.toLocaleString()}</span>
		<div class="pg">
			<a class="btn small" class:disabled={data.page <= 1} href={href({ page: 1 })} data-sveltekit-noscroll>« First</a>
			<a class="btn small" class:disabled={data.page <= 1} href={href({ page: data.page - 1 })} data-sveltekit-noscroll>‹ Prev</a>
			<a class="btn small" class:disabled={data.page >= data.pages} href={href({ page: data.page + 1 })} data-sveltekit-noscroll>Next ›</a>
			<a class="btn small" class:disabled={data.page >= data.pages} href={href({ page: data.pages })} data-sveltekit-noscroll>Last »</a>
		</div>
	</div>
</div>

<p class="muted note">Default order shows the most recently added rows first. Click a column header to sort.</p>

<style>
	.head-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.flash {
		background: var(--accent-soft);
		border-radius: 8px;
		padding: 10px 14px;
		margin-bottom: 14px;
		font-weight: 520;
	}
	.flash.err {
		background: var(--danger-soft);
		color: var(--danger);
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin-bottom: 12px;
	}
	.filters input[type='search'] {
		flex: 1 1 220px;
		max-width: 320px;
	}
	.count {
		margin-left: auto;
		font-size: 0.85rem;
	}
	.sort {
		color: inherit;
		text-decoration: none;
		display: inline-flex;
		gap: 4px;
	}
	.sort span {
		font-size: 0.65rem;
		color: var(--accent);
	}
	.mono {
		font-family: var(--mono);
		font-size: 0.82rem;
	}
	tbody tr:hover {
		background: var(--surface-2);
	}
	tr.hl {
		background: var(--accent-soft);
	}
	.table-wrap {
		/* Override the global bleed-to-card-edge trick: with a sticky column, the negative
		   margin moves the scroll container's clip boundary past the card edge, which let
		   off-screen column content paint outside the card on horizontal scroll. */
		margin: 0;
		padding: 0;
		contain: paint;
	}
	table.full {
		table-layout: auto;
		border-collapse: separate;
		border-spacing: 0;
	}
	table.full th,
	table.full td {
		border-bottom: 1px solid var(--grid);
	}
	.sticky-col {
		position: sticky;
		left: 0;
		z-index: 3;
		background: var(--surface);
		box-shadow: 1px 0 0 var(--border);
	}
	tbody tr:hover .sticky-col {
		background: var(--surface-2);
	}
	tr.hl .sticky-col {
		background: var(--accent-soft);
	}
	thead .sticky-col {
		z-index: 4;
	}
	.sticky-actions {
		position: sticky;
		right: 0;
		z-index: 3;
		background: var(--surface);
		box-shadow: -1px 0 0 var(--border);
	}
	tbody tr:hover .sticky-actions {
		background: var(--surface-2);
	}
	tr.hl .sticky-actions {
		background: var(--accent-soft);
	}
	thead .sticky-actions {
		z-index: 4;
	}
	.group-head {
		text-align: left;
		background: var(--surface-2);
		border-bottom: 1px solid var(--border);
	}
	.group-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		border: 0;
		background: none;
		font: inherit;
		font-weight: 600;
		color: var(--ink-2);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		font-size: 0.78rem;
		cursor: pointer;
		padding: 0;
	}
	.chev {
		color: var(--muted);
		font-size: 0.7rem;
	}
	.collapsed-cell {
		text-align: center;
		color: var(--muted);
		background: var(--surface-2);
	}
	.row-actions {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
	}
	.row-actions form {
		margin: 0;
	}
	.empty {
		text-align: center;
		padding: 32px;
		color: var(--muted);
	}
	.pager {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		margin-top: 14px;
		font-size: 0.85rem;
	}
	.pager label {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.pager select {
		padding: 3px 6px;
	}
	.pg {
		margin-left: auto;
		display: flex;
		gap: 6px;
	}
	.btn.disabled {
		pointer-events: none;
		opacity: 0.4;
	}
	.note {
		font-size: 0.8rem;
		margin-top: 10px;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.tier-basic {
		background: var(--surface-2);
	}
	.tier-silver {
		background: #e4e6ea;
		color: #3c4048;
	}
	.tier-gold {
		background: #fbefd0;
		color: #7a5300;
	}
	.tier-platinum {
		background: #dce9fa;
		color: #1c4f8f;
	}
	.tier-signature {
		background: #e7e3fa;
		color: #3b2e8f;
	}
</style>
