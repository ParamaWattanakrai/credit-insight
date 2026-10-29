import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Vercel sets VERCEL=1 during its builds; everywhere else (Docker, npm run build) uses Node.
const adapter = process.env.VERCEL ? adapterVercel() : adapterNode();

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: { adapter }
};
