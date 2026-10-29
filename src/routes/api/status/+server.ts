import { json } from '@sveltejs/kit';
import { getSaveStatus } from '$lib/server/store';

export const GET = () => {
	const status = getSaveStatus();
	return json(status, { status: status.ready ? 200 : 503 });
};
