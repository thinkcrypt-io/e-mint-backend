import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import DashboardConfig from '../../models/builder/dashboardConfig.model.js';
import SidebarCategory from '../../models/sidebarcategories/model.js';
import SidebarItem from '../../models/sidebaritems/model.js';
import TenantProject from '../../models/tenancy/tenantProject.model.js';
import { BuildError } from '../builder/models.controller.js';
import { scopedModel } from '../../functions/routeRegistry.function.js';
import { loadSite } from '../../functions/siteConfig.function.js';
import { runInScope } from '../../functions/tenantScope.function.js';
import { toRoute } from '../../functions/dynamicModels.function.js';
import { KIT_ROUTES, TemplateType, normalizeBlueprint } from './blueprint.js';

/**
 * "Save as template" (docs/templates TD13): a project's **structure** as a
 * new blueprint — models with their fields, sidebar, dashboard, public API,
 * and for a website its pages, SEO, content blocks and site settings.
 *
 * Records are never taken from a tenant's project. Sample data is captured
 * only from a sandbox preview (the super admin's own), up to 20 per model,
 * links written as the linked record's display value so the apply engine can
 * resolve them again. Page layouts aren't captured: the builder makes them
 * again from the fields.
 */

const KIT = new Set(Object.values(KIT_ROUTES));
const SAMPLE_LIMIT = 20;
const SKIP_RECORD_KEYS = new Set(['_id', '__v', 'createdAt', 'updatedAt', 'code', 'addedBy', 'access', 'privacy', 'archivedAt', 'archivedBy', '_customer']);

const fieldForPlan = (f: any) => {
	const out: any = { key: f.key, label: f.label || f.key, kind: f.kind };
	for (const k of ['required', 'unique', 'searchable', 'helper', 'formula', 'min', 'max', 'ref', 'addLabel', 'secret'])
		if (f[k] !== undefined && f[k] !== null && f[k] !== false && f[k] !== '') out[k] = f[k];
	if (f.default !== undefined && f.default !== null && f.default !== '') out.default = f.default;
	if (Array.isArray(f.options) && f.options.length) out.options = f.options.map((o: any) => ({ value: o.value, label: o.label }));
	if (Array.isArray(f.fields) && f.fields.length) out.fields = f.fields.map(fieldForPlan);
	return out;
};

/** A record as sample data: own fields only, links as the linked record's display value. */
const sampleRow = async (doc: any, def: any, displayOf: Map<string, string>) => {
	const row: any = {};
	for (const f of def.fields) {
		if (SKIP_RECORD_KEYS.has(f.key) || f.kind === 'formula' || f.kind === 'password') continue;
		const v = doc[f.key];
		if (v === undefined || v === null || v === '') continue;
		if ((f.kind === 'reference' || f.kind === 'references') && f.ref) {
			const Ref = scopedModel(f.ref);
			const display = displayOf.get(f.ref) || 'name';
			const ids = ([] as any[]).concat(v);
			const linked: any[] = Ref ? await Ref.find({ _id: { $in: ids } }, { [display]: 1 }).lean() : [];
			const names = linked.map(l => l[display]).filter(Boolean);
			if (names.length) row[f.key] = f.kind === 'reference' ? names[0] : names;
			continue;
		}
		row[f.key] = v instanceof Date ? v.toISOString() : v;
	}
	return row;
};

export const captureProject = async (projectId: any, input: { name?: string; sampleData?: boolean } = {}) => {
	const project: any = await TenantProject.findById(projectId).lean();
	if (!project) throw new BuildError(404, 'No project with that id.');
	const type = project.type as TemplateType;
	const fromSandbox = !!project.preview;
	const wantSample = input.sampleData === true;
	if (wantSample && !fromSandbox) throw new BuildError(400, 'Sample data can only be captured from a template preview — never from a tenant’s own records.');

	return runInScope({ organization: project.organization, project: project._id }, async () => {
		const defs: any[] = await ModelDefinition.find({}).sort({ createdAt: 1 }).lean();
		const own = defs.filter(d => !(type === 'website' && KIT.has(d.route)));
		const nameOf = new Map(defs.map(d => [d.route, d.name]));
		const displayOf = new Map(defs.map(d => [d.name, d.displayField || d.fields?.[0]?.key || 'name']));

		const steps = own.map(d => ({
			action: 'create',
			name: d.name,
			title: d.title,
			// Kept only when it isn't what the name gives anyway.
			...(d.route !== toRoute(d.name) && { route: d.route }),
			description: d.description || '',
			rationale: '',
			displayField: d.displayField || undefined,
			...(d.code?.enabled && { code: { enabled: true, ...(d.code.prefix && { prefix: d.code.prefix }) } }),
			...(d.access?.enabled && { access: d.access }),
			fields: (d.fields || []).map(fieldForPlan),
		}));

		const categories: any[] = await SidebarCategory.find({}).sort({ priority: 1 }).lean();
		const items: any[] = await SidebarItem.find({}).sort({ priority: 1 }).lean();
		const sidebar = categories
			.map(c => ({
				name: c.name,
				icon: c.icon || '',
				description: c.description || '',
				items: items
					.filter(i => String(i.category) === String(c._id) && nameOf.has(i.href) && !(type === 'website' && KIT.has(i.href)))
					.map(i => ({ model: nameOf.get(i.href), label: i.name !== defs.find(d => d.route === i.href)?.title ? i.name : '' })),
			}))
			.filter(c => c.items.length);

		const dash: any = await DashboardConfig.findOne({ key: 'default' }).lean();
		const dashboard = (dash?.widgets || []).map((w: any) => ({ ...w, route: nameOf.get(w.route) || w.route, id: undefined }));

		const endpoints = own
			.filter(d => d.publicApi?.enabled)
			.map(d => ({ model: d.name, actions: d.publicApi.actions || [], auth: d.publicApi.auth || 'none', ownerOnly: !!d.publicApi.ownerOnly, note: '' }));

		let website: any;
		if (type === 'website') {
			const Page = scopedModel('WebPage');
			const Seo = scopedModel('PageSeo');
			const Content = scopedModel('WebContent');
			const pages: any[] = Page ? await Page.find({ status: { $ne: 'archived' } }).sort({ priority: -1, path: 1 }).limit(100).lean() : [];
			const byId = new Map(pages.map(p => [String(p._id), p.path]));
			const site: any = await loadSite(project);
			website = {
				pages: await Promise.all(
					pages.map(async p => {
						const seo: any = Seo ? await Seo.findOne({ page: p._id }).lean() : null;
						const blocks: any[] = Content ? await Content.find({ page: p._id, status: { $ne: 'archived' } }).sort({ priority: -1 }).lean() : [];
						return {
							path: p.path,
							name: p.name,
							status: p.status,
							template: p.template,
							showInMenu: p.showInMenu !== false,
							priority: p.priority || 0,
							parent: p.parent ? byId.get(String(p.parent)) || '' : '',
							seo: seo ? { title: seo.title, description: seo.description, image: seo.image, keywords: seo.keywords || [], canonical: seo.canonical, noIndex: !!seo.noIndex } : {},
							contents: blocks.map(({ _id, page, addedBy, createdAt, updatedAt, __v, priority, ...b }: any) => b),
						};
					})
				),
				settings: { identity: site?.identity || {}, contact: site?.contact || {}, social: site?.social || {}, seo: site?.seo || {} },
				starter: {},
			};
		}

		let sampleData: Record<string, any[]> = {};
		if (wantSample)
			for (const d of own) {
				const Model = scopedModel(d.name);
				if (!Model) continue;
				const docs: any[] = await Model.find({}).sort({ createdAt: 1 }).limit(SAMPLE_LIMIT).lean();
				const rows = await Promise.all(docs.map(doc => sampleRow(doc, d, displayOf)));
				if (rows.length) sampleData[d.name] = rows;
			}

		const template = project.template?.key ? ` (built from “${project.template.key}”)` : '';
		return normalizeBlueprint(type, {
			overview: { name: input.name || project.name.replace(/ · preview .*$/, ''), summary: project.description || '', description: `Captured from the project “${project.name}”${template}.` },
			models: { steps },
			sidebar,
			dashboard,
			endpoints,
			website,
			sampleData,
			guide: project.setup ? { steps: (project.setup.steps || []).map((s: any) => ({ title: s.title, body: s.body, page: nameOf.get(s.page) || s.page })), faq: project.setup.faq || [] } : undefined,
		});
	});
};
