import { json } from '@sveltejs/kit';
import { signTableauToken, tableauConfig } from '$lib/server/tableau';

const headers = { 'Cache-Control': 'no-store' };

export const GET = ({ request }) => {
	if (request.headers.get('sec-fetch-site') === 'cross-site') {
		return json({ error: 'forbidden' }, { status: 403, headers });
	}
	const cfg = tableauConfig();
	if (!cfg) return json({ enabled: false }, { headers });
	return json({ enabled: true, origin: cfg.origin, token: signTableauToken(cfg) }, { headers });
};
