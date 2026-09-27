import { Response } from 'express';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

/**
 * POST /export/rows?<the table's filters and search> — the table as a file.
 *
 * Body: `{ ids?: string[], columns: { key, label? }[], format: 'csv' | 'xlsx' | 'pdf', title? }`.
 * With `ids`, just those rows; without, every row the table's current filters
 * match (up to MAX_ROWS), in its sort order. Runs after the filter middleware,
 * read permission and the route's access rules, so it exports exactly what the
 * admin could page through. Headers are the columns' labels; a linked record
 * reads as its name, a list as "a, b", a date as a date, rich text as text.
 */

export const MAX_ROWS = 20000;

const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });

const get = (doc: any, key: string) => key.split('.').reduce((v, k) => (v == null ? v : v[k]), doc);
const strip = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/** One cell's value: a number or Date stays typed (for Excel); everything else becomes text. */
export const cellValue = (v: any): string | number | Date | null => {
	if (v === undefined || v === null) return null;
	if (v instanceof Date) return v;
	if (typeof v === 'number') return v;
	if (typeof v === 'boolean') return v ? 'Yes' : 'No';
	if (v instanceof mongoose.Types.ObjectId) return String(v);
	if (Array.isArray(v)) return v.map(x => String(cellValue(x) instanceof Date ? (cellValue(x) as Date).toISOString().slice(0, 10) : cellValue(x) ?? '')).filter(Boolean).join(', ');
	if (typeof v === 'object') return v.name ?? v.title ?? v.code ?? v.email ?? v.label ?? (v._id ? String(v._id) : JSON.stringify(v));
	const s = String(v);
	return /<[a-z][\s\S]*>/i.test(s) ? strip(s) : s;
};

const asText = (v: string | number | Date | null) =>
	v === null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'number' ? String(v) : v;

const csvCell = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13);

const exportRows = (Model: mongoose.Model<any>) => async (req: any, res: Response) => {
	try {
		const body = req.body || {};
		const format = ['csv', 'xlsx', 'pdf'].includes(body.format) ? body.format : 'csv';
		const settings: Record<string, any> = req.resolvedRoute?.settings || {};
		const built = req.resolvedRoute?.built;

		// Columns: fields of this route (or a part of one — "client.name"), never an excluded one.
		const columns: { key: string; label: string }[] = (Array.isArray(body.columns) ? body.columns : [])
			.filter((c: any) => c && typeof c.key === 'string')
			.filter((c: any) => {
				const root = c.key.split('.')[0];
				return (root in settings || ['_id', 'createdAt', 'updatedAt'].includes(root)) && !settings[root]?.exclude;
			})
			.slice(0, 60)
			.map((c: any) => ({ key: c.key, label: String(c.label || settings[c.key]?.title || c.key) }));
		if (!columns.length) return fail(res, 400, 'Pick at least one column');

		const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((id: any) => mongoose.isValidObjectId(id)) : [];
		const base = req.queryHelper || {};
		const query = ids.length ? { $and: [base, { _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } }] } : base;

		const sort = typeof req.query?.sort === 'string' && req.query.sort ? req.query.sort : '-createdAt';
		const docs = await Model.find(query)
			.sort(sort)
			.limit(MAX_ROWS)
			.select(built?.QUERY_OPTIONS?.exclude || '')
			.populate(built?.QUERY_OPTIONS?.populate || '')
			.lean();

		const rows = docs.map((doc: any) => columns.map(c => cellValue(get(doc, c.key))));
		const route = req.resolvedRoute?.key || 'export';
		const title = String(body.title || req.resolvedRoute?.frontendConfig?.route?.title || route);
		const file = `${route}-${stamp()}`;
		res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Row-Count');
		res.setHeader('X-Row-Count', String(rows.length));

		if (format === 'csv') {
			const lines = [columns.map(c => csvCell(c.label)).join(','), ...rows.map(r => r.map(v => csvCell(asText(v))).join(','))];
			res.setHeader('Content-Type', 'text/csv; charset=utf-8');
			res.setHeader('Content-Disposition', `attachment; filename="${file}.csv"`);
			return res.status(200).send('﻿' + lines.join('\r\n'));
		}

		if (format === 'xlsx') {
			const wb = new ExcelJS.Workbook();
			const ws = wb.addWorksheet(title.slice(0, 31) || 'Export', { views: [{ state: 'frozen', ySplit: 1 }] });
			ws.columns = columns.map((c, i) => {
				const longest = Math.max(c.label.length, ...rows.slice(0, 500).map(r => asText(r[i]).length));
				return { header: c.label, key: c.key, width: Math.min(Math.max(longest + 2, 10), 50) };
			});
			rows.forEach(r => ws.addRow(r));
			ws.getRow(1).font = { bold: true };
			ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
			columns.forEach((_, i) => {
				const col = ws.getColumn(i + 1);
				if (rows.some(r => r[i] instanceof Date)) col.numFmt = 'yyyy-mm-dd';
			});
			res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
			res.setHeader('Content-Disposition', `attachment; filename="${file}.xlsx"`);
			await wb.xlsx.write(res);
			return res.end();
		}

		// PDF: a landscape table, header repeated on every page.
		const doc = new PDFDocument({ margin: 32, size: 'A4', layout: 'landscape' });
		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader('Content-Disposition', `attachment; filename="${file}.pdf"`);
		doc.pipe(res);
		const left = doc.page.margins.left;
		const width = doc.page.width - left - doc.page.margins.right;
		const colW = width / columns.length;
		const bottom = () => doc.page.height - doc.page.margins.bottom;
		doc.fontSize(14).font('Helvetica-Bold').text(title, left, doc.page.margins.top);
		doc.fontSize(8).font('Helvetica').fillColor('#666').text(`${rows.length} rows · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`);
		doc.fillColor('#000');
		let y = doc.y + 8;
		const header = () => {
			doc.rect(left, y, width, 18).fill('#f1f1f1');
			doc.fillColor('#111').font('Helvetica-Bold').fontSize(8);
			columns.forEach((c, i) => doc.text(c.label, left + i * colW + 4, y + 5, { width: colW - 8, height: 10, ellipsis: true }));
			doc.font('Helvetica').fillColor('#000');
			y += 18;
		};
		header();
		rows.forEach((r, ri) => {
			const cells = r.map(asText);
			const h = Math.min(Math.max(...cells.map(s => doc.heightOfString(s || ' ', { width: colW - 8 }))) + 8, 60);
			if (y + h > bottom()) {
				doc.addPage();
				y = doc.page.margins.top;
				header();
			}
			if (ri % 2) doc.rect(left, y, width, h).fill('#fafafa').fillColor('#000');
			doc.fontSize(8);
			cells.forEach((s, i) => doc.text(s, left + i * colW + 4, y + 4, { width: colW - 8, height: h - 6, ellipsis: true }));
			y += h;
		});
		doc.end();
	} catch (e: any) {
		if (!res.headersSent) return fail(res, 500, e?.message || 'Could not export');
		res.end();
	}
};

export default exportRows;
