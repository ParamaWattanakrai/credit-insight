import fs from 'node:fs/promises';
import { flush, dataFilePath } from '$lib/server/store';

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
