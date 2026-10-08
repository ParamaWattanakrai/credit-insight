import { getSaveStatus, getStore } from '$lib/server/store';

export const load = async () => {
	await getStore();
	return { saveStatus: getSaveStatus() };
};
