import { Feature, ModelDefinition } from '../models/builder/_index.js';
import DashboardConfig from '../models/builder/dashboardConfig.model.js';
import SidebarCategory from '../models/sidebarcategories/model.js';
import SidebarItem from '../models/sidebaritems/model.js';
import OrganizationRole from '../models/tenancy/organizationRole.model.js';
import TenantProject from '../models/tenancy/tenantProject.model.js';
import { ProjectTemplate } from '../models/templates/_index.js';
import { BuildError, deleteModelCore } from '../controllers/builder/models.controller.js';
import { TEMPLATE_MAX_STEPS, buildFeature } from '../controllers/builder/features.service.js';
import { planFromAi } from '../controllers/builder/features.schema.js';
import { normalizeWidget } from '../controllers/dashboard/dashboard.controller.js';
import { apiOrigin, createRecords, setPublicApi, upsertPage } from '../controllers/mcp/website.tools.js';
import type { Caller } from '../controllers/mcp/mcp.router.js';
import { fillPlaceholders, stepIdentity } from '../controllers/templates/blueprint.js';
import { validateTemplate } from '../controllers/templates/validate.js';
import { loadSite, saveSite } from './siteConfig.function.js';
import { normalizePermissions } from './tenantPermissions.function.js';
import { scopedModel } from './routeRegistry.function.js';
import { syncDynamicModels } from './dynamicModels.function.js';
import { recordProjectEvent } from './recordHistory.function.js';
import { runInScope } from './tenantScope.function.js';

/**
 * Builds a template into a project (docs/templates TD7) — the one engine
 * behind previews (T-04) and, later, a tenant's new project (T-14), so a
 * preview is exactly what a tenant gets.
 *
 * In the project's scope, in order: placeholders filled and the result checked
 * again → sidebar categories → models (one feature plan, `TEMPLATE_MAX_STEPS`)
 * → sidebar order and labels → dashboard → organization roles → public API →
 * website settings and pages → sample data → the project remembers the
 * template and gets its setup checklist.
 *
 * All or nothing: every step registers how to take itself back; a failure
 * runs those newest first and throws `{ step, message }` as a BuildError.
 */

export type ApplyOptions = {
	project: any;
	template: any;
	/** Default: the published version; a preview may use 'draft'. */
	from?: 'published' | 'draft';
	answers?: Record<string, any>;
	sampleData?: boolean;
	/** A sandbox preview: counted as a preview, not a use. */
	preview?: boolean;
};

export type ApplyResult = {
	template: { key: string; version: number | null; from: 'published' | 'draft' };
	models: { name: string; title: string; route: string }[];
	categories: string[];
	widgets: number;
	roles: { created: string[]; skipped: string[] };
	endpoints: string[];
	pages: string[];
	records: Record<string, number>;
	warnings: string[];
};

const lower = (s: any) => String(s || '').toLowerCase();

/** The panel's own identity for the writes the website tools make (the applying user, every permission). */
const callerFor = (req: any, project: any): Caller => ({
	user: req.user || { _id: null, name: 'Template' },
	permissions: ['*'],
	key: null,
	page: route => `/${project.publicSlug}/${route}`,
	link: path => path,
	allows: () => true,
	builder: () => true,
	project,
});

/** Models in the order their links need: a sample record's links resolve by name, so targets go first. */
const linkOrder = (names: string[], refsOf: (name: string) => string[]) => {
	const out: string[] = [];
	const seen = new Set<string>();
	const visit = (n: string, path: Set<string>) => {
		if (seen.has(n) || path.has(n)) return;
		path.add(n);
		for (const r of refsOf(n)) if (names.includes(r)) visit(r, path);
		path.delete(n);
		seen.add(n);
		out.push(n);
	};
	names.forEach(n => visit(n, new Set()));
	return out;
};

/** A step's failure; the catch below names the step. */
const fail = (_step: string, message: string, problems?: string[]) => new BuildError(400, message, problems);

export const applyTemplate = async (req: any, opts: ApplyOptions): Promise<ApplyResult> => {
	const { project, template } = opts;
	const from = opts.from || 'published';
	const source = from === 'draft' ? template.draft : template.published;
	if (!source) throw new BuildError(400, 'This template has no published version yet — publish it, or preview the draft.');
	if (template.type !== project.type)
		throw new BuildError(400, `A ${template.type} template goes into a ${template.type} project; this project is ${project.type === 'app' ? 'an' : 'a'} ${project.type}.`);

	/* 1. Answers, placeholders, and the result checked again. */
	const answers = opts.answers || {};
	const missing = (source.questions || []).filter((q: any) => q.required && !String(answers[q.key] ?? '').trim() && !q.default);
	if (missing.length) throw new BuildError(400, 'Answer the template’s questions first', missing.map((q: any) => `${q.label || q.key} is required`));
	const builtins = { project: project.name, slug: project.publicSlug, api: `${safeOrigin(req)}/public/api/${project.publicSlug}` };
	const { blueprint: bp, unknown } = fillPlaceholders(source, answers, builtins);
	if (unknown.length) throw new BuildError(400, `The template uses placeholders nobody answers: ${unknown.map(k => `{{${k}}}`).join(', ')}`);
	const check = await validateTemplate(req, template.type, bp);
	if (!check.ok) throw new BuildError(400, 'The template has problems, so nothing was built', check.errors.map(e => `${e.message} ${e.fix}`));

	const scope = { organization: project.organization, project: project._id };
	const undo: { step: string; run: () => Promise<any> }[] = [];
	const result: ApplyResult = {
		template: { key: template.key, version: from === 'published' ? template.version : null, from },
		models: [],
		categories: [],
		widgets: 0,
		roles: { created: [], skipped: [] },
		endpoints: [],
		pages: [],
		records: {},
		warnings: [],
	};
	let step = 'Starting';

	try {
		await runInScope(scope, async () => {
			const steps: any[] = (bp.models?.steps || []).filter((s: any) => s.action !== 'update');
			const ids = steps.map(stepIdentity);
			const stepOf = (q: string) => {
				const k = lower(q);
				return ids.findIndex(i => lower(i.name) === k || lower(i.route) === k || lower(i.title) === k);
			};

			/* 2. Sidebar categories: the template's, then the project's first section for the rest. */
			step = 'Sidebar';
			const categoryOfStep = new Map<number, string>();
			const top: any = await SidebarCategory.findOne({}, { priority: 1 }).sort({ priority: 1 }).lean();
			let priority = Math.max(0, (top?.priority ?? 100) - 10 * ((bp.sidebar || []).length + 1));
			for (const c of bp.sidebar || []) {
				priority += 10;
				const cat: any = await SidebarCategory.create({ name: c.name, description: c.description, icon: c.icon || 'blocks', priority, isActive: true });
				undo.push({ step: 'Sidebar', run: () => SidebarCategory.deleteOne({ _id: cat._id }) });
				result.categories.push(c.name);
				for (const it of c.items) {
					const i = stepOf(it.model);
					if (i >= 0 && !categoryOfStep.has(i)) categoryOfStep.set(i, String(cat._id));
				}
			}
			let fallback: string | null = top ? String(top._id) : null;
			if (!fallback && steps.length) {
				const cat: any = await SidebarCategory.create({ name: bp.overview?.name || 'Pages', icon: bp.overview?.icon || 'blocks', priority: 100, isActive: true });
				undo.push({ step: 'Sidebar', run: () => SidebarCategory.deleteOne({ _id: cat._id }) });
				fallback = String(cat._id);
			}

			/* 3. Models: one feature plan, all or nothing on its own. */
			step = 'Models';
			let routeOf = (q: string) => q;
			if (steps.length) {
				const plan = planFromAi({
					title: bp.overview?.name || template.name,
					summary: bp.overview?.summary || bp.overview?.name || template.name,
					sidebarCategory: fallback || undefined,
					steps: steps.map((s, i) => ({ ...s, ...(categoryOfStep.has(i) && { sidebarCategory: categoryOfStep.get(i) }) })),
				});
				const built = await buildFeature(req, plan, { source: 'template', maxSteps: TEMPLATE_MAX_STEPS });
				undo.push({
					step: 'Models',
					run: async () => {
						for (const m of [...built.created].reverse()) await deleteModelCore(req, m.id, { dropData: true, ignoreLinks: true }).catch(() => undefined);
						if (built.feature?._id) await Feature.deleteOne({ _id: built.feature._id });
					},
				});
				result.models = built.created.map(({ name, title, route }) => ({ name, title, route }));
				result.warnings.push(...built.warnings);
			}
			// A model named by the blueprint (its name, title or route) → its route as built; kit models by route.
			const builtByStep = (i: number) => result.models.find(m => m.name === ids[i]?.name) || result.models[i];
			routeOf = (q: string) => {
				const i = stepOf(q);
				if (i >= 0) return builtByStep(i)?.route || ids[i].route;
				return lower(q);
			};

			/* 4. Sidebar order and labels, as the template lists them. */
			for (const c of bp.sidebar || [])
				for (const [j, it] of c.items.entries()) {
					const i = stepOf(it.model);
					const m = i >= 0 ? builtByStep(i) : null;
					if (m) await SidebarItem.updateOne({ href: m.route }, { $set: { priority: (j + 1) * 10, ...(it.label && { name: it.label }) } });
				}

			/* 5. Dashboard. */
			step = 'Dashboard';
			if ((bp.dashboard || []).length) {
				const dash: any = await DashboardConfig.findOne({ key: 'default' });
				const before = dash ? [...(dash.widgets || [])] : null;
				const widgets: any[] = [];
				for (const [i, w] of bp.dashboard.entries()) {
					const { widget, error } = normalizeWidget({ ...w, route: routeOf(w.route || w.model) }, i);
					if (error) throw fail('Dashboard', error);
					widgets.push(widget);
				}
				if (dash) {
					dash.widgets = [...(dash.widgets || []), ...widgets];
					dash.markModified('widgets');
					await dash.save();
					undo.push({ step: 'Dashboard', run: () => DashboardConfig.updateOne({ _id: dash._id }, { $set: { widgets: before } }) });
				} else {
					const created: any = await DashboardConfig.create({ key: 'default', widgets });
					undo.push({ step: 'Dashboard', run: () => DashboardConfig.deleteOne({ _id: created._id }) });
				}
				result.widgets = widgets.length;
			}

			/* 6. Organization roles: only names the organization doesn't have yet. */
			step = 'Roles';
			for (const r of bp.roles || []) {
				const exists = await OrganizationRole.exists({ organization: project.organization, name: new RegExp(`^${r.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
				if (exists) {
					result.roles.skipped.push(r.name);
					continue;
				}
				const role: any = await OrganizationRole.create({ organization: project.organization, name: r.name, description: r.description, permissions: normalizePermissions(r.permissions) });
				undo.push({ step: 'Roles', run: () => OrganizationRole.deleteOne({ _id: role._id }) });
				result.roles.created.push(r.name);
			}
			if (result.roles.skipped.length) result.warnings.push(`Roles already in the organization, left as they are: ${result.roles.skipped.join(', ')}`);

			/* 7. Public API. */
			step = 'Public API';
			for (const e of bp.endpoints || []) {
				const route = routeOf(e.model);
				const def: any = await ModelDefinition.findOne({ route }, { publicApi: 1 }).lean();
				const before = def?.publicApi ?? null;
				const r = await setPublicApi(req, route, { actions: e.actions, auth: e.auth, ownerOnly: e.ownerOnly });
				if (r.error) throw fail('Public API', r.error);
				undo.push({ step: 'Public API', run: () => ModelDefinition.updateOne({ route }, { $set: { publicApi: before } }) });
				result.endpoints.push(route);
			}
			if ((bp.webhooks || []).length) result.warnings.push('Webhooks come with API projects (T-09) — not set up yet.');

			/* 8. Website: settings, then pages (parents first). */
			if (template.type === 'website') {
				step = 'Website settings';
				const s = bp.website?.settings || {};
				const patch = Object.fromEntries(
					['identity', 'contact', 'social', 'seo'].map(k => [k, s[k]]).filter(([, v]) => v && Object.values(v).some((x: any) => (Array.isArray(x) ? x.length : x)))
				);
				if (Object.keys(patch).length) {
					const current: any = await loadSite(project, { req });
					const before = Object.fromEntries(Object.keys(patch).map(k => [k, JSON.parse(JSON.stringify(current?.[k] || {}))]));
					try {
						await saveSite(project, patch, { req });
					} catch (e: any) {
						throw fail('Website settings', e.message);
					}
					undo.push({ step: 'Website settings', run: () => saveSite(project, before, { req }) });
				}

				step = 'Pages';
				const caller = callerFor(req, project);
				const pending = [...(bp.website?.pages || [])];
				const done = new Set<string>();
				while (pending.length) {
					const i = pending.findIndex(p => !p.parent || done.has(p.parent));
					if (i < 0) throw fail('Pages', `these pages wait for parents that never come: ${pending.map(p => p.path).join(', ')}`);
					const [p] = pending.splice(i, 1);
					// SEO only when there is some: the kit's SEO record needs a title and a description.
					const seo = p.seo?.title || p.seo?.description ? p.seo : undefined;
					const out = await upsertPage(req, { ...p, seo, parent: p.parent || undefined, contents: p.contents }, caller);
					if (out.isError) throw fail('Pages', `${p.path} — ${out.text}`);
					const pageId = out.data?.page?._id;
					undo.push({
						step: 'Pages',
						run: async () => {
							for (const name of ['WebContent', 'PageSeo']) await scopedModel(name)?.deleteMany({ page: pageId });
							await scopedModel('WebPage')?.deleteOne({ _id: pageId });
						},
					});
					done.add(p.path);
					result.pages.push(p.path);
				}
			}

			/* 9. Sample data, linked models first. */
			step = 'Sample data';
			if (opts.sampleData !== false) {
				const sample = bp.sampleData || {};
				const keys = Object.keys(sample).filter(k => sample[k]?.length);
				const refsOf = (k: string) => {
					const i = stepOf(k);
					return i < 0 ? [] : (steps[i].fields || []).filter((f: any) => f?.ref).map((f: any) => Object.keys(sample).find(x => stepOf(x) === stepOf(f.ref)) || '').filter(Boolean);
				};
				const caller = callerFor(req, project);
				for (const k of linkOrder(keys, refsOf)) {
					const route = routeOf(k);
					const out = await createRecords(req, { route, records: sample[k] }, caller);
					if (out.isError) throw fail('Sample data', `${k} — ${out.text}`);
					const created = (out.data?.records || []).map((r: any) => r._id);
					undo.push({
						step: 'Sample data',
						run: async () => {
							const def: any = await ModelDefinition.findOne({ route }, { name: 1 }).lean();
							if (def) await scopedModel(def.name)?.deleteMany({ _id: { $in: created } });
						},
					});
					result.records[route] = created.length;
				}
			}
		});

		/* 10. The project remembers where it came from, and gets its checklist. */
		step = 'Project';
		const resolvePage = (page: string) => {
			if (!page) return '';
			if (page.startsWith('/')) return page;
			const m = result.models.find(x => [x.name, x.title, x.route].some(v => lower(v) === lower(page)));
			return m ? m.route : page;
		};
		await TenantProject.updateOne(
			{ _id: project._id },
			{
				$set: {
					template: { template: template._id, key: template.key, version: result.template.version, appliedAt: new Date(), answers },
					setup: {
						steps: (bp.guide?.steps || []).map((s: any) => ({ title: s.title, body: s.body, page: resolvePage(s.page), done: false })),
						faq: bp.guide?.faq || [],
					},
				},
			}
		);
		await ProjectTemplate.updateOne(
			{ _id: template._id },
			opts.preview ? { $inc: { 'usage.previews': 1 } } : { $inc: { 'usage.applied': 1 }, $set: { 'usage.lastAppliedAt': new Date() } }
		);
		await runInScope(scope, () =>
			recordProjectEvent({
				req,
				action: 'create',
				model: 'Template',
				modelPath: 'dashboard',
				document: template._id,
				name: template.name,
				text: `built the template “${template.name}”${result.template.version ? ` (v${result.template.version})` : ' (draft)'}`,
			})
		);
		return result;
	} catch (e: any) {
		await runInScope(scope, async () => {
			for (const u of undo.reverse()) await u.run().catch((err: any) => console.error(`Undoing template ${u.step}:`, err?.message));
			await syncDynamicModels({ app: req.app, force: true }).catch(() => undefined);
		});
		const message = e?.message || 'the build failed';
		throw new BuildError(e?.status || 500, message.startsWith('Nothing was built') ? message : `Nothing was built — ${step}: ${message.replace(/^Nothing was built — /, '')}`, e?.problems);
	}
};

/** The API's own address, as the request saw it (or PUBLIC_API_URL). */
const safeOrigin = (req: any) => {
	try {
		return apiOrigin(req);
	} catch {
		return String(process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
	}
};
