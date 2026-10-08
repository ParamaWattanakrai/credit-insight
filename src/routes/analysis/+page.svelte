<script lang="ts">
	import BarChart from '$lib/components/charts/BarChart.svelte';
	import Histogram from '$lib/components/charts/Histogram.svelte';
	import Heatmap from '$lib/components/charts/Heatmap.svelte';
	import Scatter from '$lib/components/charts/Scatter.svelte';
	import StackedBars from '$lib/components/charts/StackedBars.svelte';
	import { COLUMN_MAP } from '$lib/schema';
	import { money, compact, pct, num, pval } from '$lib/format';

	let { data } = $props();
	const a = $derived(data.a);

	const sections = [
		['descriptive', 'Descriptive'],
		['distributions', 'Distributions'],
		['correlation', 'Correlation'],
		['groups', 'Group comparison'],
		['mix', 'Spending mix'],
		['tests', 'Hypothesis tests'],
		['regression', 'Regression']
	];

	// --- group comparison controls
	const dims = [
		['byCard', 'Card type'],
		['byOccupation', 'Occupation'],
		['byAge', 'Age band'],
		['byGender', 'Gender'],
		['byScoreBand', 'Credit-score band']
	] as const;
	let dim = $state<(typeof dims)[number][0]>('byCard');
	let metric = $state('Credit_Score');
	const groupRows = $derived(a.groups[dim]);
	const fmtMetric = (key: string, v: number) => {
		const c = COLUMN_MAP[key];
		if (c.ratio) return pct(v);
		if (c.unit === 'amt') return money(v);
		return num(v, key === 'Credit_Score' ? 1 : 0);
	};

	const fmtCell = (key: string, v: number) => {
		const c = COLUMN_MAP[key];
		if (c.ratio) return v.toFixed(3);
		if (Math.abs(v) >= 1000) return num(v, 0);
		return num(v, 2);
	};

	const strength = (r: number) => (Math.abs(r) > 0.5 ? 'strong' : Math.abs(r) > 0.3 ? 'moderate' : Math.abs(r) > 0.1 ? 'weak' : 'negligible');
	const mixLabels = $derived(Object.fromEntries(a.mix.categories.map((k) => [k, COLUMN_MAP[k].label])));
	const tests = $derived([
		{ name: 'One-way ANOVA', q: 'Does mean credit score differ by card type?', t: a.tests.anovaScoreByCard, stat: `F = ${num(a.tests.anovaScoreByCard.F, 2)}`, df: `${a.tests.anovaScoreByCard.df1}, ${num(a.tests.anovaScoreByCard.df2)}`, eff: `η² = ${a.tests.anovaScoreByCard.etaSq.toFixed(4)}` },
		{ name: 'One-way ANOVA', q: 'Does mean credit score differ by occupation?', t: a.tests.anovaScoreByOcc, stat: `F = ${num(a.tests.anovaScoreByOcc.F, 2)}`, df: `${a.tests.anovaScoreByOcc.df1}, ${num(a.tests.anovaScoreByOcc.df2)}`, eff: `η² = ${a.tests.anovaScoreByOcc.etaSq.toFixed(4)}` },
		{ name: 'One-way ANOVA', q: 'Does mean monthly spending differ by card type?', t: a.tests.anovaSpendByCard, stat: `F = ${num(a.tests.anovaSpendByCard.F, 2)}`, df: `${a.tests.anovaSpendByCard.df1}, ${num(a.tests.anovaSpendByCard.df2)}`, eff: `η² = ${a.tests.anovaSpendByCard.etaSq.toFixed(4)}` },
		{ name: 'χ² test of independence', q: 'Is card type independent of occupation?', t: a.tests.chiCardOcc, stat: `χ² = ${num(a.tests.chiCardOcc.chi2, 2)}`, df: String(a.tests.chiCardOcc.df), eff: `Cramér's V = ${a.tests.chiCardOcc.cramersV.toFixed(4)}` },
		{ name: 'χ² test of independence', q: 'Is card type independent of gender?', t: a.tests.chiCardGender, stat: `χ² = ${num(a.tests.chiCardGender.chi2, 2)}`, df: String(a.tests.chiCardGender.df), eff: `Cramér's V = ${a.tests.chiCardGender.cramersV.toFixed(4)}` }
	]);
	const effectWord = (s: string) => {
		const v = parseFloat(s.split('=')[1]);
		if (s.startsWith('η²')) return v >= 0.14 ? 'large' : v >= 0.06 ? 'medium' : v >= 0.01 ? 'small' : 'negligible';
		return v >= 0.3 ? 'large' : v >= 0.1 ? 'small–medium' : 'negligible';
	};
</script>

<svelte:head><title>Statistics · Credit Insight</title></svelte:head>

<div class="page-head">
	<div>
		<h1>Statistical analysis</h1>
		<p>
			Computed from all <b class="num">{num(a.n)}</b> rows currently in the Excel file. Results are recalculated automatically after every edit.
		</p>
	</div>
	<a class="btn primary" href="/api/export/report.xlsx" data-sveltekit-reload>Download as Excel report</a>
</div>

<nav class="toc" aria-label="Sections">
	{#each sections as [id, label]}<a href="#{id}">{label}</a>{/each}
</nav>

<!-- 1. Descriptive -->
<section id="descriptive" class="card">
	<div class="card-head">
		<h2>1 · Descriptive statistics</h2>
		<p>SD = sample (STDEV.S) · quartiles = QUARTILE.INC · skewness = SKEW (Excel-compatible)</p>
	</div>
	<div class="table-wrap">
		<table>
			<thead>
				<tr>
					<th>Variable</th><th class="r">Mean</th><th class="r">SD</th><th class="r">Min</th><th class="r">Q1</th>
					<th class="r">Median</th><th class="r">Q3</th><th class="r">Max</th><th class="r">CV</th><th class="r">Skew</th>
				</tr>
			</thead>
			<tbody>
				{#each a.summaries as s}
					<tr>
						<td>{s.label}</td>
						<td class="r">{fmtCell(s.key, s.mean)}</td>
						<td class="r">{fmtCell(s.key, s.sd)}</td>
						<td class="r">{fmtCell(s.key, s.min)}</td>
						<td class="r">{fmtCell(s.key, s.q1)}</td>
						<td class="r">{fmtCell(s.key, s.median)}</td>
						<td class="r">{fmtCell(s.key, s.q3)}</td>
						<td class="r">{fmtCell(s.key, s.max)}</td>
						<td class="r">{s.cv.toFixed(2)}</td>
						<td class="r" class:hot={Math.abs(s.skew) > 1}>{s.skew.toFixed(2)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="foot">Highlighted skewness (|skew| &gt; 1) marks heavily right-skewed money variables — for these the <b>median</b> is a better "typical" value than the mean.</p>
</section>

<!-- 2. Distributions -->
<section id="distributions" class="grid grid-2">
	<div class="card">
		<div class="card-head"><h2>2 · Credit score</h2><p>30 bins</p></div>
		<Histogram bins={a.histograms.Credit_Score.bins} marker={{ value: a.kpis.avgScore, label: `mean ${num(a.kpis.avgScore)}` }} />
	</div>
	<div class="card">
		<div class="card-head"><h2>Monthly spending</h2><p>top 1% ({num(a.histograms.Monthly_Spending.clipped)} customers above {compact(a.histograms.Monthly_Spending.clipAt)}) omitted</p></div>
		<Histogram bins={a.histograms.Monthly_Spending.bins} format={compact} color="var(--s3)" marker={{ value: a.summaries.find((s) => s.key === 'Monthly_Spending')!.median, label: 'median' }} />
	</div>
	<div class="card">
		<div class="card-head"><h2>Age</h2><p>years</p></div>
		<Histogram bins={a.histograms.Age.bins} color="var(--s7)" />
	</div>
	<div class="card">
		<div class="card-head"><h2>Credit utilization</h2><p>balance ÷ limit</p></div>
		<Histogram bins={a.histograms.Credit_Utilization.bins} format={(v) => pct(v, 0)} color="var(--s2)" />
	</div>
</section>

<!-- 3. Correlation -->
<section id="correlation" class="grid grid-3">
	<div class="card span-2">
		<div class="card-head"><h2>3 · Pearson correlation matrix</h2><p>hover a cell for r</p></div>
		<Heatmap labels={a.corr.labels} matrix={a.corr.matrix} />
	</div>
	<div class="card">
		<div class="card-head"><h2>What moves credit score?</h2><p>r with Credit Score</p></div>
		<ul class="corr-list">
			{#each a.scoreCorrelations.slice(0, 12) as c}
				<li>
					<span class="cl">{c.label}</span>
					<span class="track">
						<span class="mid"></span>
						<span class="fill" class:neg={c.r < 0} style="width:{Math.abs(c.r) * 50}%; {c.r < 0 ? `right:50%` : `left:50%`}"></span>
					</span>
					<span class="cv num">{c.r >= 0 ? '+' : '−'}{Math.abs(c.r).toFixed(2)}</span>
				</li>
			{/each}
		</ul>
		<p class="foot">
			Strongest: <b>{a.scoreCorrelations[0].label}</b> ({strength(a.scoreCorrelations[0].r)}, r = {a.scoreCorrelations[0].r.toFixed(2)}).
			Correlation is not causation.
		</p>
	</div>
</section>

<!-- 4. Groups -->
<section id="groups" class="card">
	<div class="card-head">
		<h2>4 · Group comparison</h2>
		<div class="controls">
			<label>Group by
				<select bind:value={dim}>{#each dims as [k, l]}<option value={k}>{l}</option>{/each}</select>
			</label>
			<label>Metric
				<select bind:value={metric}>{#each a.groups.metrics as m}<option value={m}>{COLUMN_MAP[m].label}</option>{/each}</select>
			</label>
		</div>
	</div>
	<div class="grid grid-2">
		<div>
			<h3 class="mini">Mean {COLUMN_MAP[metric].label.toLowerCase()} by {dims.find((d) => d[0] === dim)![1].toLowerCase()}</h3>
			<BarChart
				items={groupRows.map((g) => ({ label: g.group, value: g.means[metric], detail: `${num(g.count)} customers (${pct(g.share)})` }))}
				format={(v) => fmtMetric(metric, v)}
				labelWidth={140}
			/>
		</div>
		<div class="table-wrap">
			<table>
				<thead>
					<tr><th>Group</th><th class="r">n</th><th class="r">Income</th><th class="r">Spend/mo</th><th class="r">Score</th><th class="r">Util.</th><th class="r">Pay ratio</th></tr>
				</thead>
				<tbody>
					{#each groupRows as g}
						<tr>
							<td>{g.group}</td>
							<td class="r">{num(g.count)}</td>
							<td class="r">{compact(g.means.Annual_Income)}</td>
							<td class="r">{compact(g.means.Monthly_Spending)}</td>
							<td class="r">{num(g.means.Credit_Score, 1)}</td>
							<td class="r">{pct(g.means.Credit_Utilization)}</td>
							<td class="r">{pct(g.means.Payment_Ratio)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</section>

<!-- 5. Mix -->
<section id="mix" class="card">
	<div class="card-head"><h2>5 · Spending mix by card type</h2><p>share of the seven spending categories</p></div>
	<StackedBars groups={a.mix.byCard} keys={a.mix.categories} labels={mixLabels} />
</section>

<!-- 6. Tests -->
<section id="tests" class="card">
	<div class="card-head"><h2>6 · Hypothesis tests</h2><p>α = 0.05</p></div>
	<div class="table-wrap">
		<table>
			<thead><tr><th>Test</th><th>Question (H₁)</th><th class="r">Statistic</th><th class="r">df</th><th class="r">p-value</th><th>Effect size</th><th>Decision</th></tr></thead>
			<tbody>
				{#each tests as t}
					<tr>
						<td>{t.name}</td>
						<td>{t.q}</td>
						<td class="r">{t.stat}</td>
						<td class="r">{t.df}</td>
						<td class="r">{pval(t.t.p)}</td>
						<td>{t.eff} <span class="pill">{effectWord(t.eff)}</span></td>
						<td><b>{t.t.p < 0.05 ? 'Reject H₀' : 'Fail to reject H₀'}</b></td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<p class="callout foot">
		With ~{compact(a.n)} observations even tiny differences become statistically significant, so read the <b>effect size</b>: η² is the share of
		variance explained by the grouping (0.01 small · 0.06 medium · 0.14 large); Cramér's V measures association strength between two categorical variables (0–1).
	</p>
</section>

<!-- 7. Regression -->
<section id="regression" class="grid grid-2">
	<div class="card">
		<div class="card-head">
			<h2>7 · Credit score vs payment ratio</h2>
			<p>R² = {a.regressions.regPayScore.r2.toFixed(3)}</p>
		</div>
		<Scatter
			points={a.scatterSample.map((p) => ({ x: p.Payment_Ratio, y: p.Credit_Score, id: p.id }))}
			line={a.regressions.regPayScore}
			xLabel="Payment ratio"
			yLabel="Credit score"
			xFormat={(v) => pct(v, 0)}
		/>
		<p class="foot mono">ŷ = {a.regressions.regPayScore.intercept.toFixed(1)} + {a.regressions.regPayScore.slope.toFixed(1)} · payment_ratio</p>
	</div>
	<div class="card">
		<div class="card-head">
			<h2>Credit limit vs annual income</h2>
			<p>R² = {a.regressions.regIncomeLimit.r2.toFixed(3)}</p>
		</div>
		<Scatter
			points={a.scatterSample.map((p) => ({ x: p.Annual_Income, y: p.Credit_Limit, id: p.id }))}
			line={a.regressions.regIncomeLimit}
			xLabel="Annual income"
			yLabel="Credit limit"
			xFormat={compact}
			yFormat={compact}
		/>
		<p class="foot mono">ŷ = {compact(a.regressions.regIncomeLimit.intercept)} + {a.regressions.regIncomeLimit.slope.toFixed(3)} · income</p>
	</div>
</section>
<p class="muted note">Scatter plots show a fixed sample of 1,200 customers for readability; regression lines are fitted on all {num(a.n)}.</p>

<style>
	section {
		margin-top: 16px;
		scroll-margin-top: 110px;
	}
	.toc {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		position: sticky;
		top: 56px;
		z-index: 5;
		background: var(--page);
		padding: 8px 0;
	}
	.toc a {
		font-size: 0.82rem;
		padding: 4px 11px;
		border-radius: 999px;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--ink-2);
		text-decoration: none;
	}
	.toc a:hover {
		color: var(--ink);
		border-color: var(--axis);
	}
	td.hot {
		color: var(--s2);
		font-weight: 600;
	}
	.foot {
		margin-top: 12px;
		font-size: 0.82rem;
		color: var(--ink-2);
	}
	.mono {
		font-family: var(--mono);
	}
	.mini {
		margin-bottom: 12px;
		color: var(--ink-2);
		font-weight: 550;
	}
	.controls {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}
	.controls label {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 0.82rem;
		color: var(--ink-2);
	}
	.corr-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 7px;
	}
	.corr-list li {
		display: grid;
		grid-template-columns: 1fr 90px 44px;
		align-items: center;
		gap: 8px;
		font-size: 0.82rem;
	}
	.cl {
		color: var(--ink-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.track {
		position: relative;
		height: 10px;
	}
	.mid {
		position: absolute;
		left: 50%;
		top: -2px;
		bottom: -2px;
		width: 1px;
		background: var(--axis);
	}
	.fill {
		position: absolute;
		top: 0;
		height: 100%;
		background: var(--div-pos);
		border-radius: 3px;
	}
	.fill.neg {
		background: var(--div-neg);
	}
	.cv {
		text-align: right;
	}
	.note {
		font-size: 0.8rem;
		margin-top: 10px;
	}
	@media (max-width: 760px) {
		.toc {
			top: 96px;
		}
	}
</style>
