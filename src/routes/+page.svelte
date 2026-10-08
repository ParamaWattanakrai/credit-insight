<script lang="ts">
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import Histogram from '$lib/components/charts/Histogram.svelte';
	import { money, compact, pct, num } from '$lib/format';

	let { data } = $props();
	const k = $derived(data.kpis);
</script>

<svelte:head><title>Dashboard · Credit Insight</title></svelte:head>

<div class="page-head">
	<div>
		<h1>Credit card customer behaviour</h1>
		<p>
			Live overview of <b class="num">{num(k.customers)}</b> customers stored in Excel. Numbers update as soon as records are added,
			edited or removed on the <a href="/data">Data</a> page.
		</p>
	</div>
	<div class="actions">
		<a class="btn" href="/api/export/report.xlsx" data-sveltekit-reload>Download Excel report</a>
		<a class="btn primary" href="/analysis">Full statistics →</a>
	</div>
</div>

<section class="grid grid-4 kpis">
	<div class="card kpi">
		<span>Customers</span>
		<strong>{num(k.customers)}</strong>
		<small>{pct(k.fullPayers, 0)} pay ≥ 95% of their statement</small>
	</div>
	<div class="card kpi">
		<span>Average credit score</span>
		<strong>{num(k.avgScore)}</strong>
		<small>median {num(k.medianScore)}</small>
	</div>
	<div class="card kpi">
		<span>Average monthly spend</span>
		<strong>{money(k.avgSpend)}</strong>
		<small>avg income {money(k.avgIncome)} / yr</small>
	</div>
	<div class="card kpi">
		<span>High-risk customers</span>
		<strong>{pct(k.highRiskShare)}</strong>
		<small>{num(k.highRisk)} with utilization ≥ 80% and paying &lt; 30%</small>
	</div>
</section>

<section class="grid grid-2 row">
	<div class="card">
		<div class="card-head">
			<h2>Credit score distribution</h2>
			<p>SD {num(data.scoreSummary.sd, 1)} · skew {data.scoreSummary.skew.toFixed(2)}</p>
		</div>
		<Histogram bins={data.scoreHist.bins} marker={{ value: k.avgScore, label: `mean ${num(k.avgScore)}` }} />
	</div>
	<div class="card">
		<div class="card-head">
			<h2>Average monthly spending by card type</h2>
			<p>per customer</p>
		</div>
		<BarChart
			items={data.byCard.map((g) => ({ label: g.group, value: g.means.Monthly_Spending, detail: `${num(g.count)} customers · avg limit ${money(g.means.Credit_Limit)}` }))}
			format={money}
			labelWidth={90}
			barHeight={26}
		/>
	</div>
</section>

<section class="grid grid-3 row">
	<div class="card">
		<div class="card-head"><h2>Where the money goes</h2><p>avg / month</p></div>
		<BarChart
			items={[...data.mix].sort((a, b) => b.mean - a.mean).map((c) => ({ label: c.label, value: c.mean, detail: `${pct(c.mean / data.mixTotal)} of categorised spend` }))}
			format={(v) => compact(v)}
			labelWidth={110}
			barHeight={18}
			color="var(--s3)"
		/>
	</div>
	<div class="card">
		<div class="card-head"><h2>Customers by occupation</h2><p>count</p></div>
		<BarChart
			items={[...data.byOccupation].sort((a, b) => b.count - a.count).map((g) => ({ label: g.group, value: g.count, detail: `${pct(g.share)} · avg score ${num(g.means.Credit_Score)}` }))}
			format={(v) => compact(v)}
			labelWidth={140}
			barHeight={18}
			color="var(--s7)"
		/>
	</div>
	<div class="card">
		<div class="card-head"><h2>Credit-score bands</h2><p>count</p></div>
		<BarChart
			items={data.byScoreBand.map((g) => ({ label: g.group, value: g.count, detail: `${pct(g.share)} · avg pay ratio ${pct(g.means.Payment_Ratio, 0)} · avg util ${pct(g.means.Credit_Utilization, 0)}` }))}
			format={(v) => compact(v)}
			labelWidth={130}
			barHeight={18}
		/>
	</div>
</section>

<section class="card row">
	<div class="card-head"><h2>Key findings</h2><p>generated from the current data</p></div>
	<ol class="insights">
		{#each data.insights as t}<li>{t}</li>{/each}
	</ol>
</section>

<style>
	.actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.row {
		margin-top: 16px;
	}
	.kpi {
		display: grid;
		gap: 2px;
	}
	.kpi span {
		font-size: 0.82rem;
		color: var(--ink-2);
	}
	.kpi strong {
		font-size: 1.85rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		line-height: 1.15;
	}
	.kpi small {
		color: var(--muted);
		font-size: 0.78rem;
	}
	.insights {
		margin: 0;
		padding-left: 1.3em;
		display: grid;
		gap: 8px;
		color: var(--ink-2);
		max-width: 95ch;
	}
</style>
