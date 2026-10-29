
import ExcelJS from 'exceljs';
import { getAnalysis } from './stats';
import { COLUMN_MAP } from '$lib/schema';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C5CAB' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14 };

function title(ws: ExcelJS.Worksheet, text: string, note?: string) {
	ws.getCell('A1').value = text;
	ws.getCell('A1').font = TITLE_FONT;
	if (note) {
		ws.getCell('A2').value = note;
		ws.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };
	}
}

function table(ws: ExcelJS.Worksheet, startRow: number, header: string[], rows: (string | number)[][], formats: (string | undefined)[] = []) {
	const h = ws.getRow(startRow);
	header.forEach((t, i) => {
		const c = h.getCell(i + 1);
		c.value = t;
		c.fill = HEADER_FILL;
		c.font = HEADER_FONT;
		c.alignment = { vertical: 'middle', wrapText: true };
	});
	rows.forEach((r, ri) => {
		const row = ws.getRow(startRow + 1 + ri);
		r.forEach((v, ci) => {
			const c = row.getCell(ci + 1);
			c.value = v;
			if (formats[ci]) c.numFmt = formats[ci]!;
		});
	});
	return startRow + rows.length + 2;
}

const fmtFor = (key: string) => {
	const col = COLUMN_MAP[key];
	if (col?.ratio) return '0.0%';
	if (col?.type === 'float' || col?.unit === 'amt') return '#,##0.00';
	return '#,##0.0';
};

export async function buildReport(): Promise<Buffer> {
	const a = await getAnalysis();
	const wb = new ExcelJS.Workbook();
	wb.creator = 'Credit Insight';
	wb.created = new Date();

	{
		const ws = wb.addWorksheet('Summary');
		title(ws, 'Credit card customer behaviour — statistical summary', `Generated ${new Date().toLocaleString()} from ${a.n.toLocaleString()} live records`);
		const k = a.kpis;
		const end = table(
			ws,
			4,
			['Metric', 'Value'],
			[
				['Customers', k.customers],
				['Average annual income', k.avgIncome],
				['Average monthly spending', k.avgSpend],
				['Average credit score', k.avgScore],
				['Median credit score', k.medianScore],
				['Average credit utilization', k.avgUtil],
				['Average payment ratio', k.avgPayRatio],
				['Share paying ≥ 95% of statement', k.fullPayers],
				['High-risk customers (util ≥ 80%, pay < 30%)', k.highRisk],
				['High-risk share', k.highRiskShare]
			]
		);
		['#,##0', '#,##0', '#,##0', '0.0', '0', '0.0%', '0.0%', '0.0%', '#,##0', '0.0%'].forEach((f, i) => (ws.getCell(`B${5 + i}`).numFmt = f));
		ws.getCell(`A${end}`).value = 'Key findings';
		ws.getCell(`A${end}`).font = { bold: true, size: 12 };
		a.insights.forEach((t, i) => {
			const c = ws.getCell(`A${end + 1 + i}`);
			c.value = `${i + 1}. ${t}`;
			ws.mergeCells(`A${end + 1 + i}:H${end + 1 + i}`);
			c.alignment = { wrapText: true, vertical: 'top' };
			ws.getRow(end + 1 + i).height = 32;
		});
		ws.getColumn(1).width = 46;
		ws.getColumn(2).width = 18;
	}

	{
		const ws = wb.addWorksheet('Descriptive Stats', { views: [{ state: 'frozen', ySplit: 4, xSplit: 1 }] });
		title(ws, 'Descriptive statistics', 'SD = sample standard deviation (STDEV.S); quartiles = QUARTILE.INC; skewness = SKEW');
		table(
			ws,
			4,
			['Variable', 'N', 'Mean', 'SD', 'Min', 'Q1', 'Median', 'Q3', 'Max', 'IQR', 'CV', 'Skewness'],
			a.summaries.map((s) => [s.label, s.n, s.mean, s.sd, s.min, s.q1, s.median, s.q3, s.max, s.q3 - s.q1, s.cv, s.skew]),
			[undefined, '#,##0', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '#,##0.00', '0.00', '0.00']
		);
		ws.getColumn(1).width = 28;
		for (let i = 2; i <= 12; i++) ws.getColumn(i).width = 14;
	}

	const groupSheet = (name: string, heading: string, groups: typeof a.groups.byCard) => {
		const ws = wb.addWorksheet(name);
		title(ws, heading, 'Mean of each metric per group');
		const metrics = a.groups.metrics;
		table(
			ws,
			4,
			['Group', 'Customers', 'Share', ...metrics.map((m) => COLUMN_MAP[m].label)],
			groups.map((g) => [g.group, g.count, g.share, ...metrics.map((m) => g.means[m])]),
			[undefined, '#,##0', '0.0%', ...metrics.map(fmtFor)]
		);
		ws.getColumn(1).width = 22;
		for (let i = 2; i <= 3 + metrics.length; i++) ws.getColumn(i).width = 16;
	};
	groupSheet('By Card Type', 'Comparison by card type', a.groups.byCard);
	groupSheet('By Occupation', 'Comparison by occupation', a.groups.byOccupation);
	groupSheet('By Age Band', 'Comparison by age band', a.groups.byAge);
	groupSheet('By Credit Score Band', 'Comparison by credit-score band (FICO-style)', a.groups.byScoreBand);

	{
		const ws = wb.addWorksheet('Correlation');
		title(ws, 'Pearson correlation matrix', 'Blue = positive, red = negative; |r| > 0.5 strong, 0.3–0.5 moderate, < 0.3 weak');
		const { labels, matrix } = a.corr;
		table(ws, 4, ['', ...labels], matrix.map((r, i) => [labels[i], ...r]), [undefined, ...labels.map(() => '0.00')]);
		const last = String.fromCharCode(65 + labels.length);
		ws.addConditionalFormatting({
			ref: `B5:${last}${4 + labels.length}`,
			rules: [
				{
					type: 'colorScale',
					priority: 1,
					cfvo: [
						{ type: 'num', value: -1 },
						{ type: 'num', value: 0 },
						{ type: 'num', value: 1 }
					],
					color: [{ argb: 'FFD03B3B' }, { argb: 'FFF0EFEC' }, { argb: 'FF2A78D6' }]
				}
			]
		});
		ws.getColumn(1).width = 26;
		for (let i = 2; i <= labels.length + 1; i++) ws.getColumn(i).width = 12;

		const r0 = 6 + labels.length;
		ws.getCell(`A${r0}`).value = 'Correlation of every variable with Credit Score (sorted by strength)';
		ws.getCell(`A${r0}`).font = { bold: true };
		table(ws, r0 + 1, ['Variable', 'r with Credit Score', 'Strength'], a.scoreCorrelations.map((c) => [c.label, c.r, Math.abs(c.r) > 0.5 ? 'Strong' : Math.abs(c.r) > 0.3 ? 'Moderate' : Math.abs(c.r) > 0.1 ? 'Weak' : 'Negligible']), [undefined, '0.000']);
	}

	{
		const ws = wb.addWorksheet('Hypothesis Tests');
		title(ws, 'Inferential statistics', 'α = 0.05. With n ≈ 50,000 almost any difference is "significant" — read the effect size (η², Cramér\'s V, R²).');
		const t = a.tests;
		const pfmt = (p: number) => (p < 1e-4 ? '< 0.0001' : p.toFixed(4));
		const verdict = (p: number) => (p < 0.05 ? 'Reject H₀' : 'Fail to reject H₀');
		let r = table(
			ws,
			4,
			['Test', 'Question', 'Statistic', 'df', 'p-value', 'Effect size', 'Decision'],
			[
				['One-way ANOVA', 'Does mean credit score differ by card type?', t.anovaScoreByCard.F, `${t.anovaScoreByCard.df1}, ${t.anovaScoreByCard.df2}`, pfmt(t.anovaScoreByCard.p), `η² = ${t.anovaScoreByCard.etaSq.toFixed(4)}`, verdict(t.anovaScoreByCard.p)],
				['One-way ANOVA', 'Does mean credit score differ by occupation?', t.anovaScoreByOcc.F, `${t.anovaScoreByOcc.df1}, ${t.anovaScoreByOcc.df2}`, pfmt(t.anovaScoreByOcc.p), `η² = ${t.anovaScoreByOcc.etaSq.toFixed(4)}`, verdict(t.anovaScoreByOcc.p)],
				['One-way ANOVA', 'Does mean monthly spending differ by card type?', t.anovaSpendByCard.F, `${t.anovaSpendByCard.df1}, ${t.anovaSpendByCard.df2}`, pfmt(t.anovaSpendByCard.p), `η² = ${t.anovaSpendByCard.etaSq.toFixed(4)}`, verdict(t.anovaSpendByCard.p)],
				['χ² independence', 'Is card type independent of occupation?', t.chiCardOcc.chi2, String(t.chiCardOcc.df), pfmt(t.chiCardOcc.p), `V = ${t.chiCardOcc.cramersV.toFixed(4)}`, verdict(t.chiCardOcc.p)],
				['χ² independence', 'Is card type independent of gender?', t.chiCardGender.chi2, String(t.chiCardGender.df), pfmt(t.chiCardGender.p), `V = ${t.chiCardGender.cramersV.toFixed(4)}`, verdict(t.chiCardGender.p)]
			],
			[undefined, undefined, '#,##0.00']
		);
		const g = a.regressions;
		ws.getCell(`A${r}`).value = 'Simple linear regressions';
		ws.getCell(`A${r}`).font = { bold: true };
		r = table(
			ws,
			r + 1,
			['Model', 'Slope', 'Intercept', 'r', 'R²'],
			[
				['Credit_Score = a + b·Payment_Ratio', g.regPayScore.slope, g.regPayScore.intercept, g.regPayScore.r, g.regPayScore.r2],
				['Credit_Score = a + b·Credit_Utilization', g.regUtilScore.slope, g.regUtilScore.intercept, g.regUtilScore.r, g.regUtilScore.r2],
				['Credit_Limit = a + b·Annual_Income', g.regIncomeLimit.slope, g.regIncomeLimit.intercept, g.regIncomeLimit.r, g.regIncomeLimit.r2]
			],
			[undefined, '#,##0.0000', '#,##0.00', '0.000', '0.000']
		);
		ws.getCell(`A${r}`).value = 'Contingency table: occupation × card type (observed counts)';
		ws.getCell(`A${r}`).font = { bold: true };
		const c = t.chiCardOcc;
		table(ws, r + 1, ['Occupation', ...c.cols, 'Total'], c.rows.map((name, i) => [name, ...c.counts[i], c.rowTot[i]]), [undefined, ...c.cols.map(() => '#,##0'), '#,##0']);
		ws.getColumn(1).width = 40;
		ws.getColumn(2).width = 44;
		for (let i = 3; i <= 8; i++) ws.getColumn(i).width = 16;
	}

	{
		const ws = wb.addWorksheet('Spending Mix');
		title(ws, 'Spending mix by category', 'Average monthly per customer, and each category\'s share within card tiers');
		const m = a.mix;
		const r = table(ws, 4, ['Category', 'Avg monthly', 'Share'], m.overall.map((c) => [c.label, c.mean, c.mean / m.total]), [undefined, '#,##0.00', '0.0%']);
		table(
			ws,
			r,
			['Card type', 'Avg categorised spend', ...m.categories.map((k) => COLUMN_MAP[k].label)],
			m.byCard.map((g) => [g.group, g.total, ...m.categories.map((k) => g.shares[k])]),
			[undefined, '#,##0.00', ...m.categories.map(() => '0.0%')]
		);
		ws.getColumn(1).width = 22;
		for (let i = 2; i <= 9; i++) ws.getColumn(i).width = 16;
	}

	return Buffer.from(await wb.xlsx.writeBuffer());
}
