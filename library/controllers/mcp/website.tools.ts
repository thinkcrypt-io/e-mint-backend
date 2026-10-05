import dns from 'dns/promises';
import net from 'net';
import mongoose from 'mongoose';
import sharp from 'sharp';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import TenantProject from '../../models/tenancy/tenantProject.model.js';
import File from '../../models/admin-file/model.js';
import { compiledModel, generateSettings, makeTargetLookup, syncDynamicModels } from '../../functions/dynamicModels.function.js';
import { getActiveSettings } from '../../functions/resolveRoute.function.js';
import { dataToSettings, scopedModel } from '../../functions/routeRegistry.function.js';
import { applyFormulas, formulasOf } from '../../functions/formula.function.js';
import { isAccessRestricted } from '../../functions/recordAccess.function.js';
import { runInScope } from '../../functions/tenantScope.function.js';
import { MODEL_KEY } from '../../functions/projectIndexes.function.js';
import { getS3, resolveUploadFolder } from '../../../routes-admin/file/media.helpers.js';
import { PUBLIC_API, mergedPublicApi, readOnlyProblem } from '../builder/models.controller.js';
import { routePermission } from '../builder/builder.controller.js';
import { PROTECTED_ROUTES } from '../builder/validate.js';
import { refIds } from './records.helpers.js';
import { FLAT, TRACKERS, forgetSite, loadSite, patchFromFlat, publicConfig, publicSettings, saveSite } from '../../functions/siteConfig.function.js';
import type { Caller, ToolDef } from './mcp.router.js';

/**
 * The MCP tools that make a site an AI builds into a managed website
 * (docs/multi-tenancy WO-33): "the user creates a website with Claude Code,
 * deploys it and instantly has an admin panel".
 *
 * While the AI builds, everything the site shows goes into the project — the
 * settings (name, logo, favicon, colours, contact, socials, default SEO), each
 * page with its SEO and its content blocks in order, the images (into the
 * project's media library), and the longer lists as models of their own with a
 * public API. The site's code reads all of it from the site API, so after the
 * deploy it's edited from the panel with no code change.
 *
 * Writes are upserts — by page path, by a block's slug on its page, by a
 * record's `matchOn` field — so building the site again updates instead of
 * duplicating. Every write is checked before anything is saved.
 */

type Out = { text: string; data?: any; isError?: boolean };
const refuse = (text: string): Out => ({ text, isError: true });

/* ------------------------------------------------------------ addresses */

/** Where the site reaches the API: PUBLIC_API_URL, or this server as the request saw it. */
export const apiOrigin = (req: any) =>
	String(process.env.PUBLIC_API_URL || `${String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0]}://${req.get('host')}`).replace(/\/$/, '');

const publicBase = (req: any, project: any) => `${apiOrigin(req)}/public/api/${project.publicSlug}`;

/* ------------------------------------------------------------ the kit */

const KIT = { pages: 'pages', seo: 'seo', contents: 'web-contents' } as const;

type Kit = { def: any; Model: mongoose.Model<any> };

/** One of the website kit's models in this project (the builder may have removed it). */
const kitModel = async (route: string): Promise<Kit | null> => {
	const def: any = await ModelDefinition.findOne({ route }).lean();
	const Model = def ? compiledModel(def.name) : null;
	return def && Model ? { def, Model } : null;
};

const missingKit = (route: string) =>
	refuse(`This project's website kit has no /${route} model any more — it was renamed or deleted in the model builder, so this tool can't write it.`);

/** A record as the site API returns it: _id and the model's own fields. */
const shape = (doc: any, def: any) => {
	if (!doc) return null;
	const out: any = { _id: String(doc._id) };
	for (const f of def.fields) if (doc[f.key] !== undefined) out[f.key] = doc[f.key];
	return out;
};

/* ------------------------------------------------------- record writes */

/** The model's formulas, as its form and API apply them. */
const formulasFor = async (req: any, def: any) => {
	const published: any = await getActiveSettings(def.route);
	const settings = published?.data ? dataToSettings(published.data) : generateSettings(def, makeTargetLookup(req.app, [def]));
	return formulasOf(settings);
};

/** Never taken from the AI: who owns a record and who it's shared with. */
const NOT_WRITABLE = new Set(['_id', 'code', 'createdAt', 'updatedAt', 'addedBy', 'access', 'archivedAt', 'archivedBy', '_customer']);

/** Linked records already looked up in this call, by model and name — many records link the same few. */
type RefCache = Map<string, string[]>;

/**
 * `input` cut down to the model's own writable fields, links resolved (an id,
 * or the linked record's name / title / code). Collects unknown keys and links
 * that name nothing.
 */
const pickFields = async (def: any, input: any, omit: string[] = [], refCache?: RefCache) => {
	const body: any = {};
	const skipped: string[] = [];
	const problems: string[] = [];
	const byKey = new Map<string, any>(def.fields.map((f: any) => [f.key, f]));
	for (const [key, value] of Object.entries<any>(input && typeof input === 'object' ? input : {})) {
		const f = byKey.get(key);
		if (omit.includes(key)) continue;
		if (!f || f.kind === 'formula' || NOT_WRITABLE.has(key)) {
			if (key !== 'privacy' || !def.access?.enabled) {
				skipped.push(key);
				continue;
			}
		}
		if (value === undefined) continue;
		if ((f?.kind === 'reference' || f?.kind === 'references') && value !== null && value !== '') {
			const Ref = scopedModel(f.ref);
			if (!Ref) {
				problems.push(`${key}: links to ${f.ref}, which isn't a model here`);
				continue;
			}
			const wanted = ([] as any[]).concat(value);
			const cacheKey = `${f.ref}\u0000${wanted.map(String).join('\u0000')}`;
			const ids = refCache?.get(cacheKey) || (await refIds(Ref, wanted));
			refCache?.set(cacheKey, ids);
			if (ids.length < wanted.length) {
				problems.push(`${key}: no ${f.ref} called ${wanted.filter(v => !ids.includes(String(v))).map(v => `“${v}”`).join(', ')}`);
				continue;
			}
			body[key] = f.kind === 'reference' ? ids[0] : ids;
			continue;
		}
		body[key] = value;
	}
	return { body, skipped, problems };
};

/** A Mongoose validation error as short sentences. */
const validationProblems = (doc: any, prefix = '') => {
	const err: any = doc.validateSync();
	return Object.entries<any>(err?.errors || {}).map(([path, e]) => {
		const why =
			e?.kind === 'required'
				? 'is required'
				: e?.kind === 'enum'
				? `“${e?.value}” isn't allowed${e?.properties?.enumValues?.length ? ` — use ${e.properties.enumValues.join(', ')}` : ''}`
				: e?.name === 'CastError'
				? `“${e?.value}” isn't a valid ${String(e?.kind || 'value').toLowerCase()}`
				: String(e?.message || 'is invalid').replace(/^Path `[^`]+` /, '');
		return `${prefix}${path} ${why}`;
	});
};

const ownedBy = (Model: mongoose.Model<any>, caller: Caller) => (Model.schema.path('addedBy') ? { addedBy: caller.user._id } : {});

/** May the key's owner add and change this model's records (the role's Records: Add and Edit)? */
const mayWrite = (req: any, caller: Caller, route: string) => {
	const permission = routePermission(req.app, route) || route;
	const missing = ['create', 'edit'].filter(a => !caller.allows(`${a}-${permission}`));
	return missing.length ? `${caller.user.name || 'The key’s owner'} can't ${missing.join(' or ')} /${route} records (their role needs Records: ${missing.map(a => (a === 'create' ? 'Add' : 'Edit')).join(' and ')}).` : null;
};

/** Saves checked documents in order; if one fails, the ones it created are taken back. */
const saveAll = async (docs: { doc: any; Model: mongoose.Model<any>; isNew: boolean }[]) => {
	const created: { Model: mongoose.Model<any>; id: any }[] = [];
	for (const d of docs) {
		try {
			await d.doc.save();
			if (d.isNew) created.push({ Model: d.Model, id: d.doc._id });
		} catch (e: any) {
			for (const c of created.reverse()) await c.Model.deleteOne({ _id: c.id }).catch(() => undefined);
			throw e;
		}
	}
};

const saveFailure = (e: any) =>
	refuse(
		e?.code === 11000
			? `Nothing saved — a record with that ${Object.keys(e.keyValue || {}).filter(k => k !== MODEL_KEY).join(', ') || 'value'} already exists.`
			: `Nothing saved — ${e?.message || 'the save failed'}.`
	);

/* -------------------------------------------------------------- pages */

const normalizePath = (raw: any) => {
	let p = String(raw ?? '').trim();
	if (!p) return '';
	try {
		if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
	} catch {
		/* kept as written */
	}
	p = `/${p.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
	return p.length > 1 ? p.replace(/\/+$/, '') : p;
};

const slugify = (s: any) =>
	String(s ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);

const nameFromPath = (path: string) =>
	path === '/'
		? 'Home'
		: path
				.split('/')
				.filter(Boolean)
				.pop()!
				.replace(/[-_]+/g, ' ')
				.replace(/^\w/, c => c.toUpperCase());

/** Exported for the template apply engine (docs/templates T-03), which calls it with its own caller. */
export const upsertPage = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const path = normalizePath(args?.path);
	if (!path) return refuse('Give the page’s path, e.g. "/" or "/about".');
	const [pages, seo, contents] = await Promise.all([kitModel(KIT.pages), kitModel(KIT.seo), kitModel(KIT.contents)]);
	if (!pages) return missingKit(KIT.pages);
	if (args?.seo && !seo) return missingKit(KIT.seo);
	if (Array.isArray(args?.contents) && !contents) return missingKit(KIT.contents);
	for (const kit of [pages, args?.seo && seo, Array.isArray(args?.contents) && contents].filter(Boolean) as Kit[]) {
		const denied = mayWrite(req, caller, kit.def.route);
		if (denied) return refuse(denied);
	}

	const problems: string[] = [];
	const skipped = new Set<string>();
	const docs: { doc: any; Model: mongoose.Model<any>; isNew: boolean }[] = [];

	// The page, by path.
	const pageInput: any = { ...args };
	for (const k of ['seo', 'contents', 'removeOthers', 'parent']) delete pageInput[k];
	pageInput.path = path;
	const existing: any = await pages.Model.findOne({ path });
	if (!existing) {
		pageInput.name ??= nameFromPath(path);
		pageInput.status ??= 'published';
	}
	const pagePicked = await pickFields(pages.def, pageInput);
	pagePicked.skipped.forEach(k => skipped.add(k));
	problems.push(...pagePicked.problems);
	if (args?.parent !== undefined && pages.def.fields.some((f: any) => f.key === 'parent')) {
		const parentPath = normalizePath(args.parent);
		const parent: any = parentPath ? await pages.Model.findOne({ path: parentPath }, { _id: 1 }).lean() : null;
		if (parentPath && !parent) problems.push(`parent: no page at ${parentPath} yet — create it first`);
		else pagePicked.body.parent = parent?._id ?? null;
	}
	const page: any = existing || new pages.Model(ownedBy(pages.Model, caller));
	page.set(pagePicked.body);
	problems.push(...validationProblems(page, 'page.'));
	docs.push({ doc: page, Model: pages.Model, isNew: !existing });

	// Its SEO: one record pointing at it.
	if (args?.seo && seo) {
		const picked = await pickFields(seo.def, args.seo, ['page']);
		picked.skipped.forEach(k => skipped.add(`seo.${k}`));
		problems.push(...picked.problems.map(p => `seo.${p}`));
		const current: any = existing ? await seo.Model.findOne({ page: page._id }) : null;
		const doc: any = current || new seo.Model({ ...ownedBy(seo.Model, caller), page: page._id });
		doc.set(picked.body);
		problems.push(...validationProblems(doc, 'seo.'));
		docs.push({ doc, Model: seo.Model, isNew: !current });
	}

	// Its content blocks, by slug, in the order given (the site sorts by priority, highest first).
	const slugs: string[] = [];
	if (Array.isArray(args?.contents) && contents) {
		if (args.contents.length > 100) return refuse('A page takes up to 100 content blocks per call.');
		const n = args.contents.length;
		for (let i = 0; i < n; i++) {
			const block = args.contents[i] || {};
			const slug = slugify(block.slug || block.name);
			if (!slug) {
				problems.push(`contents[${i}] needs a slug (or a name) — the site finds the block by it`);
				continue;
			}
			if (slugs.includes(slug)) {
				problems.push(`contents[${i}]: the slug “${slug}” is used twice on this page`);
				continue;
			}
			slugs.push(slug);
			const picked = await pickFields(contents.def, { ...block, slug, name: block.name || slug }, ['page']);
			picked.skipped.forEach(k => skipped.add(`contents.${k}`));
			problems.push(...picked.problems.map(p => `contents[${i}].${p}`));
			if (block.priority === undefined) picked.body.priority = (n - i) * 10;
			const current: any = existing ? await contents.Model.findOne({ page: page._id, slug }) : null;
			const doc: any = current || new contents.Model({ ...ownedBy(contents.Model, caller), page: page._id });
			doc.set(picked.body);
			problems.push(...validationProblems(doc, `contents[${i}].`));
			docs.push({ doc, Model: contents.Model, isNew: !current });
		}
	}

	if (problems.length) return refuse(`Nothing saved:\n- ${problems.join('\n- ')}`);
	try {
		await saveAll(docs);
	} catch (e: any) {
		return saveFailure(e);
	}
	let archived = 0;
	if (args?.removeOthers && contents && Array.isArray(args?.contents)) {
		const r = await contents.Model.updateMany({ page: page._id, slug: { $nin: slugs }, status: { $ne: 'archived' } }, { $set: { status: 'archived' } });
		archived = r.modifiedCount || 0;
	}

	const added = docs.filter(d => d.isNew).length;
	const lines = [
		`${existing ? 'Updated' : 'Created'} the page ${path} (“${page.name}”, ${page.status}) — ${docs.length - 1} related record(s) saved, ${added} of them new.`,
		...(slugs.length ? [`Content blocks, in order: ${slugs.join(', ')}`] : []),
		...(archived ? [`Archived ${archived} older block(s) not in this list (hidden from the site, still in the panel).`] : []),
		...(skipped.size ? [`Ignored (not fields of the kit): ${[...skipped].join(', ')}`] : []),
		...(page.status !== 'published' ? ['The site API only serves published pages.'] : []),
		`In the panel: ${caller.page(KIT.pages)}`,
		`On the site API: GET ${publicBase(req, caller.project)}/pages/by-path?path=${encodeURIComponent(path)}`,
	];
	return { text: lines.join('\n'), data: { page: shape(page.toObject(), pages.def), contents: slugs, created: added, archived } };
};

/* ------------------------------------------------------------ settings */

const DOMAIN = /^(localhost(:\d+)?|([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?)$/;

const updateSiteSettings = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const input = args?.settings && typeof args.settings === 'object' ? args.settings : Object.fromEntries(Object.entries<any>(args || {}).filter(([k]) => k !== 'domains' && k !== 'config'));
	const config = args?.config && typeof args.config === 'object' ? args.config : {};
	const lines: string[] = [];

	let domains: string[] | undefined;
	if (args?.domains !== undefined) {
		if (!Array.isArray(args.domains)) return refuse('domains is a list, e.g. ["example.com"].');
		domains = [...new Set(args.domains.map((d: any) => String(d).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean))] as string[];
		const bad = domains.filter(d => d.length > 253 || !DOMAIN.test(d));
		if (bad.length) return refuse(`Not a domain: ${bad.join(', ')} — a domain looks like example.com`);
		if (domains.length > 20) return refuse('Up to 20 domains.');
		if (!caller.allows('manage-projects')) return refuse(`${caller.user.name || 'The key’s owner'} can't change the project's domains (their role needs Manage projects).`);
	}

	// The project's WebsiteSettings (WO-38): flat settings plus the config sections — checked before anything is saved.
	const { patch, skipped } = patchFromFlat(input);
	for (const k of ['tracking', 'code', 'headTags', 'redirects', 'headers'])
		if (config[k] !== undefined) patch[k] = config[k];
	if (config.seo !== undefined) patch.seo = { ...(patch.seo || {}), ...config.seo };
	let doc: any = null;
	if (Object.keys(patch).length) {
		if (!caller.allows('build')) return refuse(`${caller.user.name || 'The key’s owner'} can't change the site setup (their role needs Build).`);
		try {
			doc = await saveSite(caller.project, patch, { req });
		} catch (e: any) {
			return refuse(`Nothing saved — ${e.message}.`);
		}
		const tags = TRACKERS.filter(k => doc.tracking?.[k]);
		lines.push(`Site settings saved (${Object.keys(patch).join(', ')}) — tags: ${tags.join(', ') || 'none'}; ${doc.redirects.length} redirect(s), ${doc.headers.length} header(s); indexing ${doc.seo?.indexing === false ? 'off' : 'on'}.`);
		if (skipped.length) lines.push(`Ignored (not site settings): ${skipped.join(', ')} — get_site lists the settings.`);
	}
	if (domains) {
		await TenantProject.updateOne({ _id: caller.project._id }, { $set: { domains } });
		caller.project.domains = domains;
		forgetSite(caller.project);
		lines.push(`Domains: ${domains.join(', ') || 'none'} — analytics only counts visits from these${domains.length ? '' : ' (none: from anywhere)'}.`);
	}
	if (!lines.length) return refuse(`Send the settings to change (${Object.keys(FLAT).join(', ')}), config, and/or domains.${skipped.length ? ` Not settings: ${skipped.join(', ')}.` : ''}`);
	lines.push(`In the panel: ${caller.page('site-setup')}`);
	doc ||= await loadSite(caller.project, { req });
	return { text: lines.join('\n'), data: { settings: publicSettings(doc), config: publicConfig(caller.project, doc) } };
};

const getSite = async (req: any, _args: any, caller: Caller): Promise<Out> => {
	const [site, pages, seo, contents] = await Promise.all([loadSite(caller.project, { req }), kitModel(KIT.pages), kitModel(KIT.seo), kitModel(KIT.contents)]);
	const list: any[] = pages ? await pages.Model.find({}).sort({ priority: -1, path: 1 }).limit(200).lean() : [];
	const ids = list.map(p => p._id);
	const [seos, blocks]: any = await Promise.all([
		seo ? seo.Model.find({ page: { $in: ids } }, { page: 1, title: 1 }).lean() : [],
		contents ? contents.Model.find({ page: { $in: ids }, status: { $ne: 'archived' } }, { page: 1, slug: 1, category: 1, section: 1 }).sort({ priority: -1 }).lean() : [],
	]);
	const pageRows = list.map(p => ({
		path: p.path,
		name: p.name,
		status: p.status,
		showInMenu: p.showInMenu,
		seoTitle: seos.find((s: any) => String(s.page) === String(p._id))?.title || null,
		contents: blocks.filter((b: any) => String(b.page) === String(p._id)).map((b: any) => b.slug || b._id),
	}));
	const project = caller.project;
	const config = publicConfig(project, site);
	const data = {
		project: { name: project.name, slug: project.publicSlug, domains: project.domains || [] },
		api: publicBase(req, project),
		settings: publicSettings(site),
		config: { ...config, headTags: (site.headTags || []).map((t: any) => ({ name: t.name, location: t.location, enabled: t.enabled !== false })) },
		settingsFields: Object.keys(FLAT).filter(k => k !== 'twitter'),
		pages: pageRows,
	};
	const text = [
		`Website “${project.name}” — site API ${data.api}`,
		`Domains: ${data.project.domains.join(', ') || 'none yet (analytics counts visits from anywhere)'}`,
		`Settings: ${JSON.stringify(data.settings)}`,
		`Site setup (tags, code tags, SEO & indexing, redirects, headers): ${JSON.stringify({ tracking: config.tracking, seo: config.seo, headTags: data.config.headTags, redirects: config.redirects, headers: config.headers })}`,
		pageRows.length ? '| Path | Name | Status | SEO title | Content blocks |\n|---|---|---|---|---|' : 'No pages yet — upsert_page makes them.',
		...pageRows.map(p => `| ${p.path} | ${p.name} | ${p.status} | ${p.seoTitle || '—'} | ${p.contents.join(', ') || '—'} |`),
	].join('\n');
	return { text, data };
};

/* --------------------------------------------------------------- media */

const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif',
	'image/svg+xml': 'svg',
	'image/x-icon': 'ico',
	'image/vnd.microsoft.icon': 'ico',
};
const BY_EXTENSION: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon' };
/** Kept as sent: vectors, icons, animations. Everything else becomes webp, as the panel's uploads do. */
const KEEP = new Set(['image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/gif']);

const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./];
const isPrivateIp = (ip: string): boolean =>
	net.isIPv4(ip) ? PRIVATE_V4.some(r => r.test(ip)) : ip === '::1' || ip === '::' || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || /^::ffff:/i.test(ip) && isPrivateIp(ip.replace(/^::ffff:/i, ''));

/** A URL the server may fetch: http(s), and in production never this network's own addresses. */
export const fetchable = async (raw: string) => {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return 'That isn’t a URL.';
	}
	if (!/^https?:$/.test(url.protocol)) return 'Only http and https URLs can be fetched.';
	if (process.env.NODE_ENV !== 'production') return null;
	const host = url.hostname.replace(/^\[|\]$/g, '');
	const addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a: any) => a.address);
	if (!addresses.length) return `Couldn’t find ${host}.`;
	if (addresses.some(isPrivateIp)) return 'That address is on a private network — use a public URL.';
	return null;
};

/** Downloads an image, following up to 3 redirects (each one checked). */
const download = async (raw: string): Promise<{ buffer: Buffer; type: string; name: string } | string> => {
	let current = raw;
	for (let hop = 0; hop < 4; hop++) {
		const bad = await fetchable(current);
		if (bad) return bad;
		const res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'e-mint-media/1.0' } }).catch((e: any) => e as Error);
		if (res instanceof Error) return `Couldn’t download it: ${res.message}`;
		if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
			current = new URL(res.headers.get('location')!, current).toString();
			continue;
		}
		if (!res.ok) return `The URL answered ${res.status}.`;
		if (Number(res.headers.get('content-length') || 0) > MAX_BYTES) return 'Images up to 10 MB.';
		const buffer = Buffer.from(await res.arrayBuffer());
		if (buffer.length > MAX_BYTES) return 'Images up to 10 MB.';
		const name = decodeURIComponent(new URL(current).pathname.split('/').pop() || 'image');
		const ext = name.split('.').pop()?.toLowerCase() || '';
		const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
		return { buffer, type: IMAGE_TYPES[type] ? type : BY_EXTENSION[ext] || type, name };
	}
	return 'Too many redirects.';
};

/** `data:image/png;base64,…` or bare base64 (with a filename to tell the type). */
const decodeData = (raw: string, filename: string) => {
	const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(raw.trim());
	const buffer = Buffer.from(m ? m[3] : raw.trim(), m && !m[2] ? 'utf8' : 'base64');
	const ext = filename.split('.').pop()?.toLowerCase() || '';
	return { buffer, type: m ? m[1].toLowerCase() : BY_EXTENSION[ext] || '', name: filename || 'image' };
};

const uploadMedia = async (_req: any, args: any, caller: Caller): Promise<Out> => {
	if (!args?.url === !args?.data) return refuse('Send either `url` (an image on the web) or `data` (base64 or a data: URL).');
	if (!process.env.S3_BUCKET_NAME) return refuse('Media storage isn’t set up on this server, so images can’t be uploaded — keep the image URLs as they are.');
	if (!caller.allows('create-image')) return refuse(`${caller.user.name || 'The key’s owner'} can't upload files (their role needs Records: Add).`);

	const got = args.url ? await download(String(args.url)) : decodeData(String(args.data), String(args.filename || ''));
	if (typeof got === 'string') return refuse(got);
	if (!IMAGE_TYPES[got.type]) return refuse(`Only images can be uploaded here (png, jpg, webp, gif, avif, svg, ico)${got.type ? ` — this is ${got.type}` : ''}.`);
	if (!got.buffer.length) return refuse('The image is empty.');
	if (got.buffer.length > MAX_BYTES) return refuse('Images up to 10 MB.');

	let body = got.buffer;
	let type = got.type;
	let width: number | undefined;
	let height: number | undefined;
	const base = slugify(String(args.filename || got.name).replace(/\.[a-z0-9]+$/i, '')) || 'image';
	try {
		if (!KEEP.has(type) && !args.keepFormat) {
			const out = await sharp(body).webp({ quality: 80, alphaQuality: 90 }).toBuffer({ resolveWithObject: true });
			body = out.data;
			type = 'image/webp';
			({ width, height } = out.info);
		} else if (type !== 'image/x-icon' && type !== 'image/vnd.microsoft.icon') {
			({ width, height } = await sharp(body).metadata());
		}
	} catch {
		return refuse('That file isn’t an image that can be read.');
	}
	const key = `${Date.now()}_${base}.${IMAGE_TYPES[type]}`;

	// The project's own library, or the organization's shared one (WO-23).
	const project = caller.project;
	const save = async () => {
		const uploaded: any = await getS3().upload({ Bucket: process.env.S3_BUCKET_NAME!, Body: body, Key: key, ContentType: type }).promise();
		const folder = await resolveUploadFolder(String(args.folder || 'website').slice(0, 60));
		return new File({
			name: args.name ? String(args.name).slice(0, 200) : key,
			description: args.alt ? String(args.alt).slice(0, 500) : undefined,
			url: uploaded.Location,
			key: uploaded.Key,
			type,
			fileType: 'image',
			fileFolder: folder._id,
			bucket: uploaded.Bucket,
			size: body.length,
			width,
			height,
			folder: folder.slug,
		}).save();
	};
	let file: any;
	try {
		file = project?.mediaScope === 'organization' ? await runInScope({ organization: project.organization }, save) : await save();
	} catch (e: any) {
		return refuse(`The upload failed: ${e?.message || 'unknown error'}`);
	}
	return {
		text: `Uploaded to the media library: ${file.url}${width ? ` (${width}×${height})` : ''}. Use this URL in the settings, contents or records.`,
		data: { url: file.url, _id: String(file._id), type, size: body.length, width, height },
	};
};

/* ------------------------------------------------------- create_records */

const MAX_WRITE = 200;

export const createRecords = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const route = String(args?.route || '').trim();
	const def: any = route ? await ModelDefinition.findOne({ route }).lean() : null;
	const Model = def ? compiledModel(def.name) : null;
	if (!def || !Model) return refuse(`No model built here at /${route} — create_records writes models made in the model builder (list_models shows routes).`);
	if (PROTECTED_ROUTES.has(route)) return refuse(`/${route} controls access — its records can't be written here.`);
	const denied = mayWrite(req, caller, route);
	if (denied) return refuse(denied);
	const records = Array.isArray(args?.records) ? args.records : null;
	if (!records?.length) return refuse('Send the records as a list of objects (field key → value).');
	if (records.length > MAX_WRITE) return refuse(`Up to ${MAX_WRITE} records per call — send the rest in another call.`);
	const matchOn = args?.matchOn ? String(args.matchOn) : '';
	if (matchOn && !def.fields.some((f: any) => f.key === matchOn && !['formula', 'section', 'sectionlist', 'references', 'images', 'files'].includes(f.kind)))
		return refuse(`matchOn must be one of /${route}'s own single-value fields (${def.fields.map((f: any) => f.key).join(', ')}).`);

	const formulas = await formulasFor(req, def);
	const restricted = isAccessRestricted(Model);
	const problems: string[] = [];
	const skipped = new Set<string>();
	const docs: { doc: any; Model: mongoose.Model<any>; isNew: boolean }[] = [];
	const seen = new Set<string>();
	const refCache: RefCache = new Map();
	for (let i = 0; i < records.length; i++) {
		const picked = await pickFields(def, records[i], [], refCache);
		picked.skipped.forEach(k => skipped.add(k));
		problems.push(...picked.problems.map(p => `records[${i}].${p}`));
		let existing: any = null;
		if (matchOn) {
			const value = picked.body[matchOn];
			if (value === undefined || value === null || value === '') {
				problems.push(`records[${i}] has no ${matchOn} to match on`);
				continue;
			}
			if (seen.has(String(value))) {
				problems.push(`records[${i}]: ${matchOn} “${value}” appears twice in this call`);
				continue;
			}
			seen.add(String(value));
			existing = await Model.findOne({ [matchOn]: value });
		}
		const doc: any = existing || new Model({ ...ownedBy(Model, caller), ...(restricted && { privacy: 'public' }) });
		doc.set(picked.body);
		applyFormulas(doc, formulas);
		problems.push(...validationProblems(doc, `records[${i}].`));
		docs.push({ doc, Model, isNew: !existing });
	}
	if (problems.length) return refuse(`Nothing saved:\n- ${problems.slice(0, 50).join('\n- ')}${problems.length > 50 ? `\n- …and ${problems.length - 50} more` : ''}`);
	try {
		await saveAll(docs);
	} catch (e) {
		return saveFailure(e);
	}
	const created = docs.filter(d => d.isNew).length;
	const display = def.displayField || def.fields[0]?.key;
	const pub = def.publicApi?.enabled ? `\nOn the public API: GET ${publicBase(req, caller.project || { publicSlug: '' })}/${route}` : '';
	return {
		text: `/${route}: ${created} created, ${docs.length - created} updated.${skipped.size ? `\nIgnored (not fields of this model): ${[...skipped].join(', ')}` : ''}${restricted ? '\nNew records are Public, so the site can read them.' : ''}\nIn the panel: ${caller.page(route)}${caller.project ? pub : ''}`,
		data: { route, created, updated: docs.length - created, records: docs.map(d => ({ _id: String(d.doc._id), ...(display && { [display]: d.doc[display] }) })) },
	};
};

/* ------------------------------------------------------- set_public_api */

/** A project model's public API on or off, which actions, for whom (WO-11). */
export const setPublicApi = async (req: any, model: string, input: any) => {
	const q = String(model || '').trim();
	const def: any = q ? await ModelDefinition.findOne({ $or: [{ name: q }, { route: q.toLowerCase() }] }) : null;
	if (!def) return { error: `No model “${model}” built in this project — list_models shows them.` };
	const { value, error } = PUBLIC_API.validate({ enabled: true, ...(input || {}) }, { stripUnknown: true });
	if (error) return { error: error.details[0].message.replace(/"/g, '') };
	if (value.ownerOnly && value.auth !== 'customer') return { error: 'Owner-only records need signed-in customers (auth: "customer").' };
	if (value.enabled && !value.actions.length) value.actions = ['list', 'get'];
	const next = mergedPublicApi(value, def.publicApi);
	const problem = next.enabled && readOnlyProblem(def.fields, next.readOnlyFields, next.actions);
	if (problem) return { error: problem };
	def.publicApi = next;
	def.version = (def.version || 1) + 1;
	await def.save();
	await syncDynamicModels({ app: req.app, force: true });
	return { def, value: next };
};

const publicApiTool = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const r = await setPublicApi(req, args?.model, { enabled: args?.enabled, actions: args?.actions, auth: args?.auth, ownerOnly: args?.ownerOnly, readOnlyFields: args?.readOnlyFields });
	if (r.error || !r.def) return refuse(r.error || 'Model not found');
	const base = `${publicBase(req, caller.project)}/${r.def.route}`;
	const v = r.value;
	const lines = v.enabled
		? [
				`${r.def.title}'s public API is on (${v.auth === 'customer' ? `signed-in customers${v.ownerOnly ? ', each only their own records' : ''}` : 'open to anyone'}):`,
				...(v.readOnlyFields?.length && v.actions.some((a: string) => a === 'create' || a === 'update')
					? [`Read-only (the API never writes them — creates get the default, updates ignore them): ${v.readOnlyFields.join(', ')}`]
					: []),
				...v.actions.map((a: string) => `- ${{ list: `GET ${base}?limit=20&page=1&sort=-createdAt — filters: <field>=<value>, <field>_<op>=<value> (ne, in, nin, gt, gte, lt, lte, btwn, contains, all), search=, fields=`, get: `GET ${base}/:id`, create: `POST ${base}`, update: `PUT ${base}/:id`, delete: `DELETE ${base}/:id` }[a]}`),
		  ]
		: [`${r.def.title}'s public API is off.`];
	return { text: lines.join('\n'), data: { model: r.def.name, route: r.def.route, publicApi: v, endpoint: base } };
};

/* -------------------------------------------------- describe & snippets */

const snippetsOf = (req: any, project: any) => {
	const origin = apiOrigin(req);
	const api = publicBase(req, project);
	return {
		api,
		env: [`MINT_API=${api}`, `NEXT_PUBLIC_MINT_API=${api}`],
		track: `<script src="${origin}/public/track.js" data-project="${project.publicSlug}" defer></script>`,
		login: `<script src="${origin}/public/widget.js" data-project="${project.publicSlug}" async></script>\n<div data-mint-login></div>`,
	};
};

const siteSnippets = async (req: any, _args: any, caller: Caller): Promise<Out> => {
	const s = snippetsOf(req, caller.project);
	const domains: string[] = caller.project.domains || [];
	return {
		text: [
			`Environment variables for the site:\n${s.env.join('\n')}`,
			`\nAnalytics — on every page (in the root layout / <head>):\n${s.track}`,
			'Mark buttons to count with data-track="<name>"; send custom events with window.MintAnalytics?.track(name, props).',
			domains.length
				? `Visits are only counted from: ${domains.join(', ')} (localhost too, outside production). Add the deployed domain with update_site_settings { domains }.`
				: 'No domains set: visits from any site count. Once deployed, set the real domain with update_site_settings { domains } so others can’t send visits.',
			`\nCustomer sign-in (only if the site has accounts):\n${s.login}`,
		].join('\n'),
		data: { ...s, domains },
	};
};

const fieldList = (kit: Kit | null) => (kit ? kit.def.fields.map((f: any) => `${f.key} (${f.kind}${f.options?.length ? `: ${f.options.map((o: any) => o.value).join('|')}` : ''}${f.ref ? ` → ${f.ref}` : ''})`).join(', ') : '(missing)');

const describeWebsite = async (req: any, _args: any, caller: Caller): Promise<Out> => {
	const [pages, seo, contents] = await Promise.all([kitModel(KIT.pages), kitModel(KIT.seo), kitModel(KIT.contents)]);
	const s = snippetsOf(req, caller.project);
	const text = `# Building a website that this project manages

This project ("${caller.project.name}") is a WEBSITE project. Build the site so that everything it shows comes from here, and the user edits it afterwards in the panel with no code change: texts, images, buttons, SEO, favicon, colours, contact details and lists. Never hard-code content in the site's code — only layout and styling.

## Do this, in order
1. get_site — what's here already. Building again updates the same pages and blocks, never duplicates.
2. upload_media — every image the site uses (logo, favicon, hero, photos): from a URL, or the file's bytes as base64. Use the returned URL everywhere.
3. update_site_settings — site name, logo, favicon, colours, font, footer, contact, socials, default meta title/description/share image, and domains once you know where it's deployed. Its \`config\` holds the site setup: tracking IDs the user gives you (ga4, gtm, metaPixel…), custom head/body code, SEO & indexing (robots, sitemap, verification), redirects and response headers — never hard-code these in the site.
4. upsert_page — one call per page: its path, name, SEO, and ALL its content as blocks in display order, each with a stable slug.
5. Lists that grow or repeat (products, services, projects, team, testimonials, clients, FAQs, posts…) are models of their own: plan_feature, show the user, then build_feature with publicApi {"enabled": true, "actions": ["list","get"]} on each step (or set_public_api later), then create_records with matchOn (e.g. "slug") to fill them. Link them with reference fields (a product → its category). A one-off set of 3 cards can stay a content block's card list.
6. site_snippets — the env variables and the analytics script for the site.
7. Write the site's code to read the site API below at request time (short revalidation), then tell the user where everything is edited in the panel.

## The website kit (models already in this project)
- Site settings (not a model — update_site_settings sets them, the panel's Site setup page edits them): ${Object.keys(FLAT).filter(k => k !== 'twitter').join(', ')}
- Pages (/pages): ${fieldList(pages)}
- SEO (/seo), one per page: ${fieldList(seo)}
- Contents (/web-contents), blocks on a page: ${fieldList(contents)}

How a block holds content — pick the category and fill its fields:
- content: heading/text in \`content\`, secondary text in \`subContent\`, a button in \`btnText\` + \`url\`
- rich-content: formatted HTML in \`richContent\`
- list: bullet points in \`list\` (strings)
- card: repeated items in \`card\` [{image, title, subTitle, description}]
- image: \`image\` (URL); gallery: \`gallery\` (URLs); video: \`videoUrl\`
- list-of-links: \`list\` of labels with \`card\` rows or \`url\`
- \`section\` groups blocks into a page section (hero, features, cta…); \`slug\` is how the code finds a block; \`bgColor\`, \`color\`, \`fontSize\` style it.
Use one block per editable piece (hero, intro, each section), not one block per page.

## The site API — no key needed (read-only, CORS open)
Base: ${s.api}
- GET /site → { settings, menu: [{ _id, name, path, parent }] } (published pages with showInMenu, by priority)
- GET /pages/by-path?path=/about → { page, seo, contents: [...] } (published, visible blocks, highest priority first); 404 when there's no published page
- GET /<route> → { doc: [...], total, page, limit, totalPages } — a list model with its public API on. Query (the admin lists' syntax):
  - page (from 1), limit (1–100, default 20); another page exists while page < totalPages
  - sort=-price,name (up to 3 fields, - = descending; default -createdAt)
  - <field>=<value> equals (tags/multi-options/links: has it; dates: that whole day); repeat the name or use _in for any of several
  - <field>_<op>=<value>: _ne, _in / _nin (comma-separated), _gt _gte _lt _lte (numbers, dates), _btwn=from_to (10_50, 2026-10-01_2026-10-31; an end may be empty), _contains (text, any case), _all (tags: has every one)
  - dates also take today, week, month, year, days_30, months_3; createdAt/updatedAt filter on every model
  - search=<words> (text fields contain it, any case); fields=name,price (only those keys + _id)
  - unknown names are ignored; unreadable values → 400 { message }. GET / lists each model's filters, search and sort fields.
  - e.g. /products?category=<id>&price_btwn=20_100&tags_in=sale,new&sort=price&limit=24&page=2
- GET /<route>/<id> → one record; linked records come back as { _id, <name field> }. Archived records never come out.

## Code recipe (Next.js App Router — adapt the same idea to any framework)
\`\`\`ts
// lib/mint.ts
const API = process.env.MINT_API!; // ${s.api}
export async function mint<T = any>(path: string): Promise<T | null> {
  const res = await fetch(\`\${API}\${path}\`, { next: { revalidate: 60 } });
  return res.ok ? res.json() : null;
}
export const getSite = () => mint('/site');
export const getPage = (path: string) => mint(\`/pages/by-path?path=\${encodeURIComponent(path)}\`);
export const block = (page: any, slug: string) => page?.contents?.find((c: any) => c.slug === slug);
export const list = (route: string, query = '') => mint(\`/\${route}?\${query}\`);
\`\`\`
- Root layout: getSite() for the header menu, footer, colours (CSS variables from primaryColor/secondaryColor/fontFamily), and \`generateMetadata\` with icons: { icon: settings.favicon }, the default title/description and openGraph image. Add the analytics script there:
  ${s.track}
- Each route: \`generateMetadata\` from page.seo (title, description, image, keywords, canonical, noIndex → robots), falling back to the settings' defaults; render page.contents through components chosen by slug/section/category; notFound() when getPage returns null.
- A dynamic catch-all route ([[...slug]]) can render pages added later in the panel with a generic block renderer.
- Lists: list('products', 'limit=12&sort=-createdAt'), detail pages by /products/<id> or a slug field (list('products', \`slug=\${slug}&limit=1\`)). Filter on the server, not in the site's code: list('products', 'featured=true&limit=3'), list('posts', 'status=published&sort=-createdAt'); build queries with URLSearchParams; page with page/limit and the answer's totalPages.
- Revalidate (60s) or render on request; a fully static export only changes after a rebuild.
- The site setup comes from here too: the analytics script injects the tracking tags and custom code by itself. Serve /robots.txt and /sitemap.xml from \`\${API}/site/robots.txt\` and \`\${API}/site/sitemap.xml?origin=https://<domain>\` (route handlers), and apply \`config.redirects\` and \`config.headers\` from GET /site in middleware (Next: middleware.ts, or fetch them in next.config redirects()/headers() at build).
- Never put an API key in the site — the site API needs none.`;
	return { text, data: { api: s.api, snippets: s, kit: { pages: !!pages, seo: !!seo, contents: !!contents } } };
};

/* --------------------------------------------------------------- tools */

const CONTENT_BLOCK = {
	type: 'object',
	required: ['slug'],
	properties: {
		slug: { type: 'string', description: 'Stable key the site code finds the block by, unique on the page, e.g. "hero"' },
		name: { type: 'string', description: 'What the user sees in the panel, e.g. "Home — hero"' },
		section: { type: 'string', description: 'The page section it belongs to, e.g. "hero", "features"' },
		category: { type: 'string', enum: ['content', 'rich-content', 'list', 'card', 'image', 'gallery', 'list-of-links', 'video', 'section', 'other'] },
		content: { type: 'string', description: 'Main text or heading' },
		subContent: { type: 'string', description: 'Secondary text' },
		btnText: { type: 'string' },
		url: { type: 'string', description: 'The button’s or link’s target' },
		list: { type: 'array', items: { type: 'string' } },
		card: { type: 'array', items: { type: 'object', properties: { image: { type: 'string' }, title: { type: 'string' }, subTitle: { type: 'string' }, description: { type: 'string' } } } },
		richContent: { type: 'string', description: 'HTML' },
		image: { type: 'string', description: 'Image URL (upload_media first)' },
		gallery: { type: 'array', items: { type: 'string' } },
		videoUrl: { type: 'string' },
		bgColor: { type: 'string' },
		color: { type: 'string' },
		fontSize: { type: 'string' },
		fontSizeSm: { type: 'string' },
		status: { type: 'string', enum: ['published', 'draft', 'archived'] },
		isVisible: { type: 'boolean' },
		priority: { type: 'number', description: 'Higher shows first. Left out: the order of the list.' },
	},
};

export const WEBSITE_TOOLS: ToolDef[] = [
	{
		name: 'describe_website',
		title: 'How to build a managed website',
		description:
			'For website projects: how to build a site whose contents, SEO, favicon, images, lists and analytics are all managed from this project — the steps, the website kit’s models, the site API (with this project’s address) and a code recipe. Read it before building or changing the site.',
		scope: 'read',
		only: 'website',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: describeWebsite,
	},
	{
		name: 'get_site',
		title: 'Read the website',
		description: 'The website as it stands here: its settings, domains, the site API address, and every page with its status, SEO title and content block slugs.',
		scope: 'read',
		only: 'website',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: getSite,
	},
	{
		name: 'update_site_settings',
		title: 'Change the site settings',
		description:
			'Sets the website’s settings (one per project, edited on the panel’s Site setup page): siteName, tagline, logo, favicon, primaryColor, secondaryColor, fontFamily, footerText, email, phone, whatsapp, address, mapEmbedUrl, hours, facebook, instagram, x, linkedin, youtube, tiktok, pinterest, metaTitle, titleTemplate ("%s · Acme"), metaDescription, ogImage, keywords. Only the fields sent change. `config` holds the tags, code, SEO & indexing, redirects and headers; `domains` sets where the site is deployed (analytics only counts visits from them).',
		scope: 'build',
		only: 'website',
		inputSchema: {
			type: 'object',
			properties: {
				settings: { type: 'object', description: 'Setting → value, e.g. {"siteName": "Acme", "favicon": "https://…/favicon.png", "primaryColor": "#0f766e", "instagram": "https://instagram.com/acme"}' },
				domains: { type: 'array', items: { type: 'string' }, description: 'e.g. ["acme.com", "www.acme.com"] — replaces the list' },
				config: {
					type: 'object',
					description:
						'The site setup — send only the sections that change: tracking {mintAnalytics, ga4 "G-…", gtm "GTM-…", googleAds "AW-…", metaPixel, tiktokPixel, linkedinPartner, pinterestTag, xPixel, snapPixel, clarity, hotjar}; headTags [{name, location "head"|"bodyStart"|"bodyEnd", content (HTML), enabled}] (replaces the list) or code {head, bodyStart, bodyEnd} (replaces only the tags named for those places); seo {indexing, sitemap, robots (extra rules), canonicalDomain, googleVerification, bingVerification}; redirects [{from "/old", to "/new" or URL, permanent}]; headers [{source "/(.*)", name, value}]. Lists replace the saved ones. Server-side tracking keys are set by the user in the panel, never here.',
				},
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: updateSiteSettings,
	},
	{
		name: 'upsert_page',
		title: 'Create or update a page',
		description:
			'One page of the website by its path — created, or updated if it exists: its name, status (default published), template, menu placement, its SEO, and its content blocks in display order. Blocks are matched by slug on the page, so calling again updates them; `removeOthers: true` archives this page’s blocks that aren’t in the list. Everything is checked first: nothing is saved if anything is wrong.',
		scope: 'build',
		only: 'website',
		inputSchema: {
			type: 'object',
			required: ['path'],
			properties: {
				path: { type: 'string', description: '"/" for the home page, "/about", "/services/web"' },
				name: { type: 'string', description: 'The menu label, e.g. "About us"' },
				status: { type: 'string', enum: ['published', 'draft', 'archived'] },
				template: { type: 'string', enum: ['default', 'home', 'landing', 'content', 'contact'] },
				showInMenu: { type: 'boolean' },
				priority: { type: 'number', description: 'Menu order, higher first' },
				parent: { type: 'string', description: 'The parent page’s path, for a sub-page' },
				seo: {
					type: 'object',
					properties: {
						title: { type: 'string', description: 'Up to 120 characters' },
						description: { type: 'string', description: 'Up to 320 characters' },
						image: { type: 'string', description: 'Share image URL' },
						keywords: { type: 'array', items: { type: 'string' } },
						canonical: { type: 'string' },
						noIndex: { type: 'boolean' },
					},
				},
				contents: { type: 'array', maxItems: 100, items: CONTENT_BLOCK },
				removeOthers: { type: 'boolean' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: upsertPage,
	},
	{
		name: 'upload_media',
		title: 'Upload an image',
		description:
			'Puts an image into this project’s media library and returns its hosted URL, to use in the settings (logo, favicon), content blocks and records. From `url` (an image on the web) or `data` (base64, or a data: URL, with `filename`). Up to 10 MB; photos become webp, svg/ico/gif stay as they are (`keepFormat` keeps any format, e.g. a png favicon).',
		scope: 'build',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string' },
				data: { type: 'string', description: 'Base64 or data:image/…;base64,…' },
				filename: { type: 'string', description: 'e.g. "logo.png" — needed with bare base64' },
				name: { type: 'string', description: 'Its name in the media library' },
				alt: { type: 'string', description: 'What the image shows' },
				folder: { type: 'string', description: 'Media folder (default "website")' },
				keepFormat: { type: 'boolean' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		run: uploadMedia,
	},
	{
		name: 'create_records',
		title: 'Add records',
		description:
			'Adds records to a model built here (up to 200 a call), checked like its form: unknown fields are ignored, required ones and allowed values enforced, formulas worked out, links given by the linked record’s id or name. With `matchOn` (a field such as "slug" or "name") a record that already has that value is updated instead — so filling a list again doesn’t duplicate it. All or nothing.',
		scope: 'build',
		inputSchema: {
			type: 'object',
			required: ['route', 'records'],
			properties: {
				route: { type: 'string', description: 'The model’s route, e.g. "products"' },
				records: { type: 'array', maxItems: MAX_WRITE, items: { type: 'object' } },
				matchOn: { type: 'string', description: 'Update the record with the same value of this field instead of adding another' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
		run: createRecords,
	},
	{
		name: 'set_public_api',
		title: 'Turn a model’s public API on or off',
		description:
			'A model’s public API — what a site or app can call without a key: on/off, which `actions` (list, get, create, update, delete; default list and get), `auth` "none" (anyone) or "customer" (signed-in customers), `ownerOnly` (each customer only their own records), and `readOnlyFields` — field keys the API never writes, for what only the business sets (an order’s status, payment reference, tracking link): on create they take their default, on update they’re ignored. Left out, the read-only list the model has is kept. A website’s list models need list and get.',
		scope: 'build',
		only: 'project',
		inputSchema: {
			type: 'object',
			required: ['model', 'enabled'],
			properties: {
				model: { type: 'string', description: 'The model’s name or route' },
				enabled: { type: 'boolean' },
				actions: { type: 'array', items: { type: 'string', enum: ['list', 'get', 'create', 'update', 'delete'] } },
				auth: { type: 'string', enum: ['none', 'customer'] },
				ownerOnly: { type: 'boolean' },
				readOnlyFields: { type: 'array', items: { type: 'string' }, description: 'Field keys the public API never writes; [] lets it write every field' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: publicApiTool,
	},
	{
		name: 'site_snippets',
		title: 'Site snippets',
		description: 'What goes into the site’s code and settings: the env variables with the site API address, the analytics script for every page, and the customer sign-in widget.',
		scope: 'read',
		only: 'website',
		inputSchema: { type: 'object', properties: {} },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: siteSnippets,
	},
];

/** The paragraph a website project's AI gets in the server instructions. */
export const WEBSITE_INSTRUCTIONS = `

This project is a WEBSITE. When the user builds or changes the site (in Claude Code or any editor), call describe_website first and follow it: everything the site shows — settings, favicon and logo, each page's SEO and content blocks, images, lists — goes into this project with update_site_settings, upsert_page, upload_media, build_feature (publicApi on) and create_records, and the site's code reads it from the site API, so the user manages the deployed site from the panel. Show the user the pages and lists you plan before writing them.`;
