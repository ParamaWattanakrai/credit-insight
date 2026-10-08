import { getAnalysis } from '$lib/server/stats';

export const load = async () => ({ a: await getAnalysis() });
