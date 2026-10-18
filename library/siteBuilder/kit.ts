import mongoose from 'mongoose';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import SitePage from '../models/siteBuilder/sitePage.model.js';
import SiteDesign from '../models/siteBuilder/siteDesign.model.js';
import { compiledModel, syncDynamicModels } from '../functions/dynamicModels.function.js';
import { buildFeature } from '../controllers/builder/features.service.js';
import { updateModelCore } from '../controllers/builder/models.controller.js';
import { planFromAi } from '../controllers/builder/features.schema.js';
import { refPopulates, shape } from '../functions/publicRecords.function.js';
import { liveFind, publishRecord, statusOf } from '../functions/drafts.function.js';
import { afterPublish } from '../functions/publishEvents.function.js';
import { ownRecordsOf } from '../functions/projectIndexes.function.js';
import { loadManifest } from './manifest.js';
import { EMPTY_SEO } from './site.js';

/**
 * The builder site in the project's own models (docs/site-builder D27, SB-09).
 * What the site shows is data the team can see and change in the panel like
 * any other records:
 *
 *   Pages        /pages         one record per builder page (name, path, status, menu) — kept in step by the builder
 *   SEO          /seo           each page's title, description, share image… — the page's SEO lives here
 *   Contents     /web-contents  texts, images, buttons blocks show by binding { from: 'content', slug, field }
 *   Site design  /site-design   the theme, colour scheme, colours and fonts (one record)
 *
 * Contents, SEO and the design are read by the backend itself (render,
 * resolve) — they need no public API. Lists (services, team, products…) are
 * models of their own and need a public API with list / get, because the site
 * reads them as any visitor would (resolve.ts).
 *
 * The SEO and design records are the drafts' source: an edit in the panel
 * reaches the builder's draft the next time it's read (pull*), and goes live
 * with the next Publish. Every function runs inside the project's scope.
 */

export const KIT_ROUTES = { pages: 'pages', seo: 'seo', contents: 'web-contents', design: 'site-design' } as const;

type Kit = { def: any; Model: mongoose.Model<any> };

/** One of the kit's models in this project, if it's still there (the builder may have changed it). */
export const kitModel = async (route: string): Promise<Kit | null> => {
	await syncDynamicModels({});
	const def: any = await ModelDefinition.findOne({ route, active: { $ne: false } }).lean();
	const Model = def ? compiledModel(def.name) : null;
	return def && Model ? { def, Model } : null;
};

const has = (kit: Kit | null, key: string) => !!kit?.def.fields.some((f: any) => f.key === key);

/* ---------------------------------------------------------- site design */

const labelled = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

/** The Site design model, as a feature-builder step (the website kit adds it to new projects). */
export const SITE_DESIGN_STEP = () => ({
	action: 'create',
	name: 'SiteTheme',
	route: KIT_ROUTES.design,
	title: 'Site design',
	kind: 'single',
	description: 'The site’s theme, colours and fonts — the site builder reads and writes it',
	buttonTitle: 'Add design',
	displayField: 'name',
	rationale: 'One record: the look of the whole site. The site builder’s Design tab and the AI change it; a change goes live with the next Publish.',
	fields: [
		{ key: 'name', label: 'Name', kind: 'text', required: true, default: 'Site design' },
		{ key: 'theme', label: 'Theme', kind: 'select', required: true, default: 'studio', options: loadManifest().themes.map(t => ({ value: t.key, label: t.label })) },
		{ key: 'colorScheme', label: 'Colour scheme', kind: 'select', default: 'light', options: labelled([['light', 'Light'], ['dark', 'Dark'], ['system', 'Follow the visitor']]) },
		{ key: 'primaryColor', label: 'Main colour', kind: 'color', helper: 'Buttons, links and highlights. Empty: the theme’s.' },
		{ key: 'accentColor', label: 'Accent colour', kind: 'color', helper: 'Soft backgrounds behind highlights. Empty: the theme’s.' },
		{ key: 'backgroundColor', label: 'Background', kind: 'color', helper: 'The page background. Empty: the theme’s.' },
		{ key: 'textColor', label: 'Text colour', kind: 'color', helper: 'Empty: the theme’s.' },
		{ key: 'headingFont', label: 'Heading font', kind: 'text', helper: 'A Google font, e.g. Playfair Display. Empty: the theme’s.' },
		{ key: 'bodyFont', label: 'Body font', kind: 'text', helper: 'A Google font, e.g. Inter. Empty: the theme’s.' },
		{ key: 'buttonRadius', label: 'Button corners', kind: 'select', options: labelled([['none', 'Square'], ['sm', 'Slight'], ['md', 'Rounded'], ['lg', 'More rounded'], ['full', 'Pill']]) },
		{ key: 'advanced', label: 'All design settings (JSON)', kind: 'textarea', helper: 'Everything else the builder’s Design tab sets. The fields above win over it.' },
	],
	form: [
		{ sectionTitle: 'Theme', fields: ['name', ['theme', 'colorScheme']] },
		{ sectionTitle: 'Colours', fields: [['primaryColor', 'accentColor'], ['backgroundColor', 'textColor']] },
		{ sectionTitle: 'Type and shape', fields: [['headingFont', 'bodyFont'], 'buttonRadius'] },
		{ sectionTitle: 'Advanced', fields: ['advanced'] },
	],
	table: ['name', 'theme', 'colorScheme', 'primaryColor'],
	filters: ['theme'],
});

/** Adds the Site design model to a website project that doesn't have it (projects made before it existed). */
export const ensureDesignModel = async (req: any) => {
	const have: any = await ModelDefinition.findOne({ route: KIT_ROUTES.design, active: { $ne: false } }).lean();
	if (have) {
		// One record, the site's look: a single type (docs/cms D2, CMS-06c) — its page opens the record, not a table.
		if (have.kind !== 'single') {
			const Model = compiledModel(have.name);
			if (Model && (await Model.countDocuments()) <= 1) {
				const { _id, name, route, sidebar, collectionName, createdAt, updatedAt, version, __v, organization, project, ...rest } = have;
				await updateModelCore(req, have._id, { ...rest, kind: 'single' }, { note: 'Site design: a single type (CMS-06c)' }).catch((e: any) => console.error('site design single:', e?.message));
			}
		}
		return;
	}
	const kitCategory: any = await ModelDefinition.findOne({ route: KIT_ROUTES.pages }, { sidebarCategory: 1 }).lean();
	try {
		await buildFeature(
			req,
			planFromAi({ title: 'Site design', summary: 'The site’s theme, colours and fonts.', sidebarCategory: kitCategory?.sidebarCategory || 'Website', steps: [SITE_DESIGN_STEP()] }),
			{ source: 'wizard' }
		);
		await syncDynamicModels({ app: req?.app, force: true });
	} catch (e: any) {
		// Two requests at once, or the route taken by the user's own model: the builder keeps working without it.
		console.error('site design model:', e?.message);
	}
};

const HEX = /^#[0-9a-f]{3,8}$/i;
const color = (v: any) => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim() : '');
const font = (v: any) => (typeof v === 'string' && /^[A-Za-z0-9 ]{2,60}$/.test(v.trim()) ? v.trim() : '');

const parseTokens = (raw: any) => {
	if (raw && typeof raw === 'object') return raw;
	try {
		const v = JSON.parse(String(raw || '{}'));
		return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
	} catch {
		return {};
	}
};

/** The design record's fields as the builder's design (theme, tokens, colour scheme). */
export const recordToDesign = (rec: any) => {
	const m = loadManifest();
	const tokens: any = JSON.parse(JSON.stringify(parseTokens(rec.advanced)));
	const setColor = (key: string, v: string) => {
		if (!v) return;
		tokens.colors = tokens.colors || {};
		tokens.colors[key] = { ...(tokens.colors[key] || {}), light: v };
	};
	setColor('primary', color(rec.primaryColor));
	setColor('ring', color(rec.primaryColor));
	setColor('accent', color(rec.accentColor));
	setColor('background', color(rec.backgroundColor));
	setColor('card', color(rec.backgroundColor));
	setColor('foreground', color(rec.textColor));
	for (const [slot, v] of [['heading', font(rec.headingFont)], ['body', font(rec.bodyFont)]] as const)
		if (v) {
			tokens.fonts = tokens.fonts || {};
			tokens.fonts[slot] = { ...(tokens.fonts[slot] || {}), family: v };
		}
	if (['none', 'sm', 'md', 'lg', 'full'].includes(rec.buttonRadius)) tokens.button = { ...(tokens.button || {}), radius: rec.buttonRadius };
	return {
		theme: m.themeKeys.has(rec.theme) ? rec.theme : undefined,
		colorScheme: ['light', 'dark', 'system'].includes(rec.colorScheme) ? rec.colorScheme : undefined,
		tokens,
	};
};

/** The builder's design as the record's fields. */
export const designToRecord = (draft: any) => {
	const t = draft?.tokens || {};
	return {
		theme: draft?.theme || 'studio',
		colorScheme: draft?.colorScheme || 'light',
		primaryColor: t.colors?.primary?.light || '',
		accentColor: t.colors?.accent?.light || '',
		backgroundColor: t.colors?.background?.light || '',
		textColor: t.colors?.foreground?.light || '',
		headingFont: t.fonts?.heading?.family || '',
		bodyFont: t.fonts?.body?.family || '',
		buttonRadius: t.button?.radius || '',
		// (not "tokens": a key that sounds like a secret must be a Password field)
		advanced: JSON.stringify(t),
	};
};

const designRecord = async (kit: Kit) => kit.Model.findOne({ archivedAt: null }).sort({ createdAt: 1 }).lean();

/** Writes the builder's draft design into the Site design record (made if there's none). */
export const pushDesign = async (draft: any) => {
	const kit = await kitModel(KIT_ROUTES.design);
	if (!kit) return;
	const fields = Object.fromEntries(Object.entries(designToRecord(draft)).filter(([k]) => has(kit, k)));
	const rec: any = await designRecord(kit);
	const now = new Date();
	if (rec) await kit.Model.updateOne({ _id: rec._id }, { $set: { ...fields, updatedAt: now } }, { timestamps: false });
	else await kit.Model.create({ name: 'Site design', ...fields });
	await SiteDesign.updateOne({}, { $set: { 'draft.kitSyncedAt': now } });
};

/**
 * The Site design record's changes made in the panel, into the builder's
 * draft design (a new rev). Nothing happens when the record hasn't changed
 * since the builder last wrote or read it.
 */
export const pullDesign = async () => {
	const kit = await kitModel(KIT_ROUTES.design);
	const design: any = await SiteDesign.findOne({}).lean();
	if (!kit || !design) return design;
	const rec: any = await designRecord(kit);
	if (!rec) {
		await pushDesign(design.draft);
		return design;
	}
	const synced = design.draft?.kitSyncedAt ? new Date(design.draft.kitSyncedAt).getTime() : 0;
	if (new Date(rec.updatedAt || 0).getTime() <= synced) return design;
	const from = recordToDesign(rec);
	const $set: any = { 'draft.kitSyncedAt': rec.updatedAt, 'draft.tokens': from.tokens };
	if (from.theme) $set['draft.theme'] = from.theme;
	if (from.colorScheme) $set['draft.colorScheme'] = from.colorScheme;
	return SiteDesign.findOneAndUpdate({ _id: design._id }, { $set, $inc: { 'draft.rev': 1 } }, { new: true }).lean();
};

/* ------------------------------------------------------------- pages */

/** The Pages record that stands for a builder page: made or updated to match it. */
export const pushPage = async (page: any) => {
	const kit = await kitModel(KIT_ROUTES.pages);
	if (!kit || !page) return null;
	const fields: any = {
		name: page.name,
		path: page.path,
		status: page.deletedAt ? 'archived' : page.published || page.status === 'published' ? 'published' : 'draft',
		showInMenu: !!page.showInMenu,
		priority: page.priority || 0,
		...(has(kit, 'template') && { template: page.isHome ? 'home' : 'default' }),
	};
	for (const k of Object.keys(fields)) if (!has(kit, k)) delete fields[k];
	let rec: any = page.kitPage ? await kit.Model.findById(page.kitPage, { _id: 1, status: 1 }).lean() : null;
	// A Pages record already at this path (the kit's own, a template's, or made by the AI for a coded site) is adopted.
	if (!rec && !page.deletedAt) rec = await kit.Model.findOne({ path: page.path, archivedAt: null }, { _id: 1, status: 1 }).lean();
	// A published record stays published until the builder's page is taken off the site or deleted (the public API serves it).
	if (rec?.status === 'published' && fields.status === 'draft' && page.status !== 'unpublished') delete fields.status;
	try {
		if (rec) await kit.Model.updateOne({ _id: rec._id }, { $set: fields });
		else if (!page.deletedAt) rec = await kit.Model.create(fields);
	} catch (e: any) {
		// Another record holds the path (unique): keep the builder working, link nothing.
		if (e?.code !== 11000) console.error('site page record:', e?.message);
		return null;
	}
	if (rec && String(rec._id) !== String(page.kitPage || '')) await SitePage.updateOne({ _id: page._id }, { $set: { kitPage: rec._id } });
	return rec?._id || null;
};

/* --------------------------------------------------------------- SEO */

const SEO_KEYS = ['title', 'description', 'image', 'keywords', 'canonical', 'noIndex'] as const;

const seoFromRecord = (rec: any) => ({
	...EMPTY_SEO,
	...Object.fromEntries(SEO_KEYS.filter(k => rec?.[k] !== undefined && rec?.[k] !== null).map(k => [k, rec[k]])),
});

/** Writes a page's SEO into its SEO record (made if there's none). */
export const pushSeo = async (page: any, seo: any) => {
	const [kit, kitPage] = await Promise.all([kitModel(KIT_ROUTES.seo), pushPage(page)]);
	if (!kit || !kitPage) return;
	const fields: any = { page: kitPage, ...Object.fromEntries(SEO_KEYS.filter(k => seo?.[k] !== undefined && has(kit, k)).map(k => [k, seo[k]])) };
	if (!fields.title) fields.title = page.name;
	const now = new Date();
	// Written without the form's checks: a page may have no description yet.
	await kit.Model.updateOne({ page: kitPage, archivedAt: null }, { $set: { ...fields, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true, timestamps: false, strict: false });
	await SitePage.updateOne({ _id: page._id }, { $set: { 'draft.seoSyncedAt': now } });
};

/** SEO records changed in the panel, into the pages' drafts (a new rev each). Returns the pages as they are now. */
export const pullSeo = async (pages: any[]) => {
	const kit = await kitModel(KIT_ROUTES.seo);
	const linked = pages.filter(p => p.kitPage);
	if (!kit || !linked.length) return pages;
	const recs: any[] = await kit.Model.find({ page: { $in: linked.map(p => p.kitPage) }, archivedAt: null }).lean();
	const byPage = new Map(recs.map(r => [String(r.page), r]));
	const out: any[] = [];
	for (const p of pages) {
		const rec = p.kitPage ? byPage.get(String(p.kitPage)) : null;
		const synced = p.draft?.seoSyncedAt ? new Date(p.draft.seoSyncedAt).getTime() : 0;
		if (!rec || new Date(rec.updatedAt || 0).getTime() <= synced) {
			out.push(p);
			continue;
		}
		const saved = await SitePage.findOneAndUpdate(
			{ _id: p._id },
			{ $set: { 'draft.seo': seoFromRecord(rec), 'draft.seoSyncedAt': rec.updatedAt }, $inc: { 'draft.rev': 1 } },
			{ new: true }
		).lean();
		out.push(saved || p);
	}
	return out;
};

/* ----------------------------------------------------------- contents */

/**
 * Typed Contents records (docs/cms D1): the words live in `block[0]` — one
 * item of the record's type — and a binding's `field` is a path in it
 * (`heading`, `items.2.title`). Read flat (the item's fields beside slug and
 * name), with the old field names as aliases so a binding made the old way —
 * the editor's `content`, `btnText`, `card`… — finds the same words.
 */
export const LEGACY_ALIAS: Record<string, string> = {
	content: 'heading',
	subContent: 'subheading',
	btnText: 'buttonLabel',
	url: 'buttonUrl',
	richContent: 'text',
	image: 'image',
	card: 'items',
};

export const typedItem = (rec: any) => (Array.isArray(rec?.block) && rec.block[0] && typeof rec.block[0] === 'object' ? rec.block[0] : null);

/** A Contents record as bindings read it: a typed one flat (and its old names), an old one as it is. */
export const flatContent = (rec: any, def?: any) => {
	const item = typedItem(rec);
	if (!item) return def ? shape(rec, def) : rec;
	const { _key, __component, ...fields } = item;
	const out: any = { _id: rec._id, slug: rec.slug, name: rec.name, page: rec.page, type: __component, ...fields };
	for (const [old, now] of Object.entries(LEGACY_ALIAS)) if (out[old] === undefined && fields[now] !== undefined) out[old] = fields[now];
	return out;
};

/** A binding's field in a typed record's item: the first part through the old names (`card.1.title` → `items.1.title`). */
export const typedPath = (field: string) => {
	const [head, ...rest] = String(field || '').split('.');
	return [LEGACY_ALIAS[head] || head, ...rest].join('.');
};

/** The Contents records the site reads: what's published (Contents keeps drafts, D5), or the drafts for the editor. */
const findContents = async (kit: Kit, cond: any, { drafts = false, populate = [] as any[] } = {}) => {
	if (drafts || !kit.def.draftAndPublish) return kit.Model.find(cond).sort({ priority: -1, createdAt: 1 }).populate(populate).lean();
	return liveFind(kit.def, kit.Model, { query: cond, sort: { priority: -1, createdAt: 1 }, limit: 1000, populate });
};

/** The slugs every `content` binding in `trees` names. */
export const contentSlugs = (trees: any[][], out = new Set<string>()) => {
	const visit = (nodes: any[]) => {
		for (const n of nodes || []) {
			if (!n || typeof n !== 'object') continue;
			for (const b of Object.values<any>(n.bind || {})) if (b?.from === 'content' && typeof b.slug === 'string') out.add(b.slug);
			if (n.action?.bind?.from === 'content' && typeof n.action.bind.slug === 'string') out.add(n.action.bind.slug);
			if (Array.isArray(n.children)) visit(n.children);
			if (n.slots && typeof n.slots === 'object') Object.values<any>(n.slots).forEach(visit);
		}
	};
	trees.forEach(t => visit(Array.isArray(t) ? t : []));
	return out;
};

/** Every Contents record `trees` show: their bindings' and their lists' (`source.content`). */
export const siteContentSlugs = (trees: any[][]) => {
	const out = contentSlugs(trees);
	const visit = (nodes: any[]) => {
		for (const n of nodes || []) {
			if (!n || typeof n !== 'object') continue;
			if (n.type === 'collection' && typeof n.props?.source?.content === 'string') out.add(n.props.source.content);
			if (Array.isArray(n.children)) visit(n.children);
			if (n.slots && typeof n.slots === 'object') Object.values<any>(n.slots).forEach(visit);
		}
	};
	trees.forEach(t => visit(Array.isArray(t) ? t : []));
	return out;
};

/** The Contents records `trees` bind to, by slug — visible and published ones only (`drafts`: as they are now, for the editor). */
export const resolveContents = async (trees: any[][], { drafts = false }: { drafts?: boolean } = {}) => {
	const slugs = [...contentSlugs(trees)].slice(0, 200);
	if (!slugs.length) return {} as Record<string, any>;
	const kit = await kitModel(KIT_ROUTES.contents);
	if (!kit) return {};
	const cond: any = { slug: { $in: slugs }, archivedAt: null };
	if (has(kit, 'status')) cond.status = { $nin: ['draft', 'archived'] };
	if (has(kit, 'isVisible')) cond.isVisible = { $ne: false };
	const docs: any[] = await findContents(kit, cond, { drafts, populate: await refPopulates(kit.def) });
	const out: Record<string, any> = {};
	for (const d of docs) if (!out[d.slug]) out[d.slug] = flatContent(d, kit.def);
	return out;
};

/** The Contents records for the editor and the AI: slug, name, section, and what they hold (typed ones flat). */
export const contentList = async () => {
	const kit = await kitModel(KIT_ROUTES.contents);
	if (!kit) return { fields: [], items: [] };
	const docs: any[] = await kit.Model.find({ archivedAt: null }).sort({ section: 1, priority: -1, createdAt: 1 }).limit(500).populate(await refPopulates(kit.def)).lean();
	return {
		fields: kit.def.fields.map((f: any) => ({ key: f.key, label: f.label || f.key, kind: f.kind })),
		items: docs.filter(d => d.slug).map(d => flatContent(d, kit.def)),
	};
};

/** Whether the project's Contents holds typed records (CMS-06). */
export const isTyped = (def: any) => !!def?.fields?.some((f: any) => f.key === 'block' && f.kind === 'blocks');

/** The type a record made from old-style fields gets: cards when it has them, else a Section. */
const typeForOld = (fields: any) => (Array.isArray(fields.card) ? 'content.cards' : 'content.section');

/** Old-style fields (`content`, `btnText`, `card`…) as a typed item's. */
const asTypedFields = (fields: any) => {
	const out: any = {};
	for (const [k, v] of Object.entries<any>(fields)) {
		const to = LEGACY_ALIAS[k];
		if (to) out[to] = k === 'card' && Array.isArray(v) ? v.map(({ _id, ...row }: any) => row) : v;
	}
	return out;
};

const RECORD_KEYS = new Set(['name', 'page', 'section', 'slug', 'status', 'isVisible', 'priority', 'order', 'type', 'block', 'category']);

/**
 * Adds or updates Contents records by slug (the editor's "Save as content", its
 * cards, the MCP, the theme demos). A typed record takes typed fields, or the
 * old names (`content` → heading…); a new one sent the old way is made typed
 * when the project's Contents is (a Section, or Cards with `card`). Old-style
 * Contents get what they always did.
 */
export const upsertContents = async (records: any[], page?: any) => {
	const kit = await kitModel(KIT_ROUTES.contents);
	if (!kit) throw new Error('This project has no Contents model (web-contents) — it was renamed or deleted');
	const kitPage = page ? await pushPage(page) : null;
	const typed = isTyped(kit.def);
	const allowed = new Set(kit.def.fields.filter((f: any) => f.kind !== 'formula' && f.kind !== 'dateformula').map((f: any) => f.key));
	const out: any[] = [];
	for (const r of records) {
		const slug = String(r?.slug || '').trim();
		if (!/^[a-z0-9-]{1,120}$/.test(slug)) throw new Error(`“${slug || '(empty)'}” isn’t a content slug — lowercase letters, digits and dashes`);
		const current: any = await kit.Model.findOne({ slug, archivedAt: null }).lean();
		const item = typedItem(current);
		let saved: any;
		if (item || (typed && !current)) {
			// Typed: the record's own keys, and the item's fields (sent typed, or by their old names).
			const own: any = Object.fromEntries(Object.entries<any>(r).filter(([k, v]) => RECORD_KEYS.has(k) && k !== 'block' && v !== undefined && allowed.has(k)));
			const given = Array.isArray(r.block) && r.block[0] ? r.block[0] : { ...asTypedFields(r), ...(r.data && typeof r.data === 'object' ? r.data : {}) };
			const type = item?.__component || r.type || given.__component || typeForOld(r);
			const { __component, _key, ...fields } = given;
			const next = { ...(item || {}), ...fields, __component: type, ...(item?._key && { _key: item._key }) };
			if (!current) {
				if (!own.name) own.name = slug;
				if (kitPage && !own.page) own.page = kitPage;
				const doc = await kit.Model.create({ slug, ...own, type, block: [next] });
				saved = doc.toObject();
			} else {
				const doc: any = await kit.Model.findById(current._id);
				doc.set({ ...own, block: [next] });
				await doc.save();
				saved = doc.toObject();
			}
		} else {
			const fields: any = Object.fromEntries(Object.entries<any>(r).filter(([k, v]) => allowed.has(k) && v !== undefined));
			// A new record gets a name, its page, a category and "published"; an update changes only what was sent.
			if (!current) {
				if (!fields.name) fields.name = slug;
				if (kitPage && allowed.has('page') && !fields.page) fields.page = kitPage;
				if (allowed.has('category') && !fields.category) fields.category = 'content';
				if (allowed.has('status') && !fields.status) fields.status = 'published';
			}
			saved = current
				? await kit.Model.findOneAndUpdate({ _id: current._id }, { $set: fields }, { new: true, runValidators: true }).lean()
				: (await kit.Model.create({ slug, ...fields })).toObject();
		}
		out.push(flatContent(saved, kit.def));
	}
	return out;
};

/* ------------------------------------------------- contents and Publish */

/** The Contents records the site's trees use that aren't live as they are (Contents keeps drafts, D5). */
export const unpublishedContents = async (trees: any[][]) => {
	const kit = await kitModel(KIT_ROUTES.contents);
	if (!kit?.def.draftAndPublish) return [];
	const slugs = [...siteContentSlugs(trees)].slice(0, 2000);
	if (!slugs.length) return [];
	const docs: any[] = await kit.Model.find({ slug: { $in: slugs }, archivedAt: null }, { slug: 1, name: 1, updatedAt: 1, _publishedAt: 1, _publishedFrom: 1 }).lean();
	return docs.filter(d => statusOf(d) !== 'published').map(d => ({ _id: String(d._id), slug: d.slug, name: d.name, status: statusOf(d) }));
};

/** Publishes the Contents records the trees use — the site's Publish puts its words live with its layout. */
export const publishContents = async (trees: any[][], user?: any) => {
	const kit = await kitModel(KIT_ROUTES.contents);
	if (!kit?.def.draftAndPublish) return 0;
	const todo = await unpublishedContents(trees);
	for (const c of todo) {
		const out = await publishRecord(kit.Model, c._id, user);
		if (out) afterPublish(kit.Model, 'publish', out.doc, { refresh: false });
	}
	return todo.length;
};

/**
 * The page's Contents records in the order its tree shows them (bindings and
 * lists, first use first) — the Contents screen lists a page in that order.
 * Only the order changes: no draft is touched.
 */
export const orderContents = async (kitPage: any, tree: any[]) => {
	const kit = await kitModel(KIT_ROUTES.contents);
	if (!kit || !kitPage || !has(kit, 'order') || !Array.isArray(tree)) return 0;
	const seen: string[] = [];
	const visit = (nodes: any[]) => {
		for (const n of nodes || []) {
			if (!n || typeof n !== 'object') continue;
			for (const b of Object.values<any>(n.bind || {})) if (b?.from === 'content' && typeof b.slug === 'string' && !seen.includes(b.slug)) seen.push(b.slug);
			const src = n.type === 'collection' && n.props?.source?.content;
			if (typeof src === 'string' && !seen.includes(src)) seen.push(src);
			if (Array.isArray(n.children)) visit(n.children);
			if (n.slots && typeof n.slots === 'object') Object.values<any>(n.slots).forEach(visit);
		}
	};
	visit(tree);
	if (!seen.length) return 0;
	const own = ownRecordsOf(kit.Model);
	const ops = seen.slice(0, 500).map((slug, order) => ({ updateOne: { filter: { ...own, slug, page: kitPage, archivedAt: null }, update: { $set: { order } } } }));
	await kit.Model.collection.bulkWrite(ops as any);
	return ops.length;
};
