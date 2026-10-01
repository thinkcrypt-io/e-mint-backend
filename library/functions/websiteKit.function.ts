import ModelDefinition from '../models/builder/modelDefinition.model.js';
import { buildFeature } from '../controllers/builder/features.service.js';
import { planFromAi } from '../controllers/builder/features.schema.js';
import { runInScope } from './tenantScope.function.js';
import { syncDynamicModels } from './dynamicModels.function.js';
import { projectHooks } from './projectHooks.function.js';

/**
 * The website kit (docs/multi-tenancy WO-18, D13): what a new **website**
 * project starts with — ordinary built models (the builder can change them
 * like any other), modelled on the AGS backend (ab/akashbari-backend-2/models):
 *
 *   SiteSettings  /site-settings  AGS GlobalSettings — branding, theme, contact, socials, default SEO
 *   WebContent    /web-contents   AGS Content — the content blocks of the site
 *   WebPage       /pages          the site's pages (path, status, template, menu)
 *   PageSeo       /seo            AGS Seo — per-page title, description, image, keywords
 *
 * Built through the feature builder (one plan, all or nothing). A content
 * block and an SEO entry point at their page (the "many" side), so each page's
 * detail lists its contents and SEO. The site API (routes-public, /site and
 * /pages/by-path) reads them; their public API starts read-only (list, get).
 */

const labelled = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const WEBSITE_KIT = (category: string) => ({
	title: 'Website',
	summary: 'Site settings, pages, per-page SEO and content blocks — the website kit.',
	sidebarCategory: category,
	steps: [
		{
			action: 'create',
			name: 'SiteSettings',
			route: 'site-settings',
			title: 'Site settings',
			description: 'Branding, theme, contact details, social links and default SEO',
			buttonTitle: 'Add settings',
			displayField: 'siteName',
			rationale: 'One record holds the site’s name, logo, colours, contact details, socials and default SEO (AGS GlobalSettings).',
			fields: [
				{ key: 'siteName', label: 'Site name', kind: 'text', required: true },
				{ key: 'logo', label: 'Logo', kind: 'image' },
				{ key: 'favicon', label: 'Favicon', kind: 'image' },
				{ key: 'footerText', label: 'Footer text', kind: 'textarea' },
				{ key: 'primaryColor', label: 'Primary colour', kind: 'color', default: '#000000' },
				{ key: 'secondaryColor', label: 'Secondary colour', kind: 'color', default: '#ffffff' },
				{ key: 'fontFamily', label: 'Font family', kind: 'text', default: 'Inter' },
				{ key: 'email', label: 'Email', kind: 'email' },
				{ key: 'phone', label: 'Phone', kind: 'text' },
				{ key: 'address', label: 'Address', kind: 'textarea' },
				{ key: 'mapEmbedUrl', label: 'Map embed URL', kind: 'url' },
				{ key: 'facebook', label: 'Facebook', kind: 'url' },
				{ key: 'twitter', label: 'X / Twitter', kind: 'url' },
				{ key: 'instagram', label: 'Instagram', kind: 'url' },
				{ key: 'youtube', label: 'YouTube', kind: 'url' },
				{ key: 'linkedin', label: 'LinkedIn', kind: 'url' },
				{ key: 'metaTitle', label: 'Default meta title', kind: 'text' },
				{ key: 'metaDescription', label: 'Default meta description', kind: 'textarea' },
				{ key: 'ogImage', label: 'Default share image', kind: 'image' },
				{ key: 'enableComments', label: 'Comments on', kind: 'boolean', default: true },
				{ key: 'enableTicker', label: 'Ticker on', kind: 'boolean', default: true },
			],
			form: [
				{ sectionTitle: 'Branding', fields: ['siteName', ['logo', 'favicon'], 'footerText'] },
				{ sectionTitle: 'Theme', fields: [['primaryColor', 'secondaryColor'], 'fontFamily'] },
				{ sectionTitle: 'Contact', fields: [['email', 'phone'], 'address', 'mapEmbedUrl'] },
				{ sectionTitle: 'Social', fields: [['facebook', 'twitter'], ['instagram', 'youtube'], 'linkedin'] },
				{ sectionTitle: 'Default SEO', fields: ['metaTitle', 'metaDescription', 'ogImage'] },
				{ sectionTitle: 'Features', fields: [['enableComments', 'enableTicker']] },
			],
			table: ['siteName', 'email', 'phone', 'primaryColor'],
			view: [
				{ title: 'Branding', columns: 2, fields: ['siteName', 'logo', 'favicon', 'footerText'] },
				{ title: 'Theme', columns: 3, fields: ['primaryColor', 'secondaryColor', 'fontFamily'] },
				{ title: 'Contact', columns: 2, fields: ['email', 'phone', 'address', 'mapEmbedUrl'] },
				{ title: 'Social', columns: 2, fields: ['facebook', 'twitter', 'instagram', 'youtube', 'linkedin'] },
				{ title: 'Default SEO', columns: 1, fields: ['metaTitle', 'metaDescription', 'ogImage'] },
			],
		},
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
			rationale: 'Per-page title, description, image and keywords (AGS Seo), linked to the page they describe.',
			fields: [
				{ key: 'page', label: 'Page', kind: 'reference', ref: 'WebPage', required: true },
				{ key: 'title', label: 'Title', kind: 'text', required: true, max: 120, searchable: true },
				{ key: 'description', label: 'Description', kind: 'textarea', required: true, max: 320 },
				{ key: 'image', label: 'Share image', kind: 'image' },
				{ key: 'keywords', label: 'Keywords', kind: 'tags' },
				{ key: 'tags', label: 'Tags', kind: 'tags' },
				{ key: 'canonical', label: 'Canonical URL', kind: 'url' },
				{ key: 'noIndex', label: 'Hide from search engines', kind: 'boolean', default: false },
			],
			form: [
				{ sectionTitle: 'Page', fields: ['page'] },
				{ sectionTitle: 'Search & share', fields: ['title', 'description', 'image'] },
				{ sectionTitle: 'More', fields: ['keywords', 'tags', ['canonical', 'noIndex']] },
			],
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
	],
});

/** The kit's models start with a read-only public API (the site reads them). */
const KIT_ROUTES = ['site-settings', 'pages', 'seo', 'web-contents'];

/** Seeds the website kit into a new website project (projectHooks.created). */
export const seedWebsiteKit = async (req: any, project: any) => {
	if (project.type !== 'website') return;
	await runInScope({ organization: project.organization, project: project._id }, async () => {
		await buildFeature(req, planFromAi(WEBSITE_KIT('Website')), { source: 'wizard' });
		await ModelDefinition.updateMany(
			{ route: { $in: KIT_ROUTES } },
			{ $set: { publicApi: { enabled: true, actions: ['list', 'get'], auth: 'none', ownerOnly: false } }, $inc: { version: 1 } }
		);
		await syncDynamicModels({ app: req.app, force: true });
	});
};

projectHooks.onCreated(seedWebsiteKit);
