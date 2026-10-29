import ModelDefinition from '../models/builder/modelDefinition.model.js';
import SidebarCategory from '../models/sidebarcategories/model.js';
import { buildFeature } from '../controllers/builder/features.service.js';
import { planFromAi } from '../controllers/builder/features.schema.js';
import { runInScope } from './tenantScope.function.js';
import { syncDynamicModels } from './dynamicModels.function.js';
import { projectHooks } from './projectHooks.function.js';
import { SITE_DESIGN_STEP } from '../siteBuilder/kit.js';
import { PAGE_SEO_FIELDS, PAGE_SEO_FORM } from '../siteBuilder/seo.js';
import { ensureTypedContents } from '../siteBuilder/contentTypes.js';

/**
 * The website kit (docs/multi-tenancy WO-18, D13): what a new **website**
 * project starts with — ordinary built models (the builder can change them
 * like any other), modelled on the AGS backend (ab/akashbari-backend-2/models):
 *
 *   WebContent    /web-contents   AGS Content — the content blocks of the site
 *   WebPage       /pages          the site's pages (path, status, template, menu)
 *   PageSeo       /seo            AGS Seo — per-page title, description, image, keywords
 *   SiteTheme     /site-design    the site builder's theme, colours and fonts (docs/site-builder D27)
 *
 * Built through the feature builder (one plan, all or nothing). A content
 * block and an SEO entry point at their page (the "many" side), so each page's
 * detail lists its contents and SEO. The site API (routes-public, /site and
 * /pages/by-path) reads them; their public API starts read-only (list, get).
 *
 * The site's own settings (name, logo, favicon, contact, tags…) aren't a model
 * here: they're the project's WebsiteSettings (WO-38, siteConfig.function.ts).
 */

const labelled = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const WEBSITE_KIT = (category: string) => ({
	title: 'Website',
	summary: 'Pages, per-page SEO, content blocks and the site design — the website kit.',
	sidebarCategory: category,
	steps: [
		{
			action: 'create',
			name: 'WebPage',
			route: 'pages',
			title: 'Pages',
			description: 'The site’s pages: path, status, template and menu',
			buttonTitle: 'Add page',
			displayField: 'name',
			rationale: 'Every page of the site, by path. Its contents and SEO point at it, and show as tabs on its page.',
			fields: [
				{ key: 'name', label: 'Name', kind: 'text', required: true, searchable: true },
				{ key: 'path', label: 'Path', kind: 'text', required: true, unique: true, searchable: true, helper: 'Where it lives on the site, e.g. / or /about' },
				{ key: 'status', label: 'Status', kind: 'select', required: true, default: 'draft', options: labelled([['draft', 'Draft'], ['published', 'Published'], ['archived', 'Archived']]) },
				{ key: 'template', label: 'Template', kind: 'select', default: 'default', options: labelled([['default', 'Default'], ['home', 'Home'], ['landing', 'Landing'], ['content', 'Content'], ['contact', 'Contact']]) },
				{ key: 'parent', label: 'Parent page', kind: 'reference', ref: '__self__' },
				{ key: 'showInMenu', label: 'In the menu', kind: 'boolean', default: true },
				{ key: 'priority', label: 'Priority', kind: 'number', default: 0, helper: 'Higher shows first in the menu' },
			],
			form: [{ sectionTitle: 'Page', fields: ['name', ['path', 'status'], ['template', 'parent'], ['showInMenu', 'priority']] }],
			table: ['name', 'path', 'status', 'template', 'showInMenu', 'priority'],
			filters: ['status', 'template', 'showInMenu'],
		},
		{
			action: 'create',
			name: 'PageSeo',
			route: 'seo',
			title: 'SEO',
			description: 'Search and share details for each page',
			buttonTitle: 'Add SEO',
			displayField: 'title',
			rationale: 'Per-page SEO edited with the AGS SEO editor, linked to the page it describes.',
			fields: PAGE_SEO_FIELDS(),
			form: PAGE_SEO_FORM(),
			table: ['page', 'title', 'noIndex'],
			filters: ['page', 'noIndex'],
		},
		{
			action: 'create',
			name: 'WebContent',
			route: 'web-contents',
			title: 'Contents',
			description: 'Content blocks for the site, grouped by page and section',
			buttonTitle: 'Add content',
			displayField: 'name',
			rationale: 'The AGS content model: each record is one block of content — text, list, cards, rich text, image, gallery, video — on a page.',
			fields: [
				{ key: 'name', label: 'Name', kind: 'text', required: true, searchable: true },
				{ key: 'page', label: 'Page', kind: 'reference', ref: 'WebPage' },
				{ key: 'section', label: 'Section', kind: 'text', searchable: true, helper: 'Optional. Used to group contents on the page.' },
				{ key: 'slug', label: 'Slug', kind: 'text', searchable: true, index: true },
				{
					key: 'category',
					label: 'Category',
					kind: 'select',
					required: true,
					default: 'content',
					options: labelled([
						['content', 'Content'], ['rich-content', 'Rich Content'], ['list', 'List'], ['card', 'Card'], ['image', 'Image'],
						['gallery', 'Gallery'], ['list-of-links', 'List Of Links'], ['video', 'Video'], ['section', 'Section'], ['other', 'Other'],
					]),
				},
				{ key: 'status', label: 'Status', kind: 'select', required: true, default: 'published', options: labelled([['published', 'Published'], ['draft', 'Draft'], ['archived', 'Archived']]) },
				{ key: 'isVisible', label: 'Is visible', kind: 'boolean', default: true, helper: 'Whether to show this content on the site.' },
				{ key: 'description', label: 'Description', kind: 'editor', searchable: true },
				{ key: 'content', label: 'Content', kind: 'textarea', searchable: true },
				{ key: 'subContent', label: 'Sub Content', kind: 'textarea' },
				{ key: 'btnText', label: 'Button text', kind: 'text' },
				{ key: 'url', label: 'Url', kind: 'text' },
				{ key: 'list', label: 'List', kind: 'tags' },
				{
					key: 'card',
					label: 'Cards',
					kind: 'sectionlist',
					addLabel: 'Add card',
					fields: [
						{ key: 'image', label: 'Image', kind: 'image' },
						{ key: 'title', label: 'Title', kind: 'text' },
						{ key: 'subTitle', label: 'Sub title', kind: 'text' },
						{ key: 'description', label: 'Description', kind: 'textarea' },
					],
				},
				{ key: 'richContent', label: 'Rich content', kind: 'editor' },
				{ key: 'image', label: 'Image', kind: 'image' },
				{ key: 'gallery', label: 'Gallery', kind: 'images' },
				{ key: 'videoUrl', label: 'Video URL', kind: 'text' },
				{ key: 'bgColor', label: 'Background Color', kind: 'color' },
				{ key: 'color', label: 'Font Color', kind: 'color' },
				{ key: 'fontSize', label: 'Font Size', kind: 'text' },
				{ key: 'fontSizeSm', label: 'Font Size Small', kind: 'text' },
				{ key: 'note', label: 'Note', kind: 'editor' },
				{ key: 'refImage', label: 'Ref image', kind: 'image', helper: 'Reference image for internal use showing the section on the website.' },
				{ key: 'priority', label: 'Priority', kind: 'number', default: 0 },
			],
			form: [
				{ sectionTitle: 'Content Basic', fields: ['name', ['page', 'section'], ['slug', 'category'], ['status', 'isVisible'], 'description'] },
				{ sectionTitle: 'Content Management (Text)', fields: ['content', 'subContent', ['btnText', 'url']] },
				{ sectionTitle: 'Content Management (List)', fields: ['list'] },
				{ sectionTitle: 'Content Management (Card)', fields: ['card'] },
				{ sectionTitle: 'Content Management (Editor)', fields: ['richContent'] },
				{ sectionTitle: 'Content Management (Image)', fields: ['image'] },
				{ sectionTitle: 'Content Management (Gallery)', fields: ['gallery'] },
				{ sectionTitle: 'Content Management (Video)', fields: ['videoUrl'] },
				{ sectionTitle: 'Style', fields: [['bgColor', 'color'], ['fontSize', 'fontSizeSm']] },
				{ sectionTitle: 'Note & Ref', fields: ['note', 'refImage', 'priority'] },
			],
			table: ['name', 'page', 'section', 'category', 'isVisible', 'status', 'priority'],
			filters: ['page', 'category', 'status', 'isVisible'],
		},
		SITE_DESIGN_STEP(),
	],
});

/** The kit's models start with a read-only public API (the site reads them). */
const KIT_ROUTES = ['pages', 'seo', 'web-contents'];

/**
 * What a store (e-commerce project) gets of the website kit: the pages, their
 * SEO and the content blocks — the site's words and search details in the
 * panel. Not the Site design: that's the site builder's, and a store's site
 * is its own Next app. The store's site settings (name, logo, tags, SEO
 * defaults) are the project's own, as for any site.
 */
export const STORE_SITE_KIT = (category: string) => {
	const kit = WEBSITE_KIT(category);
	return { ...kit, title: 'Website content', summary: 'Pages, per-page SEO and content blocks for your store’s website.', steps: kit.steps.filter((s: any) => s.route !== 'site-design') };
};

/** Builds a kit plan in the project's scope: the kit's models get a read-only public API (the site reads them). */
const installKit = async (req: any, plan: any) => {
	await buildFeature(req, planFromAi(plan), { source: 'wizard' });
	await ModelDefinition.updateMany(
		{ route: { $in: KIT_ROUTES } },
		{ $set: { publicApi: { enabled: true, actions: ['list', 'get'], auth: 'none', ownerOnly: false } }, $inc: { version: 1 } }
	);
	await syncDynamicModels({ app: req.app, force: true });
	// Contents hold typed records — a Hero, Cards, a List… (docs/cms D1, CMS-06).
	// A problem here leaves the old Contents form; the Contents screen tries again when it opens.
	await ensureTypedContents(req).catch((e: any) => console.error('typed contents:', e?.message));
};

/** The sidebar category the kit's pages sit in ("Website"); made when the project (a store's is "Pages") hasn't one. */
const websiteCategory = async () => {
	const have: any = await SidebarCategory.findOne({ name: 'Website' }).lean();
	if (have) return have;
	return SidebarCategory.create({ name: 'Website', priority: 90, icon: 'globe', isActive: true });
};

/** Puts the kit's models in that category when they have none (a store built them before it had one). */
const placeStoreKit = async (apply: boolean) => {
	const loose = await ModelDefinition.countDocuments({ route: { $in: KIT_ROUTES }, active: { $ne: false }, $or: [{ 'sidebar.category': null }, { 'sidebar.category': '' }, { 'sidebar.category': { $exists: false } }] });
	if (!loose) return [];
	if (apply) {
		const cat: any = await websiteCategory();
		await ModelDefinition.updateMany(
			{ route: { $in: KIT_ROUTES }, active: { $ne: false }, $or: [{ 'sidebar.category': null }, { 'sidebar.category': '' }, { 'sidebar.category': { $exists: false } }] },
			{ $set: { 'sidebar.category': String(cat._id) }, $inc: { version: 1 } }
		);
	}
	return [`Pages, SEO and Contents in the sidebar under Website`];
};

/**
 * A store's site kit when it hasn't one (Pages, SEO, Contents), in the
 * project's scope. A project that already has any of those routes is left
 * alone — its own models — apart from putting them in the sidebar. Returns
 * what it did (or would do, when not applying).
 */
export const ensureStoreSiteKit = async (req: any, { apply = true } = {}): Promise<string[]> => {
	const have = await ModelDefinition.countDocuments({ route: { $in: KIT_ROUTES }, active: { $ne: false } });
	if (have) return placeStoreKit(apply);
	if (apply) {
		await websiteCategory();
		await installKit(req, STORE_SITE_KIT('Website'));
	}
	return ['website kit: Pages, SEO and Contents'];
};

/** Seeds the website kit into a new website project (projectHooks.created); a store gets the kit without the design. */
export const seedWebsiteKit = async (req: any, project: any) => {
	if (project.type !== 'website' && project.type !== 'ecommerce') return;
	await runInScope({ organization: project.organization, project: project._id }, async () => {
		if (project.type === 'ecommerce') await websiteCategory();
		await installKit(req, project.type === 'website' ? WEBSITE_KIT('Website') : STORE_SITE_KIT('Website'));
	});
};

projectHooks.onCreated(seedWebsiteKit);
