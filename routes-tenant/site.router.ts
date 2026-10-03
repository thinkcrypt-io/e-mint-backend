import express from 'express';
import Joi from 'joi';
import TenantProject from '../library/models/tenancy/tenantProject.model.js';
import WebsiteSettings from '../library/models/tenancy/websiteSettings.model.js';
import ModelDefinition from '../library/models/builder/modelDefinition.model.js';
import { compiledModel, syncDynamicModels } from '../library/functions/dynamicModels.function.js';
import { TenancyError, handle } from '../library/functions/tenancy.function.js';
import { grants } from '../library/functions/tenantPermissions.function.js';
import { forgetSite, loadSite, panelView, saveSite, setupChecklist, siteOrigin } from '../library/functions/siteConfig.function.js';
import { checkSite } from '../library/functions/siteCheck.function.js';
import { recordProjectEvent } from '../library/functions/recordHistory.function.js';
import { runInScope } from '../library/functions/tenantScope.function.js';

/**
 * /tenant/api/p/:projectId — a website project's settings (docs/multi-tenancy
 * WO-34, WO-38): the project's WebsiteSettings.
 *
 *   GET  /site-config         identity, contact, socials, SEO & indexing, tracking, server-side
 *                             (whether each key is set — never the key), code tags, redirects,
 *                             headers, domains, the last check; `legacy`: the old Site settings
 *                             model, while the project still has it
 *   PUT  /site-config         any of those sections (each replaces only the keys it names; lists
 *                             whole; `secrets` write-only)                                    build
 *                             `domains` needs manage-projects
 *   POST /site-config/check   fetches the live site and checks each tag is on it; checks the
 *                             IDs and keys with Google and Meta where they allow it            build
 *   GET  /site-overview       the website's state for its home: settings, pages, checklist
 *
 * Reading needs to open the project; website projects only.
 */
const router = express.Router();

const websiteOnly = (req: any) => {
	if (req.project.type !== 'website') throw new TenancyError(404, 'Only website projects have a site setup');
};
const mayBuild = (req: any) => {
	if (!grants(req.permissions, ['build'])) throw new TenancyError(403, 'Your role can’t change the site setup (it needs Build)');
};

const DOMAIN = Joi.string()
	.trim()
	.lowercase()
	.max(253)
	.pattern(/^(localhost(:\d+)?|([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?)$/)
	.messages({ 'string.pattern.base': 'A domain looks like example.com' });

const SECTION: Record<string, string> = {
	identity: 'branding',
	contact: 'contact',
	social: 'socials',
	seo: 'SEO & indexing',
	tracking: 'tracking',
	serverSide: 'server-side tracking',
	secrets: 'server-side keys',
	headTags: 'code',
	code: 'code',
	redirects: 'redirects',
	headers: 'headers',
};

/** Websites made before WO-38 have the kit's Site settings model; once copied here the panel offers to remove it. */
const legacyTable = async () => {
	const def: any = await ModelDefinition.findOne({ route: 'site-settings' }, { title: 1 }).lean();
	return def ? { _id: String(def._id), title: def.title || 'Site settings' } : null;
};

router.get(
	'/site-config',
	handle(async req => {
		websiteOnly(req);
		const [doc, legacy] = await Promise.all([loadSite(req.project, { req, secrets: true }), legacyTable()]);
		return { ...panelView(req.project, doc), legacy };
	})
);

router.put(
	'/site-config',
	handle(async req => {
		websiteOnly(req);
		mayBuild(req);
		const { domains, ...patch } = req.body || {};
		let project = req.project;
		if (domains !== undefined) {
			if (!grants(req.permissions, ['manage-projects'])) throw new TenancyError(403, 'Changing the domains needs Manage projects');
			const { value, error } = Joi.array().items(DOMAIN).max(20).unique().validate(domains);
			if (error) throw new TenancyError(400, error.details[0].message.replace(/"/g, ''));
			// Checked before the settings are saved, saved after — so a bad settings change saves nothing.
			project = { ...project, domains: value };
		}
		const hasPatch = Object.keys(patch).length > 0;
		if (!hasPatch && domains === undefined) throw new TenancyError(400, 'Nothing to change');
		if (hasPatch) {
			try {
				await saveSite(project, patch, { req });
			} catch (e: any) {
				throw new TenancyError(e.status || 500, e.message);
			}
		}
		if (domains !== undefined) {
			await TenantProject.updateOne({ _id: req.project._id }, { $set: { domains: project.domains } });
			forgetSite(project);
		}
		const what = [...new Set([...Object.keys(patch).map(k => SECTION[k]).filter(Boolean), ...(domains !== undefined ? ['domains'] : [])])];
		recordProjectEvent({ req, model: 'Site setup', modelPath: 'site-setup', document: req.project._id, name: 'Site setup', text: `changed the site setup (${what.join(', ')})` });
		return { ...panelView(project, await loadSite(project, { req, secrets: true })), legacy: await legacyTable() };
	})
);

router.post(
	'/site-config/check',
	handle(async req => {
		websiteOnly(req);
		mayBuild(req);
		const doc = await loadSite(req.project, { req, secrets: true });
		const check = await checkSite(req.project, doc);
		await runInScope({ organization: req.project.organization, project: req.project._id }, () => WebsiteSettings.updateOne({}, { $set: { check } }));
		return check;
	})
);

/** A website kit model in this project (the builder may have renamed or removed it). */
const kit = async (route: string) => {
	const def: any = await ModelDefinition.findOne({ route }, { name: 1, route: 1 }).lean();
	return def ? compiledModel(def.name) : null;
};

router.get(
	'/site-overview',
	handle(async req => {
		websiteOnly(req);
		await syncDynamicModels({ app: req.app });
		const [doc, Pages, Seo, Contents] = await Promise.all([loadSite(req.project, { req }), kit('pages'), kit('seo'), kit('web-contents')]);
		const pages: any[] = Pages ? await Pages.find({}, { name: 1, path: 1, status: 1, showInMenu: 1, updatedAt: 1 }).sort({ priority: -1, path: 1 }).limit(100).lean() : [];
		const ids = pages.map(p => p._id);
		const [seoPages, blocks]: any = await Promise.all([
			Seo ? Seo.distinct('page', { page: { $in: ids } }) : [],
			Contents ? Contents.aggregate([{ $match: { page: { $in: ids }, status: { $ne: 'archived' } } }, { $group: { _id: '$page', n: { $sum: 1 } } }]) : [],
		]);
		const withSeo = new Set(seoPages.map(String));
		const blockCount = new Map<string, number>(blocks.map((b: any) => [String(b._id), b.n]));
		const published = pages.filter(p => p.status === 'published');
		const counts = { total: pages.length, published: published.length, withSeo: published.filter(p => withSeo.has(String(p._id))).length };
		const i = doc.identity || {};
		return {
			settings: {
				_id: String(doc._id),
				siteName: i.siteName || '',
				logo: i.logo || '',
				favicon: i.favicon || '',
				metaTitle: doc.seo?.metaTitle || '',
				metaDescription: doc.seo?.metaDescription || '',
			},
			pages: pages.map(p => ({
				_id: String(p._id),
				name: p.name,
				path: p.path,
				status: p.status,
				seo: withSeo.has(String(p._id)),
				contents: blockCount.get(String(p._id)) || 0,
				updatedAt: p.updatedAt,
			})),
			counts,
			checklist: setupChecklist(req.project, doc, counts),
			domains: req.project.domains || [],
			origin: siteOrigin(req.project, doc),
			kit: { settings: true, pages: !!Pages, seo: !!Seo, contents: !!Contents },
		};
	})
);

export default router;
