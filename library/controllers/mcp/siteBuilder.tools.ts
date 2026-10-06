import SitePage from '../../models/siteBuilder/sitePage.model.js';
import SiteDesign from '../../models/siteBuilder/siteDesign.model.js';
import { recordProjectEvent } from '../../functions/recordHistory.function.js';
import { loadManifest, presetTree } from '../../siteBuilder/manifest.js';
import { NODE_ID, newId } from '../../siteBuilder/ids.js';
import { applyOps, OpsError } from '../../siteBuilder/ops.js';
import { treeIds, validateDesign, validatePageFields, validateTree, type Problem } from '../../siteBuilder/validate.js';
import { EMPTY_SEO, designView, ensureSite, livePages, pageSummary, pageView, siteChanges } from '../../siteBuilder/site.js';
import { publishSite, siteUrl } from '../../siteBuilder/publish.js';
import { dataModels, dataProblems } from '../../siteBuilder/resolve.js';
import { applyStarter, starterSummaries } from '../../siteBuilder/starter.js';
import { contentList, ensureDesignModel, pullDesign, pullSeo, pushDesign, pushPage, pushSeo, upsertContents } from '../../siteBuilder/kit.js';
import type { Caller, ToolDef } from './mcp.router.js';

/**
 * The site builder over MCP (docs/site-builder SB-12): the user's own AI
 * (Claude, ChatGPT, Cursor…) builds a website project's site in the visual
 * builder — the same pages, blocks, themes and checks as the editor at
 * builder.mintapp.shop, so the user carries on there. Website projects only.
 *
 * What the site shows lives in the project's models (D27, siteBuilder/kit.ts):
 * texts and pictures in Contents records the blocks bind to, each page's SEO in
 * its SEO record, the theme in the Site design record, and lists (services,
 * team, products…) in models of their own with a public API (list, get) that
 * `collection` blocks show. Nothing goes live until publish_site (a key with
 * the "publish" scope) or the user's Publish in the editor.
 */

type Out = { text: string; data?: any; isError?: boolean };
const refuse = (text: string, data?: any): Out => ({ text, isError: true, ...(data && { data }) });

/** The visual editor, at a page of this project. */
export const builderUrl = (project: any, pageId?: string) => {
	const base = String(process.env.SITE_BUILDER_URL || (process.env.NODE_ENV === 'production' ? 'https://builder.mintapp.shop' : 'http://localhost:3400')).replace(/\/$/, '');
	return `${base}/${project.publicSlug}${pageId ? `?page=${pageId}` : ''}`;
};

const problemLines = (problems: Problem[], max = 30) =>
	problems
		.slice(0, max)
		.map(p => `- ${p.level === 'error' ? 'ERROR' : p.level === 'publish' ? 'before publishing' : 'warning'}: ${p.nodeId ? `[${p.nodeId}] ` : ''}${p.message}`)
		.join('\n');

/* ----------------------------------------------------------- catalogue */

const propLine = (p: any) =>
	`${p.key}:${p.kind}${p.options?.length ? `(${p.options.map((o: any) => o.value).join('|')})` : ''}${p.bindable ? '*' : ''}${p.kind === 'list' && p.fields?.length ? `[${p.fields.map((f: any) => `${f.key}:${f.kind}`).join(',')}]` : ''}`;

/** The compact catalogue (D21): every block in a line or two, presets and themes by key, the style keys. */
const catalogue = () => {
	const m = loadManifest();
	const blocks = m.blocks
		.map(b => {
			const slots = Object.entries(b.slots || {})
				.map(([k, s]) => (k === 'children' ? `children${s.allow?.length ? `(${s.allow.join('|')})` : ''}` : `${k}${s.allow?.length ? `(${s.allow.join('|')})` : ''}`))
				.join(', ');
			return `- ${b.type} — ${b.label}: ${b.aiHint || b.description}\n  props: ${b.props.map(propLine).join(', ') || '—'}${slots ? ` · slots: ${slots}` : ''}${b.canBeChildOf?.length ? ` · only inside ${b.canBeChildOf.join('|')}` : ''}${b.actions ? ' · takes an action' : ''}`;
		})
		.join('\n');
	const byCat = new Map<string, string[]>();
	for (const p of m.presets) byCat.set(p.category, [...(byCat.get(p.category) || []), `${p.key} (${p.label})`]);
	const presets = [...byCat.entries()].map(([c, list]) => `- ${c}: ${list.join(', ')}`).join('\n');
	const themes = m.themes.map(t => `- ${t.key} — ${t.label}: ${t.description}`).join('\n');
	const style = Object.entries(m.style)
		.map(([k, s]) => `${k}${s.values?.length ? `(${s.values.slice(0, 14).join('|')})` : s.kind === 'space' ? '(space step)' : s.kind === 'color' ? '(colour token)' : ''}`)
		.join(', ');
	return { blocks, presets, themes, style, limits: m.limits };
};

const GUIDE = (project: any) => {
	const c = catalogue();
	return `# Building "${project.name}" in the site builder

The site is made of pages; a page is a tree of blocks (nodes). Build it here with these tools — the user then sees and edits it in the visual editor (${builderUrl(project)}), and nothing goes live until it's published.

## Where the content goes (always)
- Texts, headings, button labels, pictures of each section → **Contents** records (/web-contents), one record per piece, with a stable slug like "home-hero". Save them with set_site_contents, then bind the blocks to them: \`"bind": { "text": { "from": "content", "slug": "home-hero", "field": "content" } }\`. The team then edits the words in the panel's Contents table. Fields: content (main text), subContent, btnText, url, image, richContent (HTML), list (strings), card ([{image,title,subTitle,description}]). Contents need no public API.
- Each page's SEO → its **SEO** record: send \`seo\` with save_site_page (title ≤ 120, description ≤ 320, image, keywords).
- The theme, colour scheme, colours and fonts → the **Site design** record: set_site_design.
- Anything that repeats or grows — services, team, products, projects, testimonials, FAQs, posts — is a **model of its own**: plan_feature then build_feature with publicApi {"enabled": true, "actions": ["list","get"]} (or set_public_api on an existing one), fill it with create_records (matchOn "slug"), and show it with a \`collection\` block. **A list model must have public list and get, or the site can't show it** (check_site says so).
- Detail pages for a list: a template page — path "/services/[slug]", kind "template", source { "model": "<route>", "match": { "param": "slug", "field": "slug" } }; inside it, bind to \`{ "from": "record", "field": "title" }\` or write "{{record.title}}".

## Steps
1. get_site_builder — pages, design, models, contents already here. Reuse; building again updates, never duplicates. For a new site, start_from_theme loads a theme's whole demo site (pages, a list model, contents) — then rewrite it for the business.
2. Agree the pages, sections and lists with the user (show them first).
3. set_site_design — theme (pick from the list below to suit the business), colours, fonts, header and footer.
4. Models for the lists (build_feature, publicApi on) + create_records.
5. set_site_contents — the words and pictures, per page.
6. save_site_page — one call per page: a tree built from presets ({"preset": "hero-centered"}) and blocks, bound to the contents and models, and its SEO. Use get_site_presets to see a preset's tree when you want to change it, get_site_blocks for a block's full settings.
7. check_site, fix what it lists; then tell the user to look in the editor and publish (or publish_site if the key allows it and the user said so).

## Nodes
{ "id"?: 4–32 of A-Za-z0-9_- (left out: made for you), "type", "name"?, "props": {…}, "bind"?: { prop: binding }, "style"?: { "base"|"md"|"lg": { key: value } }, "children"?: [nodes], "slots"?: { name: [nodes] }, "action"?: { "type": "link", "href" } | { "type": "page", "pageId" } | { "type": "scroll"|"open"|"close"|"toggle", "target": nodeId } }
Bindings: { "from": "content", "slug", "field" } · { "from": "item", "field" } (inside a collection) · { "from": "record", "field" } (template pages) · { "from": "site", "field": "name"|"tagline"|"email"|"phone"|"address" }. Text may also hold "{{item.title}}", "{{record.price | money}}", "{{content.home-hero.content}}" — filters date, money, number, upper, lower, truncate:n, default:'…'.
A collection: { "type": "collection", "props": { "source": { "model": "services", "sort": "-createdAt", "pageSize": 6, "filter": { "featured": true } }, "columns": 3 }, "children": [ one card bound to item fields ] }.
Edits: save_site_page with "ops": [{ "op": "insert", "parentId": id|null, "index"?, "slot"?, "node" } | { "op": "update", "id", "props"?, "bind"?, "style"?, "action"? } | { "op": "move", "id", "parentId", "index" } | { "op": "remove", "id" }].
Limits: ${c.limits.maxNodes} blocks, depth ${c.limits.maxDepth}. Images: URLs from upload_media (or https). Props marked * can be bound to data.

## Themes
${c.themes}

## Presets (ready sections — insert with {"preset": "<key>"})
${c.presets}

## Blocks
${c.blocks}

## Style keys (per screen size base / md / lg)
${c.style}`;
};

/* -------------------------------------------------------------- trees */

/** `{ preset: key }` items replaced by the preset's blocks; ids filled in where missing; presets' ids made fresh. */
const expandTree = (tree: any[], problems: string[]): any[] => {
	const out: any[] = [];
	const fill = (nodes: any[]): any[] =>
		(Array.isArray(nodes) ? nodes : []).map(n => {
			if (!n || typeof n !== 'object') return n;
			const copy: any = { ...n };
			if (typeof copy.id !== 'string' || !NODE_ID.test(copy.id)) copy.id = newId();
			if (!copy.props || typeof copy.props !== 'object') copy.props = {};
			if (Array.isArray(copy.children)) copy.children = fill(copy.children);
			if (copy.slots && typeof copy.slots === 'object') copy.slots = Object.fromEntries(Object.entries<any>(copy.slots).map(([k, v]) => [k, fill(v)]));
			return copy;
		});
	for (const n of Array.isArray(tree) ? tree : []) {
		if (n && typeof n === 'object' && typeof n.preset === 'string') {
			const nodes = presetTree(n.preset);
			if (!nodes.length) problems.push(`There is no preset “${n.preset}”`);
			out.push(...nodes);
		} else out.push(...fill([n]));
	}
	return out;
};

/** A page tree checked as the editor's save checks it: errors refuse, publish-only problems come back. */
const checkPageTree = async (tree: any[], layoutKey: string) => {
	const design: any = await SiteDesign.findOne({}, { 'draft.layouts': 1, 'draft.sections': 1 }).lean();
	const layout = layoutKey === 'none' ? null : design?.draft?.layouts?.[layoutKey || 'default'];
	const pages = await SitePage.find({ deletedAt: null }, { _id: 1 }).lean();
	return validateTree(tree, {
		externalIds: layout ? treeIds(layout.header, treeIds(layout.footer)) : undefined,
		pageIds: new Set(pages.map((p: any) => String(p._id))),
		sectionIds: new Set(Object.keys(design?.draft?.sections || {})),
	}).problems;
};

const findPage = async (ref: unknown) => {
	const s = String(ref || '').trim();
	if (!s) return null;
	if (/^[a-f0-9]{24}$/i.test(s)) {
		const byId: any = await SitePage.findOne({ _id: s, deletedAt: null }).lean();
		if (byId) return byId;
	}
	return SitePage.findOne({ path: s.startsWith('/') ? s : `/${s}`, deletedAt: null }).lean();
};

/* -------------------------------------------------------------- tools */

const getBuilder = async (req: any, _args: any, caller: Caller): Promise<Out> => {
	await ensureSite();
	const [design, pages, models, contents]: any = await Promise.all([pullDesign(), livePages().then(pullSeo), dataModels(), contentList()]);
	const d = design?.draft || {};
	const data = {
		editor: builderUrl(caller.project),
		live: siteUrl(caller.project),
		pages: pages.map((p: any) => ({ ...pageSummary(p), source: p.source || null, seoTitle: p.draft?.seo?.title || '' })),
		design: { theme: d.theme, colorScheme: d.colorScheme, tokens: d.tokens, layouts: Object.keys(d.layouts || {}), sections: Object.entries<any>(d.sections || {}).map(([id, s]) => ({ id, name: s.name })) },
		models: models.map((m: any) => ({ model: m.model, title: m.title, list: m.list, get: m.get, problem: m.problem, fields: m.fields.map((f: any) => `${f.key}:${f.kind}`) })),
		contents: contents.items.map((c: any) => ({ slug: c.slug, name: c.name, section: c.section, category: c.category })),
	};
	const text = [
		`Editor: ${data.editor}${data.live ? ` · live at ${data.live}` : ''}`,
		`Theme: ${d.theme} (${d.colorScheme || 'light'}) · layouts: ${data.design.layouts.join(', ') || '—'} · saved sections: ${data.design.sections.map((s: any) => s.name).join(', ') || '—'}`,
		`\nPages:\n${data.pages.map((p: any) => `- ${p.name} ${p.path}${p.kind === 'template' ? ` (template of ${p.source?.model})` : ''} — ${p.status}${p.changed ? ', changed' : ''} [id ${p.id}]`).join('\n')}`,
		`\nModels (a list on the site needs list ✓):\n${data.models.map((m: any) => `- ${m.title} /${m.model} — list ${m.list ? '✓' : '✗'} get ${m.get ? '✓' : '✗'} · ${m.fields.join(', ')}`).join('\n') || '—'}`,
		`\nContents: ${data.contents.map((c: any) => c.slug).join(', ') || '—'}`,
	].join('\n');
	return { text, data };
};

const getPage = async (_req: any, args: any, caller: Caller): Promise<Out> => {
	const page = await findPage(args.page);
	if (!page) return refuse(`No page “${args.page}” — get_site_builder lists them`);
	const [fresh] = await pullSeo([page]);
	const view = pageView(fresh);
	return { text: JSON.stringify({ ...view, editor: builderUrl(caller.project, view.id) }), data: { ...view, editor: builderUrl(caller.project, view.id) } };
};

const PAGE_KEYS = ['name', 'kind', 'source', 'layout', 'showInMenu', 'menuLabel', 'priority'] as const;

const savePage = async (req: any, args: any, caller: Caller): Promise<Out> => {
	await ensureSite();
	const path = String(args.path || '').trim();
	if (!path) return refuse('Name the page’s path, e.g. "/" or "/services"');
	const existing: any = await findPage(args.pageId || path);
	const fields: any = Object.fromEntries(PAGE_KEYS.filter(k => args[k] !== undefined).map(k => [k, typeof args[k] === 'string' ? args[k].trim() : args[k]]));
	if (!existing && !fields.name) fields.name = path === '/' ? 'Home' : path.split('/').filter(Boolean).pop()!.replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase());
	if (existing && existing.path !== path) fields.path = path;
	if (!existing) fields.path = path;

	const expandProblems: string[] = [];
	let tree: any[] = existing?.draft?.tree || [];
	if (args.tree !== undefined) {
		if (!Array.isArray(args.tree)) return refuse('tree must be a list of blocks');
		tree = expandTree(args.tree, expandProblems);
	}
	if (expandProblems.length) return refuse(expandProblems.join('\n'));
	if (args.ops !== undefined) {
		try {
			const ops = (Array.isArray(args.ops) ? args.ops : []).map((o: any) => (o?.op === 'insert' || o?.op === 'wrap' ? { ...o, node: expandTree([o.node], expandProblems)[0] } : o));
			tree = applyOps(tree, ops);
		} catch (e: any) {
			if (e instanceof OpsError) return refuse(e.message);
			throw e;
		}
	}

	const layouts = Object.keys(((await SiteDesign.findOne({}, { 'draft.layouts': 1 }).lean()) as any)?.draft?.layouts || {});
	const check = validatePageFields({ kind: existing?.kind || 'static', ...fields, seo: args.seo }, { layouts });
	if (!check.ok) return refuse(`The page wasn’t saved:\n${problemLines(check.problems)}`, { problems: check.problems });
	if (existing?.isHome && fields.path && fields.path !== '/') return refuse('The home page stays at /');
	if (fields.path && (await SitePage.exists({ path: fields.path, deletedAt: null, ...(existing && { _id: { $ne: existing._id } }) })))
		return refuse(`Another page is already at ${fields.path}`);

	const problems = await checkPageTree(tree, fields.layout ?? existing?.layout ?? 'default');
	const errors = problems.filter(p => p.level === 'error');
	if (errors.length) return refuse(`The page has problems — nothing was saved:\n${problemLines(errors)}`, { problems: errors });

	const seo = args.seo && typeof args.seo === 'object' ? { ...EMPTY_SEO, ...(existing?.draft?.seo || {}), ...args.seo } : null;
	let saved: any;
	if (existing) {
		const $set: any = { ...fields, 'draft.tree': tree, 'draft.updatedAt': new Date(), 'draft.updatedBy': caller.user._id };
		if (seo) $set['draft.seo'] = seo;
		saved = await SitePage.findOneAndUpdate({ _id: existing._id }, { $set, $inc: { 'draft.rev': 1 } }, { new: true }).lean();
	} else {
		const doc = await SitePage.create({
			kind: 'static',
			...fields,
			isHome: false,
			draft: { tree, seo: seo || { ...EMPTY_SEO }, rev: 1, updatedAt: new Date(), updatedBy: caller.user._id },
		});
		saved = doc.toObject();
	}
	await (seo ? pushSeo(saved, saved.draft.seo) : pushPage(saved));
	recordProjectEvent({
		req,
		action: existing ? 'update' : 'create',
		model: 'Site page',
		modelPath: 'site-builder',
		document: saved._id,
		name: saved.name,
		text: `${existing ? 'changed' : 'added'} the page “${saved.name}” (${saved.path}) through the AI`,
	});
	// Lists and template pages whose model the site can't read (turn on its public API).
	const rest = [...problems.filter(p => p.level !== 'error'), ...(await dataProblems([saved], null)).map(({ part, page, pageName, ...p }) => p as Problem)];
	const editor = builderUrl(caller.project, String(saved._id));
	return {
		text: `${existing ? 'Saved' : 'Added'} “${saved.name}” (${saved.path}) — ${JSON.stringify(tree).length > 2 ? `${countNodes(tree)} blocks` : 'empty'}. Open it: ${editor}${rest.length ? `\nStill to fix before publishing:\n${problemLines(rest)}` : ''}`,
		data: { page: pageSummary(saved), editor, problems: rest },
	};
};

const countNodes = (nodes: any[]): number => (nodes || []).reduce((n, x) => n + 1 + countNodes(x?.children || []) + Object.values<any>(x?.slots || {}).reduce((m, s) => m + countNodes(s), 0), 0);

const setDesign = async (req: any, args: any, caller: Caller): Promise<Out> => {
	await ensureSite();
	await ensureDesignModel(req);
	const design: any = await pullDesign();
	const draft = design.draft || {};
	const patch: any = {};
	if (args.theme !== undefined) patch.theme = args.theme;
	if (args.colorScheme !== undefined) patch.colorScheme = args.colorScheme;
	if (args.tokens !== undefined) patch.tokens = args.replaceTokens ? args.tokens : deepMerge(draft.tokens || {}, args.tokens || {});
	const layoutKey = typeof args.layout === 'string' && args.layout ? args.layout : 'default';
	const problemsOut: string[] = [];
	for (const part of ['header', 'footer'] as const) {
		if (args[part] === undefined) continue;
		const value = typeof args[part] === 'string' ? [{ preset: args[part] }] : args[part];
		const tree = expandTree(Array.isArray(value) ? value : [], problemsOut);
		patch.layouts = patch.layouts || { ...(draft.layouts || {}) };
		patch.layouts[layoutKey] = { ...(patch.layouts[layoutKey] || { header: [], footer: [] }), [part]: tree };
	}
	if (problemsOut.length) return refuse(problemsOut.join('\n'));
	if (!Object.keys(patch).length) return refuse('Send theme, colorScheme, tokens, header or footer');
	const pages = await SitePage.find({ deletedAt: null }, { _id: 1 }).lean();
	const r = validateDesign(patch, { pageIds: new Set(pages.map((p: any) => String(p._id))), sectionIds: new Set(Object.keys(draft.sections || {})) });
	const errors = r.problems.filter(p => p.level === 'error');
	if (errors.length) return refuse(`The design has problems — nothing was saved:\n${problemLines(errors)}`, { problems: errors });
	const $set = Object.fromEntries(Object.entries(patch).map(([k, v]) => [`draft.${k}`, v]));
	const saved: any = await SiteDesign.findOneAndUpdate({ _id: design._id }, { $set, $inc: { 'draft.rev': 1 } }, { new: true }).lean();
	await pushDesign(saved.draft);
	recordProjectEvent({ req, model: 'Site design', modelPath: 'site-builder', document: saved._id, name: 'Design', text: `changed the site design through the AI${patch.theme ? ` (theme ${patch.theme})` : ''}` });
	return {
		text: `Design saved — theme ${saved.draft.theme}, ${saved.draft.colorScheme || 'light'}. It's in the Site design record and the editor's Design tab: ${builderUrl(caller.project)}`,
		data: designView(saved),
	};
};

const deepMerge = (a: any, b: any): any => {
	if (!b || typeof b !== 'object' || Array.isArray(b)) return b;
	const out: any = { ...(a && typeof a === 'object' ? a : {}) };
	for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k], v) : v;
	return out;
};

const setContents = async (_req: any, args: any, caller: Caller): Promise<Out> => {
	if (!Array.isArray(args.records) || !args.records.length || args.records.length > 100) return refuse('Send records: 1 to 100 contents, each with a slug');
	const page = args.page ? await findPage(args.page) : null;
	if (args.page && !page) return refuse(`No page “${args.page}”`);
	try {
		const records = await upsertContents(args.records, page);
		return {
			text: `Saved ${records.length} content record(s): ${records.map((r: any) => r.slug).join(', ')}. Bind blocks to them with { "from": "content", "slug", "field" }.`,
			data: { records: records.map((r: any) => ({ _id: r._id, slug: r.slug, name: r.name })), editor: builderUrl(caller.project) },
		};
	} catch (e: any) {
		return refuse(e?.message || 'The contents weren’t saved');
	}
};

const checkSite = async (_req: any, _args: any, caller: Caller): Promise<Out> => {
	await ensureSite();
	await Promise.all([pullDesign(), livePages().then(pullSeo)]);
	const c: any = await siteChanges();
	const lines = [
		c.canPublish ? 'Ready to publish.' : 'Not ready to publish — fix these first:',
		problemLines(c.problems.map((p: any) => ({ ...p, message: `${p.part === 'design' ? 'Design' : p.pageName}: ${p.message}` }))),
		`New: ${c.pages.added.map((p: any) => p.path).join(', ') || '—'} · changed: ${c.pages.changed.map((p: any) => p.path).join(', ') || '—'} · removed: ${c.pages.removed.map((p: any) => p.path).join(', ') || '—'}${c.design ? ' · the design changed' : ''}`,
		c.live ? `Live now: version ${c.live.version}.` : 'Nothing is live yet.',
		`Editor: ${builderUrl(caller.project)}`,
	].filter(Boolean);
	return { text: lines.join('\n'), data: c };
};

const publish = async (req: any, args: any, caller: Caller): Promise<Out> => {
	await ensureSite();
	await Promise.all([pullDesign(), livePages().then(pullSeo)]);
	try {
		const out = await publishSite({ req, project: caller.project, note: typeof args.note === 'string' ? args.note.trim() : '' });
		for (const p of await livePages()) await pushPage(p);
		return { text: `Published version ${out.version}${out.url ? ` — live at ${out.url}` : ''}.`, data: out };
	} catch (e: any) {
		return refuse(e?.message || 'Not published', e?.extra);
	}
};

const startFromTheme = async (req: any, args: any, caller: Caller): Promise<Out> => {
	await ensureDesignModel(req);
	try {
		const out = await applyStarter(req, String(args.theme || ''), { replace: args.replace === true });
		return {
			text: `Loaded the ${out.theme} demo site (dressed as “${out.business}”): ${out.pages.map(p => `${p.name} ${p.path}`).join(', ')}; the ${out.list.title} model (public list/get on) with sample records; ${out.contents} Contents records bound to the blocks. Now change the words (set_site_contents on the same slugs — get_site_builder lists them), the list's records (create_records with matchOn "slug") and the design. Editor: ${builderUrl(caller.project, out.home)}`,
			data: out,
		};
	} catch (e: any) {
		return refuse(e?.message || 'The demo site wasn’t loaded');
	}
};

const blocksTool = async (_req: any, args: any): Promise<Out> => {
	const m = loadManifest();
	const types: string[] = Array.isArray(args.types) ? args.types : [];
	const found = m.blocks.filter(b => types.includes(b.type));
	if (!found.length) return refuse(`Name blocks by type: ${m.blocks.map(b => b.type).join(', ')}`);
	return { text: JSON.stringify(found), data: { blocks: found } };
};

const presetsTool = async (_req: any, args: any): Promise<Out> => {
	const m = loadManifest();
	const keys: string[] = Array.isArray(args.keys) ? args.keys : [];
	const found = m.presets.filter(p => keys.includes(p.key) || (args.category && p.category === args.category)).slice(0, 12);
	if (!found.length) return refuse('Name presets by key, or a category — site_builder_guide lists them');
	const out = found.map(p => ({ key: p.key, label: p.label, category: p.category, tree: p.tree }));
	return { text: JSON.stringify(out), data: { presets: out } };
};

/* ------------------------------------------------------------ the list */

const PAGE_TREE = { type: 'array', description: 'The page’s blocks, top level first. An item may be {"preset": "<key>"} for a ready section.', items: { type: 'object' } };

export const SITE_BUILDER_TOOLS: ToolDef[] = [
	{
		name: 'site_builder_guide',
		title: 'How to build in the site builder',
		description:
			'For website projects: how to build the site in the visual site builder — where content goes (Contents, SEO, Site design records; list models with a public API), the steps, the node format, bindings, and the catalogue of themes, presets and blocks. Read it once before building or changing the site.',
		scope: 'read',
		only: 'website',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: async (_req, _args, caller) => ({ text: GUIDE(caller.project) }),
	},
	{
		name: 'get_site_builder',
		title: 'Read the site',
		description: 'The site in the builder now: its pages (with ids, paths, status), the design (theme, colours, layouts, saved sections), the project’s models (and whether the site may show them) and the Contents records — plus the editor’s link.',
		scope: 'read',
		only: 'website',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: getBuilder,
	},
	{
		name: 'get_site_page',
		title: 'Read a page',
		description: 'One page’s draft: its blocks (tree), SEO, kind and source — by path ("/about") or id.',
		scope: 'read',
		only: 'website',
		inputSchema: { type: 'object', required: ['page'], properties: { page: { type: 'string', description: 'The path or the id' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: getPage,
	},
	{
		name: 'get_site_blocks',
		title: 'Blocks in full',
		description: 'The full settings of some blocks: every prop with its options and defaults, slots, where they may go.',
		scope: 'read',
		only: 'website',
		inputSchema: { type: 'object', required: ['types'], properties: { types: { type: 'array', items: { type: 'string' }, maxItems: 12 } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: blocksTool,
	},
	{
		name: 'get_site_presets',
		title: 'Preset sections',
		description: 'Ready sections’ trees (up to 12), by key or by category — to change one before placing it.',
		scope: 'read',
		only: 'website',
		inputSchema: { type: 'object', properties: { keys: { type: 'array', items: { type: 'string' } }, category: { type: 'string' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: presetsTool,
	},
	{
		name: 'set_site_design',
		title: 'Set the design',
		description:
			'The site’s look, saved in the Site design record: theme (a key from site_builder_guide), colorScheme (light|dark|system), tokens to change (merged: e.g. {"colors": {"primary": {"light": "#0f766e"}}, "fonts": {"heading": {"family": "Playfair Display"}}}; replaceTokens to replace), and the header and footer — a preset key ("header-simple") or a tree — of a layout (default "default").',
		scope: 'build',
		only: 'website',
		inputSchema: {
			type: 'object',
			properties: {
				theme: { type: 'string' },
				colorScheme: { type: 'string', enum: ['light', 'dark', 'system'] },
				tokens: { type: 'object' },
				replaceTokens: { type: 'boolean' },
				layout: { type: 'string' },
				header: { description: 'A preset key, or a tree', anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'object' } }] },
				footer: { description: 'A preset key, or a tree', anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'object' } }] },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: setDesign,
	},
	{
		name: 'set_site_contents',
		title: 'Save contents',
		description:
			'The site’s words and pictures as Contents records (/web-contents), added or updated by slug — the panel’s Contents table edits them afterwards. Each: slug (lowercase-dashes, unique), name, section, category (content|rich-content|list|card|image|gallery|video|…), content, subContent, btnText, url, image, richContent (HTML), list, card [{image,title,subTitle,description}], priority. `page` (path) files them under that page. Then bind blocks: {"from": "content", "slug", "field"}.',
		scope: 'build',
		only: 'website',
		inputSchema: {
			type: 'object',
			required: ['records'],
			properties: { page: { type: 'string', description: 'The page’s path, e.g. "/"' }, records: { type: 'array', maxItems: 100, items: { type: 'object', required: ['slug'] } } },
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: setContents,
	},
	{
		name: 'save_site_page',
		title: 'Create or change a page',
		description:
			'One page by its path — made if it isn’t there: name, its blocks (tree replaces them all; ops change some), SEO (saved in its SEO record), menu (showInMenu, menuLabel, priority), layout, and for a template page kind "template" with source {model, match: {param, field}} and a path like "/services/[slug]". Checked like the editor’s save: nothing is saved if anything is wrong. Nothing goes live until it’s published.',
		scope: 'build',
		only: 'website',
		inputSchema: {
			type: 'object',
			required: ['path'],
			properties: {
				path: { type: 'string', description: '"/", "/about", "/services/[slug]"' },
				pageId: { type: 'string', description: 'To move a page to a new path: its id' },
				name: { type: 'string' },
				kind: { type: 'string', enum: ['static', 'template'] },
				source: { type: 'object', description: 'Template pages: {"model": "services", "match": {"param": "slug", "field": "slug"}}' },
				layout: { type: 'string' },
				showInMenu: { type: 'boolean' },
				menuLabel: { type: 'string' },
				priority: { type: 'number' },
				seo: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, image: { type: 'string' }, keywords: { type: 'array', items: { type: 'string' } }, noIndex: { type: 'boolean' } } },
				tree: PAGE_TREE,
				ops: { type: 'array', items: { type: 'object' }, description: 'insert / update / move / remove / wrap — see site_builder_guide' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: savePage,
	},
	{
		name: 'start_from_theme',
		title: 'Start from a theme’s demo site',
		description: `Loads a theme's whole demo site in place of the pages — home and the other pages built from presets, a list model that suits it (menu, services, products, classes, posts, projects, features) with sample records and its public API on, every text as a Contents record bound to its block. The quickest start: then rewrite the words and records for the user's business. replace: true is needed when the site already has pages (they go off the site at the next Publish). Themes: ${Object.entries(starterSummaries()).map(([k, v]) => `${k} (${v.business}: ${v.pages.join(', ')})`).join('; ')}.`,
		scope: 'build',
		only: 'website',
		inputSchema: { type: 'object', required: ['theme'], properties: { theme: { type: 'string' }, replace: { type: 'boolean' } } },
		annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
		run: startFromTheme,
	},
	{
		name: 'check_site',
		title: 'Check the site',
		description: 'What Publish would change and what stops it: blocks with problems, lists whose model the site can’t read (turn on its public API), template pages without a model.',
		scope: 'read',
		only: 'website',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: checkSite,
	},
	{
		name: 'publish_site',
		title: 'Publish the site',
		description: 'Makes the drafts live (pages, design) as a new version. Only when the user asks — and only with a key that has the “publish” scope.',
		scope: 'publish',
		only: 'website',
		inputSchema: { type: 'object', properties: { note: { type: 'string', description: 'What changed, e.g. "First version"' } } },
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		run: publish,
	},
];

/** The paragraph a website project's AI gets in the server instructions. */
export const SITE_BUILDER_INSTRUCTIONS = `

The site is built in MINT's visual SITE BUILDER (the user edits it at builder.mintapp.shop). To build or change it, read site_builder_guide first and use the site builder tools: set_site_design (theme, colours, header, footer — kept in the Site design record), set_site_contents (the words and pictures — Contents records the blocks bind to), save_site_page (pages built from presets and blocks, SEO in each page's SEO record), and for lists (services, team, products…) a model of its own with build_feature (publicApi list + get on) and create_records, shown with a collection block. Every list model the site shows needs its public API on (list, get); Contents don't. Show the user the plan before writing, and run check_site at the end. Publish only when the user asks. (describe_website is for sites written as code instead.)`;

/** "Build my site" — the prompt the user picks in their AI client (MCP prompts). */
export const SITE_PROMPTS = (project: any) => {
	const themes = loadManifest().themes;
	return [
		{
			name: 'build_site',
			title: 'Build my site',
			description: `Build ${project.name}'s website in the site builder with a theme — pages, contents, lists, SEO.`,
			arguments: [
				{ name: 'brief', description: 'What the business does and what the site needs (pages, services, tone)', required: true },
				{ name: 'theme', description: `A theme: ${themes.map(t => t.key).join(', ')} (left out: the AI picks one)`, required: false },
			],
			render: (args: Record<string, string>) => {
				const theme = themes.find(t => t.key === String(args.theme || '').trim());
				return `Build the website for "${project.name}" in MINT's site builder.

About it: ${String(args.brief || '').trim() || '(ask me)'}

${theme ? `Use the ${theme.label} theme (${theme.key}) — ${theme.description}` : 'Pick the theme that suits the business and tell me why.'}

How:
1. Read site_builder_guide and get_site_builder.
2. Propose the pages, each page's sections, and the lists that need a model of their own (services, team, testimonials…). Wait for my OK.
3. If the site is still blank, start_from_theme with that theme for a full demo to work from; then set_site_design for the colours, fonts, header and footer.
4. Build the list models with their public API on (list, get) and fill them with create_records.
5. Save every text and picture as Contents records (set_site_contents) and bind the blocks to them, so I can edit the words in the panel.
6. save_site_page for each page with its SEO; template pages for detail pages of a list.
7. check_site, fix what it lists, and give me the editor link. Don't publish unless I say so.`;
			},
		},
		{
			name: 'add_site_list',
			title: 'Add a list to my site',
			description: 'A model of its own (services, team, products…) with its public API on, filled, and shown on a page.',
			arguments: [
				{ name: 'what', description: 'What the list is, e.g. "our services with a price and a picture"', required: true },
				{ name: 'page', description: 'The page it goes on, e.g. "/services"', required: false },
			],
			render: (args: Record<string, string>) =>
				`On my site in MINT's site builder, add ${String(args.what || 'a list').trim()}${args.page ? ` on ${args.page}` : ''}. Read site_builder_guide first. Make it a model of its own with build_feature (public API on: list and get — the site can't show it otherwise), fill it with create_records, then show it with a collection block bound to its fields, and add a template page for each record if it needs a detail page. Show me the model's fields before building it.`,
		},
	];
};
