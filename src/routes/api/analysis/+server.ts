import { json } from '@sveltejs/kit';
import { getAnalysis } from '$lib/server/stats';

export const GET = async () => {
	const { scatterSample, ...rest } = await getAnalysis();
	return json(rest);
};
