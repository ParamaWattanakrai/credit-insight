import { getAnalysis } from '$lib/server/stats';

export const load = async () => {
	const a = await getAnalysis();
	return {
		kpis: a.kpis,
		insights: a.insights,
		byCard: a.groups.byCard,
		byOccupation: a.groups.byOccupation,
		byScoreBand: a.groups.byScoreBand,
		mix: a.mix.overall,
		mixTotal: a.mix.total,
		scoreHist: a.histograms.Credit_Score,
		scoreSummary: a.summaries.find((s) => s.key === 'Credit_Score')!
	};
};
