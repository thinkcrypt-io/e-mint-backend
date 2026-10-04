import { REFERENCE_KINDS, singular, toModelName, toRoute } from '../../functions/dynamicModels.function.js';
import { TEMPLATE_MAX_STEPS } from '../builder/features.service.js';

/**
 * A template's blueprint (docs/templates README §3): everything a project
 * built from it gets, as plain data. This file only shapes it — known keys,
 * capped strings and lists, defaults — and reads it (placeholders, the
 * generated "What's inside"). Checking it is validate.ts; building it is the
 * apply engine (T-03). Nothing here touches the database.
 */

export type TemplateType = 'app' | 'api' | 'website';

export const PARTS = [
	'overview',
	'questions',
	'models',
	'sidebar',
	'dashboard',
	'roles',
	'endpoints',
	'webhooks',
	'website',
	'sampleData',
	'guide',
] as const;
export type Part = (typeof PARTS)[number];

/** Which parts each type uses — the studio shows these tabs, the MCP these tools. */
export const PARTS_BY_TYPE: Record<TemplateType, Part[]> = {
	app: ['overview', 'questions', 'models', 'sidebar', 'dashboard', 'roles', 'endpoints', 'sampleData', 'guide'],
	api: ['overview', 'questions', 'models', 'sidebar', 'dashboard', 'roles', 'endpoints', 'webhooks', 'sampleData', 'guide'],
	website: ['overview', 'questions', 'models', 'sidebar', 'dashboard', 'roles', 'endpoints', 'website', 'sampleData', 'guide'],
};

export const QUESTION_KINDS = ['text', 'textarea', 'select', 'currency', 'locale', 'color', 'image', 'email', 'url'] as const;
/** Filled in by the apply engine itself, never asked: the project's name, public slug and API base. */
export const BUILTIN_PLACEHOLDERS = ['project', 'slug', 'api'];
export const PAGE_STATUSES = ['published', 'draft', 'archived'];
export const PAGE_TEMPLATES = ['default', 'home', 'landing', 'content', 'contact'];
export const BLOCK_CATEGORIES = ['content', 'rich-content', 'list', 'card', 'image', 'gallery', 'list-of-links', 'video', 'section', 'other'];
export const WEBHOOK_EVENTS = ['create', 'update', 'delete'];
export const PUBLIC_ACTIONS = ['list', 'get', 'create', 'update', 'delete'];
/** The website kit's routes (websiteKit.function.ts) — a website template may point at them. */
export const KIT_ROUTES: Record<string, string> = { WebPage: 'pages', PageSeo: 'seo', WebContent: 'web-contents' };

const LIMITS = {
	steps: TEMPLATE_MAX_STEPS + 20, // kept so validation can say "too many", not silently drop them
	questions: 20,
	categories: 20,
	items: 40,
	widgets: 40,
	roles: 10,
	endpoints: 60,
	pages: 100,
	blocks: 100,
	sampleModels: 40,
	sampleRecords: 50,
	guideSteps: 20,
	faq: 20,
};

/* ---------------------------------------------------------------- shaping */

const str = (v: any, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '');
const bool = (v: any) => v === true;
const list = (v: any, max: number) => (Array.isArray(v) ? v.slice(0, max) : []);
const obj = (v: any) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const strings = (v: any, max: number, len = 60) => list(v, max).map(x => str(x, len)).filter(Boolean);
/** Plain JSON only — no functions, dates or prototypes sneak into the stored blueprint. */
const plain = (v: any) => {
	try {
		return JSON.parse(JSON.stringify(v ?? null));
	} catch {
		return null;
	}
};
const pick = (src: any, keys: string[], max = 300) =>
	Object.fromEntries(keys.map(k => [k, str(obj(src)[k], max)]).filter(([, v]) => v !== ''));

const overview = (v: any) => {
	const o = obj(v);
	return {
		name: str(o.name, 80),
		summary: str(o.summary, 300),
		description: str(o.description, 8000),
		audience: str(o.audience, 500),
		category: str(o.category, 60),
		tags: strings(o.tags, 12, 30),
		icon: str(o.icon, 40),
		color: str(o.color, 30),
		cover: str(o.cover, 1000),
		screenshots: strings(o.screenshots, 10, 1000),
	};
};

const questions = (v: any) =>
	list(v, LIMITS.questions).map((q: any) => {
		const kind = (QUESTION_KINDS as readonly string[]).includes(q?.kind) ? q.kind : 'text';
		return {
			key: str(q?.key, 40),
			label: str(q?.label, 80),
			help: str(q?.help, 300),
			kind,
			...(kind === 'select' && {
				options: list(q?.options, 50)
					.map((o: any) => (typeof o === 'string' ? { value: str(o, 80), label: str(o, 80) } : { value: str(o?.value, 80), label: str(o?.label || o?.value, 80) }))
					.filter((o: any) => o.value),
			}),
			default: str(q?.default, 200),
			required: bool(q?.required),
		};
	});

const models = (v: any) => {
	const o = obj(v);
	return {
		sidebarCategory: str(o.sidebarCategory, 60),
		steps: list(o.steps, LIMITS.steps)
			.filter((s: any) => s && typeof s === 'object' && !Array.isArray(s))
			.map(plain),
	};
};

const sidebar = (v: any) =>
	list(v, LIMITS.categories).map((c: any) => ({
		name: str(c?.name, 60),
		icon: str(c?.icon, 40),
		description: str(c?.description, 200),
		items: list(c?.items, LIMITS.items)
			.map((i: any) => (typeof i === 'string' ? { model: str(i, 60), label: '' } : { model: str(i?.model || i?.route, 60), label: str(i?.label, 60) }))
			.filter((i: any) => i.model),
	}));

const roles = (v: any) =>
	list(v, LIMITS.roles).map((r: any) => ({
		name: str(r?.name, 60),
		description: str(r?.description, 200),
		permissions: strings(r?.permissions, 20, 40),
	}));

const endpoints = (v: any) =>
	list(v, LIMITS.endpoints).map((e: any) => ({
		model: str(e?.model || e?.route, 60),
		actions: strings(e?.actions, 5, 10),
		auth: e?.auth === 'customer' ? 'customer' : 'none',
		ownerOnly: bool(e?.ownerOnly),
		note: str(e?.note, 300),
	}));

const webhooks = (v: any) =>
	list(v, LIMITS.endpoints).map((w: any) => ({
		model: str(w?.model || w?.route, 60),
		events: strings(w?.events, 3, 10),
		/** Where it's sent — usually a question's placeholder (`{{orders_webhook_url}}`); empty makes it switched off. */
		url: str(w?.url, 500),
		note: str(w?.note, 300),
	}));

const BLOCK_TEXT = ['slug', 'name', 'section', 'category', 'content', 'subContent', 'btnText', 'url', 'image', 'videoUrl', 'bgColor', 'color', 'fontSize', 'fontSizeSm', 'status'];

const block = (b: any) => ({
	...pick(b, BLOCK_TEXT, 2000),
	...(typeof b?.richContent === 'string' && { richContent: b.richContent.slice(0, 50000) }),
	...(Array.isArray(b?.list) && { list: strings(b.list, 50, 500) }),
	...(Array.isArray(b?.gallery) && { gallery: strings(b.gallery, 50, 1000) }),
	...(Array.isArray(b?.card) && {
		card: list(b.card, 50).map((c: any) => pick(c, ['image', 'title', 'subTitle', 'description'], 2000)),
	}),
});

const website = (v: any) => {
	const o = obj(v);
	const s = obj(o.settings);
	return {
		pages: list(o.pages, LIMITS.pages).map((p: any) => ({
			path: str(p?.path, 200),
			name: str(p?.name, 80),
			status: PAGE_STATUSES.includes(p?.status) ? p.status : 'published',
			template: PAGE_TEMPLATES.includes(p?.template) ? p.template : 'default',
			showInMenu: p?.showInMenu !== false,
			priority: Number.isFinite(+p?.priority) ? +p.priority : 0,
			parent: str(p?.parent, 200),
			seo: {
				...pick(p?.seo, ['title', 'description', 'image', 'canonical'], 1000),
				keywords: strings(p?.seo?.keywords, 20, 60),
				noIndex: bool(p?.seo?.noIndex),
			},
			contents: list(p?.contents, LIMITS.blocks).map(block),
		})),
		settings: {
			identity: pick(s.identity, ['siteName', 'tagline', 'logo', 'favicon', 'footerText', 'primaryColor', 'secondaryColor', 'fontFamily'], 1000),
			contact: pick(s.contact, ['email', 'phone', 'whatsapp', 'address', 'mapEmbedUrl', 'hours'], 1000),
			social: pick(s.social, ['facebook', 'instagram', 'x', 'linkedin', 'youtube', 'tiktok', 'pinterest'], 500),
			seo: { ...pick(s.seo, ['metaTitle', 'titleTemplate', 'metaDescription', 'ogImage'], 1000), keywords: strings(s.seo?.keywords, 20, 60) },
		},
		starter: {
			...pick(o.starter, ['repoUrl', 'framework', 'deployUrl'], 500),
			env: list(o.starter?.env, 30)
				.map((e: any) => ({ key: str(e?.key, 80), value: str(e?.value, 500) }))
				.filter((e: any) => e.key),
		},
	};
};

const sampleData = (v: any) =>
	Object.fromEntries(
		Object.entries(obj(v))
			.slice(0, LIMITS.sampleModels)
			.map(([model, rows]) => [str(model, 60), list(rows, LIMITS.sampleRecords).filter(r => r && typeof r === 'object' && !Array.isArray(r)).map(plain)])
			.filter(([model]) => model)
	);

const guide = (v: any) => {
	const o = obj(v);
	return {
		steps: list(o.steps, LIMITS.guideSteps).map((s: any) => ({ title: str(s?.title, 120), body: str(s?.body, 2000), page: str(s?.page, 120) })),
		faq: list(o.faq, LIMITS.faq).map((f: any) => ({ q: str(f?.q, 200), a: str(f?.a, 2000) })),
	};
};

const SHAPERS: Record<Part, (v: any) => any> = {
	overview,
	questions,
	models,
	sidebar,
	dashboard: (v: any) => list(v, LIMITS.widgets).filter(w => w && typeof w === 'object').map(plain),
	roles,
	endpoints,
	webhooks,
	website,
	sampleData,
	guide,
};

/** One part, shaped. Parts a type doesn't use come back empty. */
export const normalizePart = (type: TemplateType, part: Part, value: any) => {
	const shaped = SHAPERS[part](value);
	return PARTS_BY_TYPE[type].includes(part) ? shaped : SHAPERS[part](undefined);
};

/** A whole blueprint, shaped: every part present, known keys only. */
export const normalizeBlueprint = (type: TemplateType, input: any) => {
	const src = obj(input);
	const out: any = { type };
	for (const part of PARTS) out[part] = normalizePart(type, part, src[part]);
	return out;
};

export const emptyBlueprint = (type: TemplateType, overviewInput: any = {}) =>
	normalizeBlueprint(type, { overview: overviewInput });

/* ------------------------------------------------------------ placeholders */

const TOKEN = /\{\{\s*([A-Za-z][\w]*)\s*\}\}/g;

const walk = (v: any, fn: (s: string) => string): any => {
	if (typeof v === 'string') return fn(v);
	if (Array.isArray(v)) return v.map(x => walk(x, fn));
	if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, fn)]));
	return v;
};

/** Every `{{key}}` the blueprint uses, with where (part) it appears first. */
export const placeholdersUsed = (bp: any): Map<string, Part> => {
	const used = new Map<string, Part>();
	for (const part of PARTS) {
		if (part === 'questions') continue;
		walk(bp?.[part], s => {
			for (const m of s.matchAll(TOKEN)) if (!used.has(m[1])) used.set(m[1], part);
			return s;
		});
	}
	return used;
};

/**
 * The blueprint with every `{{key}}` replaced: the answer, else the
 * question's default, else ''. Built-ins (project, slug, api) come from
 * `builtins`. Unknown keys are listed so the caller can refuse.
 */
export const fillPlaceholders = (bp: any, answers: Record<string, any> = {}, builtins: Record<string, string> = {}) => {
	const known = new Map<string, string>();
	for (const q of bp?.questions || []) known.set(q.key, str(answers[q.key], 2000) || q.default || '');
	for (const k of BUILTIN_PLACEHOLDERS) known.set(k, builtins[k] || '');
	const unknown = new Set<string>();
	const filled: any = {};
	for (const part of PARTS)
		filled[part] =
			part === 'questions'
				? bp?.[part]
				: walk(bp?.[part], s =>
						s.replace(TOKEN, (_m, k) => {
							if (!known.has(k)) unknown.add(k);
							return known.get(k) ?? '';
						})
				  );
	return { blueprint: { ...filled, type: bp?.type }, unknown: [...unknown] };
};

/* ------------------------------------------------------- relative sample dates */

const RELATIVE_DATE = /^now(?:\s*([+-])\s*(\d{1,4})\s*([dwmy]))?$/i;

/** "now", "now-12d", "now+3w", "now-2m", "now+1y" → that day as ISO; anything else unchanged. */
export const relativeDate = (v: any, base = new Date()) => {
	const m = typeof v === 'string' ? v.trim().match(RELATIVE_DATE) : null;
	if (!m) return v;
	const d = new Date(base);
	const n = m[1] ? (m[1] === '-' ? -1 : 1) * Number(m[2]) : 0;
	const unit = (m[3] || 'd').toLowerCase();
	if (unit === 'd') d.setDate(d.getDate() + n);
	else if (unit === 'w') d.setDate(d.getDate() + 7 * n);
	else if (unit === 'm') d.setMonth(d.getMonth() + n);
	else d.setFullYear(d.getFullYear() + n);
	return d.toISOString();
};

/**
 * Sample records with their date fields (in sections and line items too)
 * resolved against the day the project is built — so "this month" on a
 * template's dashboard still has numbers a year after it was written.
 */
export const resolveSampleDates = (rows: any[], fields: any[] = [], base = new Date()): any[] => {
	const one = (r: any, fs: any[]): any => {
		if (!r || typeof r !== 'object') return r;
		const out = { ...r };
		for (const f of fs) {
			if (!f?.key || !(f.key in out)) continue;
			if (f.kind === 'date') out[f.key] = relativeDate(out[f.key], base);
			else if (f.kind === 'section') out[f.key] = one(out[f.key], f.fields || []);
			else if (f.kind === 'sectionlist' && Array.isArray(out[f.key])) out[f.key] = out[f.key].map((x: any) => one(x, f.fields || []));
		}
		return out;
	};
	return rows.map(r => one(r, fields));
};

/* ------------------------------------------------------------ what's inside */

/** A create step's model name and route as they'll be built in an empty project. */
export const stepIdentity = (s: any) => {
	const name = toModelName(str(s?.name, 60) || singular(str(s?.title, 80)));
	const route = (str(s?.route, 60).toLowerCase().replace(/[^a-z0-9-]/g, '') || (name ? toRoute(name) : '')) as string;
	return { name, route, title: str(s?.title, 80) || name };
};

/**
 * What a template holds, generated from its blueprint (TD11) — never typed by
 * hand, so it can't drift. The studio's Overview, the MCP's get_template and
 * (later) the tenant's template page show it.
 */
export const whatsInside = (bp: any) => {
	const steps = (bp?.models?.steps || []).filter((s: any) => s?.action !== 'update');
	const models = steps.map((s: any) => {
		const { name, route, title } = stepIdentity(s);
		const fields = Array.isArray(s.fields) ? s.fields : [];
		return {
			name,
			route,
			title,
			description: str(s.description, 300),
			fields: fields.length,
			links: fields
				.filter((f: any) => REFERENCE_KINDS.includes(f?.kind) && f?.ref)
				.map((f: any) => ({ field: str(f.key, 40), to: str(f.ref, 60), many: f.kind === 'references' })),
		};
	});
	const pages = bp?.website?.pages || [];
	const sample = Object.entries(bp?.sampleData || {}).map(([model, rows]: any) => ({ model, records: rows.length }));
	return {
		type: bp?.type,
		models,
		pages: pages.map((p: any) => ({ path: p.path, name: p.name, blocks: p.contents?.length || 0 })),
		endpoints: (bp?.endpoints || []).map((e: any) => ({ model: e.model, actions: e.actions, auth: e.auth })),
		webhooks: (bp?.webhooks || []).length,
		sidebar: (bp?.sidebar || []).map((c: any) => ({ name: c.name, items: c.items.length })),
		widgets: (bp?.dashboard || []).length,
		roles: (bp?.roles || []).map((r: any) => r.name),
		questions: (bp?.questions || []).length,
		sampleData: sample,
		guideSteps: (bp?.guide?.steps || []).length,
		counts: {
			models: models.length,
			fields: models.reduce((n: number, m: any) => n + m.fields, 0),
			links: models.reduce((n: number, m: any) => n + m.links.length, 0),
			pages: pages.length,
			sampleRecords: sample.reduce((n: number, s: any) => n + s.records, 0),
		},
	};
};
