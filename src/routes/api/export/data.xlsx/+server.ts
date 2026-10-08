import fs from 'node:fs/promises';
import { flush, dataFilePath } from '$lib/server/store';

// Download the live Excel database (pending edits are flushed first).
// This is the file to connect Tableau to.
export const GET = async () => {
	await flush();
	const buf = await fs.readFile(dataFilePath());
	return new Response(buf, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="credit_card_customers.xlsx"',
			'Cache-Control': 'no-store'
		}
	});
};
