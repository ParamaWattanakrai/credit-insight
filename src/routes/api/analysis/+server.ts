import { json } from '@sveltejs/kit';
import { getAnalysis } from '$lib/server/stats';

/** Full statistical analysis as JSON (useful for Tableau Web Data Connectors, notebooks, etc.). */
export const GET = async () => {
	const { scatterSample, ...rest } = await getAnalysis();
	return json(rest);
};
