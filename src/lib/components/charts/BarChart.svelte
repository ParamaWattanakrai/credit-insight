<!-- Horizontal bar chart: one series, labels on the left, value labels at bar ends. -->
<script lang="ts">
	interface Item {
		label: string;
		value: number;
		detail?: string;
	}
	interface Props {
		items: Item[];
		format?: (v: number) => string;
		color?: string;
		barHeight?: number;
		labelWidth?: number;
		domainMin?: number;
	}
	let { items, format = (v) => v.toLocaleString(), color = 'var(--s1)', barHeight = 22, labelWidth = 130, domainMin = 0 }: Props = $props();

	let width = $state(480);
	let hover = $state<number | null>(null);
	const gap = 10;
	const valueRoom = 76;
	const height = $derived(items.length * (barHeight + gap));
	const max = $derived(Math.max(...items.map((d) => d.value), 0));
	const plotW = $derived(Math.max(40, width - labelWidth - valueRoom));
	const x = (v: number) => ((v - domainMin) / (max - domainMin || 1)) * plotW;
</script>

<div class="wrap" bind:clientWidth={width}>
	<svg {width} {height} role="img" aria-label="Bar chart">
		{#each items as d, i}
			{@const y = i * (barHeight + gap)}
			{@const w = Math.max(6, x(d.value))}
			<g
				role="listitem"
				onmouseenter={() => (hover = i)}
				onmouseleave={() => (hover = null)}
				opacity={hover === null || hover === i ? 1 : 0.55}
			>
				<rect x="0" {y} width={width} height={barHeight + gap} fill="transparent" />
				<text x={labelWidth - 10} y={y + barHeight / 2} dy="0.35em" text-anchor="end" class="lbl">{d.label}</text>
				<path
					d="M{labelWidth},{y} h{w - 4} a4,4 0 0 1 4,4 v{barHeight - 8} a4,4 0 0 1 -4,4 h{-(w - 4)} z"
					fill={color}
				/>
				<text x={labelWidth + w + 6} y={y + barHeight / 2} dy="0.35em" class="val">{format(d.value)}</text>
			</g>
		{/each}
	</svg>
	{#if hover !== null && items[hover]?.detail}
		<div class="viz-tip" style="left:{labelWidth + x(items[hover].value) / 2}px; top:{hover * (barHeight + gap)}px">
			<b>{items[hover].label}</b><br />{items[hover].detail}
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
		overflow: visible;
	}
	.lbl {
		font-size: 12.5px;
		fill: var(--ink-2);
	}
	.val {
		font-size: 12px;
		fill: var(--ink);
		font-variant-numeric: tabular-nums;
	}
</style>
