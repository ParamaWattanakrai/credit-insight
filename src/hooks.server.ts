import { getStore, flush } from '$lib/server/store';

// Load the Excel file as soon as the server starts so the first page view is fast.
getStore().catch((err) => console.error('[store] initial load failed:', err));

// adapter-node emits this on graceful shutdown; make sure pending edits reach the xlsx.
let flushing = false;
async function onExit(signal: string) {
	if (flushing) return;
	flushing = true;
	console.log(`[store] ${signal} — flushing pending edits to Excel…`);
	try {
		await flush();
	} finally {
		if (signal !== 'sveltekit:shutdown') process.exit(0);
	}
}
process.on('sveltekit:shutdown', () => onExit('sveltekit:shutdown'));
process.on('SIGINT', () => onExit('SIGINT'));
process.on('SIGTERM', () => onExit('SIGTERM'));
