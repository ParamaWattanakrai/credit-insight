// Excel-backed data store.
//
// The .xlsx file IS the database. Reading/writing 50k rows per request would be far
// too slow, so the store works like this:
//
//   1. On first use, the workbook is streamed into memory once (plain JS objects).
//   2. Reads (list / get / stats) are served from memory.
//   3. Every create/update/delete mutates memory, then schedules a save.
//      Saves are debounced and serialized — only one write runs at a time, and a
//      burst of edits produces a single write. Rows are streamed to a temp file
//      which is then renamed over the original (atomic: the xlsx is never half-written).
//   4. If the xlsx is edited outside the app (e.g. opened and saved in Excel), the
//      store notices the newer modification time and reloads it.
//
// This is safe for a single server process (`docker compose up`, `npm run dev` or `node build`).

import ExcelJS from 'exceljs';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { EXCEL_ORDER, COLUMN_MAP, type Customer } from '$lib/schema';

const DATA_FILE = path.resolve(env.DATA_FILE || 'data/credit_card_customers.xlsx');
const SEED_FILE = path.resolve(env.SEED_FILE || 'data/seed/credit_card_customers_seed.xlsx');
const BACKUP_DIR = path.join(path.dirname(DATA_FILE), 'backups');
const SHEET_NAME = 'Customers';
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

// ---------------------------------------------------------------- loading

async function readWorkbook(file: string): Promise<Customer[]> {
	const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, {
		sharedStrings: 'cache',
		worksheets: 'emit',
		hyperlinks: 'ignore',
		styles: 'ignore',
		entries: 'emit'
	});
	const rows: Customer[] = [];
	let header: string[] | null = null;

	for await (const sheet of reader) {
		for await (const row of sheet) {
			const values = row.values as unknown[];
			if (!header) {
				header = values.slice(1).map((v) => String(v ?? '').trim());
				const missing = EXCEL_ORDER.filter((k) => !header!.includes(k));
				if (missing.length) throw new Error(`Excel file is missing columns: ${missing.join(', ')}`);
				continue;
			}
			const rec: Customer = {};
			for (let i = 0; i < header.length; i++) {
				const key = header[i];
				if (!COLUMN_MAP[key]) continue;
				let v = values[i + 1] as unknown;
				if (v && typeof v === 'object' && 'result' in (v as object)) v = (v as { result: unknown }).result; // formula cell
				const col = COLUMN_MAP[key];
				if (col.type === 'id' || col.type === 'enum') rec[key] = String(v ?? '').trim();
				else rec[key] = v === null || v === undefined || v === '' ? 0 : Number(v);
			}
			if (rec.Customer_ID) rows.push(rec);
		}
		break; // first worksheet only
	}
	return rows;
}

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
	const rows = await readWorkbook(DATA_FILE);
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

export async function writeWorkbook(rows: Customer[], file: string) {
	// No styles / shared strings: keeps the write fast. Header row is frozen for readability in Excel.
	const writer = new ExcelJS.stream.xlsx.WorkbookWriter({ filename: file, useStyles: false, useSharedStrings: false });
	const ws = writer.addWorksheet(SHEET_NAME, { views: [{ state: 'frozen', ySplit: 1 }] });
	ws.columns = EXCEL_ORDER.map((key) => ({ header: key, key, width: Math.max(12, key.length + 2) }));
	ws.getRow(1).commit();
	for (let i = 0; i < rows.length; i++) {
		ws.addRow(EXCEL_ORDER.map((k) => rows[i][k] ?? null)).commit();
		// yield to the event loop regularly so the site stays responsive during a save
		if (i % 2000 === 1999) await new Promise((r) => setImmediate(r));
	}
	ws.commit();
	await writer.commit();
}

async function saveNow(): Promise<void> {
	if (!state) return;
	saving = true;
	try {
		while (state && savedVersion !== state.version) {
			const target = state.version;
			const snapshot = state.rows.slice();
			await backupOnce();
			const tmp = `${DATA_FILE}.${process.pid}.tmp`;
			const t0 = Date.now();
			await writeWorkbook(snapshot, tmp);
			await fsp.rename(tmp, DATA_FILE); // atomic replace
			state.loadedMtimeMs = (await fsp.stat(DATA_FILE)).mtimeMs;
			savedVersion = target;
			lastSavedAt = new Date().toISOString();
			lastError = null;
			console.log(`[store] saved ${snapshot.length} rows to Excel in ${Date.now() - t0} ms (v${target})`);
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

function touch(s: State) {
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
	touch(s);
	return rec;
}

export async function updateCustomer(id: string, data: Customer) {
	const s = await getStore();
	const i = s.index.get(id);
	if (i === undefined) return null;
	const rec = { ...s.rows[i], ...data, Customer_ID: id };
	s.rows[i] = rec;
	touch(s);
	return rec;
}

export async function deleteCustomer(id: string) {
	const s = await getStore();
	const i = s.index.get(id);
	if (i === undefined) return false;
	s.rows.splice(i, 1);
	s.index.delete(id);
	for (let j = i; j < s.rows.length; j++) s.index.set(String(s.rows[j].Customer_ID), j);
	touch(s);
	return true;
}