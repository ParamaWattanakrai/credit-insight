// Excel-backed data store.
//
// The .xlsx file IS the database. Reading/writing 50k rows per request would be far
// too slow, so the store works like this:
//
//   1. On first use, the data sheet is read into memory once (plain JS objects).
//   2. Reads (list / get / stats) are served from memory.
//   3. Every create/update/delete mutates memory, records the customer ID as changed,
//      then schedules a save. Saves are debounced and serialized — only one write runs
//      at a time, and a burst of edits produces a single write.
//   4. A save patches ONLY the changed rows of the data sheet (see xlsx-patch.ts).
//      Other sheets, charts, tables, formulas and formatting in the workbook are kept.
//      The result goes to a temp file which is renamed over the original
//      (atomic: the xlsx is never half-written).
//   5. If the xlsx is edited outside the app (e.g. opened and saved in Excel), the
//      store notices the newer modification time and reloads it.
//
// This is safe for a single server process (`docker compose up`, `npm run dev` or `node build`).

import { patchDataSheet, readDataSheet } from './xlsx-patch';
import { bundledSeed } from './seed';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { EXCEL_ORDER, COLUMN_MAP, type Customer } from '$lib/schema';

// On Vercel the deployed code is read-only and only /tmp is writable. /tmp belongs to one
// running instance and is wiped when it shuts down, so edits there are temporary.
const ON_VERCEL = !!process.env.VERCEL;
const DATA_FILE = path.resolve(env.DATA_FILE || (ON_VERCEL ? '/tmp/credit_card_customers.xlsx' : 'data/credit_card_customers.xlsx'));
const SEED_FILE = path.resolve(env.SEED_FILE || 'data/seed/credit_card_customers_seed.xlsx');
const BACKUP_DIR = path.join(path.dirname(DATA_FILE), 'backups');
const SAVE_DEBOUNCE_MS = 400;
const MAX_BACKUPS = 5;

interface State {
	rows: Customer[];
	index: Map<string, number>;
	nextId: number;
	version: number;
	loadedMtimeMs: number;
}

export interface SaveStatus {
	ready: boolean;
	loadError: string | null;
	file: string;
	rows: number;
	version: number;
	savedVersion: number;
	saving: boolean;
	lastSavedAt: string | null;
	lastError: string | null;
}

let state: State | null = null;
let loading: Promise<State> | null = null;
let loadError: string | null = null;

let savedVersion = 0;
let saving = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let savePromise: Promise<void> | null = null;
let lastSavedAt: string | null = null;
let lastError: string | null = null;
let backedUpThisRun = false;
/** Customer IDs created, updated or deleted since the last successful save. */
let dirty = new Set<string>();

// ---------------------------------------------------------------- loading

async function ensureDataFile() {
	if (fs.existsSync(DATA_FILE)) return;
	await fsp.mkdir(path.dirname(DATA_FILE), { recursive: true });
	if (fs.existsSync(SEED_FILE)) {
		await fsp.copyFile(SEED_FILE, DATA_FILE);
		console.log(`[store] seeded ${DATA_FILE} from ${SEED_FILE}`);
		return;
	}
	// Serverless hosts (Vercel) don't ship the data/ folder, so fall back to the copy of
	// the seed workbook that the build bundles in (see bundledSeed in $lib/server/seed).
	const res = await bundledSeed();
	if (!res?.ok) throw new Error(`No data file at ${DATA_FILE} and no seed at ${SEED_FILE}`);
	await fsp.writeFile(DATA_FILE, Buffer.from(await res.arrayBuffer()));
	console.log(`[store] seeded ${DATA_FILE} from the bundled seed workbook`);
}

async function load(): Promise<State> {
	await ensureDataFile();
	const t0 = Date.now();
	const mtimeMs = (await fsp.stat(DATA_FILE)).mtimeMs;
	const rows = await readDataSheet(DATA_FILE, EXCEL_ORDER);
	const index = new Map<string, number>();
	let maxId = 100000 - 1;
	rows.forEach((r, i) => {
		const id = String(r.Customer_ID);
		index.set(id, i);
		const n = parseInt(id.replace(/\D/g, ''), 10);
		if (Number.isFinite(n) && n > maxId) maxId = n;
	});
	const version = (state?.version ?? 0) + 1;
	savedVersion = version;
	dirty = new Set();
	console.log(`[store] loaded ${rows.length} rows from ${path.basename(DATA_FILE)} in ${Date.now() - t0} ms`);
	return { rows, index, nextId: maxId + 1, version, loadedMtimeMs: mtimeMs };
}

/** Get the in-memory dataset, loading (or reloading after external edits) as needed. */
export async function getStore(): Promise<State> {
	if (loading) return loading;
	if (state) {
		// Reload if someone edited the xlsx outside the app — but never discard unsaved edits.
		const clean = !saving && savedVersion === state.version;
		if (clean) {
			try {
				const { mtimeMs } = await fsp.stat(DATA_FILE);
				if (mtimeMs > state.loadedMtimeMs + 1) {
					console.log('[store] Excel file changed on disk — reloading');
					loading = load().then((s) => (state = s)).finally(() => (loading = null));
					return loading;
				}
			} catch {
				/* file temporarily missing (e.g. mid-rename) — keep serving memory */
			}
		}
		return state;
	}
	loading = load()
		.then((s) => {
			loadError = null;
			return (state = s);
		})
		.catch((err) => {
			loadError = err instanceof Error ? err.message : String(err);
			throw err;
		})
		.finally(() => (loading = null));
	return loading;
}

// ---------------------------------------------------------------- saving

async function backupOnce() {
	if (backedUpThisRun || !fs.existsSync(DATA_FILE)) return;
	backedUpThisRun = true;
	await fsp.mkdir(BACKUP_DIR, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	await fsp.copyFile(DATA_FILE, path.join(BACKUP_DIR, `customers-${stamp}.xlsx`));
	const files = (await fsp.readdir(BACKUP_DIR)).filter((f) => f.endsWith('.xlsx')).sort();
	for (const f of files.slice(0, Math.max(0, files.length - MAX_BACKUPS))) await fsp.unlink(path.join(BACKUP_DIR, f));
}


async function saveNow(): Promise<void> {
	if (!state) return;
	saving = true;
	try {
		while (state && savedVersion !== state.version) {
			const target = state.version;
			const ids = dirty;
			dirty = new Set();
			const s = state;
			try {
				await backupOnce();
				const tmp = `${DATA_FILE}.${process.pid}.tmp`;
				const t0 = Date.now();
				const r = await patchDataSheet(DATA_FILE, tmp, EXCEL_ORDER, ids, (id) => {
					const i = s.index.get(id);
					return i === undefined ? undefined : s.rows[i];
				});
				await fsp.rename(tmp, DATA_FILE); // atomic replace
				s.loadedMtimeMs = (await fsp.stat(DATA_FILE)).mtimeMs;
				console.log(
					`[store] saved to Excel in ${Date.now() - t0} ms (v${target}): ${r.updated} updated, ${r.added} added, ${r.removed} removed`
				);
			} catch (err) {
				for (const id of ids) dirty.add(id); // keep them for the retry
				throw err;
			}
			savedVersion = target;
			lastSavedAt = new Date().toISOString();
			lastError = null;
		}
	} catch (err) {
		lastError = err instanceof Error ? err.message : String(err);
		console.error('[store] save failed — will retry:', lastError);
		// Typical cause on Windows: the file is open in Excel. Retry later.
		setTimeout(scheduleSave, 3000);
	} finally {
		saving = false;
	}
}

function scheduleSave() {
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		saveTimer = null;
		if (saving) {
			// another save is running; it loops until versions match, but re-arm just in case
			savePromise?.then(scheduleSave);
			return;
		}
		savePromise = saveNow();
	}, SAVE_DEBOUNCE_MS);
}

/** Flush pending edits to disk (used on shutdown and before downloads). */
export async function flush() {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = null;
	}
	if (savePromise) await savePromise;
	if (state && savedVersion !== state.version) {
		savePromise = saveNow();
		await savePromise;
	}
}

export function getSaveStatus(): SaveStatus {
	return {
		ready: state !== null,
		loadError,
		file: path.relative(process.cwd(), DATA_FILE),
		rows: state?.rows.length ?? 0,
		version: state?.version ?? 0,
		savedVersion,
		saving,
		lastSavedAt,
		lastError
	};
}

export function dataFilePath() {
	return DATA_FILE;
}

function touch(s: State, id: string) {
	dirty.add(id);
	s.version++;
	scheduleSave();
}

// ---------------------------------------------------------------- CRUD

export interface ListQuery {
	q?: string;
	card?: string;
	occupation?: string;
	gender?: string;
	sort?: string;
	dir?: 'asc' | 'desc';
	page?: number;
	pageSize?: number;
}

export async function listCustomers(query: ListQuery) {
	const s = await getStore();
	const q = query.q?.trim().toLowerCase();
	let rows = s.rows.filter(
		(r) =>
			(!query.card || r.Card_Type === query.card) &&
			(!query.occupation || r.Occupation === query.occupation) &&
			(!query.gender || r.Gender === query.gender) &&
			(!q || String(r.Customer_ID).toLowerCase().includes(q) || String(r.Occupation).toLowerCase().includes(q))
	);

	// Newest records first by default, so freshly added customers are visible.
	const sort = query.sort && COLUMN_MAP[query.sort] ? query.sort : null;
	const dir = query.dir === 'asc' ? 1 : -1;
	if (sort) {
		const col = COLUMN_MAP[sort];
		const numeric = col.type === 'int' || col.type === 'float';
		// Enum columns (e.g. Card_Type) sort by their defined tier/rank order, not alphabetically.
		const rank = col.type === 'enum' && col.options ? (v: unknown) => col.options!.indexOf(String(v)) : null;
		rows = rows.slice().sort((a, b) =>
			numeric
				? (Number(a[sort]) - Number(b[sort])) * dir
				: rank
					? (rank(a[sort]) - rank(b[sort])) * dir
					: String(a[sort]).localeCompare(String(b[sort])) * dir
		);
	} else {
		rows = rows.slice().reverse();
	}

	const pageSize = Math.min(Math.max(query.pageSize ?? 25, 5), 200);
	const total = rows.length;
	const pages = Math.max(1, Math.ceil(total / pageSize));
	const page = Math.min(Math.max(query.page ?? 1, 1), pages);
	return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pages, pageSize };
}

export async function getCustomer(id: string) {
	const s = await getStore();
	const i = s.index.get(id);
	return i === undefined ? null : s.rows[i];
}

export async function createCustomer(data: Customer) {
	const s = await getStore();
	const id = `CC${s.nextId++}`;
	const rec: Customer = { Customer_ID: id };
	for (const k of EXCEL_ORDER) if (k !== 'Customer_ID') rec[k] = data[k];
	s.rows.push(rec);
	s.index.set(id, s.rows.length - 1);
	touch(s, id);
	return rec;
}

export async function updateCustomer(id: string, data: Customer) {
	const s = await getStore();
	const i = s.index.get(id);
	if (i === undefined) return null;
	const rec = { ...s.rows[i], ...data, Customer_ID: id };
	s.rows[i] = rec;
	touch(s, id);
	return rec;
}

export async function deleteCustomer(id: string) {
	const s = await getStore();
	const i = s.index.get(id);
	if (i === undefined) return false;
	s.rows.splice(i, 1);
	s.index.delete(id);
	for (let j = i; j < s.rows.length; j++) s.index.set(String(s.rows[j].Customer_ID), j);
	touch(s, id);
	return true;
}