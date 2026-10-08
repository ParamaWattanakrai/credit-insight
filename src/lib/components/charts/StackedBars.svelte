<!-- 100% stacked horizontal bars (composition per group) with legend + tooltips. -->
<script lang="ts">
	interface Props {
		groups: { group: string; shares: Record<string, number> }[];
		keys: string[];
		labels: Record<string, string>;
	}
	let { groups, keys, labels }: Props = $props();

	const colors = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'];
	let width = $state(600);
	let hover = $state<{ g: number; k: number; x: number } | null>(null);
	const labelW = 86;
	const bh = 26;
	const gap = 12;
	const plotW = $derived(Math.max(80, width - labelW));
</script>

<div class="wrap" bind:clientWidth={width}>
	<ul class="legend">
		{#each keys as k, i}
			<li><span class="sw" style="background:{colors[i]}"></span>{labels[k]}</li>
		{/each}
	</ul>
	<svg {width} height={groups.length * (bh + gap)} role="img" aria-label="Spending composition by group">
		{#each groups as g, gi}
			{@const y = gi * (bh + gap)}
			<text x={labelW - 10} y={y + bh / 2} dy="0.35em" text-anchor="end" class="lbl">{g.group}</text>
			{#each keys as k, ki}
				{@const x0 = keys.slice(0, ki).reduce((a, kk) => a + g.shares[kk], 0)}
				{@const w = g.shares[k] * plotW}
				<rect
					role="listitem"
					x={labelW + x0 * plotW + (ki ? 1 : 0)}
					{y}
					width={Math.max(0, w - (ki ? 2 : 1))}
					height={bh}
					rx={ki === 0 || ki === keys.length - 1 ? 4 : 0}
					fill={colors[ki]}
					opacity={hover === null || (hover.g === gi && hover.k === ki) ? 1 : 0.45}
					onmouseenter={() => (hover = { g: gi, k: ki, x: labelW + (x0 + g.shares[k] / 2) * plotW })}
					onmouseleave={() => (hover = null)}
				/>
				{#if w > 34}
					<text x={labelW + (x0 + g.shares[k] / 2) * plotW} y={y + bh / 2} dy="0.35em" text-anchor="middle" class="seg" fill={[2, 3, 4].includes(ki) ? '#0b0b0b' : '#fff'}>{(g.shares[k] * 100).toFixed(0)}%</text>
				{/if}
			{/each}
		{/each}
	</svg>
	{#if hover}
		{@const g = groups[hover.g]}
		<div class="viz-tip" style="left:{hover.x}px; top:{hover.g * (bh + gap) + 34}px">
			<b>{g.group}</b> · {labels[keys[hover.k]]}<br />{(g.shares[keys[hover.k]] * 100).toFixed(1)}% of categorised spend
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
		width: 100%;
	}
	svg {
		display: block;
	}
	.legend {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
		padding: 0;
		margin: 0 0 12px;
		font-size: 0.8rem;
		color: var(--ink-2);
	}
	.legend li {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.sw {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}
	.lbl {
		font-size: 12.5px;
		fill: var(--ink-2);
	}
	.seg {
		font-size: 10.5px;
		font-weight: 600;
		pointer-events: none;
		font-variant-numeric: tabular-nums;
	}
</style>
