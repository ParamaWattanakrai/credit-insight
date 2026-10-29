import { getSaveStatus, getStore } from '$lib/server/store';

export const load = async () => {
	// Don't take the whole site down if the Excel file can't be loaded: the Dashboard
	// (Tableau) doesn't need it, and the header shows the load error from saveStatus.
	await getStore().catch(() => {});
	return { saveStatus: getSaveStatus() };
};
