import { Response } from 'express';
import mongoose from 'mongoose';
import { scopedModel } from '../../functions/routeRegistry.function.js';
import ExcelJS from 'exceljs';
import recordHistory from '../../functions/recordHistory.function.js';
import { applyFormulas, formulasOf, stripFormulaKeys } from '../../functions/formula.function.js';
import { hiddenFields, rulesOf } from '../../functions/formRules.function.js';

/**
 * Bulk upload — many records at once from a spreadsheet or JSON (admin table
 * header → Bulk upload):
 *
 *   GET  /bulk/import/template                     → the columns a file can have
 *   POST /bulk/import { format, content, dryRun }  → check every row; with dryRun false, save them
 *
 * `format` is 'csv' | 'xlsx' | 'json'; `content` is the file's text (csv,
 * json) or base64 (xlsx). Columns match a field by its key or its label, in
 * any case. Values are read the way the field needs them: numbers without
 * their thousands commas, yes/no as booleans, a linked record by its id or
 * its name, code, title or email, a list split on ";" (or ","). Every row
 * then goes through what the create form's save does — the route's
 * validator, its hidden-field rules, formulas, the model's own validation and
 * its unique fields, in the database and within the file.
 *
 * All or nothing: nothing is saved unless every row passes, and if a save
 * still fails half way the rows already saved are removed again.
 *
 * The route's `bulkUpload` config can be `true` or options (uploadOptions):
 * other names a file's columns go by, cell values that mean "no value" in
 * number, date and yes/no columns (and a yes/no field ticked where one was
 * found), the fields that together
 * identify a record (a row matching one is refused) and a larger row limit.
 */

const MAX_ROWS = 2000;
const MAX_ROWS_LIMIT = 50000;
const SAVE_BATCH = 100;
const MAX_ERRORS = 200;
const SKIP = new Set(['_id', 'id', '__v', 'createdAt', 'updatedAt', 'addedBy', 'archivedAt', 'archivedBy']);
const LOOKUP = ['name', 'title', 'code', 'email', 'slug', 'invoiceId', 'label', 'username'];

type Problem = { row: number; field?: string; message: string };
type Column = { key: string; label: string; type: string; required: boolean; ref?: string; options?: string[]; list?: boolean };

const fail = (res: Response, status: number, message: string, extra: any = {}) => res.status(status).json({ message, ...extra });
const norm = (s: any) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const blank = (v: any) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/* ---------------------------------------------------------------- options */

type UploadOptions = { maxRows: number; columns: [string, string][]; missing: Set<string>; missingFlag?: string; matchOn: string[] };

/** The route config's `bulkUpload` block, with anything unusable dropped. */
const uploadOptions = (req: any, Model: mongoose.Model<any>): UploadOptions => {
	const raw = req.resolvedRoute?.frontendConfig?.route?.bulkUpload;
	const o: any = raw && typeof raw === 'object' ? raw : {};
	const has = (k: any) => typeof k === 'string' && !!Model.schema.path(k);
	const n = Number(o.maxRows);
	return {
		maxRows: Number.isInteger(n) && n > 0 ? Math.min(n, MAX_ROWS_LIMIT) : MAX_ROWS,
		columns: Object.entries(o.columns && typeof o.columns === 'object' ? o.columns : {})
			.filter(([h, k]) => norm(h) && has(k))
			.map(([h, k]) => [h.trim(), k as string]),
		missing: new Set((Array.isArray(o.missing) ? o.missing : []).map((c: any) => String(c).trim()).filter(Boolean)),
		missingFlag: has(o.missingFlag) && (Model.schema.path(o.missingFlag) as any).instance === 'Boolean' ? o.missingFlag : undefined,
		matchOn: (Array.isArray(o.matchOn) ? o.matchOn : []).filter(has),
	};
};

/* ---------------------------------------------------------------- columns */

/** The fields a file can fill: what the create validator accepts, minus formulas and system fields. */
const columnsOf = (req: any, Model: mongoose.Model<any>): Column[] => {
	const settings: Record<string, any> = req.resolvedRoute?.settings || {};
	const validator = req.resolvedRoute?.built?.VALIDATORS?.POST;
	const described: Record<string, any> = (() => {
		try {
			return validator?.describe?.()?.keys || {};
		} catch {
			return {};
		}
	})();
	const formulas = new Set(formulasOf(settings).map((f: any) => f.key));
	const keys = Object.keys(described).length ? Object.keys(described) : Object.keys(settings).filter(k => settings[k]?.edit);

	return keys
		.filter(k => !SKIP.has(k) && !formulas.has(k) && !settings[k]?.exclude)
		.map(key => {
			const s = settings[key] || {};
			const path: any = Model.schema.path(key);
			const caster: any = path?.caster || path?.$embeddedSchemaType;
			const list = path?.instance === 'Array';
			const inner = list ? caster : path;
			const enumValues: string[] = inner?.enumValues || inner?.options?.enum || [];
			const options = Array.isArray(s?.schema?.options) ? s.schema.options.map((o: any) => String(o?.value ?? o)) : [];
			return {
				key,
				label: s.title || s?.schema?.label || key,
				type: list ? `list of ${String(inner?.instance || 'text').toLowerCase()}` : String(path?.instance || s.type || 'text').toLowerCase(),
				required: described[key]?.flags?.presence === 'required' || !!s.required || !!path?.isRequired,
				ref: inner?.options?.ref || undefined,
				options: (enumValues.length ? enumValues : options).map(String).filter(Boolean),
				list,
			};
		});
};

/* ---------------------------------------------------------------- parsing */

/** RFC 4180 CSV — quoted cells, doubled quotes, newlines inside quotes; comma, semicolon or tab. */
const parseCsv = (text: string): string[][] => {
	const src = text.replace(/^﻿/, '');
	const first = src.split(/\r?\n/, 1)[0] || '';
	const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
	const rows: string[][] = [];
	let row: string[] = [];
	let cell = '';
	let quoted = false;
	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (quoted) {
			if (c === '"' && src[i + 1] === '"') (cell += '"'), i++;
			else if (c === '"') quoted = false;
			else cell += c;
		} else if (c === '"' && cell === '') quoted = true;
		else if (c === delim) row.push(cell), (cell = '');
		else if (c === '\n' || c === '\r') {
			if (c === '\r' && src[i + 1] === '\n') i++;
			row.push(cell), rows.push(row), (row = []), (cell = '');
		} else cell += c;
	}
	if (cell !== '' || row.length) row.push(cell), rows.push(row);
	return rows.filter(r => r.some(c => c.trim() !== ''));
};

const cellOf = (v: any): any => {
	if (v === null || v === undefined) return undefined;
	if (v instanceof Date || typeof v !== 'object') return v;
	if (v.richText) return v.richText.map((t: any) => t.text).join('');
	if (v.text !== undefined) return v.text; // hyperlink
	if (v.result !== undefined) return v.result; // formula
	if (v.error) return undefined;
	return String(v);
};

const parseXlsx = async (base64: string): Promise<any[][]> => {
	const wb = new ExcelJS.Workbook();
	await wb.xlsx.load(Buffer.from(base64, 'base64') as any);
	const sheet = wb.worksheets.find(s => s.actualRowCount > 0);
	if (!sheet) return [];
	const rows: any[][] = [];
	sheet.eachRow({ includeEmpty: false }, r => {
		const out: any[] = [];
		r.eachCell({ includeEmpty: true }, (c, col) => (out[col - 1] = cellOf(c.value)));
		rows.push(Array.from(out, v => v));
	});
	return rows;
};

/** Header row + rows → objects. */
const toObjects = (table: any[][]) => {
	const [head = [], ...body] = table;
	const headers = head.map(h => String(h ?? '').trim());
	return {
		headers,
		rows: body.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]]).filter(([h]) => h))),
	};
};

const parse = async (format: string, content: any) => {
	if (format === 'json') {
		const data = typeof content === 'string' ? JSON.parse(content) : content;
		const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.rows) ? data.rows : Array.isArray(data?.doc) ? data.doc : null;
		if (!rows) throw new Error('The JSON must be a list of records: [ { … }, { … } ]');
		if (rows.some((r: any) => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error('Every item in the JSON list must be an object, like { "name": "…" }');
		const headers = [...new Set(rows.flatMap((r: any) => Object.keys(r)))] as string[];
		return { headers, rows };
	}
	if (format === 'csv') return toObjects(parseCsv(String(content || '')));
	if (format === 'xlsx') return toObjects(await parseXlsx(String(content || '')));
	throw new Error('Choose Excel, CSV or JSON');
};

/* ----------------------------------------------------------------- values */

const toNumber = (v: any) => {
	if (typeof v === 'number') return v;
	const n = Number(String(v).replace(/[,\s]/g, '').replace(/^[^\d.-]+/, ''));
	if (!Number.isFinite(n)) throw new Error(`“${v}” is not a number`);
	return n;
};

const toBoolean = (v: any) => {
	if (typeof v === 'boolean') return v;
	const s = String(v).trim().toLowerCase();
	if (['true', 'yes', 'y', '1', 'on'].includes(s)) return true;
	if (['false', 'no', 'n', '0', 'off'].includes(s)) return false;
	throw new Error(`“${v}” should be yes or no`);
};

/** An ISO string: the route validators take dates as text, and the model casts it. */
const toDate = (v: any) => {
	if (v instanceof Date) return v.toISOString();
	// An Excel serial number that arrived as a plain number.
	if (typeof v === 'number') return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString();
	const d = new Date(String(v).trim());
	if (Number.isNaN(d.getTime())) throw new Error(`“${v}” is not a date (use 2026-09-29)`);
	return d.toISOString();
};

const splitList = (v: any): any[] => {
	if (Array.isArray(v)) return v;
	const s = String(v).trim();
	if (s.startsWith('[')) {
		try {
			const parsed = JSON.parse(s);
			if (Array.isArray(parsed)) return parsed;
		} catch {
			/* not JSON — split it */
		}
	}
	return s.split(s.includes(';') ? ';' : ',').map(x => x.trim()).filter(Boolean);
};

/** A value as its field wants it, before links are looked up. */
const coerce = (v: any, col: Column, path: any): any => {
	const one = (x: any, p: any): any => {
		if (blank(x)) return undefined;
		const kind = p?.instance;
		if (kind === 'Number') return toNumber(x);
		if (kind === 'Boolean') return toBoolean(x);
		if (kind === 'Date') return toDate(x);
		if (kind === 'ObjectId') return typeof x === 'object' && x?._id ? String(x._id) : String(x).trim();
		if (kind === 'Mixed' || kind === 'Embedded' || kind === 'Subdocument' || kind === 'Object') {
			if (typeof x === 'string' && /^[[{]/.test(x.trim())) {
				try {
					return JSON.parse(x);
				} catch {
					throw new Error('isn’t valid JSON');
				}
			}
			return x;
		}
		if (kind === 'String' || !kind) {
			const s = x instanceof Date ? x.toISOString().slice(0, 10) : typeof x === 'object' ? JSON.stringify(x) : String(x).trim();
			// An allowed value in another case becomes the value; anything else
			// is refused — the form would only have offered these.
			if (col.options?.length && !col.options.includes(s)) {
				const hit = col.options.find(o => norm(o) === norm(s));
				if (hit) return hit;
				throw new Error(`“${s}” isn’t one of: ${col.options.slice(0, 8).join(', ')}${col.options.length > 8 ? '…' : ''}`);
			}
			return s;
		}
		return x;
	};
	if (col.list) {
		if (blank(v)) return undefined;
		const inner = path?.caster || path?.$embeddedSchemaType;
		// A list of sub-records (invoice items) comes as JSON.
		if (path?.schema && typeof v === 'string') {
			try {
				return JSON.parse(v);
			} catch {
				throw new Error('should be a JSON list, like [ { … } ]');
			}
		}
		if (path?.schema) return v;
		return splitList(v).map(x => one(x, inner)).filter(x => x !== undefined);
	}
	return one(v, path);
};

/* -------------------------------------------------------------- the check */

type Checked = { rows: any[]; hidden: string[][]; problems: Problem[]; ignored: string[]; used: Column[]; total: number };

const check = async (req: any, Model: mongoose.Model<any>, format: string, content: any): Promise<Checked> => {
	const { headers, rows: raw }: { headers: string[]; rows: any[] } = await parse(format, content);
	const options = uploadOptions(req, Model);
	if (!raw.length) throw new Error('The file has no rows. The first row should be the column names, then one row per record.');
	if (raw.length > options.maxRows)
		throw new Error(`At most ${options.maxRows.toLocaleString()} rows at a time — this file has ${raw.length.toLocaleString()}`);

	const columns = columnsOf(req, Model);
	const byName = new Map<string, Column>();
	for (const c of columns) {
		byName.set(norm(c.key), c);
		if (!byName.has(norm(c.label))) byName.set(norm(c.label), c);
	}
	// The route's other names for a column ("rme_size_grp" → sizeBand).
	for (const [header, key] of options.columns) {
		const c = columns.find(col => col.key === key);
		if (c && !byName.has(norm(header))) byName.set(norm(header), c);
	}
	const match = new Map<string, Column>();
	const ignored: string[] = [];
	for (const h of headers) {
		// Two headers can name one field ("Status" in one JSON record, "status"
		// in the next); a row takes the first of them it has a value for.
		const c = byName.get(norm(h));
		if (c) match.set(h, c);
		else if (h) ignored.push(h);
	}
	if (!match.size)
		throw new Error(
			`None of the columns match a field. Use these names in the first row: ${columns
				.slice(0, 8)
				.map(c => c.label)
				.join(', ')}${columns.length > 8 ? '…' : ''}`
		);

	const problems: Problem[] = [];
	const add = (p: Problem) => problems.length < MAX_ERRORS * 2 && problems.push(p);
	const settings = req.resolvedRoute?.settings || {};
	const formulas = formulasOf(settings);
	const rules = rulesOf(settings, req.resolvedRoute?.frontendConfig);
	const used = [...new Set(match.values())];

	// 1. Values → the types their fields want.
	const flagCol = options.missingFlag ? columns.find(c => c.key === options.missingFlag) : undefined;
	const valueKinds = new Set(used.filter(c => !c.list && ['Number', 'Date', 'Boolean'].includes((Model.schema.path(c.key) as any)?.instance)).map(c => c.key));
	const rows: any[] = raw.map((r: any, i: number) => {
		const out: any = {};
		let missing = false;
		for (const [header, col] of match) {
			if (out[col.key] !== undefined || blank(r[header])) continue;
			// A "no value" code (a suppressed "C") reads as empty — only in number,
			// date and yes/no columns, where it can't be a real value (a text or
			// linked column may hold "C" itself: Manufacturing's industry code).
			if (valueKinds.has(col.key) && options.missing.has(String(r[header]).trim())) {
				missing = true;
				continue;
			}
			try {
				const v = coerce(r[header], col, Model.schema.path(col.key));
				if (v !== undefined) out[col.key] = v;
			} catch (e: any) {
				add({ row: i + 2, field: col.label, message: e.message });
			}
		}
		if (missing && flagCol && out[flagCol.key] === undefined) out[flagCol.key] = true;
		stripFormulaKeys(out, formulas);
		return out;
	});
	if (flagCol && !used.includes(flagCol) && rows.some(r => r[flagCol.key])) used.push(flagCol);

	// 2. Links: an id, or a record found by its name / code / title / email.
	for (const col of used.filter(c => c.ref)) {
		// The linked model as this scope sees it: in a project, its own `T<projectId>_<Name>`, never the platform's.
		const Ref = scopedModel(col.ref!);
		if (!Ref) continue;
		const wanted = new Set<string>();
		rows.forEach(r => [].concat(r[col.key] ?? []).forEach((v: any) => wanted.add(String(v))));
		if (!wanted.size) continue;
		const ids = [...wanted].filter(v => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(v));
		const names = [...wanted].filter(v => !ids.includes(v));
		// Its usual naming fields, and any unique text field (an industry's code).
		const fields = [
			...new Set([
				...LOOKUP.filter(f => Ref.schema.path(f)),
				...Object.entries<any>(Ref.schema.paths)
					.filter(([k, p]) => p?.instance === 'String' && p?.options?.unique && !k.includes('.') && p?.options?.select !== false)
					.map(([k]) => k),
			]),
		];
		const or: any[] = [];
		if (ids.length) or.push({ _id: { $in: ids } });
		if (names.length) fields.forEach(f => or.push({ [f]: { $in: names } }));
		const found = or.length
			? await Ref.find({ $or: or }, ['_id', ...fields].join(' ')).collation({ locale: 'en', strength: 2 }).limit(20000).lean()
			: [];
		const byId = new Set(found.map((d: any) => String(d._id)));
		const byText = new Map<string, Set<string>>();
		for (const d of found as any[])
			for (const f of fields)
				if (d[f] !== undefined && d[f] !== null) {
					const k = norm(d[f]);
					if (!byText.has(k)) byText.set(k, new Set());
					byText.get(k)!.add(String(d._id));
				}
		const noun = col.ref!.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
		rows.forEach((r, i) => {
			if (r[col.key] === undefined) return;
			const resolve = (v: any) => {
				const s = String(v);
				if (byId.has(s)) return s;
				const hits = byText.get(norm(s));
				if (!hits?.size) {
					add({ row: i + 2, field: col.label, message: `No ${noun} called “${s}”` });
					return undefined;
				}
				if (hits.size > 1) {
					add({ row: i + 2, field: col.label, message: `${hits.size} ${noun} records match “${s}” — use its id instead` });
					return undefined;
				}
				return [...hits][0];
			};
			r[col.key] = Array.isArray(r[col.key]) ? r[col.key].map(resolve).filter(Boolean) : resolve(r[col.key]);
		});
	}

	// 3. Unique fields: against the database, and within the file.
	const uniques = new Set<string>([
		...String(req.resolvedRoute?.built?.EXIST_OPTIONS?.fields || '').split(' ').filter(Boolean),
		...Object.keys(settings).filter(k => settings[k]?.unique),
		...Object.entries(Model.schema.paths)
			.filter(([, p]: any) => p?.options?.unique)
			.map(([k]) => k),
	]);
	uniques.delete('_id');
	for (const key of uniques) {
		const col = used.find(c => c.key === key);
		if (!col) continue;
		const seen = new Map<string, number>();
		rows.forEach((r, i) => {
			const v = r[key];
			if (blank(v)) return;
			const k = String(v).toLowerCase();
			if (seen.has(k)) add({ row: i + 2, field: col.label, message: `“${v}” is also in row ${seen.get(k)} — it must be unique` });
			else seen.set(k, i + 2);
		});
		const values = rows.map(r => r[key]).filter(v => !blank(v));
		if (!values.length) continue;
		const taken = new Set((await Model.find({ [key]: { $in: values } }).distinct(key)).map((v: any) => String(v).toLowerCase()));
		rows.forEach((r, i) => !blank(r[key]) && taken.has(String(r[key]).toLowerCase()) && add({ row: i + 2, field: col.label, message: `“${r[key]}” already exists` }));
	}

	// 3b. Fields that together identify a record (year + industry + size band +
	// measure): a row matching a saved record, or an earlier row, is refused —
	// so a file uploaded twice doesn't double the data.
	if (options.matchOn.length) {
		const keyOf = (r: any) => (options.matchOn.some(k => blank(r[k])) ? null : options.matchOn.map(k => String(r[k]).toLowerCase()).join('\u0000'));
		const names = options.matchOn.map(k => columns.find(c => c.key === k)?.label || settings[k]?.title || k).join(' + ');
		const seen = new Map<string, number>();
		const keys = rows.map(keyOf);
		keys.forEach((k, i) => {
			if (k === null) return;
			if (seen.has(k)) add({ row: i + 2, message: `Same ${names} as row ${seen.get(k)}` });
			else seen.set(k, i + 2);
		});
		if (seen.size) {
			// Narrow by each field's values, then compare whole keys.
			const query: any = {};
			for (const k of options.matchOn) query[k] = { $in: [...new Set(rows.map(r => r[k]).filter(v => !blank(v)))] };
			const saved = new Set<string>();
			for await (const d of Model.find(query, options.matchOn.join(' ')).lean().cursor()) {
				const k = keyOf(d);
				if (k !== null) saved.add(k);
			}
			keys.forEach((k, i) => k !== null && saved.has(k) && add({ row: i + 2, message: `A record with this ${names} already exists` }));
		}
	}

	// 4. What the create form's save checks: hidden fields, the validator, the model.
	const validator = req.resolvedRoute?.built?.VALIDATORS?.POST;
	const labelOf = (k: string) => used.find(c => c.key === k)?.label || columns.find(c => c.key === k)?.label || settings[k]?.title || k;
	const hidden: string[][] = [];
	rows.forEach((row, i) => {
		const skip = Object.keys(rules).length ? hiddenFields(rules, row) : [];
		skip.forEach(k => delete row[k]);
		hidden.push(skip);
		const flagged = new Set(problems.filter(p => p.row === i + 2).map(p => p.field));

		if (validator?.validate) {
			let schema = validator;
			for (const k of skip)
				try {
					schema = schema.fork([k], (f: any) => f.optional());
				} catch {
					/* not in this validator */
				}
			const { error } = schema.validate(row, { abortEarly: false });
			for (const d of error?.details || []) {
				const key = String(d.path?.[0] ?? '');
				const label = labelOf(key);
				if (flagged.has(label)) continue;
				flagged.add(label);
				add({
					row: i + 2,
					field: label,
					message: d.type === 'any.required' ? 'is required' : d.type === 'object.unknown' ? 'can’t be set' : d.message.replace(/^"[^"]*"\s*/, ''),
				});
			}
		}

		const doc = new Model({ ...row, addedBy: req.user?._id });
		applyFormulas(doc, formulas);
		const err: any = doc.validateSync(skip.length ? { pathsToSkip: skip } : undefined);
		for (const [path, e] of Object.entries<any>(err?.errors || {})) {
			const label = labelOf(path.split('.')[0]);
			if (flagged.has(label)) continue;
			flagged.add(label);
			add({
				row: i + 2,
				field: label,
				message:
					e?.kind === 'required'
						? 'is required'
						: e?.kind === 'enum'
						? `“${e?.value}” isn’t allowed${e?.properties?.enumValues?.length ? ` — use ${e.properties.enumValues.slice(0, 6).join(', ')}` : ''}`
						: e?.name === 'CastError'
						? `“${e?.value}” isn’t a valid ${String(e?.kind || 'value').toLowerCase()}`
						: String(e?.message || 'is invalid'),
			});
		}
	});

	problems.sort((a, b) => a.row - b.row);
	return { rows, hidden, problems, ignored, used, total: raw.length };
};

/* ------------------------------------------------------------ controllers */

export const importTemplate = (Model: mongoose.Model<any>) => (req: any, res: Response) => {
	try {
		const { maxRows, columns: aliases, missing } = uploadOptions(req, Model);
		const columns = columnsOf(req, Model).map(c => {
			const also = aliases.filter(([, k]) => k === c.key).map(([h]) => h);
			return also.length ? { ...c, also } : c;
		});
		return res.status(200).json({ columns, maxRows, ...(missing.size && { missing: [...missing] }) });
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not read this route’s fields');
	}
};

export const importRows = (Model: mongoose.Model<any>) => async (req: any, res: Response) => {
	const { format, content, dryRun = true } = req.body || {};
	let result: Checked;
	try {
		if (blank(content)) return fail(res, 400, format === 'json' ? 'Paste or upload some JSON first' : 'Upload a file first');
		result = await check(req, Model, String(format), content);
	} catch (e: any) {
		// The file itself couldn't be read: bad JSON, not a spreadsheet, too many rows.
		const message = e instanceof SyntaxError ? `The JSON isn’t valid: ${e.message}` : e?.message || 'Could not read this file';
		return fail(res, 400, message, { problems: [], stage: 'read' });
	}

	const { rows, hidden, problems, ignored, used, total } = result;
	const badRows = new Set(problems.map(p => p.row)).size;
	const summary = {
		total,
		valid: total - badRows,
		invalidRows: badRows,
		problems: problems.slice(0, MAX_ERRORS),
		moreProblems: Math.max(0, problems.length - MAX_ERRORS),
		columns: used.map(c => ({ key: c.key, label: c.label })),
		ignored,
		preview: rows.slice(0, 5),
	};

	if (dryRun) return res.status(200).json(summary);
	if (problems.length) return fail(res, 400, `Nothing was imported — ${badRows} of ${total} rows have problems`, { ...summary, stage: 'check' });

	// Save through the model (its hooks number codes, set slugs…), a batch at a
	// time so a large file doesn't take one round trip per row.
	const created: any[] = [];
	const formulas = formulasOf(req.resolvedRoute?.settings);
	const saveRow = async (i: number) => {
		const doc = new Model({ ...rows[i], addedBy: req.user?._id });
		applyFormulas(doc, formulas);
		const skip = hidden[i];
		if (skip.length) await doc.validate({ pathsToSkip: skip });
		created.push(await doc.save(skip.length ? { validateBeforeSave: false } : undefined));
	};
	for (let start = 0; start < rows.length; start += SAVE_BATCH) {
		const batch = rows.slice(start, start + SAVE_BATCH).map((_, j) => start + j);
		const results = await Promise.allSettled(batch.map(saveRow));
		const failed = results.findIndex(r => r.status === 'rejected');
		if (failed !== -1) {
			// All or nothing: take back what this import already saved.
			if (created.length) await Model.deleteMany({ _id: { $in: created.map(d => d._id) } }).catch(() => undefined);
			const e: any = (results[failed] as PromiseRejectedResult).reason;
			return fail(res, 400, `Nothing was imported — row ${batch[failed] + 2} failed to save`, {
				...summary,
				stage: 'save',
				problems: [{ row: batch[failed] + 2, message: e?.message || 'Could not save' }],
			});
		}
	}
	created.forEach(doc => recordHistory({ req, action: 'create', model: Model.modelName, doc }));
	return res.status(201).json({ ...summary, created: created.length });
};
