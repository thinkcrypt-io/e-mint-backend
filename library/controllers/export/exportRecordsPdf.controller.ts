import { Response } from 'express';
import mongoose from 'mongoose';
import PDFDocument from 'pdfkit';
import { cellValue } from './exportRows.controller.js';

/**
 * POST /export/records — the selected records as a PDF, one per page: its
 * name and code, then its fields in the form's sections (label, value). The
 * "Download PDF" beside the print page; plainer (text only), but a file in
 * one click. Password fields are masked, excluded fields left out.
 *
 * Body: `{ ids: string[] }`. Same middleware as the rows export.
 */

const MAX_RECORDS = 200;
const HIDE = new Set(['_id', '__v', 'archivedBy']);

const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });
const get = (doc: any, key: string) => key.split('.').reduce((v, k) => (v == null ? v : v[k]), doc);
const show = (v: ReturnType<typeof cellValue>) =>
	v === null || v === '' ? '—' : v instanceof Date ? v.toISOString().slice(0, 16).replace('T', ' ').replace(' 00:00', '') : String(v);

/** The form's sections as [title, keys][]: from the config's `form` layout, else one untitled group. */
const sectionsOf = (config: any, keys: string[]): [string, string[]][] => {
	const out: [string, string[]][] = [];
	const claimed = new Set<string>();
	for (const s of Array.isArray(config?.form) ? config.form : []) {
		const fields = (Array.isArray(s?.fields) ? s.fields : []).flat().filter((k: any) => typeof k === 'string' && keys.includes(k));
		fields.forEach((k: string) => claimed.add(k));
		if (fields.length) out.push([String(s.sectionTitle || ''), fields]);
	}
	const rest = keys.filter(k => !claimed.has(k));
	if (rest.length) out.push([out.length ? 'Other' : '', rest]);
	return out;
};

const exportRecordsPdf = (Model: mongoose.Model<any>) => async (req: any, res: Response) => {
	try {
		const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: any) => mongoose.isValidObjectId(id)) : [];
		if (!ids.length) return fail(res, 400, 'Select at least one row');
		if (ids.length > MAX_RECORDS) return fail(res, 400, `At most ${MAX_RECORDS} records at a time`);

		const settings: Record<string, any> = req.resolvedRoute?.settings || {};
		const built = req.resolvedRoute?.built;
		const config = req.resolvedRoute?.frontendConfig || {};
		const keys = (Array.isArray(config.fields) && config.fields.length ? config.fields : Object.keys(settings)).filter(
			(k: string) => !HIDE.has(k) && !settings[k]?.exclude
		);
		const sections = sectionsOf(config, keys);
		const labelOf = (k: string) => settings[k]?.schema?.label || settings[k]?.title || k;
		const isSecret = (k: string) => settings[k]?.schema?.type === 'password';

		const docs = await Model.find({
			$and: [req.queryHelper || {}, { _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } }],
		})
			.select(built?.QUERY_OPTIONS?.exclude || '')
			.populate(built?.QUERY_OPTIONS?.populate || '')
			.lean();
		if (!docs.length) return fail(res, 404, 'None of these records were found');
		// In the order they were ticked.
		docs.sort((a: any, b: any) => ids.indexOf(String(a._id)) - ids.indexOf(String(b._id)));

		const route = req.resolvedRoute?.key || 'records';
		const routeTitle = String(config?.route?.title || route);
		const pdf = new PDFDocument({ margin: 48, size: 'A4', autoFirstPage: false });
		res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
		res.setHeader('Content-Type', 'application/pdf');
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${route}-${docs.length === 1 ? (docs[0] as any).code || 'record' : `${docs.length}-records`}.pdf"`
		);
		pdf.pipe(res);

		for (const doc of docs as any[]) {
			pdf.addPage();
			const left = pdf.page.margins.left;
			const width = pdf.page.width - left - pdf.page.margins.right;
			const labelW = Math.min(170, width * 0.35);
			const bottom = pdf.page.height - pdf.page.margins.bottom;

			pdf.fillColor('#666').font('Helvetica').fontSize(9).text(routeTitle.toUpperCase(), left, pdf.page.margins.top);
			pdf.fillColor('#111').font('Helvetica-Bold').fontSize(18).text(doc.name || doc.title || doc.code || String(doc._id), { width });
			if (doc.code && (doc.name || doc.title)) pdf.fillColor('#666').font('Helvetica').fontSize(10).text(String(doc.code));
			pdf.moveDown(0.8);

			for (const [title, fields] of sections) {
				if (pdf.y > bottom - 60) pdf.addPage();
				if (title) {
					pdf.fillColor('#111').font('Helvetica-Bold').fontSize(11).text(title, left, pdf.y, { width });
					const lineY = pdf.y + 3;
					pdf.moveTo(left, lineY).lineTo(left + width, lineY).strokeColor('#e4e4e4').lineWidth(1).stroke();
					pdf.moveDown(0.6);
				}
				for (const k of fields) {
					const value = isSecret(k) && get(doc, k) ? '••••••••' : show(cellValue(get(doc, k)));
					const h = Math.max(pdf.heightOfString(value, { width: width - labelW }), 12);
					if (pdf.y + h > bottom) pdf.addPage();
					const y = pdf.y;
					pdf.fillColor('#666').font('Helvetica').fontSize(9).text(labelOf(k), left, y + 1, { width: labelW - 10 });
					pdf.fillColor('#111').fontSize(10).text(value, left + labelW, y, { width: width - labelW });
					pdf.y = Math.max(pdf.y, y + h) + 5;
				}
				pdf.moveDown(0.6);
			}
		}
		pdf.end();
	} catch (e: any) {
		if (!res.headersSent) return fail(res, 500, e?.message || 'Could not make the PDF');
		res.end();
	}
};

export default exportRecordsPdf;
