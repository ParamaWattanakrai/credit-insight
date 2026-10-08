import { json } from '@sveltejs/kit';
import { getSaveStatus } from '$lib/server/store';

// 200 once the Excel file is loaded; 503 while loading or if loading failed (used by the Docker healthcheck).
export const GET = () => {
	const status = getSaveStatus();
	return json(status, { status: status.ready ? 200 : 503 });
};
