<!-- Vertical histogram with hover tooltip and optional reference line (e.g. the mean). -->
<script lang="ts">
	interface Bin {
		x0: number;
		x1: number;
		count: number;
	}
	interface Props {
		bins: Bin[];
		format?: (v: number) => string;
		height?: number;
		marker?: { value: number; label: string } | null;
		color?: string;
	}
	let { bins, format = (v) => Math.round(v).toLocaleString(), height = 220, marker = null, color = 'var(--s1)' }: Props = $props();

	let width = $state(480);
	let hover = $state<number | null>(null);
	const m = { top: 18, right: 8, bottom: 28, left: 46 };
	const innerW = $derived(Math.max(50, width - m.left - m.right));
	const innerH = $derived(height - m.top - m.bottom);
	const maxC = $derived(Math.max(...bins.map((b) => b.count), 1));
	const lo = $derived(bins[0]?.x0 ?? 0);
	const hi = $derived(bins[bins.length - 1]?.x1 ?? 1);
	const sx = (v: number) => ((v - lo) / (hi - lo || 1)) * innerW;
	const sy = (c: number) => innerH - (c / maxC) * innerH;

	const yTicks = $derived.by(() => {
		const raw = maxC / 4;
		const p = Math.pow(10, Math.floor(Math.log10(raw)));
		const step = [1, 2, 2.5, 5, 10].map((k) => k * p).find((s) => s >= raw) ?? raw;
		return Array.from({ length: Math.floor(maxC / step) + 1 }, (_, i) => i * step);
	});
	const xTicks = $derived(Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4));
	const bw = $derived(innerW / bins.length);
</script>

<div class="wrap" bind:clientWidth={width}>
	<svg {width} {height} role="img" aria-label="Histogram">
		<g transform="translate({m.left},{m.top})">
			{#each yTicks as t}
				<line x1="0" x2={innerW} y1={sy(t)} y2={sy(t)} class="grid" />
				<text x="-8" y={sy(t)} dy="0.35em" text-anchor="end" class="tick">{t >= 1000 ? `${t / 1000}k` : t}</text>
			{/each}
			{#each bins as b, i}
				{@const h = innerH - sy(b.count)}
				<rect
					x={sx(b.x0) + 1}
					y={sy(b.count)}
					width={Math.max(1, bw - 2)}
					height={Math.max(0, h)}
					rx={Math.min(3, bw / 3)}
					fill={color}
					opacity={hover === null || hover === i ? 1 : 0.5}
				/>
				<rect
					role="listitem"
					x={sx(b.x0)}
					y="0"
					width={bw}
					height={innerH}
					fill="transparent"
					onmouseenter={() => (hover = i)}
					onmouseleave={() => (hover = null)}
				/>
			{/each}
			<line x1="0" x2={innerW} y1={innerH} y2={innerH} class="axis" />
			{#each xTicks as t}
				<text x={sx(t)} y={innerH + 18} text-anchor="middle" class="tick">{format(t)}</text>
			{/each}
			{#if marker}
				<line x1={sx(marker.value)} x2={sx(marker.value)} y1="-6" y2={innerH} class="marker" />
				<text x={sx(marker.value) + 5} y="-4" class="mlabel">{marker.label}</text>
			{/if}
		</g>
	</svg>
	{#if hover !== null}
		{@const b = bins[hover]}
		<div class="viz-tip" style="left:{m.left + sx(b.x0) + bw / 2}px; top:{m.top + sy(b.count)}px">
			<b>{format(b.x0)} – {format(b.x1)}</b><br />{b.count.toLocaleString()} customers
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
	.grid {
		stroke: var(--grid);
		stroke-width: 1;
	}
	.axis {
		stroke: var(--axis);
	}
	.tick {
		font-size: 11px;
		fill: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.marker {
		stroke: var(--ink);
		stroke-width: 1.5;
		stroke-dasharray: 4 3;
	}
	.mlabel {
		font-size: 11px;
		fill: var(--ink-2);
		font-weight: 600;
	}
</style>
