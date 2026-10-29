
import { getStore } from './store';
import {
	NUMERIC_KEYS,
	SPENDING_CATEGORIES,
	CARD_TYPES,
	OCCUPATIONS,
	COLUMN_MAP,
	type Customer
} from '$lib/schema';


export interface Summary {
	key: string;
	label: string;
	n: number;
	mean: number;
	sd: number;
	min: number;
	q1: number;
	median: number;
	q3: number;
	max: number;
	skew: number;
	cv: number;
}

function quantileSorted(s: Float64Array, p: number) {
	if (!s.length) return NaN;
	const pos = (s.length - 1) * p;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

function column(rows: Customer[], key: string) {
	const a = new Float64Array(rows.length);
	for (let i = 0; i < rows.length; i++) a[i] = Number(rows[i][key]);
	return a;
}

function summarize(key: string, a: Float64Array): Summary {
	const n = a.length;
	let sum = 0;
	for (const v of a) sum += v;
	const mean = sum / n;
	let m2 = 0,
		m3 = 0;
	for (const v of a) {
		const d = v - mean;
		m2 += d * d;
		m3 += d * d * d;
	}
	const sd = Math.sqrt(m2 / (n - 1));
	const skew = n > 2 && sd > 0 ? (n / ((n - 1) * (n - 2))) * (m3 / Math.pow(sd, 3)) : 0;
	const s = Float64Array.from(a).sort();
	return {
		key,
		label: COLUMN_MAP[key]?.label ?? key,
		n,
		mean,
		sd,
		min: s[0],
		q1: quantileSorted(s, 0.25),
		median: quantileSorted(s, 0.5),
		q3: quantileSorted(s, 0.75),
		max: s[n - 1],
		skew,
		cv: mean ? sd / mean : 0
	};
}

function pearson(x: Float64Array, y: Float64Array) {
	const n = x.length;
	let sx = 0,
		sy = 0;
	for (let i = 0; i < n; i++) {
		sx += x[i];
		sy += y[i];
	}
	const mx = sx / n,
		my = sy / n;
	let sxy = 0,
		sxx = 0,
		syy = 0;
	for (let i = 0; i < n; i++) {
		const dx = x[i] - mx,
			dy = y[i] - my;
		sxy += dx * dy;
		sxx += dx * dx;
		syy += dy * dy;
	}
	return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}


function lgamma(x: number): number {
	const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
	let y = x;
	const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
	let ser = 1.000000000190015;
	for (const ci of c) ser += ci / ++y;
	return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function gammaQ(a: number, x: number): number {
	if (x <= 0) return 1;
	if (x < a + 1) {
		let sum = 1 / a,
			del = sum,
			ap = a;
		for (let i = 0; i < 500; i++) {
			del *= x / ++ap;
			sum += del;
			if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
		}
		return 1 - sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
	}
	let b = x + 1 - a,
		c = 1e300,
		d = 1 / b,
		h = d;
	for (let i = 1; i < 500; i++) {
		const an = -i * (i - a);
		b += 2;
		d = an * d + b;
		if (Math.abs(d) < 1e-300) d = 1e-300;
		c = b + an / c;
		if (Math.abs(c) < 1e-300) c = 1e-300;
		d = 1 / d;
		const del = d * c;
		h *= del;
		if (Math.abs(del - 1) < 1e-14) break;
	}
	return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

function betacf(a: number, b: number, x: number) {
	const qab = a + b,
		qap = a + 1,
		qam = a - 1;
	let c = 1,
		d = 1 - (qab * x) / qap;
	if (Math.abs(d) < 1e-300) d = 1e-300;
	d = 1 / d;
	let h = d;
	for (let m = 1; m <= 500; m++) {
		const m2 = 2 * m;
		let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < 1e-300) d = 1e-300;
		c = 1 + aa / c;
		if (Math.abs(c) < 1e-300) c = 1e-300;
		d = 1 / d;
		h *= d * c;
		aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < 1e-300) d = 1e-300;
		c = 1 + aa / c;
		if (Math.abs(c) < 1e-300) c = 1e-300;
		d = 1 / d;
		const del = d * c;
		h *= del;
		if (Math.abs(del - 1) < 1e-14) break;
	}
	return h;
}

function betaI(a: number, b: number, x: number) {
	if (x <= 0) return 0;
	if (x >= 1) return 1;
	const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
	return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

const fPValue = (f: number, d1: number, d2: number) => betaI(d2 / 2, d1 / 2, d2 / (d2 + d1 * f));
const chi2PValue = (x: number, df: number) => gammaQ(df / 2, x / 2);


export interface GroupRow {
	group: string;
	count: number;
	share: number;
	means: Record<string, number>;
}

function groupBy(rows: Customer[], keyFn: (r: Customer) => string, order: string[], metrics: string[]): GroupRow[] {
	const acc = new Map<string, { count: number; sums: Record<string, number> }>();
	for (const g of order) acc.set(g, { count: 0, sums: Object.fromEntries(metrics.map((m) => [m, 0])) });
	for (const r of rows) {
		const g = keyFn(r);
		let a = acc.get(g);
		if (!a) acc.set(g, (a = { count: 0, sums: Object.fromEntries(metrics.map((m) => [m, 0])) }));
		a.count++;
		for (const m of metrics) a.sums[m] += Number(r[m]);
	}
	return [...acc.entries()]
		.filter(([, a]) => a.count > 0)
		.map(([group, a]) => ({
			group,
			count: a.count,
			share: a.count / rows.length,
			means: Object.fromEntries(metrics.map((m) => [m, a.sums[m] / a.count]))
		}));
}

export const AGE_BANDS = ['18–24', '25–34', '35–44', '45–54', '55–64', '65+'];
export function ageBand(age: number) {
	if (age < 25) return '18–24';
	if (age < 35) return '25–34';
	if (age < 45) return '35–44';
	if (age < 55) return '45–54';
	if (age < 65) return '55–64';
	return '65+';
}

export const SCORE_BANDS = ['Poor (<580)', 'Fair (580–669)', 'Good (670–739)', 'Very good (740–799)', 'Excellent (800+)'];
export function scoreBand(s: number) {
	if (s < 580) return SCORE_BANDS[0];
	if (s < 670) return SCORE_BANDS[1];
	if (s < 740) return SCORE_BANDS[2];
	if (s < 800) return SCORE_BANDS[3];
	return SCORE_BANDS[4];
}

function oneWayAnova(rows: Customer[], groupKey: string, valueKey: string, order: string[]) {
	const groups = new Map<string, { n: number; sum: number; sumsq: number }>();
	let N = 0,
		total = 0;
	for (const r of rows) {
		const g = String(r[groupKey]);
		const v = Number(r[valueKey]);
		let a = groups.get(g);
		if (!a) groups.set(g, (a = { n: 0, sum: 0, sumsq: 0 }));
		a.n++;
		a.sum += v;
		a.sumsq += v * v;
		N++;
		total += v;
	}
	const grand = total / N;
	let ssb = 0,
		sst = 0;
	for (const a of groups.values()) {
		ssb += a.n * (a.sum / a.n - grand) ** 2;
		sst += a.sumsq;
	}
	sst -= N * grand * grand;
	const ssw = sst - ssb;
	const k = groups.size;
	const df1 = k - 1,
		df2 = N - k;
	const F = ssb / df1 / (ssw / df2);
	return {
		groupKey,
		valueKey,
		groups: order.filter((g) => groups.has(g)).map((g) => ({ group: g, n: groups.get(g)!.n, mean: groups.get(g)!.sum / groups.get(g)!.n })),
		F,
		df1,
		df2,
		p: fPValue(F, df1, df2),
		etaSq: ssb / sst
	};
}

function chiSquare(rows: Customer[], rowKey: string, colKey: string, rowOrder: string[], colOrder: string[]) {
	const counts = rowOrder.map(() => colOrder.map(() => 0));
	for (const r of rows) {
		const i = rowOrder.indexOf(String(r[rowKey]));
		const j = colOrder.indexOf(String(r[colKey]));
		if (i >= 0 && j >= 0) counts[i][j]++;
	}
	const rowTot = counts.map((r) => r.reduce((a, b) => a + b, 0));
	const colTot = colOrder.map((_, j) => counts.reduce((a, r) => a + r[j], 0));
	const N = rowTot.reduce((a, b) => a + b, 0);
	let chi2 = 0;
	counts.forEach((r, i) =>
		r.forEach((o, j) => {
			const e = (rowTot[i] * colTot[j]) / N;
			if (e > 0) chi2 += (o - e) ** 2 / e;
		})
	);
	const df = (rowOrder.length - 1) * (colOrder.length - 1);
	const cramersV = Math.sqrt(chi2 / (N * (Math.min(rowOrder.length, colOrder.length) - 1)));
	return { rowKey, colKey, rows: rowOrder, cols: colOrder, counts, rowTot, colTot, N, chi2, df, p: chi2PValue(chi2, df), cramersV };
}

function regression(x: Float64Array, y: Float64Array) {
	const n = x.length;
	let mx = 0,
		my = 0;
	for (let i = 0; i < n; i++) {
		mx += x[i];
		my += y[i];
	}
	mx /= n;
	my /= n;
	let sxy = 0,
		sxx = 0;
	for (let i = 0; i < n; i++) {
		sxy += (x[i] - mx) * (y[i] - my);
		sxx += (x[i] - mx) ** 2;
	}
	const slope = sxy / sxx;
	const intercept = my - slope * mx;
	const r = pearson(x, y);
	return { slope, intercept, r, r2: r * r };
}

function histogram(a: Float64Array, bins: number, clipQuantile = 0.995) {
	const s = Float64Array.from(a).sort();
	const lo = s[0];
	const hi = quantileSorted(s, clipQuantile);
	const width = (hi - lo) / bins || 1;
	const counts = new Array(bins).fill(0);
	let clipped = 0;
	for (const v of a) {
		if (v > hi) {
			clipped++;
			continue;
		}
		counts[Math.min(bins - 1, Math.floor((v - lo) / width))]++;
	}
	return { bins: counts.map((c, i) => ({ x0: lo + i * width, x1: lo + (i + 1) * width, count: c })), clipped, clipAt: hi };
}

function sample<T>(arr: T[], n: number) {
	if (arr.length <= n) return arr;
	const step = arr.length / n;
	return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
}


const CORR_KEYS = [
	'Credit_Score',
	'Payment_Ratio',
	'Credit_Utilization',
	'Cash_Advance_Amount',
	'Outstanding_Balance',
	'Annual_Income',
	'Credit_Limit',
	'Monthly_Spending',
	'Monthly_Transactions',
	'Card_Age_Months',
	'Age',
	'Reward_Points_Earned',
	'Mobile_App_Login',
	'EMI_Count'
];

const GROUP_METRICS = [
	'Annual_Income',
	'Credit_Limit',
	'Monthly_Spending',
	'Credit_Score',
	'Credit_Utilization',
	'Payment_Ratio',
	'Outstanding_Balance',
	'Reward_Points_Earned'
];

let cache: { version: number; result: Analysis } | null = null;

export type Analysis = Awaited<ReturnType<typeof compute>>;

export async function getAnalysis() {
	const s = await getStore();
	if (cache && cache.version === s.version) return cache.result;
	const t0 = Date.now();
	const result = await compute(s.rows);
	cache = { version: s.version, result };
	console.log(`[stats] analysis computed in ${Date.now() - t0} ms (v${s.version})`);
	return result;
}

async function compute(rows: Customer[]) {
	const cols: Record<string, Float64Array> = {};
	for (const k of NUMERIC_KEYS) cols[k] = column(rows, k);

	const summaries = NUMERIC_KEYS.map((k) => summarize(k, cols[k]));
	const sumMap = Object.fromEntries(summaries.map((s) => [s.key, s]));

	const n = rows.length;
	const totalSpend = summaries.find((s) => s.key === 'Monthly_Spending')!.mean * n;

	const corrMatrix = CORR_KEYS.map((a) => CORR_KEYS.map((b) => (a === b ? 1 : pearson(cols[a], cols[b]))));
	const scoreCorrelations = NUMERIC_KEYS.filter((k) => k !== 'Credit_Score')
		.map((k) => ({ key: k, label: COLUMN_MAP[k].label, r: pearson(cols[k], cols.Credit_Score) }))
		.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

	const byCard = groupBy(rows, (r) => String(r.Card_Type), CARD_TYPES, GROUP_METRICS);
	const byOccupation = groupBy(rows, (r) => String(r.Occupation), OCCUPATIONS, GROUP_METRICS);
	const byAge = groupBy(rows, (r) => ageBand(Number(r.Age)), AGE_BANDS, GROUP_METRICS);
	const byGender = groupBy(rows, (r) => String(r.Gender), ['M', 'F'], GROUP_METRICS);
	const byScoreBand = groupBy(rows, (r) => scoreBand(Number(r.Credit_Score)), SCORE_BANDS, GROUP_METRICS);

	const mixOverall = SPENDING_CATEGORIES.map((k) => ({ key: k, label: COLUMN_MAP[k].label, mean: sumMap[k].mean }));
	const mixTotal = mixOverall.reduce((a, b) => a + b.mean, 0);
	const mixByCard = groupBy(rows, (r) => String(r.Card_Type), CARD_TYPES, SPENDING_CATEGORIES).map((g) => {
		const tot = SPENDING_CATEGORIES.reduce((a, k) => a + g.means[k], 0);
		return { group: g.group, total: tot, shares: Object.fromEntries(SPENDING_CATEGORIES.map((k) => [k, g.means[k] / tot])) };
	});

	const anovaScoreByCard = oneWayAnova(rows, 'Card_Type', 'Credit_Score', CARD_TYPES);
	const anovaScoreByOcc = oneWayAnova(rows, 'Occupation', 'Credit_Score', OCCUPATIONS);
	const anovaSpendByCard = oneWayAnova(rows, 'Card_Type', 'Monthly_Spending', CARD_TYPES);
	const chiCardOcc = chiSquare(rows, 'Occupation', 'Card_Type', OCCUPATIONS, CARD_TYPES);
	const chiCardGender = chiSquare(rows, 'Gender', 'Card_Type', ['M', 'F'], CARD_TYPES);

	const regPayScore = regression(cols.Payment_Ratio, cols.Credit_Score);
	const regUtilScore = regression(cols.Credit_Utilization, cols.Credit_Score);
	const regIncomeLimit = regression(cols.Annual_Income, cols.Credit_Limit);

	const scatterSample = sample(rows, 1200).map((r) => ({
		id: String(r.Customer_ID),
		Payment_Ratio: Number(r.Payment_Ratio),
		Credit_Utilization: Number(r.Credit_Utilization),
		Credit_Score: Number(r.Credit_Score),
		Annual_Income: Number(r.Annual_Income),
		Credit_Limit: Number(r.Credit_Limit),
		Card_Type: String(r.Card_Type)
	}));

	const histograms = {
		Credit_Score: histogram(cols.Credit_Score, 30, 1),
		Monthly_Spending: histogram(cols.Monthly_Spending, 30, 0.99),
		Age: histogram(cols.Age, 26, 1),
		Credit_Utilization: histogram(cols.Credit_Utilization, 17, 1)
	};

	const highRisk = rows.filter((r) => Number(r.Credit_Utilization) >= 0.8 && Number(r.Payment_Ratio) < 0.3).length;

	const kpis = {
		customers: n,
		avgIncome: sumMap.Annual_Income.mean,
		avgScore: sumMap.Credit_Score.mean,
		medianScore: sumMap.Credit_Score.median,
		avgSpend: sumMap.Monthly_Spending.mean,
		totalSpend,
		avgUtil: sumMap.Credit_Utilization.mean,
		avgPayRatio: sumMap.Payment_Ratio.mean,
		fullPayers: rows.filter((r) => Number(r.Payment_Ratio) >= 0.95).length / n,
		highRisk,
		highRiskShare: highRisk / n
	};

	const topCorr = scoreCorrelations[0];
	const topCard = [...byCard].sort((a, b) => b.means.Monthly_Spending - a.means.Monthly_Spending)[0];
	const lowCard = [...byCard].sort((a, b) => a.means.Monthly_Spending - b.means.Monthly_Spending)[0];
	const topCat = [...mixOverall].sort((a, b) => b.mean - a.mean)[0];
	const insights = [
		`The strongest linear driver of credit score is ${topCorr.label.toLowerCase()} (r = ${topCorr.r.toFixed(2)}); each +10 percentage points of payment ratio is associated with ${(regPayScore.slope * 0.1).toFixed(1)} more score points.`,
		`Credit utilization moves the other way: r = ${regUtilScore.r.toFixed(2)} with credit score, so heavier use of the limit goes with lower scores.`,
		`${topCard.group} cardholders spend ${(topCard.means.Monthly_Spending / lowCard.means.Monthly_Spending).toFixed(1)}× as much per month as ${lowCard.group} holders (${Math.round(topCard.means.Monthly_Spending).toLocaleString()} vs ${Math.round(lowCard.means.Monthly_Spending).toLocaleString()}).`,
		`${topCat.label} is the largest spending category at ${((topCat.mean / mixTotal) * 100).toFixed(1)}% of categorised spend.`,
		`Card tier is ${chiCardOcc.cramersV < 0.1 ? 'only weakly' : chiCardOcc.cramersV < 0.3 ? 'moderately' : 'strongly'} associated with occupation (Cramér's V = ${chiCardOcc.cramersV.toFixed(3)}), and income explains ${(regIncomeLimit.r2 * 100).toFixed(0)}% of the variance in credit limit.`,
		`${(kpis.highRiskShare * 100).toFixed(1)}% of customers (${highRisk.toLocaleString()}) are high-risk: utilization ≥ 80% while paying back < 30% of their statement.`
	];

	return {
		n,
		kpis,
		summaries,
		corr: { keys: CORR_KEYS, labels: CORR_KEYS.map((k) => COLUMN_MAP[k].label), matrix: corrMatrix },
		scoreCorrelations,
		groups: { byCard, byOccupation, byAge, byGender, byScoreBand, metrics: GROUP_METRICS },
		mix: { overall: mixOverall, total: mixTotal, byCard: mixByCard, categories: SPENDING_CATEGORIES },
		tests: { anovaScoreByCard, anovaScoreByOcc, anovaSpendByCard, chiCardOcc, chiCardGender },
		regressions: { regPayScore, regUtilScore, regIncomeLimit },
		scatterSample,
		histograms,
		insights
	};
}
