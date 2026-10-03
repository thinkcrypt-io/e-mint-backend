import Joi from 'joi';
import WebsiteSettings from '../models/tenancy/websiteSettings.model.js';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import { compiledModel, syncDynamicModels } from './dynamicModels.function.js';
import { runInScope } from './tenantScope.function.js';

/**
 * A website project's settings (docs/multi-tenancy WO-34, WO-38): the
 * WebsiteSettings document — identity, contact, socials, default SEO and
 * indexing, tracking tags, server-side tracking, code for every page,
 * redirects and response headers. One per project, created on first use.
 *
 * Edited on the panel's Site setup page (routes-tenant/site.router.ts) and by
 * the MCP (update_site_settings); the site reads it from the site API: `/site`
 * (settings + config), `/site/tags` (what /public/track.js injects, so tags
 * change with no deploy), `/site/robots.txt` and `/site/sitemap.xml`.
 *
 * Before WO-38 the identity lived in the website kit's Site settings model
 * (a table) and the rest on the project (`TenantProject.site`); a project
 * that has either is copied over the first time its settings are read.
 */

/* ------------------------------------------------------------ validation */

const text = (max: number) => Joi.string().trim().allow('').max(max);
const id = (pattern: RegExp, example: string) =>
	Joi.string()
		.trim()
		.allow('')
		.pattern(pattern)
		.messages({ 'string.pattern.base': `{#label} looks like ${example}` });
const url = Joi.string()
	.trim()
	.allow('')
	.max(2000)
	.pattern(/^https?:\/\/\S+$/)
	.messages({ 'string.pattern.base': '{#label} is a full address starting with https://' });
const image = Joi.string()
	.trim()
	.allow('')
	.max(2000)
	.pattern(/^(https?:\/\/|\/)\S*$/)
	.messages({ 'string.pattern.base': '{#label} is an image address' });
const color = Joi.string()
	.trim()
	.allow('')
	.pattern(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)
	.messages({ 'string.pattern.base': '{#label} is a colour like #0f766e' });
const code = Joi.string().allow('').max(20000);
const path = Joi.string()
	.trim()
	.max(500)
	.pattern(/^\/[^\s]*$/)
	.messages({ 'string.pattern.base': '{#label} starts with / (e.g. /old-page)' });
const target = Joi.string()
	.trim()
	.max(1000)
	.pattern(/^(\/[^\s]*|https?:\/\/[^\s]+)$/)
	.messages({ 'string.pattern.base': '{#label} is a path (/new-page) or a full URL' });
const LOCATIONS = ['head', 'bodyStart', 'bodyEnd'];

export const SITE_SETTINGS = Joi.object({
	identity: Joi.object({
		siteName: text(120).label('Site name'),
		tagline: text(200).label('Tagline'),
		logo: image.label('Logo'),
		favicon: image.label('Favicon'),
		footerText: text(1000).label('Footer text'),
		primaryColor: color.label('Primary colour'),
		secondaryColor: color.label('Secondary colour'),
		fontFamily: text(80).label('Font'),
	}),
	contact: Joi.object({
		email: Joi.string().trim().lowercase().allow('').max(200).email({ tlds: false }).label('Email'),
		phone: text(40).label('Phone'),
		whatsapp: text(40).label('WhatsApp'),
		address: text(500).label('Address'),
		mapEmbedUrl: url.label('Map embed URL'),
		hours: text(300).label('Opening hours'),
	}),
	social: Joi.object({
		facebook: url.label('Facebook'),
		instagram: url.label('Instagram'),
		x: url.label('X'),
		linkedin: url.label('LinkedIn'),
		youtube: url.label('YouTube'),
		tiktok: url.label('TikTok'),
		pinterest: url.label('Pinterest'),
	}),
	seo: Joi.object({
		metaTitle: text(120).label('Default title'),
		titleTemplate: text(120)
			.pattern(/%s/)
			.messages({ 'string.pattern.base': 'The title template has %s where the page’s title goes, e.g. “%s · Acme”' })
			.label('Title template'),
		metaDescription: text(320).label('Default description'),
		ogImage: image.label('Default share image'),
		keywords: Joi.array().items(Joi.string().trim().max(60)).max(30).label('Keywords'),
		indexing: Joi.boolean(),
		sitemap: Joi.boolean(),
		robots: Joi.string().allow('').max(5000).label('Extra robots.txt rules'),
		canonicalDomain: Joi.string()
			.trim()
			.lowercase()
			.allow('')
			.max(253)
			.pattern(/^([a-z0-9-]+\.)+[a-z]{2,}$/)
			.messages({ 'string.pattern.base': 'The main domain looks like example.com' }),
		googleVerification: text(200).label('Google verification'),
		bingVerification: text(200).label('Bing verification'),
	}),
	tracking: Joi.object({
		mintAnalytics: Joi.boolean(),
		ga4: id(/^G-[A-Z0-9]{4,15}$/, 'G-XXXXXXXXXX').label('Google Analytics ID'),
		gtm: id(/^GTM-[A-Z0-9]{4,12}$/, 'GTM-XXXXXXX').label('Tag Manager ID'),
		googleAds: id(/^AW-\d{6,15}$/, 'AW-123456789').label('Google Ads ID'),
		metaPixel: id(/^\d{6,20}$/, '1234567890123456').label('Meta Pixel ID'),
		tiktokPixel: id(/^[A-Z0-9]{10,30}$/, 'C1234567890ABCDEFGHI').label('TikTok Pixel ID'),
		linkedinPartner: id(/^\d{3,12}$/, '1234567').label('LinkedIn Partner ID'),
		pinterestTag: id(/^\d{6,20}$/, '2612345678901').label('Pinterest Tag ID'),
		xPixel: id(/^[a-z0-9]{4,12}$/, 'o1a2b').label('X Pixel ID'),
		snapPixel: id(/^[a-f0-9-]{36}$/, 'a1b2c3d4-…-…-…-… (36 characters)').label('Snap Pixel ID'),
		clarity: id(/^[a-z0-9]{6,20}$/, 'abcd1234ef').label('Clarity project ID'),
		hotjar: id(/^\d{5,10}$/, '1234567').label('Hotjar site ID'),
	}),
	serverSide: Joi.object({
		meta: Joi.object({ enabled: Joi.boolean(), testEventCode: id(/^[A-Z0-9]{3,40}$/i, 'TEST12345').label('Test event code') }),
		ga4: Joi.object({ enabled: Joi.boolean() }),
	}),
	/** Write-only: '' removes one. */
	secrets: Joi.object({
		metaAccessToken: Joi.string()
			.trim()
			.allow('')
			.max(600)
			.pattern(/^[A-Za-z0-9_-]+$/)
			.messages({ 'string.pattern.base': 'That doesn’t look like a Conversions API access token' })
			.label('Access token'),
		ga4ApiSecret: Joi.string()
			.trim()
			.allow('')
			.max(100)
			.pattern(/^[A-Za-z0-9_-]+$/)
			.messages({ 'string.pattern.base': 'That doesn’t look like a Measurement Protocol API secret' })
			.label('API secret'),
	}),
	headTags: Joi.array()
		.max(50)
		.items(
			Joi.object({
				_id: Joi.string().hex().length(24),
				name: Joi.string().trim().max(80).required().label('Name'),
				location: Joi.string()
					.valid(...LOCATIONS)
					.default('head'),
				content: code.label('Code'),
				enabled: Joi.boolean().default(true),
			})
		),
	/** The code before named tags (and how the MCP may still send it): becomes tags named for their place. */
	code: Joi.object({
		head: code.label('Head code'),
		bodyStart: code.label('Body start code'),
		bodyEnd: code.label('Body end code'),
	}),
	redirects: Joi.array()
		.max(200)
		.items(
			Joi.object({
				from: path.required().label('From'),
				to: target.required().label('To'),
				permanent: Joi.boolean().default(true),
			})
		),
	headers: Joi.array()
		.max(30)
		.items(
			Joi.object({
				source: path.default('/(.*)').label('Path'),
				name: Joi.string()
					.trim()
					.max(80)
					.pattern(/^[A-Za-z0-9-]+$/)
					.required()
					.messages({ 'string.pattern.base': 'A header name has letters, digits and dashes' })
					.label('Header'),
				value: Joi.string()
					.trim()
					.max(2000)
					.pattern(/^[^\r\n]*$/)
					.required()
					.label('Value'),
			})
		),
});

const SECTIONS = ['identity', 'contact', 'social', 'seo', 'tracking'] as const;
export const TRACKERS = ['ga4', 'gtm', 'googleAds', 'metaPixel', 'tiktokPixel', 'linkedinPartner', 'pinterestTag', 'xPixel', 'snapPixel', 'clarity', 'hotjar'];
const CODE_TAG: Record<string, string> = { head: 'Head code', bodyStart: 'Body start code', bodyEnd: 'Body end code' };

/**
 * The settings as one flat object — how the site API's `/site` has always
 * returned them (the kit's Site settings fields), and what the MCP accepts.
 */
export const FLAT: Record<string, [string, string]> = {
	siteName: ['identity', 'siteName'],
	tagline: ['identity', 'tagline'],
	logo: ['identity', 'logo'],
	favicon: ['identity', 'favicon'],
	footerText: ['identity', 'footerText'],
	primaryColor: ['identity', 'primaryColor'],
	secondaryColor: ['identity', 'secondaryColor'],
	fontFamily: ['identity', 'fontFamily'],
	email: ['contact', 'email'],
	phone: ['contact', 'phone'],
	whatsapp: ['contact', 'whatsapp'],
	address: ['contact', 'address'],
	mapEmbedUrl: ['contact', 'mapEmbedUrl'],
	hours: ['contact', 'hours'],
	facebook: ['social', 'facebook'],
	instagram: ['social', 'instagram'],
	x: ['social', 'x'],
	twitter: ['social', 'x'],
	linkedin: ['social', 'linkedin'],
	youtube: ['social', 'youtube'],
	tiktok: ['social', 'tiktok'],
	pinterest: ['social', 'pinterest'],
	metaTitle: ['seo', 'metaTitle'],
	titleTemplate: ['seo', 'titleTemplate'],
	metaDescription: ['seo', 'metaDescription'],
	ogImage: ['seo', 'ogImage'],
	keywords: ['seo', 'keywords'],
};

/** Flat keys → a sectioned patch; unknown keys are returned as `skipped`. */
export const patchFromFlat = (flat: Record<string, any>) => {
	const patch: any = {};
	const skipped: string[] = [];
	for (const [key, value] of Object.entries(flat || {})) {
		const at = FLAT[key];
		if (!at) {
			skipped.push(key);
			continue;
		}
		patch[at[0]] = { ...(patch[at[0]] || {}), [at[1]]: typeof value === 'object' && value && !Array.isArray(value) ? value.url || '' : value };
	}
	return { patch, skipped };
};

/* ------------------------------------------------------------- loading */

/** Settings read by the site API and track.js, kept a minute (forgotten on every save here). */
const cache = new Map<string, { at: number; doc: any }>();
const CACHE_MS = 60 * 1000;
export const forgetSite = (project: any) => cache.delete(String(project?._id || project));

const legacyImport = async (project: any, req?: any) => {
	const s = project.site || {};
	const data: any = {
		identity: { siteName: project.name || '' },
		tracking: { ...(s.tracking || {}) },
		seo: { ...(s.seo || {}) },
		redirects: Array.isArray(s.redirects) ? s.redirects : [],
		headers: Array.isArray(s.headers) ? s.headers : [],
		headTags: Object.entries<any>(s.code || {})
			.filter(([k, v]) => CODE_TAG[k] && typeof v === 'string' && v.trim())
			.map(([k, v]) => ({ name: CODE_TAG[k], location: k, content: v, enabled: true })),
	};
	// The kit's Site settings record, if the project still has that model.
	const def: any = await ModelDefinition.findOne({ route: 'site-settings' }, { name: 1 }).lean();
	if (def) {
		if (req?.app) await syncDynamicModels({ app: req.app });
		const Model = compiledModel(def.name);
		const old: any = Model ? await Model.findOne({}).sort({ createdAt: 1 }).lean() : null;
		if (old)
			for (const [key, [section, field]] of Object.entries(FLAT)) {
				const v = old[key];
				if (v === undefined || v === null || v === '') continue;
				data[section] = { ...(data[section] || {}), [field]: typeof v === 'object' && !Array.isArray(v) ? v.url || '' : v };
			}
	}
	return data;
};

/**
 * The project's settings (created the first time — copied from the kit's Site
 * settings record and `TenantProject.site` when the project has them).
 * `secrets: true` includes the server-side keys; `cached: true` may answer
 * from the minute-long cache (the site API, track.js).
 */
export const loadSite = async (project: any, { req, secrets = false, cached = false }: { req?: any; secrets?: boolean; cached?: boolean } = {}): Promise<any> => {
	const key = String(project._id);
	if (cached) {
		const hit = cache.get(key);
		if (hit && Date.now() - hit.at < CACHE_MS) return hit.doc;
	}
	const doc = await runInScope({ organization: project.organization, project: project._id }, async () => {
		const found = await WebsiteSettings.findOne({}).select('+secrets').lean();
		if (found) return found;
		const data = await legacyImport(project, req);
		try {
			await WebsiteSettings.create(data);
		} catch (e: any) {
			if (e?.code !== 11000) throw e; // made by a request at the same moment
		}
		return WebsiteSettings.findOne({}).select('+secrets').lean();
	});
	cache.set(key, { at: Date.now(), doc });
	if (secrets) return doc;
	const { secrets: _hidden, ...rest } = doc as any;
	return rest;
};

/* -------------------------------------------------------------- saving */

const asPlain = (v: any) => JSON.parse(JSON.stringify(v ?? null));

/**
 * Saves a change: each section sent replaces only the keys it names (lists are
 * replaced whole; `code` replaces the tags named for its places). Checked
 * first — throws the first problem as a 400. Returns the saved settings.
 */
export const saveSite = async (project: any, patch: any, { req }: { req?: any } = {}) => {
	const { value, error } = SITE_SETTINGS.validate(patch || {}, { abortEarly: true, stripUnknown: true });
	if (error) throw Object.assign(new Error(error.details[0].message.replace(/"/g, '')), { status: 400 });
	const current = await loadSite(project, { req, secrets: true });
	const $set: any = {};
	for (const section of SECTIONS) if (value[section]) for (const [k, v] of Object.entries(value[section])) $set[`${section}.${k}`] = v;
	if (value.serverSide?.meta) for (const [k, v] of Object.entries(value.serverSide.meta)) $set[`serverSide.meta.${k}`] = v;
	if (value.serverSide?.ga4) for (const [k, v] of Object.entries(value.serverSide.ga4)) $set[`serverSide.ga4.${k}`] = v;
	if (value.secrets) for (const [k, v] of Object.entries(value.secrets)) $set[`secrets.${k}`] = v;
	let tags = value.headTags ?? asPlain(current.headTags || []);
	if (value.code)
		for (const [where, content] of Object.entries<string>(value.code)) {
			const name = CODE_TAG[where];
			tags = tags.filter((t: any) => !(t.name === name && t.location === where));
			if (content.trim()) tags.push({ name, location: where, content, enabled: true });
		}
	if (value.headTags || value.code) $set.headTags = tags;
	if (value.redirects) $set.redirects = value.redirects;
	if (value.headers) $set.headers = value.headers;

	// Server-side tracking needs what it sends with.
	const after = (k: string, fallback: any) => ($set[k] !== undefined ? $set[k] : fallback);
	if (after('serverSide.meta.enabled', current.serverSide?.meta?.enabled) && !(after('tracking.metaPixel', current.tracking?.metaPixel) && after('secrets.metaAccessToken', current.secrets?.metaAccessToken)))
		throw Object.assign(new Error('Meta’s Conversions API needs the Meta Pixel ID (Tracking) and an access token'), { status: 400 });
	if (after('serverSide.ga4.enabled', current.serverSide?.ga4?.enabled) && !(after('tracking.ga4', current.tracking?.ga4) && after('secrets.ga4ApiSecret', current.secrets?.ga4ApiSecret)))
		throw Object.assign(new Error('Google Analytics server-side needs the Google Analytics ID (Tracking) and an API secret'), { status: 400 });

	if (!Object.keys($set).length) throw Object.assign(new Error('Nothing to change'), { status: 400 });
	await runInScope({ organization: project.organization, project: project._id }, () => WebsiteSettings.updateOne({}, { $set }, { runValidators: true }));
	forgetSite(project);
	return loadSite(project, { req });
};

/* ------------------------------------------------------------ reading */

/** The enabled tags' code for each place on the page. */
export const codeOf = (doc: any) => {
	const out: any = { head: '', bodyStart: '', bodyEnd: '' };
	for (const t of doc?.headTags || []) if (t.enabled !== false && t.content && out[t.location] !== undefined) out[t.location] += `${out[t.location] ? '\n' : ''}${t.content}`;
	return out as { head: string; bodyStart: string; bodyEnd: string };
};

const seoOf = (doc: any) => {
	const s = doc?.seo || {};
	return {
		indexing: s.indexing !== false,
		sitemap: s.sitemap !== false,
		robots: s.robots || '',
		canonicalDomain: s.canonicalDomain || '',
		googleVerification: s.googleVerification || '',
		bingVerification: s.bingVerification || '',
	};
};

const trackingOf = (doc: any) => ({
	mintAnalytics: doc?.tracking?.mintAnalytics !== false,
	...Object.fromEntries(TRACKERS.map(k => [k, doc?.tracking?.[k] || ''])),
});

/** The site's address for absolute URLs: the main domain, else the first domain. */
export const siteOrigin = (project: any, doc?: any) => {
	const domain = doc?.seo?.canonicalDomain || (project.domains || []).find((d: string) => !d.startsWith('localhost')) || '';
	return domain ? `https://${domain}` : '';
};

/** The settings as the site API's `/site` returns them: flat, like the kit's record was. */
export const publicSettings = (doc: any) => {
	const out: any = {};
	for (const [key, [section, field]] of Object.entries(FLAT)) if (key !== 'twitter') out[key] = doc?.[section]?.[field] ?? '';
	out.twitter = out.x;
	return out;
};

/** The site setup as `/site` returns it under `config` (no secrets, no server-side details). */
export const publicConfig = (project: any, doc: any) => ({
	tracking: trackingOf(doc),
	code: codeOf(doc),
	seo: seoOf(doc),
	redirects: doc?.redirects || [],
	headers: doc?.headers || [],
	origin: siteOrigin(project, doc),
	domains: project.domains || [],
});

/** The settings as the panel edits them: everything but the keys, which it only knows are set. */
export const panelView = (project: any, doc: any) => ({
	_id: String(doc._id),
	identity: { siteName: '', tagline: '', logo: '', favicon: '', footerText: '', primaryColor: '', secondaryColor: '', fontFamily: '', ...(doc.identity || {}) },
	contact: { email: '', phone: '', whatsapp: '', address: '', mapEmbedUrl: '', hours: '', ...(doc.contact || {}) },
	social: { facebook: '', instagram: '', x: '', linkedin: '', youtube: '', tiktok: '', pinterest: '', ...(doc.social || {}) },
	seo: { metaTitle: '', titleTemplate: '', metaDescription: '', ogImage: '', keywords: [], ...(doc.seo || {}), ...seoOf(doc) },
	tracking: trackingOf(doc),
	serverSide: {
		meta: { enabled: !!doc.serverSide?.meta?.enabled, testEventCode: doc.serverSide?.meta?.testEventCode || '', tokenSet: !!doc.secrets?.metaAccessToken },
		ga4: { enabled: !!doc.serverSide?.ga4?.enabled, secretSet: !!doc.secrets?.ga4ApiSecret },
	},
	headTags: (doc.headTags || []).map((t: any) => ({ _id: String(t._id), name: t.name, location: t.location, content: t.content || '', enabled: t.enabled !== false })),
	redirects: doc.redirects || [],
	headers: doc.headers || [],
	check: doc.check || null,
	domains: project.domains || [],
	origin: siteOrigin(project, doc),
	updatedAt: doc.updatedAt,
});

export const robotsTxt = (project: any, doc: any) => {
	const seo = seoOf(doc);
	const origin = siteOrigin(project, doc);
	const lines = ['User-agent: *', seo.indexing ? 'Allow: /' : 'Disallow: /'];
	if (seo.robots.trim()) lines.push('', seo.robots.trim());
	if (seo.indexing && seo.sitemap && origin) lines.push('', `Sitemap: ${origin}/sitemap.xml`);
	return `${lines.join('\n')}\n`;
};

const xml = (s: string) => s.replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] as string));

/** Published pages (not hidden from search) as a sitemap; `origin` is the site's address. */
export const sitemapXml = (origin: string, pages: { path: string; updatedAt?: any }[]) =>
	`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
		.map(
			p =>
				`  <url><loc>${xml(`${origin}${p.path === '/' ? '/' : p.path}`)}</loc>${p.updatedAt ? `<lastmod>${new Date(p.updatedAt).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`
		)
		.join('\n')}\n</urlset>\n`;

/** What the tracker injects on the site: the tags and the code. */
export const siteTags = (doc: any) => {
	const seo = seoOf(doc);
	return {
		...trackingOf(doc),
		...codeOf(doc),
		favicon: doc?.identity?.favicon || '',
		googleVerification: seo.googleVerification,
		bingVerification: seo.bingVerification,
		noindex: !seo.indexing,
	};
};

/** How much of the setup is done — for the website overview. */
export const setupChecklist = (project: any, doc: any, pages: { total: number; published: number; withSeo: number }) => {
	const t = trackingOf(doc) as any;
	return [
		{ key: 'name', label: 'Site name', done: !!doc?.identity?.siteName },
		{ key: 'logo', label: 'Logo', done: !!doc?.identity?.logo },
		{ key: 'favicon', label: 'Favicon', done: !!doc?.identity?.favicon },
		{ key: 'seo', label: 'Default SEO', done: !!(doc?.seo?.metaTitle && doc?.seo?.metaDescription) },
		{ key: 'pages', label: 'A published page', done: pages.published > 0 },
		{ key: 'page-seo', label: 'SEO on every published page', done: pages.published > 0 && pages.withSeo >= pages.published },
		{ key: 'domain', label: 'Domain', done: (project.domains || []).length > 0 },
		{ key: 'tracking', label: 'Tracking', done: t.mintAnalytics || TRACKERS.some(k => t[k]) },
	];
};
