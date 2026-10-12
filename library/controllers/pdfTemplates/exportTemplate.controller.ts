import { Response } from 'express';
import mongoose from 'mongoose';
import { PdfTemplate } from '../../models/pdf-templates/_index.js';
import { cleanRecord, loadLists, populateFor, templatePaths, under } from '../../functions/pdfTemplates/data.js';
import { renderPdf } from '../../functions/pdfTemplates/render.js';
import { LIMITS, normalizeTemplate } from '../../functions/pdfTemplates/schema.js';
import { findTemplate, loadSettings, sendPdf, zoneOf } from './pdfTemplates.controller.js';

/**
 * POST /<route>/export/template — records of this page printed with a PDF
 * template (docs/pdf-templates), one after another in one file. Behind the
 * page's export middleware: the reader's read permission, the list's filter
 * and record access decide which records come back (D11).
 *
 * Body: `{ ids: string[], template?: id | template, tz?: string, inline?: boolean }`
 * — no template: the page's default (or its only one).
 */

const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });

const nameOf = (doc: any) => {
	for (const k of ['number', 'invoiceNumber', 'code', 'name', 'title']) if (typeof doc?.[k] === 'string' && doc[k]) return doc[k];
	if (typeof doc?.code === 'number') return String(doc.code);
	return String(doc?._id || 'record');
};

const exportTemplate = (Model: mongoose.Model<any>) => async (req: any, res: Response) => {
	try {
		const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter((id: string) => mongoose.isValidObjectId(id)) : [];
		if (!ids.length) return fail(res, 400, 'Pick at least one record');
		if (ids.length > LIMITS.records) return fail(res, 400, `At most ${LIMITS.records} records at a time`);
		const route = req.resolvedRoute?.key || '';

		let raw: any = null;
		if (req.body?.template && typeof req.body.template === 'object') raw = req.body.template;
		else if (typeof req.body?.template === 'string') raw = await findTemplate(req.body.template, { gallery: false });
		else raw = await PdfTemplate.findOne({ route }).sort({ isDefault: -1, updatedAt: -1 }).lean();
		if (!raw) return fail(res, 404, req.body?.template ? 'Template not found' : 'This page has no PDF template yet — make one under PDF templates');
		const { template } = normalizeTemplate({ name: 'Document', ...raw });

		const settings = await loadSettings();
		const routeSettings: Record<string, any> = req.resolvedRoute?.settings || {};
		const paths = templatePaths(template);
		const populate = await populateFor(req, Model, under(paths, [template.alias, 'record']));
		const docs: any[] = await Model.find({ $and: [req.queryHelper || {}, { _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } }] })
			.select(req.resolvedRoute?.built?.QUERY_OPTIONS?.exclude || '')
			.populate(populate as any)
			.lean();
		if (!docs.length) return fail(res, 404, 'None of these records were found');
		docs.sort((a, b) => ids.indexOf(String(a._id)) - ids.indexOf(String(b._id)));
		const lists = await loadLists(req, template, docs.map(d => String(d._id)), paths);

		const now = new Date();
		const records = docs.map(doc => {
			const record = cleanRecord(doc, Model, routeSettings);
			return {
				roots: {
					...lists.get(String(doc._id)),
					[template.alias]: record,
					record,
					business: settings.business,
					today: now,
					now,
					template: { name: template.name },
				},
			};
		});
		const pdf = await renderPdf({ template, records, settings, tz: zoneOf(settings, req.body?.tz) });
		const file = docs.length === 1 ? `${template.name} ${nameOf(docs[0])}.pdf` : `${template.name} — ${docs.length} records.pdf`;
		sendPdf(res, pdf, file, req.body?.inline === true);
	} catch (e: any) {
		if (!res.headersSent) return fail(res, 500, e?.message || 'Could not make the PDF');
		res.end();
	}
};

export default exportTemplate;
