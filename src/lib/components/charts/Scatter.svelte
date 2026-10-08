<!-- Scatter plot (sampled points) with an OLS regression line. -->
<script lang="ts">
	interface Props {
		points: { x: number; y: number; id?: string }[];
		line?: { slope: number; intercept: number } | null;
		xLabel: string;
		yLabel: string;
		xFormat?: (v: number) => string;
		yFormat?: (v: number) => string;
		height?: number;
		xMax?: number;
	}
	let { points, line = null, xLabel, yLabel, xFormat = (v) => String(v), yFormat = (v) => String(Math.round(v)), height = 280, xMax }: Props = $props();

	let width = $state(480);
	let hover = $state<number | null>(null);
	const m = { top: 12, right: 14, bottom: 42, left: 52 };
	const innerW = $derived(Math.max(60, width - m.left - m.right));
	const innerH = $derived(height - m.top - m.bottom);

	function niceExtent(vals: number[]) {
		let lo = Math.min(...vals),
			hi = Math.max(...vals);
		const pad = (hi - lo) * 0.04 || 1;
		return [lo - pad, hi + pad];
	}
	const xd = $derived(xMax !== undefined ? [Math.min(...points.map((p) => p.x)), xMax] : niceExtent(points.map((p) => p.x)));
	const yd = $derived(niceExtent(points.map((p) => p.y)));
	const sx = (v: number) => ((v - xd[0]) / (xd[1] - xd[0])) * innerW;
	const sy = (v: number) => innerH - ((v - yd[0]) / (yd[1] - yd[0])) * innerH;
	const ticks = (d: number[], k = 5) => Array.from({ length: k }, (_, i) => d[0] + ((d[1] - d[0]) * (i + 0.5)) / k);
</script>

<div class="wrap" bind:clientWidth={width}>
	<svg {width} {height} role="img" aria-label="{yLabel} vs {xLabel}">
		<g transform="translate({m.left},{m.top})">
			{#each ticks(yd) as t}
				<line x1="0" x2={innerW} y1={sy(t)} y2={sy(t)} class="grid" />
				<text x="-8" y={sy(t)} dy="0.35em" text-anchor="end" class="tick">{yFormat(t)}</text>
			{/each}
			{#each ticks(xd) as t}
				<text x={sx(t)} y={innerH + 16} text-anchor="middle" class="tick">{xFormat(t)}</text>
			{/each}
			<line x1="0" x2={innerW} y1={innerH} y2={innerH} class="axis" />
			{#each points as p, i}
				{#if p.x <= xd[1]}
					<circle
						role="listitem"
						cx={sx(p.x)}
						cy={sy(p.y)}
						r={hover === i ? 5 : 2.6}
						class="pt"
						class:on={hover === i}
						onmouseenter={() => (hover = i)}
						onmouseleave={() => (hover = null)}
					/>
				{/if}
			{/each}
			{#if line}
				<line
					x1={sx(xd[0])}
					y1={sy(line.intercept + line.slope * xd[0])}
					x2={sx(xd[1])}
					y2={sy(line.intercept + line.slope * xd[1])}
					class="fit"
				/>
			{/if}
			<text x={innerW / 2} y={innerH + 36} text-anchor="middle" class="axis-label">{xLabel}</text>
			<text transform="translate(-40,{innerH / 2}) rotate(-90)" text-anchor="middle" class="axis-label">{yLabel}</text>
		</g>
	</svg>
	{#if hover !== null}
		{@const p = points[hover]}
		<div class="viz-tip" style="left:{m.left + sx(p.x)}px; top:{m.top + sy(p.y)}px">
			{#if p.id}<b>{p.id}</b><br />{/if}{xLabel}: {xFormat(p.x)}<br />{yLabel}: {yFormat(p.y)}
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
	}
	.axis {
		stroke: var(--axis);
	}
	.tick {
		font-size: 11px;
		fill: var(--muted);
		font-variant-numeric: tabular-nums;
	}
	.axis-label {
		font-size: 11.5px;
		fill: var(--ink-2);
	}
	.pt {
		fill: var(--s1);
		fill-opacity: 0.32;
	}
	.pt.on {
		fill-opacity: 1;
		stroke: var(--surface);
		stroke-width: 2;
	}
	.fit {
		stroke: var(--s2);
		stroke-width: 2.5;
	}
</style>
