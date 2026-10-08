import { getStore } from '$lib/server/store';
import { EXCEL_ORDER } from '$lib/schema';

const esc = (v: unknown) => {
	const s = String(v ?? '');
	return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// CSV export of the current data (handy for Tableau Public, which can't refresh Excel extracts).
export const GET = async () => {
	const { rows } = await getStore();
	const lines = [EXCEL_ORDER.join(',')];
	for (const r of rows) lines.push(EXCEL_ORDER.map((k) => esc(r[k])).join(','));
	return new Response(lines.join('\n'), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="credit_card_customers.csv"',
			'Cache-Control': 'no-store'
		}
	});
};
