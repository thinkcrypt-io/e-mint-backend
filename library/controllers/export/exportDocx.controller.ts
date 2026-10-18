import { Response } from 'express';
import mongoose from 'mongoose';
import { cleanRecord } from '../../functions/pdfTemplates/data.js';
import { richTextToDocx } from '../../functions/richText/docx.js';
import { richTextToPdf } from '../../functions/richText/pdf.js';
import { richTextToMarkdown, richTextToText } from '../../functions/richText/text.js';

/**
 * POST /<route>/export/richtext — one record's rich-text field as a file: Word
 * (.docx), PDF, Markdown (.md) or plain text (.txt). The row menu's download,
 * the download beside the field on a record page and the full-page editor's
 * Export use it; POST /<route>/export/docx is the Word file alone (the first
 * row-menu item). Behind the page's export middleware, like PDF downloads:
 * the reader's read permission and the list's filter and record access decide
 * whether the record comes back, and a field they may not read isn't there.
 *
 * Body: `{ id: string, field: string, format?: 'docx' | 'pdf' | 'md' | 'txt' }`
 * — `field` must be a rich-text field (`editor` / `basic-editor`) of this
 * page; `format` defaults to docx.
 */

const RICH = new Set(['editor', 'basic-editor']);

const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });

const nameOf = (doc: any) => {
	for (const k of ['title', 'name', 'number', 'invoiceNumber', 'code']) if ((typeof doc?.[k] === 'string' && doc[k].trim()) || typeof doc?.[k] === 'number') return String(doc[k]).trim();
	return String(doc?._id || 'record');
};

const FORMATS = {
	docx: { ext: 'docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', make: richTextToDocx, failed: 'Could not make the Word file' },
	pdf: { ext: 'pdf', type: 'application/pdf', make: richTextToPdf, failed: 'Could not make the PDF' },
	md: { ext: 'md', type: 'text/markdown; charset=utf-8', make: richTextToMarkdown, failed: 'Could not make the Markdown file' },
	txt: { ext: 'txt', type: 'text/plain; charset=utf-8', make: richTextToText, failed: 'Could not make the text file' },
};
type Format = keyof typeof FORMATS;

export const sendFile = (res: Response, file: Buffer, name: string, format: Format) => {
	const safe = name.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 150) || 'document';
	const full = `${safe}.${FORMATS[format].ext}`;
	const ascii = full.replace(/[^\x20-\x7e]/g, '_');
	res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
	res.setHeader('Content-Type', FORMATS[format].type);
	res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(full)}`);
	res.setHeader('Content-Length', String(file.length));
	res.status(200).end(file);
};

export const exportRichText = (Model: mongoose.Model<any>, fixed?: Format) => async (req: any, res: Response) => {
	const format: Format = fixed || (String(req.body?.format || 'docx').toLowerCase() as Format);
	if (!Object.prototype.hasOwnProperty.call(FORMATS, format)) return fail(res, 400, 'Pick a format: docx, pdf, md or txt');
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
		const file = await FORMATS[format].make({ html, title: `${name} — ${label}` });
		sendFile(res, file, name === label ? name : `${name} — ${label}`, format);
	} catch (e: any) {
		if (!res.headersSent) return fail(res, 500, e?.message || FORMATS[format].failed);
		res.end();
	}
};

const exportDocx = (Model: mongoose.Model<any>) => exportRichText(Model, 'docx');

export default exportDocx;
