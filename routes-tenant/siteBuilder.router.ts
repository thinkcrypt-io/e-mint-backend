import express from 'express';
import SitePage from '../library/models/siteBuilder/sitePage.model.js';
import SiteDesign from '../library/models/siteBuilder/siteDesign.model.js';
import SiteRelease from '../library/models/siteBuilder/siteRelease.model.js';
import { TenancyError, handle, isId, slugify } from '../library/functions/tenancy.function.js';
import { grants } from '../library/functions/tenantPermissions.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';
import { publicManifest, manifestVersion } from '../library/siteBuilder/manifest.js';
import { rekeyTree } from '../library/siteBuilder/ids.js';
import { treeIds, validateDesign, validatePageFields, validateTree, type Problem } from '../library/siteBuilder/validate.js';
import { designView, ensureSite, livePages, pageSummary, pageView, sectionUsage, siteChanges, siteInfo, EMPTY_SEO } from '../library/siteBuilder/site.js';
import { publishSite, restoreRelease, siteUrl } from '../library/siteBuilder/publish.js';

/**
 * /tenant/api/p/:projectId/site-builder — the site builder (docs/site-builder
 * SB-03). Website projects only. Reading needs to see records or build;
 * every change needs `build`. Drafts autosave with a `rev`: a save with an
 * old one answers 409 { rev, page } (someone else changed it).
 *
 *   GET    /manifest                  blocks, presets, themes, schemas (ETag = version)
 *   GET    /pages                     the pages (summary) and the live site's address
 *   POST   /pages                     { name, path, kind?, source?, layout?, tree?, seo?, showInMenu?, menuLabel?, priority? }
 *   GET    /pages/:id                 one page with its draft (and what's live)
 *   PUT    /pages/:id                 { rev, tree?, seo?, name?, path?, layout?, showInMenu?, menuLabel?, priority?, source?, status?: 'draft' }
 *   DELETE /pages/:id                 (not the home page) — off the live site at the next Publish
 *   POST   /pages/:id/duplicate       { name, path }
 *   POST   /pages/:id/home            make it the home page (its path becomes /)
 *   POST   /pages/:id/unpublish       off the live site now; Publish skips it until PUT { status: 'draft' }
 *   GET    /design                    the draft design (+ what's live)
 *   PUT    /design                    { rev, theme?, tokens?, colorScheme?, layouts?, sections? }
 *   POST   /validate                  { tree } | { design } → { ok, problems }   (the editor's live check)
 *   GET    /changes                   what Publish would change, and the problems that stop it
 *   POST   /publish                   { note? } → { version, publishedAt, url, revalidated }
 *   GET    /releases                  [{ version, note, publishedBy, publishedAt, pages, restoredFrom }]
 *   POST   /releases/:version/restore → that release live again (and the drafts), as a new version
 */
const router = express.Router({ mergeParams: true });

router.use((req: any, res: any, next: any) => {
	if (req.project?.type !== 'website') return res.status(404).json({ message: 'Only website projects have a site builder' });
	if (!grants(req.permissions, ['build', 'records:view'])) return res.status(403).json({ message: 'Forbidden: your role in this organization doesn’t allow this' });
	next();
});

const mayBuild = (req: any) => {
	if (!grants(req.permissions, ['build'])) throw new TenancyError(403, 'Your role can’t change the site (it needs Build)');
};

/** 400 with the problems listed (the editor shows each one on its block). */
const refuse = (message: string, problems: Problem[]) => Object.assign(new TenancyError(400, message), { extra: { problems } });

const pageOf = async (id: string) => {
	const page: any = isId(id) ? await SitePage.findOne({ _id: id, deletedAt: null }).lean() : null;
	if (!page) throw new TenancyError(404, 'No such page');
	return page;
};

const layoutKeys = async () => {
	const d: any = await SiteDesign.findOne({}, { 'draft.layouts': 1 }).lean();
	return Object.keys(d?.draft?.layouts || {});
};

const pathTaken = async (path: string, except?: any) => !!(await SitePage.exists({ path, deletedAt: null, ...(except && { _id: { $ne: except } }) }));

/** A tree for a page: errors refuse the save; publish-only problems are saved and listed. */
const checkTree = async (tree: unknown, page: { layout?: string }) => {
	const design: any = await SiteDesign.findOne({}, { 'draft.layouts': 1, 'draft.sections': 1 }).lean();
	const layout = page.layout === 'none' ? null : design?.draft?.layouts?.[page.layout || 'default'];
	const pages = await SitePage.find({ deletedAt: null }, { _id: 1 }).lean();
	const r = validateTree(tree, {
		externalIds: layout ? treeIds(layout.header, treeIds(layout.footer)) : undefined,
		pageIds: new Set(pages.map((p: any) => String(p._id))),
		sectionIds: new Set(Object.keys(design?.draft?.sections || {})),
	});
	const errors = r.problems.filter(p => p.level === 'error');
	if (errors.length) throw refuse('The page has problems — nothing was saved.', errors);
	return r.problems;
};

const PAGE_FIELDS = ['name', 'path', 'kind', 'source', 'layout', 'showInMenu', 'menuLabel', 'priority'] as const;

const pageFields = (body: any) => Object.fromEntries(PAGE_FIELDS.filter(k => body[k] !== undefined).map(k => [k, typeof body[k] === 'string' ? body[k].trim() : body[k]]));

const checkFields = async (fields: any, except?: any) => {
	const r = validatePageFields(fields, { layouts: await layoutKeys() });
	if (!r.ok) throw refuse(r.problems[0].message, r.problems);
	if (fields.path !== undefined && (await pathTaken(fields.path, except))) throw new TenancyError(409, `Another page is already at ${fields.path}`);
};

/* ------------------------------------------------------------ manifest */

router.get(
	'/manifest',
	handle(async (req: any, res: any) => {
		const etag = `"${manifestVersion()}"`;
		res.setHeader('ETag', etag);
		res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
		if (req.headers['if-none-match'] === etag) {
			res.status(304).end();
			return undefined;
		}
		return publicManifest();
	})
);

/* --------------------------------------------------------------- pages */

router.get(
	'/pages',
	handle(async (req: any) => {
		await ensureSite();
		return { pages: (await livePages()).map(pageSummary), url: siteUrl(req.project), site: await siteInfo(req.project) };
	})
);

router.post(
	'/pages',
	handle(async (req: any, res: any) => {
		mayBuild(req);
		await ensureSite();
		const body = req.body || {};
		const fields: any = { kind: 'static', ...pageFields(body) };
		if (!fields.name) throw new TenancyError(400, 'A page needs a name');
		if (!fields.path) fields.path = `/${slugify(fields.name) || 'page'}`;
		await checkFields({ ...fields, seo: body.seo });
		const tree = body.tree ?? [];
		await checkTree(tree, fields);
		const page = await SitePage.create({
			...fields,
			isHome: false,
			draft: { tree, seo: { ...EMPTY_SEO, ...(body.seo || {}) }, rev: 1, updatedAt: new Date(), updatedBy: req.user?._id },
		});
		recordProjectEvent({ req, action: 'create', model: 'Site page', modelPath: 'site-builder', document: page._id, name: page.name, text: `added the page “${page.name}” (${page.path})` });
		res.status(201);
		return pageView(page.toObject());
	})
);

router.get(
	'/pages/:id',
	handle(async (req: any) => pageView(await pageOf(req.params.id)))
);

router.put(
	'/pages/:id',
	handle(async (req: any) => {
		mayBuild(req);
		const body = req.body || {};
		const page = await pageOf(req.params.id);
		if (!Number.isInteger(body.rev)) throw new TenancyError(400, 'Send the page’s rev with every save');
		if (body.rev !== page.draft?.rev) throw Object.assign(new TenancyError(409, 'Someone else changed this page.'), { extra: { rev: page.draft?.rev, page: pageView(page) } });

		const fields: any = pageFields(body);
		if (page.isHome && fields.path !== undefined && fields.path !== '/') throw new TenancyError(400, 'The home page stays at / — make another page the home page first');
		if (page.isHome && fields.kind === 'template') throw new TenancyError(400, 'The home page can’t be a template page');
		await checkFields({ kind: page.kind, ...fields, seo: body.seo }, page._id);
		const $set: any = { ...fields, 'draft.updatedAt': new Date(), 'draft.updatedBy': req.user?._id };
		let problems: Problem[] = [];
		if (body.tree !== undefined) {
			problems = await checkTree(body.tree, { layout: fields.layout ?? page.layout });
			$set['draft.tree'] = body.tree;
		}
		if (body.seo !== undefined) $set['draft.seo'] = { ...EMPTY_SEO, ...body.seo };
		if (body.status !== undefined) {
			if (body.status !== 'draft' || page.status !== 'unpublished') throw new TenancyError(400, 'Only a page taken off the site can go back to draft (status: draft)');
			$set.status = 'draft';
		}
		const saved: any = await SitePage.findOneAndUpdate({ _id: page._id, 'draft.rev': body.rev }, { $set, $inc: { 'draft.rev': 1 } }, { new: true }).lean();
		if (!saved) {
			const now = await pageOf(req.params.id);
			throw Object.assign(new TenancyError(409, 'Someone else changed this page.'), { extra: { rev: now.draft?.rev, page: pageView(now) } });
		}
		return { ...pageView(saved), problems };
	})
);

router.delete(
	'/pages/:id',
	handle(async (req: any) => {
		mayBuild(req);
		const page = await pageOf(req.params.id);
		if (page.isHome) throw new TenancyError(400, 'The home page can’t be deleted — make another page the home page first');
		await SitePage.updateOne({ _id: page._id }, { $set: { deletedAt: new Date() } });
		recordProjectEvent({ req, action: 'delete', model: 'Site page', modelPath: 'site-builder', document: page._id, name: page.name, text: `deleted the page “${page.name}” (${page.path})` });
		return { deleted: true, live: !!page.published };
	})
);

router.post(
	'/pages/:id/duplicate',
	handle(async (req: any, res: any) => {
		mayBuild(req);
		const page = await pageOf(req.params.id);
		const name = String(req.body?.name || `${page.name} copy`).trim();
		let path = String(req.body?.path || '').trim();
		if (!path) {
			const base = page.path === '/' ? `/${slugify(name) || 'page'}` : `${page.path}-copy`;
			path = base;
			for (let i = 2; await pathTaken(path); i++) path = `${base}-${i}`;
		}
		const fields = { name, path, kind: page.kind, source: page.source, layout: page.layout, showInMenu: false, menuLabel: '', priority: page.priority };
		await checkFields(fields);
		const copy = await SitePage.create({
			...fields,
			isHome: false,
			draft: { tree: rekeyTree(page.draft?.tree || []), seo: { ...EMPTY_SEO, ...(page.draft?.seo || {}) }, rev: 1, updatedAt: new Date(), updatedBy: req.user?._id },
		});
		recordProjectEvent({ req, action: 'create', model: 'Site page', modelPath: 'site-builder', document: copy._id, name: copy.name, text: `duplicated “${page.name}” as “${copy.name}” (${copy.path})` });
		res.status(201);
		return pageView(copy.toObject());
	})
);

router.post(
	'/pages/:id/home',
	handle(async (req: any) => {
		mayBuild(req);
		const page = await pageOf(req.params.id);
		if (page.isHome) return pageView(page);
		if (page.kind === 'template') throw new TenancyError(400, 'A template page can’t be the home page');
		const home: any = await SitePage.findOne({ isHome: true, deletedAt: null }).lean();
		if (home) {
			let path = `/${slugify(home.name) || 'home'}`;
			if (path === '/') path = '/home';
			const base = path;
			for (let i = 2; await pathTaken(path, home._id); i++) path = `${base}-${i}`;
			await SitePage.updateOne({ _id: home._id }, { $set: { isHome: false, path }, $inc: { 'draft.rev': 1 } });
		}
		const saved: any = await SitePage.findOneAndUpdate({ _id: page._id }, { $set: { isHome: true, path: '/' }, $inc: { 'draft.rev': 1 } }, { new: true }).lean();
		recordProjectEvent({ req, model: 'Site page', modelPath: 'site-builder', document: page._id, name: page.name, text: `made “${page.name}” the home page` });
		return pageView(saved);
	})
);

router.post(
	'/pages/:id/unpublish',
	handle(async (req: any) => {
		mayBuild(req);
		const page = await pageOf(req.params.id);
		if (page.isHome) throw new TenancyError(400, 'The home page can’t be taken off the site');
		const saved: any = await SitePage.findOneAndUpdate({ _id: page._id }, { $set: { status: 'unpublished', published: null } }, { new: true }).lean();
		recordProjectEvent({ req, model: 'Site page', modelPath: 'site-builder', document: page._id, name: page.name, text: `took the page “${page.name}” off the site` });
		return pageView(saved);
	})
);

/* -------------------------------------------------------------- design */

/** The design for the editor, with where each saved section is used. */
const designWithUsage = async (design: any) => ({ ...designView(design), usage: sectionUsage(design, await livePages()) });

router.get(
	'/design',
	handle(async () => {
		await ensureSite();
		return designWithUsage(await SiteDesign.findOne({}).lean());
	})
);

const DESIGN_KEYS = ['theme', 'tokens', 'colorScheme', 'layouts', 'sections'];

router.put(
	'/design',
	handle(async (req: any) => {
		mayBuild(req);
		await ensureSite();
		const body = req.body || {};
		const design: any = await SiteDesign.findOne({}).lean();
		if (!Number.isInteger(body.rev)) throw new TenancyError(400, 'Send the design’s rev with every save');
		if (body.rev !== design.draft?.rev) throw Object.assign(new TenancyError(409, 'Someone else changed the design.'), { extra: { rev: design.draft?.rev, design: designView(design) } });
		const patch = Object.fromEntries(DESIGN_KEYS.filter(k => body[k] !== undefined).map(k => [k, body[k]]));
		if (!Object.keys(patch).length) throw new TenancyError(400, 'Nothing to change');
		const pages = await SitePage.find({ deletedAt: null }, { _id: 1 }).lean();
		const r = validateDesign(patch, { pageIds: new Set(pages.map((p: any) => String(p._id))), sectionIds: new Set(Object.keys(design.draft?.sections || {})) });
		const errors = r.problems.filter(p => p.level === 'error');
		if (errors.length) throw refuse('The design has problems — nothing was saved.', errors);
		const $set = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`draft.${k}`, v]));
		const saved: any = await SiteDesign.findOneAndUpdate({ _id: design._id, 'draft.rev': body.rev }, { $set, $inc: { 'draft.rev': 1 } }, { new: true }).lean();
		if (!saved) {
			const now: any = await SiteDesign.findOne({}).lean();
			throw Object.assign(new TenancyError(409, 'Someone else changed the design.'), { extra: { rev: now.draft?.rev, design: designView(now) } });
		}
		return { ...(await designWithUsage(saved)), problems: r.problems };
	})
);

/* ------------------------------------------------------ check, publish */

router.post(
	'/validate',
	handle(async (req: any) => {
		const body = req.body || {};
		const pages = await SitePage.find({ deletedAt: null }, { _id: 1 }).lean();
		const pageIds = new Set(pages.map((p: any) => String(p._id)));
		const d: any = await SiteDesign.findOne({}, { 'draft.sections': 1 }).lean();
		const sectionIds = new Set(Object.keys(d?.draft?.sections || {}));
		if (body.design !== undefined) return validateDesign(body.design || {}, { pageIds, sectionIds });
		if (body.tree !== undefined) {
			const externalIds = Array.isArray(body.externalIds) ? new Set<string>(body.externalIds.filter((x: any) => typeof x === 'string').slice(0, 5000)) : undefined;
			return validateTree(body.tree, { pageIds, externalIds, sectionIds });
		}
		throw new TenancyError(400, 'Send { tree } or { design }');
	})
);

router.get(
	'/changes',
	handle(async (req: any) => {
		await ensureSite();
		return { ...(await siteChanges()), url: siteUrl(req.project) };
	})
);

router.post(
	'/publish',
	handle(async (req: any) => {
		mayBuild(req);
		await ensureSite();
		return publishSite({ req, project: req.project, note: typeof req.body?.note === 'string' ? req.body.note.trim() : '' });
	})
);

router.get(
	'/releases',
	handle(async () => {
		const list: any[] = await SiteRelease.find({}, { version: 1, note: 1, publishedBy: 1, publishedByName: 1, publishedAt: 1, restoredFrom: 1, 'pages.page': 1 })
			.sort({ version: -1 })
			.lean();
		return {
			releases: list.map(r => ({
				version: r.version,
				note: r.note,
				publishedBy: r.publishedBy ? { id: String(r.publishedBy), name: r.publishedByName || '' } : null,
				publishedAt: r.publishedAt,
				restoredFrom: r.restoredFrom ?? null,
				pages: (r.pages || []).length,
			})),
		};
	})
);

router.post(
	'/releases/:version/restore',
	handle(async (req: any) => {
		mayBuild(req);
		const version = Number(req.params.version);
		if (!Number.isInteger(version) || version < 1) throw new TenancyError(400, 'Name a version number');
		return restoreRelease({ req, project: req.project, version });
	})
);

export default router;
