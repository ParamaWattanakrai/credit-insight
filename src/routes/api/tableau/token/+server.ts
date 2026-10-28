import { json } from '@sveltejs/kit';
import { signTableauToken, tableauConfig } from '$lib/server/tableau';

const headers = { 'Cache-Control': 'no-store' };

// GET /api/tableau/token
//   → { enabled: false }                       Connected App not configured (page falls back to normal login)
//   → { enabled: true, origin, token }         a fresh single-use JWT for <tableau-viz token="…">
export const GET = ({ request }) => {
	// Only our own pages may ask for a token (browsers send Sec-Fetch-Site; other clients omit it).
	if (request.headers.get('sec-fetch-site') === 'cross-site') {
		return json({ error: 'forbidden' }, { status: 403, headers });
	}
	const cfg = tableauConfig();
	if (!cfg) return json({ enabled: false }, { headers });
	return json({ enabled: true, origin: cfg.origin, token: signTableauToken(cfg) }, { headers });
};
