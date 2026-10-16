import { Response } from 'express';
import mongoose from 'mongoose';
import { PdfTemplate } from '../../models/pdf-templates/_index.js';
import { cleanRecord, loadLists, populateFor, templatePaths, under } from '../../functions/pdfTemplates/data.js';
import { renderPdf } from '../../functions/pdfTemplates/render.js';
import { LIMITS, PdfTemplateData, normalizeTemplate, textsRoot } from '../../functions/pdfTemplates/schema.js';
import { tokenPaths } from '../../functions/pdfTemplates/tokens.js';
import { PUBLISHED, findTemplate, loadSettings, sendPdf, zoneOf } from './pdfTemplates.controller.js';

/**
 * POST /<route>/export/template — records of this page printed with a PDF
 * template (docs/pdf-templates), one after another in one file. Behind the
 * page's export middleware: the reader's read permission, the list's filter
 * and record access decide which records come back (D11).
 *
 * Body: `{ ids: string[], template?: id | template, tz?: string, inline?: boolean, as?: 'data' }`
 * — no template: the page's default (or its only one). `as: 'data'` answers
 * the first record's data as JSON instead (the designer's preview).
 */

const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });

const nameOf = (doc: any) => {
	for (const k of ['number', 'invoiceNumber', 'code', 'name', 'title']) if (typeof doc?.[k] === 'string' && doc[k]) return doc[k];
	if (typeof doc?.code === 'number') return String(doc.code);
	return String(doc?._id || 'record');
};

/**
 * Records of a page printed with one template, in one PDF — the page's
 * download and an automation's email attachment (docs/automations) both use
 * it. `req` needs `user` (record access), `permissions` and `app` (lists of
 * other pages); `filter` is the reader's list rules for these records.
 */
export const printRecords = async (o: {
	req: any;
	Model: mongoose.Model<any>;
	template: PdfTemplateData;
	ids: string[];
	routeSettings: Record<string, any>;
	filter?: any;
	exclude?: string;
	tz?: string;
	asData?: boolean;
}): Promise<null | { data: any } | { pdf: Buffer; docs: any[]; file: string }> => {
	const { req, Model, template, ids, routeSettings } = o;
	const settings = await loadSettings();
	// The saved texts it prints can read the record's fields too ({{texts.terms}} → "due {{bill.dueDate | date}}").
	const paths = [...templatePaths(template), ...settings.texts.flatMap(t => tokenPaths(t.text))];
	const populate = await populateFor(req, Model, under(paths, [template.alias, 'record']));
	const docs: any[] = await Model.find({ $and: [o.filter || {}, { _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } }] })
		.select(o.exclude || '')
		.populate(populate as any)
		.lean();
	if (!docs.length) return null;
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
				texts: textsRoot(settings),
				today: now,
				now,
				template: { name: template.name },
			},
		};
	});
	if (o.asData) return { data: { roots: records[0].roots, settings, tz: zoneOf(settings, o.tz) } };
	const pdf = await renderPdf({ template, records, settings, tz: zoneOf(settings, o.tz) });
	const file = docs.length === 1 ? `${template.name} ${nameOf(docs[0])}.pdf` : `${template.name} — ${docs.length} records.pdf`;
	return { pdf, docs, file };
};

const exportTemplate = (Model: mongoose.Model<any>) => async (req: any, res: Response) => {
	try {
		const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter((id: string) => mongoose.isValidObjectId(id)) : [];
		if (!ids.length) return fail(res, 400, 'Pick at least one record');
		if (ids.length > LIMITS.records) return fail(res, 400, `At most ${LIMITS.records} records at a time`);
		const route = req.resolvedRoute?.key || '';

		let raw: any = null;
		if (req.body?.template && typeof req.body.template === 'object') raw = req.body.template;
		else if (typeof req.body?.template === 'string') {
			raw = await findTemplate(req.body.template, { gallery: false });
			// A draft prints only in the designer (its preview sends the template itself, or asks for data).
			if (raw?.status === 'draft' && req.body?.as !== 'data') return fail(res, 400, `“${raw.name}” is a draft — publish it to download with it`);
		}
		// No template named: the page's default among its published ones (PT-33).
		else raw = await PdfTemplate.findOne({ route, ...PUBLISHED }).sort({ isDefault: -1, updatedAt: -1 }).lean();
		if (!raw) return fail(res, 404, req.body?.template ? 'Template not found' : 'This page has no published PDF template yet — publish one under PDF templates');
		const { template } = normalizeTemplate({ name: 'Document', ...raw });

		const printed = await printRecords({
			req,
			Model,
			template,
			ids,
			routeSettings: req.resolvedRoute?.settings || {},
			filter: req.queryHelper || {},
			exclude: req.resolvedRoute?.built?.QUERY_OPTIONS?.exclude || '',
			tz: req.body?.tz,
			asData: req.body?.as === 'data',
		});
		if (!printed) return fail(res, 404, 'None of these records were found');
		// The designer draws the page itself: the same data, as JSON (first record).
		if ('data' in printed) return res.status(200).json(printed.data);
		sendPdf(res, printed.pdf, printed.file, req.body?.inline === true);
	} catch (e: any) {
		if (!res.headersSent) return fail(res, 500, e?.message || 'Could not make the PDF');
		res.end();
	}
};

export default exportTemplate;
