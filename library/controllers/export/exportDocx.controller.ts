import { Response } from 'express';
import mongoose from 'mongoose';
import { cleanRecord } from '../../functions/pdfTemplates/data.js';
import { richTextToDocx } from '../../functions/richText/docx.js';

/**
 * POST /<route>/export/docx — one record's rich-text field as a Word file
 * (row menu → "Download DOCX", and the download beside the field on a record
 * page). Behind the page's export middleware, like PDF downloads: the
 * reader's read permission and the list's filter and record access decide
 * whether the record comes back, and a field they may not read isn't there.
 *
 * Body: `{ id: string, field: string }` — `field` must be a rich-text field
 * (`editor` / `basic-editor`) of this page.
 */

const RICH = new Set(['editor', 'basic-editor']);

const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });

const nameOf = (doc: any) => {
	for (const k of ['title', 'name', 'number', 'invoiceNumber', 'code']) if ((typeof doc?.[k] === 'string' && doc[k].trim()) || typeof doc?.[k] === 'number') return String(doc[k]).trim();
	return String(doc?._id || 'record');
};

export const sendDocx = (res: Response, file: Buffer, name: string) => {
	const safe = name.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'document';
	const full = `${safe}.docx`;
	const ascii = full.replace(/[^\x20-\x7e]/g, '_');
	res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
	res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
	res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(full)}`);
	res.setHeader('Content-Length', String(file.length));
	res.status(200).end(file);
};

const exportDocx = (Model: mongoose.Model<any>) => async (req: any, res: Response) => {
	try {
		const id = String(req.body?.id || '');
		const field = String(req.body?.field || '');
		if (!mongoose.isValidObjectId(id)) return fail(res, 400, 'Pick a record');
		const settings: Record<string, any> = req.resolvedRoute?.settings || {};
		const def = settings[field];
		if (!field || !def) return fail(res, 400, field ? `This page has no field “${field}”` : 'Pick a rich-text field');
		// A page's settings name a field by `title` (built models) or `label`.
		const label = String(def.title || def.label || field);
		if (!RICH.has(def?.schema?.type)) return fail(res, 400, `“${label}” isn’t a rich-text field`);

		const doc: any = await Model.findOne({ $and: [req.queryHelper || {}, { _id: new mongoose.Types.ObjectId(id) }] })
			.select(req.resolvedRoute?.built?.QUERY_OPTIONS?.exclude || '')
			.lean();
		if (!doc) return fail(res, 404, 'Record not found');
		cleanRecord(doc, Model, settings);
		if (!(field in doc)) return fail(res, 403, `You can’t read “${label}”`);
		const html = doc[field];
		if (typeof html !== 'string' || !html.replace(/<[^>]*>/g, '').trim() && !/<img\b/i.test(html)) return fail(res, 400, `“${label}” is empty`);

		const name = nameOf(doc);
		const file = await richTextToDocx({ html, title: `${name} — ${label}` });
		sendDocx(res, file, name === label ? name : `${name} — ${label}`);
	} catch (e: any) {
		if (!res.headersSent) return fail(res, 500, e?.message || 'Could not make the Word file');
		res.end();
	}
};

export default exportDocx;
