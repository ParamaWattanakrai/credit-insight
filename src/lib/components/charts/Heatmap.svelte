<!-- Correlation heatmap with a diverging red–gray–blue scale. -->
<script lang="ts">
	interface Props {
		labels: string[];
		matrix: number[][];
	}
	let { labels, matrix }: Props = $props();

	let width = $state(640);
	let hover = $state<[number, number] | null>(null);
	const labelW = 150;
	const n = $derived(labels.length);
	const cell = $derived(Math.max(22, Math.min(46, (width - labelW) / n)));

	const fmtR = (r: number) => {
		const s = Math.abs(r).toFixed(2).replace(/^0/, '');
		return s === '.00' ? '.00' : (r < 0 ? '−' : '') + s;
	};
	function fill(r: number) {
		const pct = Math.round(Math.min(1, Math.abs(r)) * 100);
		return `color-mix(in oklab, ${r >= 0 ? 'var(--div-pos)' : 'var(--div-neg)'} ${pct}%, var(--div-mid))`;
	}
</script>

<div class="wrap" bind:clientWidth={width}>
	<svg width={labelW + cell * n} height={cell * n + 110} role="img" aria-label="Correlation matrix">
		<g transform="translate({labelW},4)">
			{#each matrix as row, i}
				<text x="-8" y={i * cell + cell / 2} dy="0.35em" text-anchor="end" class="lbl" class:on={hover?.[0] === i}>{labels[i]}</text>
				{#each row as r, j}
					<rect
						role="listitem"
						x={j * cell + 1}
						y={i * cell + 1}
						width={cell - 2}
						height={cell - 2}
						rx="3"
						fill={fill(r)}
						stroke={hover && hover[0] === i && hover[1] === j ? 'var(--ink)' : 'none'}
						stroke-width="1.5"
						onmouseenter={() => (hover = [i, j])}
						onmouseleave={() => (hover = null)}
					/>
					{#if cell >= 30}
						<text x={j * cell + cell / 2} y={i * cell + cell / 2} dy="0.35em" text-anchor="middle" class="v" class:inv={Math.abs(r) > 0.55}>
							{i === j ? '' : fmtR(r)}
						</text>
					{/if}
				{/each}
			{/each}
			{#each labels as l, j}
				<text transform="translate({j * cell + cell / 2},{n * cell + 8}) rotate(-50)" text-anchor="end" class="lbl" class:on={hover?.[1] === j}>{l}</text>
			{/each}
		</g>
	</svg>
	{#if hover}
		<div class="viz-tip" style="left:{labelW + hover[1] * cell + cell / 2}px; top:{hover[0] * cell + 4}px">
			<b>{labels[hover[0]]}</b> × <b>{labels[hover[1]]}</b><br />r = {matrix[hover[0]][hover[1]].toFixed(3)}
		</div>
	{/if}
	<div class="legend">
		<span>−1</span>
		<div class="ramp"></div>
		<span>+1</span>
		<span class="muted">negative ← 0 → positive</span>
	</div>
</div>

<style>
	.wrap {
		position: relative;
		width: 100%;
		overflow-x: auto;
	}
	svg {
		display: block;
	}
	.lbl {
		font-size: 11.5px;
		fill: var(--ink-2);
	}
	.lbl.on {
		fill: var(--ink);
		font-weight: 650;
	}
	.v {
		font-size: 10.5px;
		fill: var(--ink);
		font-variant-numeric: tabular-nums;
		pointer-events: none;
	}
	.v.inv {
		fill: #fff;
	}
	.legend {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.78rem;
		color: var(--ink-2);
		margin-top: 4px;
	}
	.ramp {
		width: 160px;
		height: 10px;
		border-radius: 3px;
		background: linear-gradient(90deg, var(--div-neg), var(--div-mid), var(--div-pos));
	}
</style>
