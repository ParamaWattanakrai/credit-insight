// Row-level patching of the data sheet inside an existing .xlsx.
//
// An .xlsx file is a zip of XML parts: one part per worksheet, plus charts, drawings,
// tables, styles and so on. Libraries that load a workbook into objects and save it
// again (ExcelJS included) drop the parts they don't model, such as charts. So this
// module never re-creates the workbook. It opens the zip, edits the XML of the data
// sheet only, and writes every other part back with the same content.
//
// Inside the data sheet:
//   - rows that weren't edited keep their original XML;
//   - edited rows are rewritten in place, keeping each cell's style;
//   - new customers are appended at the bottom;
//   - deleted customers are removed and the rows below move up one.
// The Excel table on the sheet (e.g. "CustomerData") is resized to fit, so formulas
// such as COUNTIFS(CustomerData[Age], ...) on other sheets pick up the change.

import JSZip from 'jszip';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { COLUMN_MAP, type Customer } from '$lib/schema';

export interface PatchResult {
	updated: number;
	added: number;
	removed: number;
}

interface RawRow {
	xml: string;
	id: string | null;
}

const decode = (s: string) =>
	s
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function colLetter(n: number) {
	let s = '';
	while (n > 0) {
		const m = (n - 1) % 26;
		s = String.fromCharCode(65 + m) + s;
		n = Math.floor((n - 1) / 26);
	}
	return s;
}
function colNumber(letters: string) {
	let n = 0;
	for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
	return n;
}

/** Resolve a path in a relationship target relative to the part that owns it. */
function resolvePart(fromPart: string, target: string) {
	if (target.startsWith('/')) return target.slice(1);
	return path.posix.normalize(path.posix.join(path.posix.dirname(fromPart), target));
}

function parseSharedStrings(xml: string): string[] {
	const out: string[] = [];
	let i = 0;
	while (true) {
		const s = xml.indexOf('<si', i);
		if (s === -1) break;
		const e = xml.indexOf('</si>', s);
		if (e === -1) break;
		const inner = xml.slice(s, e);
		let text = '';
		for (const m of inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) text += m[1];
		out.push(decode(text));
		i = e + 5;
	}
	return out;
}

/** Split <sheetData> content into its <row> elements. */
function splitRows(sheetData: string): string[] {
	const rows: string[] = [];
	let i = 0;
	while (true) {
		const s = sheetData.indexOf('<row', i);
		if (s === -1) break;
		const openEnd = sheetData.indexOf('>', s);
		if (sheetData[openEnd - 1] === '/') {
			rows.push(sheetData.slice(s, openEnd + 1)); // empty row: <row .../>
			i = openEnd + 1;
		} else {
			const e = sheetData.indexOf('</row>', openEnd) + '</row>'.length;
			rows.push(sheetData.slice(s, e));
			i = e;
		}
	}
	return rows;
}

interface Cell {
	col: string;
	attrs: string; // attributes of <c ...>
	body: string; // inner XML ('' for <c .../>)
	raw: string; // the whole <c> element as it appears in the file
}

function parseCells(rowXml: string): Cell[] {
	const cells: Cell[] = [];
	const re = /<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
	for (const m of rowXml.matchAll(re)) {
		const r = m[1].match(/\br="([A-Z]+)\d+"/);
		if (!r) continue;
		cells.push({ col: r[1], attrs: m[1], body: m[2] ?? '', raw: m[0] });
	}
	return cells;
}

const styleOf = (cell: Cell | undefined) => cell?.attrs.match(/\bs="\d+"/)?.[0] ?? '';

function cellText(cell: Cell | undefined, sst: string[]): string | null {
	if (!cell) return null;
	const t = cell.attrs.match(/\bt="([^"]+)"/)?.[1];
	if (t === 'inlineStr') {
		let text = '';
		for (const m of cell.body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) text += m[1];
		return decode(text);
	}
	const v = cell.body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
	if (v === undefined) return null;
	return t === 's' ? (sst[Number(v)] ?? null) : decode(v);
}

/** Build one <c> element, keeping the style (s="…") of the cell it replaces. */
function buildCell(ref: string, key: string, value: unknown, styleAttr: string) {
	const col = COLUMN_MAP[key];
	const s = styleAttr ? ` ${styleAttr}` : '';
	if (value === undefined || value === null || value === '') return `<c r="${ref}"${s}/>`;
	if (!col || col.type === 'id' || col.type === 'enum') {
		return `<c r="${ref}"${s} t="inlineStr"><is><t>${escapeXml(String(value))}</t></is></c>`;
	}
	return `<c r="${ref}"${s} t="n"><v>${Number(value)}</v></c>`;
}

/**
 * Rewrite the row number in a row's own tag and in every cell reference inside it.
 * A formula in a moved row would still point at its old row, so any formula is
 * replaced by its last calculated value. (The app's own columns never hold formulas.)
 */
function renumberRow(rowXml: string, newNum: number) {
	return rowXml
		.replace(/^<row\b([^>]*?)\br="\d+"/, `<row$1r="${newNum}"`)
		.replace(/(<c\s[^>]*?\br=")([A-Z]+)\d+"/g, `$1$2${newNum}"`)
		.replace(/<f\b[^>]*\/>|<f\b[^>]*>[\s\S]*?<\/f>/g, '');
}

interface DataSheet {
	zip: JSZip;
	wbPath: string;
	wbXml: string;
	sheetPath: string;
	sheetXml: string;
	sst: string[];
	sdOpen: number; // index of <sheetData
	sdAfter: number; // index just past </sheetData> (or past <sheetData/>)
	rowXmls: string[]; // header row first
	colOf: Record<string, string>; // header name -> column letter
}

/**
 * Open the workbook and locate the data sheet: the first sheet in workbook order.
 * Reads parts by name, so it doesn't matter in which order they are stored in the zip
 * (Excel and LibreOffice store them differently).
 */
async function openDataSheet(file: string, columns: string[]): Promise<DataSheet> {
	const zip = await JSZip.loadAsync(await fsp.readFile(file));
	const read = async (p: string) => {
		const f = zip.file(p);
		if (!f) throw new Error(`Missing part ${p} in ${path.basename(file)}`);
		return f.async('string');
	};

	const wbPath = 'xl/workbook.xml';
	const wbXml = await read(wbPath);
	const firstSheet = wbXml.match(/<sheets>[\s\S]*?<sheet\b[^>]*\br:id="([^"]+)"/);
	if (!firstSheet) throw new Error('No worksheets found in workbook.xml');
	const wbRels = await read('xl/_rels/workbook.xml.rels');
	const rel = [...wbRels.matchAll(/<Relationship\b[^>]*>/g)]
		.map((m) => m[0])
		.find((tag) => tag.includes(`Id="${firstSheet[1]}"`));
	const target = rel?.match(/Target="([^"]+)"/)?.[1];
	if (!target) throw new Error('Could not resolve the data worksheet');
	const sheetPath = resolvePart(wbPath, target);

	const sst = zip.file('xl/sharedStrings.xml') ? parseSharedStrings(await read('xl/sharedStrings.xml')) : [];
	const sheetXml = await read(sheetPath);

	const sdOpen = sheetXml.search(/<sheetData\s*\/?>/);
	if (sdOpen === -1) throw new Error('Data worksheet has no <sheetData>');
	const sdTagEnd = sheetXml.indexOf('>', sdOpen) + 1;
	const selfClosing = sheetXml[sdTagEnd - 2] === '/';
	const sdClose = selfClosing ? sdTagEnd : sheetXml.indexOf('</sheetData>', sdTagEnd);
	const rowXmls = selfClosing ? [] : splitRows(sheetXml.slice(sdTagEnd, sdClose));
	if (!rowXmls.length) throw new Error('The first worksheet is empty — it should hold the customer data with a header row');

	const colOf: Record<string, string> = {};
	for (const c of parseCells(rowXmls[0])) {
		const name = cellText(c, sst)?.trim();
		if (name) colOf[name] = c.col;
	}
	const missing = columns.filter((k) => !colOf[k]);
	if (missing.length) throw new Error(`The first worksheet is missing columns: ${missing.join(', ')}`);

	return {
		zip,
		wbPath,
		wbXml,
		sheetPath,
		sheetXml,
		sst,
		sdOpen,
		sdAfter: selfClosing ? sdTagEnd : sdClose + '</sheetData>'.length,
		rowXmls,
		colOf
	};
}

/** Read every customer row of the data sheet. IDs and categories become strings, the rest numbers. */
export async function readDataSheet(file: string, columns: string[]): Promise<Customer[]> {
	const { rowXmls, colOf, sst } = await openDataSheet(file, columns);
	const wanted = new Map(columns.map((k) => [colOf[k], k]));
	const out: Customer[] = [];
	for (let i = 1; i < rowXmls.length; i++) {
		const rec: Customer = {};
		for (const c of parseCells(rowXmls[i])) {
			const key = wanted.get(c.col);
			if (!key) continue;
			const col = COLUMN_MAP[key];
			const v = cellText(c, sst);
			if (col.type === 'id' || col.type === 'enum') rec[key] = (v ?? '').trim();
			else rec[key] = v === null || v.trim() === '' ? 0 : Number(v);
		}
		if (!rec.Customer_ID) continue; // blank rows
		for (const key of columns) if (rec[key] === undefined) rec[key] = COLUMN_MAP[key].type === 'enum' ? '' : 0;
		out.push(rec);
	}
	return out;
}

/**
 * Apply edits for the given customer IDs to the data sheet of `file`, writing the
 * result to `outFile`. `current` looks a customer up in the app's in-memory data:
 * an ID that's found is written (updated, or appended if new), one that isn't is deleted.
 */
export async function patchDataSheet(
	file: string,
	outFile: string,
	columns: string[],
	dirtyIds: Iterable<string>,
	current: (id: string) => Customer | undefined
): Promise<PatchResult> {
	const { zip, wbPath, wbXml, sheetPath, sheetXml, sst, sdOpen, sdAfter, rowXmls, colOf } = await openDataSheet(file, columns);
	const idCol = colOf['Customer_ID'];

	const rows: RawRow[] = rowXmls.slice(1).map((xml) => ({
		xml,
		id: cellText(parseCells(xml).find((c) => c.col === idCol), sst)?.trim() || null
	}));
	const rowIndex = new Map<string, number>();
	rows.forEach((r, i) => r.id && rowIndex.set(r.id, i));

	// Style template for appended rows: the last existing data row, if there is one.
	const template = rows.length ? rows[rows.length - 1].xml : null;
	const templateCells = template ? parseCells(template) : [];
	const templateRowAttrs = template?.match(/^<row\b([^>]*?)\/?>/)?.[1].replace(/\s*\br="\d+"/, '').replace(/\s*\bspans="[^"]*"/, '') ?? '';

	// 4. Apply each dirty ID.
	const result: PatchResult = { updated: 0, added: 0, removed: 0 };
	const toRemove = new Set<number>();
	const appended: Customer[] = [];

	for (const id of dirtyIds) {
		const rec = current(id);
		const at = rowIndex.get(id);
		if (!rec) {
			if (at !== undefined) toRemove.add(at);
			continue;
		}
		if (at === undefined) {
			appended.push(rec);
			continue;
		}
		// Update in place: replace the app's columns, keep every other cell in the row as it was.
		const rowNum = at + 2;
		const old = rows[at].xml;
		const openTag = old.match(/^<row\b[^>]*?\/?>/)![0].replace(/\/>$/, '>');
		const byCol = new Map(parseCells(old).map((c) => [c.col, { cell: c, xml: c.raw }]));
		for (const key of columns) {
			const col = colOf[key];
			const prev = byCol.get(col)?.cell;
			byCol.set(col, { cell: prev!, xml: buildCell(`${col}${rowNum}`, key, rec[key], styleOf(prev)) });
		}
		const inner = [...byCol.entries()]
			.sort(([a], [b]) => colNumber(a) - colNumber(b))
			.map(([, v]) => v.xml)
			.join('');
		rows[at].xml = `${openTag}${inner}</row>`;
		result.updated++;
	}

	// 5. Remove deleted rows, then renumber everything below the first removed row.
	let kept = rows;
	if (toRemove.size) {
		const first = Math.min(...toRemove);
		kept = rows.filter((_, i) => !toRemove.has(i));
		for (let i = first; i < kept.length; i++) kept[i] = { ...kept[i], xml: renumberRow(kept[i].xml, i + 2) };
		result.removed = toRemove.size;
	}

	// 6. Append new customers using the template row's styles.
	const allCols = Object.values(colOf).map(colNumber);
	const lastColNum = Math.max(...allCols, ...columns.map((k) => colNumber(colOf[k])));
	const lastCol = colLetter(lastColNum);
	for (const rec of appended) {
		const rowNum = kept.length + 2;
		const cells = columns
			.map((key) => {
				const col = colOf[key];
				const style = styleOf(templateCells.find((c) => c.col === col));
				return { n: colNumber(col), xml: buildCell(`${col}${rowNum}`, key, rec[key], style) };
			})
			.sort((a, b) => a.n - b.n)
			.map((c) => c.xml)
			.join('');
		kept.push({ id: String(rec.Customer_ID), xml: `<row r="${rowNum}" spans="1:${lastColNum}"${templateRowAttrs ? ' ' + templateRowAttrs.trim() : ''}>${cells}</row>` });
		result.added++;
	}

	// 7. Reassemble the sheet; update its dimension when the row count changed.
	const lastRow = kept.length + 1;
	const rangeRef = `A1:${lastCol}${lastRow}`;
	let newSheet =
		sheetXml.slice(0, sdOpen) + '<sheetData>' + rowXmls[0] + kept.map((r) => r.xml).join('') + '</sheetData>' + sheetXml.slice(sdAfter);
	const rowCountChanged = result.added > 0 || result.removed > 0;
	if (rowCountChanged) newSheet = newSheet.replace(/<dimension\s+ref="[^"]*"/, `<dimension ref="${rangeRef}"`);
	zip.file(sheetPath, newSheet);

	// 8. Resize any Excel table on the sheet so structured references see added/removed rows.
	if (rowCountChanged) {
		const relsPath = path.posix.join(path.posix.dirname(sheetPath), '_rels', path.posix.basename(sheetPath) + '.rels');
		const relsFile = zip.file(relsPath);
		if (relsFile) {
			const sheetRels = await relsFile.async('string');
			for (const m of sheetRels.matchAll(/<Relationship\b[^>]*Type="[^"]*\/table"[^>]*>/g)) {
				const t = m[0].match(/Target="([^"]+)"/)?.[1];
				if (!t) continue;
				const tablePath = resolvePart(sheetPath, t);
				const tf = zip.file(tablePath);
				if (!tf) continue;
				let tableXml = await tf.async('string');
				const ref = tableXml.match(/<table\b[^>]*\bref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/);
				if (!ref) continue;
				const newRef = `${ref[1]}${ref[2]}:${ref[3]}${lastRow}`;
				tableXml = tableXml.replace(/(<table\b[^>]*\bref=")[^"]*"/, `$1${newRef}"`).replace(/(<autoFilter\b[^>]*\bref=")[^"]*"/, `$1${newRef}"`);
				zip.file(tablePath, tableXml);
			}
		}
	}

	// 9. Ask Excel to recalculate on open so the analysis sheets reflect the new data.
	if (result.updated || rowCountChanged) {
		let wb = wbXml;
		if (/<calcPr\b/.test(wb)) {
			wb = /<calcPr\b[^>]*\bfullCalcOnLoad=/.test(wb)
				? wb.replace(/(<calcPr\b[^>]*\bfullCalcOnLoad=")[^"]*"/, '$11"')
				: wb.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"');
		} else {
			// calcPr goes after <definedNames> (or after <sheets> when there are none).
			const anchor = wb.includes('</definedNames>') ? '</definedNames>' : '</sheets>';
			wb = wb.replace(anchor, `${anchor}<calcPr fullCalcOnLoad="1"/>`);
		}
		if (wb !== wbXml) zip.file(wbPath, wb);
	}

	const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
	await fsp.writeFile(outFile, out);
	return result;
}
