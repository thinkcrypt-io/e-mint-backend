import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { PdfSettings, PdfTemplate } from '../../models/pdf-templates/_index.js';
import { currentScope, withoutScope } from '../../functions/tenantScope.function.js';
import { cleanBusiness, projectBusiness } from '../../functions/business.function.js';
import TenantProject from '../../models/tenancy/tenantProject.model.js';
import Organization from '../../models/tenancy/organization.model.js';
import { fieldTree } from '../../functions/pdfTemplates/data.js';
import { applyMapping, guessMapping, Mapping } from '../../functions/pdfTemplates/mapping.js';
import { renderPdf } from '../../functions/pdfTemplates/render.js';
import { DEFAULT_SETTINGS, PdfSettingsData, PdfTemplateData, categoryKey, normalizeSettings, normalizeTemplate, textsRoot } from '../../functions/pdfTemplates/schema.js';
import { applyLook } from '../../functions/pdfTemplates/theme.js';
import { loadCategories } from './categories.controller.js';
import { STARTERS } from '../../functions/pdfTemplates/starters.js';
import { previewRoots } from '../../functions/pdfTemplates/preview.js';
import { resources } from '../builder/viewDocument.controller.js';

/**
 * /pdf-templates (docs/pdf-templates): the templates of this scope (the super
 * admin's, or a project's), the business details they read, the gallery of
 * starters, previews, and using a starter on a page. Downloading a record is
 * the page's own POST /<route>/export/template (exportTemplate.controller).
 */

const fail = (res: Response, status: number, message: string, extra: any = {}) => res.status(status).json({ message, ...extra });
const userId = (req: any) => (mongoose.isValidObjectId(req.user?._id) ? req.user._id : undefined);

/** A starter from code, shaped like a stored template. */
const starterDoc = (s: any, i: number) => ({
	...normalizeTemplate(s).template,
	_id: `starter:${s.key}`,
	key: s.key,
	gallery: { published: true, order: i },
	builtIn: true,
});

/** The project this request works in (tenant panel), with its organization — whose business details PDFs print (D14, D15). */
const projectOf = async () => {
	const scope: any = currentScope();
	if (!scope?.project) return null;
	const [project, org] = await Promise.all([
		TenantProject.findById(scope.project, { business: 1 }).lean(),
		Organization.findById(scope.organization, { name: 1, logo: 1, business: 1, onboarding: 1 }).lean(),
	]);
	return project ? { project: project as any, org } : null;
};

/** What every template of the scope reads: in a project, its business details; the bank note, money, dates and saved texts from PdfSettings. */
export const loadSettings = async (): Promise<PdfSettingsData> => {
	const [doc, inProject]: [any, any] = await Promise.all([PdfSettings.findOne({ key: 'default' }).lean(), projectOf()]);
	const settings = normalizeSettings(doc?.data || DEFAULT_SETTINGS);
	if (inProject) settings.business = { ...projectBusiness(inProject.project, inProject.org), note: settings.business.note };
	return settings;
};

/**
 * Saves the settings. In a project its business details go to the project
 * (Project settings shows the same) and PdfSettings keeps the rest; `business:
 * false` leaves them alone (a saved text changing). Answers what loadSettings does.
 */
export const storeSettings = async (raw: any, user: any, opts: { business?: boolean } = {}): Promise<PdfSettingsData> => {
	const data = normalizeSettings(raw);
	const inProject = await projectOf();
	if (inProject) {
		const { note, ...business } = data.business;
		if (opts.business !== false) await TenantProject.updateOne({ _id: inProject.project._id }, { $set: { business: cleanBusiness(business) } });
		data.business = { ...DEFAULT_SETTINGS.business, note };
	}
	await PdfSettings.findOneAndUpdate({ key: 'default' }, { $set: { data, updatedBy: user } }, { upsert: true, new: true });
	return loadSettings();
};

/** The time zone dates print in: the settings', else the reader's, else UTC. */
export const zoneOf = (settings: PdfSettingsData, asked: any) => {
	if (settings.timezone) return settings.timezone;
	try {
		if (typeof asked === 'string' && asked) {
			new Intl.DateTimeFormat('en', { timeZone: asked });
			return asked;
		}
	} catch {
		/* not a zone */
	}
	return 'UTC';
};

/** A template by id from this scope, or a gallery one (the super admin's, or a built-in starter). */
export const findTemplate = async (id: string, { gallery = false } = {}): Promise<any | null> => {
	if (id.startsWith('starter:')) {
		const i = STARTERS.findIndex(s => s.key === id.slice(8));
		return i < 0 ? null : starterDoc(STARTERS[i], i);
	}
	if (!mongoose.isValidObjectId(id)) return null;
	const own = await PdfTemplate.findById(id).lean();
	if (own) return own;
	if (!gallery) return null;
	return withoutScope(() => PdfTemplate.findOne({ _id: id, 'gallery.published': true }).lean());
};

/* -------------------------------------------------------------- list */

/** Offered for download (PT-33): published, or saved before templates had a status. */
export const PUBLISHED = { status: { $ne: 'draft' } };
/** New, copied and from-the-gallery templates start as drafts unless asked otherwise. */
const startStatus = (raw: any): 'draft' | 'published' => (raw?.status === 'published' ? 'published' : 'draft');

export const listTemplates = async (req: Request, res: Response) => {
	try {
		const route = typeof req.query.route === 'string' ? req.query.route.replace(/^\/+|\/+$/g, '') : '';
		// ?published=1: only the ones a page offers for download.
		const published = req.query.published === '1' || req.query.published === 'true';
		const docs = await PdfTemplate.find({ ...(route && { route }), ...(published && PUBLISHED) })
			.sort({ route: 1, isDefault: -1, name: 1 })
			.lean();
		return res.status(200).json({ templates: docs });
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not load the templates');
	}
};

export const getTemplate = async (req: Request, res: Response) => {
	const doc = await findTemplate(String(req.params.id), { gallery: true }).catch(() => null);
	if (!doc) return fail(res, 404, 'Template not found');
	return res.status(200).json(doc);
};

/** Only the super admin decides what's in the gallery (D6). */
const galleryOf = (raw: any, before?: any) =>
	currentScope() ? undefined : { published: raw?.gallery?.published ?? before?.gallery?.published ?? false, order: Number(raw?.gallery?.order ?? before?.gallery?.order ?? 0) || 0 };

/** One default per page. */
const makeDefault = async (doc: any) => {
	if (!doc?.route) return;
	await PdfTemplate.updateMany({ route: doc.route, _id: { $ne: doc._id } }, { $set: { isDefault: false } });
	await PdfTemplate.updateOne({ _id: doc._id }, { $set: { isDefault: true } });
};

const pageExists = (req: any, route: string) => !route || !!resources(req.app).get(route);

export const createTemplate = async (req: any, res: Response) => {
	try {
		const { template, errors } = normalizeTemplate(req.body || {});
		if (errors.length) return fail(res, 400, errors[0], { errors });
		if (!pageExists(req, template.route)) return fail(res, 400, `There's no page “${template.route}”`);
		const first = template.route ? !(await PdfTemplate.exists({ route: template.route })) : false;
		const doc = await PdfTemplate.create({
			...template,
			...(typeof req.body?.from === 'string' && { from: req.body.from.slice(0, 80) }),
			status: startStatus(req.body),
			isDefault: first,
			gallery: galleryOf(req.body),
			createdBy: userId(req),
			updatedBy: userId(req),
		});
		return res.status(201).json(doc.toObject());
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not save the template');
	}
};

export const updateTemplate = async (req: any, res: Response) => {
	try {
		const before: any = mongoose.isValidObjectId(req.params.id) ? await PdfTemplate.findById(req.params.id).lean() : null;
		if (!before) return fail(res, 404, 'Template not found');
		const { template, errors } = normalizeTemplate({ ...req.body, slots: req.body?.slots ?? before.slots, sample: req.body?.sample ?? before.sample });
		if (errors.length) return fail(res, 400, errors[0], { errors });
		if (template.route !== before.route && !pageExists(req, template.route)) return fail(res, 400, `There's no page “${template.route}”`);
		const doc = await PdfTemplate.findByIdAndUpdate(
			before._id,
			{ $set: { ...template, ...(galleryOf(req.body, before) && { gallery: galleryOf(req.body, before) }), updatedBy: userId(req), ...(template.route !== before.route && { isDefault: false }) } },
			{ new: true }
		).lean();
		return res.status(200).json(doc);
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not save the template');
	}
};

export const deleteTemplate = async (req: Request, res: Response) => {
	if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 404, 'Template not found');
	const doc: any = await PdfTemplate.findByIdAndDelete(req.params.id).lean();
	if (!doc) return fail(res, 404, 'Template not found');
	// The page keeps a default if it has another template.
	if (doc.isDefault && doc.route) {
		const next: any = await PdfTemplate.findOne({ route: doc.route }).sort({ updatedAt: -1 }).lean();
		if (next) await makeDefault(next);
	}
	return res.status(200).json({ deleted: true });
};

export const setDefault = async (req: Request, res: Response) => {
	const doc: any = mongoose.isValidObjectId(req.params.id) ? await PdfTemplate.findById(req.params.id).lean() : null;
	if (!doc) return fail(res, 404, 'Template not found');
	if (!doc.route) return fail(res, 400, 'Pick the page it prints first');
	await makeDefault(doc);
	return res.status(200).json({ ...doc, isDefault: true });
};

export const duplicateTemplate = async (req: any, res: Response) => {
	const doc: any = await findTemplate(String(req.params.id), { gallery: true }).catch(() => null);
	if (!doc) return fail(res, 404, 'Template not found');
	const { _id, createdAt, updatedAt, organization, project, key, builtIn, gallery, isDefault, ...rest } = doc;
	const copy = await PdfTemplate.create({ ...rest, name: `${doc.name} (copy)`.slice(0, 120), status: 'draft', isDefault: false, from: String(_id), createdBy: userId(req), updatedBy: userId(req) });
	return res.status(201).json(copy.toObject());
};

/* ---------------------------------------------------------- settings */

export const getSettings = async (_req: Request, res: Response) => res.status(200).json(await loadSettings());

export const saveSettings = async (req: any, res: Response) => {
	return res.status(200).json(await storeSettings(req.body || {}, userId(req)));
};

/* ----------------------------------------------------------- gallery */

export const listGallery = async (_req: Request, res: Response) => {
	try {
		const published = await withoutScope(() => PdfTemplate.find({ 'gallery.published': true }).sort({ 'gallery.order': 1, name: 1 }).lean());
		const templates = ((published as any[]).length ? published : STARTERS.map(starterDoc)).map((t: any) => ({ ...t, kind: categoryKey(t.kind) || 'other' }));
		// Starters shipped since the super admin last added them — offered on their gallery tab.
		let newStarters = 0;
		if (!currentScope() && (published as any[]).length) {
			const have = new Set(((await PdfTemplate.find({ key: { $in: STARTERS.map(x => x.key) } }).select('key').lean()) as any[]).map(d => d.key));
			newStarters = STARTERS.filter(x => !have.has(x.key)).length;
		}
		// The categories come along: the gallery is browsed by them (D21).
		return res.status(200).json({ templates, builtIn: !(published as any[]).length, newStarters, categories: await loadCategories() });
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not load the gallery');
	}
};

/** The super admin's "Add the built-in starters": each one not already there, published. */
export const addStarters = async (req: any, res: Response) => {
	if (currentScope()) return fail(res, 403, 'Only the super admin keeps the gallery');
	let added = 0;
	for (const [i, s] of STARTERS.entries()) {
		if (await PdfTemplate.exists({ key: s.key })) continue;
		const { template } = normalizeTemplate(s);
		await PdfTemplate.create({ ...template, key: s.key, gallery: { published: true, order: i }, createdBy: userId(req), updatedBy: userId(req) });
		added++;
	}
	return res.status(200).json({ added });
};

/* ----------------------------------------------------- fields, using */

export const getFields = async (req: any, res: Response) => {
	const tree = await fieldTree(req, String(req.params.route || '').replace(/^\/+|\/+$/g, ''));
	if (!tree) return fail(res, 404, 'Page not found');
	return res.status(200).json(tree);
};

const pageTitle = (tree: any) => String(tree?.title || tree?.route || '');

export const guess = async (req: any, res: Response) => {
	const from = await findTemplate(String(req.body?.from || ''), { gallery: true });
	if (!from) return fail(res, 404, 'Template not found');
	const tree = await fieldTree(req, String(req.body?.route || ''));
	if (!tree) return fail(res, 404, 'Page not found');
	return res.status(200).json({ mapping: guessMapping(from, tree), slots: from.slots || [], alias: from.alias, fields: tree });
};

/** A gallery template (or one of this scope's) copied onto a page, its slots matched to the page's fields. */
export const useTemplate = async (req: any, res: Response) => {
	try {
		const from = await findTemplate(String(req.body?.from || ''), { gallery: true });
		if (!from) return fail(res, 404, 'Template not found');
		const route = String(req.body?.route || '').replace(/^\/+|\/+$/g, '');
		const tree = await fieldTree(req, route);
		if (!tree) return fail(res, 404, 'Pick the page it prints');
		const mapping: Mapping = req.body?.mapping && typeof req.body.mapping === 'object' ? req.body.mapping : guessMapping(from, tree);
		const { template: base } = normalizeTemplate(from);
		const mapped = applyMapping(base, mapping, { route, title: pageTitle(tree) });
		const name = typeof req.body?.name === 'string' && req.body.name.trim() ? req.body.name.trim() : from.name;
		// The look picked when using it (D24): a palette and / or a font pairing.
		const pick = { look: req.body?.look, palette: req.body?.palette, pairing: req.body?.pairing };
		const looked = pick.look || pick.palette || pick.pairing ? applyLook(mapped as any, pick).template : mapped;
		const { template, errors } = normalizeTemplate({ ...looked, name });
		if (errors.length) return fail(res, 400, errors[0], { errors });
		const first = !(await PdfTemplate.exists({ route }));
		const doc = await PdfTemplate.create({ ...template, status: startStatus(req.body), from: String(from._id), isDefault: first, createdBy: userId(req), updatedBy: userId(req) });
		return res.status(201).json(doc.toObject());
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Could not use the template');
	}
};

/* ------------------------------------------------------------ render */

/** Sample business details when the scope has none yet, so a preview isn't blank. */
const businessFor = (settings: PdfSettingsData, sample: any) => (settings.business.name ? settings.business : { ...settings.business, ...(sample?.business || {}) });

/**
 * POST /render — a template (inline or by id) drawn with sample data: the
 * gallery's previews, the designer before the page has records. `data` is
 * used as the roots when given; otherwise the template's own sample.
 * `dummy: true` — Preview: every field the page has, filled (preview.ts);
 * with `as: 'data'` the roots as JSON for the designer's page (the business
 * details and saved texts left as they are).
 */
export const renderSample = async (req: any, res: Response) => {
	try {
		const raw = typeof req.body?.template === 'string' ? await findTemplate(req.body.template, { gallery: true }) : req.body?.template;
		if (!raw) return fail(res, 404, 'Template not found');
		const { template, errors } = normalizeTemplate({ name: 'Preview', ...raw });
		if (errors.length && !template.body.length) return fail(res, 400, errors[0], { errors });
		const settings = await loadSettings();
		const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : template.sample || raw.sample || {};
		const record = data[template.alias] ?? {};
		// Preview (PT-18): every field filled — from the page's fields, the sample over them.
		const roots =
			req.body?.dummy === true
				? await previewRoots(req, template, settings, data, { own: req.body?.as === 'data' })
				: { ...data, [template.alias]: record, record, business: businessFor(settings, data), texts: textsRoot(settings), today: new Date(), now: new Date(), template: { name: template.name } };
		// The designer draws the page itself: the preview's data, as JSON.
		if (req.body?.as === 'data') return res.status(200).json({ roots, settings, tz: zoneOf(settings, req.body?.tz) });
		const pdf = await renderPdf({ template, records: [{ roots }], settings, tz: zoneOf(settings, req.body?.tz) });
		sendPdf(res, pdf, `${template.name || 'preview'}.pdf`, req.query.inline === '1');
	} catch (e: any) {
		if (!res.headersSent) return fail(res, 500, e?.message || 'Could not make the PDF');
	}
};

/** A PDF response, named for the download. */
export const sendPdf = (res: Response, pdf: Buffer, name: string, inline = false) => {
	const safe = name.replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim() || 'document.pdf';
	const ascii = safe.replace(/[^\x20-\x7e]/g, '_');
	res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
	res.setHeader('Content-Type', 'application/pdf');
	res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`);
	res.setHeader('Content-Length', String(pdf.length));
	res.status(200).end(pdf);
};

export type { PdfTemplateData };
