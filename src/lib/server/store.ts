
import { patchDataSheet, readDataSheet } from './xlsx-patch';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { EXCEL_ORDER, COLUMN_MAP, type Customer } from '$lib/schema';

const DATA_FILE = path.resolve(env.DATA_FILE || 'data/credit_card_customers.xlsx');
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
let dirty = new Set<string>();


async function ensureDataFile() {
	if (fs.existsSync(DATA_FILE)) return;
	if (!fs.existsSync(SEED_FILE)) throw new Error(`No data file at ${DATA_FILE} and no seed at ${SEED_FILE}`);
	await fsp.mkdir(path.dirname(DATA_FILE), { recursive: true });
	await fsp.copyFile(SEED_FILE, DATA_FILE);
	console.log(`[store] seeded ${DATA_FILE} from ${SEED_FILE}`);
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

export async function getStore(): Promise<State> {
	if (loading) return loading;
	if (state) {
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
				await fsp.rename(tmp, DATA_FILE);
				s.loadedMtimeMs = (await fsp.stat(DATA_FILE)).mtimeMs;
				console.log(
					`[store] saved to Excel in ${Date.now() - t0} ms (v${target}): ${r.updated} updated, ${r.added} added, ${r.removed} removed`
				);
			} catch (err) {
				for (const id of ids) dirty.add(id);
				throw err;
			}
			savedVersion = target;
			lastSavedAt = new Date().toISOString();
			lastError = null;
		}
	} catch (err) {
		lastError = err instanceof Error ? err.message : String(err);
		console.error('[store] save failed — will retry:', lastError);
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
			savePromise?.then(scheduleSave);
			return;
		}
		savePromise = saveNow();
	}, SAVE_DEBOUNCE_MS);
}

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

	const sort = query.sort && COLUMN_MAP[query.sort] ? query.sort : null;
	const dir = query.dir === 'asc' ? 1 : -1;
	if (sort) {
		const col = COLUMN_MAP[sort];
		const numeric = col.type === 'int' || col.type === 'float';
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