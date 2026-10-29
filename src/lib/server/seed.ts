// The seed workbook, bundled into the build as an asset so the app can start on hosts
// that don't have the project's data/ folder (e.g. Vercel). Docker and local runs read
// data/seed/… from disk instead and never call this.
import { read } from '$app/server';
import seedUrl from '../../../data/seed/credit_card_customers_seed.xlsx?url';

export async function bundledSeed(): Promise<Response | null> {
	try {
		return read(seedUrl);
	} catch (err) {
		console.error('[store] could not read the bundled seed workbook:', err);
		return null;
	}
}
