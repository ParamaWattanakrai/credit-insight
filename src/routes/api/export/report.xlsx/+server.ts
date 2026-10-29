import { buildReport } from '$lib/server/report';

export const GET = async () => {
	const buf = await buildReport();
	const stamp = new Date().toISOString().slice(0, 10);
	return new Response(new Uint8Array(buf), {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="credit_card_analysis_${stamp}.xlsx"`,
			'Cache-Control': 'no-store'
		}
	});
};
