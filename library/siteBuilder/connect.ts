import crypto from 'crypto';
import { asText } from './bind.js';
import { loadManifest } from './manifest.js';
import SitePage from '../models/siteBuilder/sitePage.model.js';
import SiteDesign from '../models/siteBuilder/siteDesign.model.js';
import { KIT_ROUTES, kitModel, pushPage } from './kit.js';

/**
 * Every word on the site lives in Contents (docs/site-builder SB-29, D28).
 * A block's texts, pictures and button labels are bound to a Contents record
 * by slug the moment the block is added — a section from the Add tab, a
 * pasted copy, a theme's demo site, a page the AI writes — and a page made
 * before this is connected the first time the builder opens it. A grid of
 * cards that look alike (features, team, reviews, numbers, steps) becomes a
 * list: one Contents record of category "card" whose `card` entries are the
 * cards, drawn by a `collection` block (`source: { content: <slug> }`).
 *
 * The tree keeps a copy of each bound value, so the builder edits it like any
 * other text: a save writes what changed into Contents (pushTreeContents), and
 * opening a page reads what the panel changed back into it (pullTreeContents).
 * The live site reads Contents itself, so a change made in the panel shows
 * without a Publish. Every function runs inside the project's scope.
 */

export const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
const LOREM_SHORT = 'Lorem ipsum dolor sit amet';

type Role = 'title' | 'subTitle' | 'description' | 'image' | 'alt';
type Slot = { field: string; role: Role; own?: boolean };

/**
 * What each block's words go into: the Contents field, and the card field it
 * becomes inside a list of cards. `own`: a record of its own (the node's record
 * already uses that field).
 */
const SLOTS: Record<string, Record<string, Slot>> = {
	heading: { text: { field: 'content', role: 'title' } },
	text: { html: { field: 'richContent', role: 'description' } },
	button: { label: { field: 'btnText', role: 'subTitle' } },
	link: { text: { field: 'content', role: 'title' } },
	badge: { text: { field: 'content', role: 'subTitle' } },
	stat: { value: { field: 'content', role: 'title' }, label: { field: 'subContent', role: 'subTitle' } },
	quote: { text: { field: 'content', role: 'description' }, author: { field: 'subContent', role: 'title' }, role: { field: 'content', role: 'subTitle', own: true }, avatar: { field: 'image', role: 'image' } },
	'accordion-item': { title: { field: 'content', role: 'title' } },
	image: { src: { field: 'image', role: 'image' }, alt: { field: 'content', role: 'alt' } },
};

/** The slots of SLOTS whose prop the block lets come from data (`bindable` in the manifest). */
let bindableSlots: Record<string, Record<string, Slot>> | null = null;
const slotsOf = (type: string) => {
	if (!bindableSlots) {
		const m = loadManifest();
		bindableSlots = {};
		for (const [t, slots] of Object.entries(SLOTS)) {
			const def: any = (m.blocks as any[]).find(b => b.type === t);
			bindableSlots[t] = Object.fromEntries(Object.entries(slots).filter(([prop]) => def?.props.some((p: any) => p.key === prop && p.bindable)));
		}
	}
	return bindableSlots[type];
};

const CARD_FIELDS = ['title', 'subTitle', 'description', 'image'] as const;
const DEMO_CARDS = [1, 2, 3].map(n => ({ title: `Lorem ipsum ${n}`, subTitle: 'Dolor sit amet', description: LOREM, image: `placeholder:800x600:Picture ${n}` }));
/** Containers whose children can become a list of cards (a carousel or an accordion wants its own children). */
const CARD_PARENTS = new Set(['grid']);
const MIN_CARDS = 2;

const kids = (n: any): any[][] => {
	const out: any[][] = [];
	if (Array.isArray(n?.children)) out.push(n.children);
	if (n?.slots && typeof n.slots === 'object') for (const v of Object.values<any>(n.slots)) if (Array.isArray(v)) out.push(v);
	return out;
};

const walk = (nodes: any[], fn: (n: any) => void) =>
	(nodes || []).forEach(n => {
		if (!n || typeof n !== 'object') return;
		fn(n);
		kids(n).forEach(l => walk(l, fn));
	});

export const slugPart = (s: string) =>
	String(s || '')
		.toLowerCase()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 40);

const rand = () => crypto.randomBytes(4).toString('hex').slice(0, 6);

/** `<p>Just words</p>` → `Just words`; anything richer stays HTML. */
const plainOf = (html: string) => {
	const m = /^\s*<p>([^<]*)<\/p>\s*$/.exec(html);
	return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") : html;
};

const looksLikeHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The value a prop shows from a Contents field, as the prop's kind wants it. */
export const propValue = (v: any, kind: string | undefined) => {
	if (kind === 'image') return typeof v === 'object' && v ? String(v.url ?? v.src ?? '') : asText(v);
	if (kind === 'richtext') {
		const s = asText(v);
		return looksLikeHtml(s) ? s : s ? `<p>${escapeHtml(s)}</p>` : '';
	}
	return asText(v);
};

const propKinds = () => {
	const m = loadManifest();
	const out = new Map<string, Map<string, string>>();
	for (const b of m.blocks as any[]) out.set(b.type, new Map(b.props.map((p: any) => [p.key, p.kind])));
	return out;
};

const blockDefaults = () => new Map<string, any>((loadManifest().blocks as any[]).map(b => [b.type, b.defaults?.props || {}]));

/** A prop's words: the demo text when it's empty, or still the block's placeholder for a rich text. */
const filled = (type: string, prop: string, value: any, defaults: Map<string, any>) => {
	const v = typeof value === 'string' ? value : '';
	if (type === 'text' && prop === 'html' && (!v.replace(/<[^>]*>/g, '').trim() || v === defaults.get('text')?.html)) return `<p>${LOREM}</p>`;
	if (type === 'heading' && (!v.trim() || v === defaults.get('heading')?.text)) return LOREM_SHORT;
	if (v.trim()) return v;
	if (type === 'button' || type === 'link') return 'Learn more';
	return v;
};

/* ------------------------------------------------------------ the shape */

/** Two cards look alike when they have the same blocks in the same places. */
const sig = (n: any): string => `${n?.type}(${kids(n).map(l => l.map(sig).join(',')).join('|')})`;

type CardSlot = { key: string; node: number; prop: string; role: Role; value: any };

/** The words of one card, in order: `<node order>:<prop>`. */
const cardSlots = (card: any): CardSlot[] => {
	const out: CardSlot[] = [];
	let i = 0;
	walk([card], n => {
		const order = i++;
		const slots = slotsOf(n.type);
		if (!slots) return;
		for (const [prop, s] of Object.entries(slots)) {
			const v = n.props?.[prop];
			if (typeof v !== 'string' || !v || v.includes('{{')) continue;
			out.push({ key: `${order}:${prop}`, node: order, prop, role: s.role, value: v });
		}
	});
	return out;
};

/**
 * A grid of look-alike cards as a list: which card field each varying word
 * goes into. Null when the cards differ, nothing varies, or there are more
 * varying words than a card has fields.
 */
const cardPlan = (grid: any) => {
	const cards: any[] = grid.children || [];
	if (!CARD_PARENTS.has(grid.type) || cards.length < MIN_CARDS) return null;
	const first = sig(cards[0]);
	if (cards.some(c => !c || sig(c) !== first || c.type === 'collection' || c.type === 'section-ref')) return null;
	let nested = false;
	walk(cards, n => {
		if (n.type === 'collection' || n.type === 'section-ref') nested = true;
	});
	if (nested) return null;
	const all = cards.map(cardSlots);
	const keys = [...new Set(all.flatMap(s => s.map(x => x.key)))];
	const taken: Partial<Record<(typeof CARD_FIELDS)[number], string>> = {};
	const assign = new Map<string, string>();
	const alts: string[] = [];
	for (const key of keys) {
		const values = all.map(s => s.find(x => x.key === key)?.value ?? '');
		if (values.every(v => v === values[0])) continue;
		const role = (all.flatMap(s => s).find(x => x.key === key) as CardSlot).role;
		if (role === 'alt') {
			alts.push(key);
			continue;
		}
		const order = role === 'image' ? (['image'] as const) : ([role, ...(['title', 'subTitle', 'description'] as const).filter(r => r !== role)] as const);
		const f = (order as readonly string[]).find(r => !taken[r as keyof typeof taken]) as (typeof CARD_FIELDS)[number] | undefined;
		if (!f) return null;
		taken[f] = key;
		assign.set(key, f);
	}
	if (!assign.size) return null;
	for (const key of alts) if (taken.title) assign.set(key, 'title');
	const items = all.map(slots => {
		const item: Record<string, string> = {};
		for (const [key, f] of assign) {
			if (key.endsWith(':alt')) continue;
			const s = slots.find(x => x.key === key);
			if (s) item[f] = f === 'description' && s.prop === 'html' ? plainOf(s.value) : s.value;
		}
		return item;
	});
	return { assign, items };
};

/* -------------------------------------------------------------- connect */

export type ContentRecord = Record<string, any> & { slug: string; name: string };

type ConnectOptions = {
	/** the page's key in slugs (`home`, `about`, `header`) */
	pageKey: string;
	/** the page's name in record names */
	pageName: string;
	/** 'count' (the theme demos: home-hero-1 …, the same each time) or 'random' (everything added later) */
	slugs?: 'count' | 'random';
	/** whether the Contents model can hold cards (`card` list with title, subTitle, description, image) */
	cards?: boolean;
	/** a pasted or duplicated copy: its Contents bindings get new records of their own */
	fresh?: boolean;
	/** the section name every record gets (else each top-level node's own) */
	section?: string;
};

/**
 * Binds every unbound word in `nodes` to a new Contents record, and turns
 * grids of look-alike cards into lists of cards. Returns the nodes (changed in
 * place — pass a copy) and the records to make. Words inside a list of
 * records stay bound to the list.
 */
export const connectTree = (nodes: any[], o: ConnectOptions) => {
	const defaults = blockDefaults();
	const records: ContentRecord[] = [];
	const copies: { from: string; to: string; name: string; section: string }[] = [];
	let n = 0;
	const slugFor = (section: string) => {
		const base = `${slugPart(o.pageKey) || 'page'}-${slugPart(section) || 'section'}`.slice(0, 100);
		return o.slugs === 'count' ? `${base}-${++n}` : `${base}-${rand()}`;
	};

	const visit = (list: any[], section: string, sectionName: string) => {
		for (let i = 0; i < (list || []).length; i++) {
			const x = list[i];
			if (!x || typeof x !== 'object') continue;
			const sec = o.section || section || slugPart(x.name || x.type);
			const secName = sectionName || x.name || x.type;

			// A list of records (a model's, or cards already in Contents): what's inside is the list's.
			if (x.type === 'collection') {
				const src = x.props?.source;
				// A new, empty list: three demo cards in Contents until it's pointed at a model.
				if (o.cards && !o.fresh && (!src || (!src.model && !src.content))) {
					const slug = slugFor(sec);
					records.push({ slug, name: `${o.pageName} — ${secName} cards`, section: sec, category: 'card', card: DEMO_CARDS.map(c => ({ ...c })) });
					x.props = { ...(x.props || {}), source: { content: slug } };
					continue;
				}
				if (o.fresh && src && typeof src.content === 'string') {
					const to = slugFor(sec);
					copies.push({ from: src.content, to, name: `${o.pageName} — ${secName} cards`, section: sec });
					x.props = { ...x.props, source: { ...src, content: to } };
				}
				continue;
			}

			// Cards that look alike: a list of cards in one Contents record.
			if (o.cards) {
				const plan = cardPlan(x);
				if (plan) {
					const slug = slugFor(sec);
					const template = JSON.parse(JSON.stringify(x.children[0]));
					let k = 0;
					walk([template], node => {
						const order = k++;
						if (node.bind) for (const p of Object.keys(node.bind)) if (node.bind[p]?.from === 'content') delete node.bind[p];
						for (const prop of Object.keys(slotsOf(node.type) || {})) {
							const f = plan.assign.get(`${order}:${prop}`);
							if (f) node.bind = { ...(node.bind || {}), [prop]: { from: 'item', field: f } };
						}
						if (node.bind && !Object.keys(node.bind).length) delete node.bind;
					});
					records.push({ slug, name: `${o.pageName} — ${secName} cards`, section: sec, category: 'card', card: plan.items });
					const p = x.props || {};
					const clamp = (v: any, max: number, d: number) => Math.min(Math.max(Number.isInteger(v) ? v : d, 1), max);
					list[i] = {
						id: x.id,
						type: 'collection',
						...(x.name && { name: x.name }),
						props: {
							source: { content: slug },
							layout: 'grid',
							columns: clamp(p.columns, 6, 3),
							columnsTablet: clamp(p.columnsTablet, 4, 2),
							columnsMobile: clamp(p.columnsMobile, 2, 1),
							gap: p.gap ?? 6,
							pagination: false,
						},
						...(x.style && { style: x.style }),
						...(x.hidden && { hidden: x.hidden }),
						children: [template],
					};
					continue;
				}
			}

			// The node's own words: one record (a prop whose field is taken gets its own).
			const slots = slotsOf(x.type);
			if (slots) {
				let rec: ContentRecord | null = null;
				for (const [prop, s] of Object.entries(slots)) {
					const bound = x.bind?.[prop];
					if (bound && !(o.fresh && bound.from === 'content')) continue;
					const raw = x.props?.[prop];
					if (raw !== undefined && typeof raw !== 'string') continue;
					if (typeof raw === 'string' && raw.includes('{{')) continue;
					// An image or alt that's empty stays as it is; words get demo text.
					const value = s.role === 'image' || s.role === 'alt' ? raw || '' : filled(x.type, prop, raw, defaults);
					if (!value) continue;
					if (value !== raw) x.props = { ...(x.props || {}), [prop]: value };
					let target: ContentRecord | null = rec;
					if (!target || s.own || target[s.field] !== undefined) {
						target = { slug: slugFor(sec), name: `${o.pageName} — ${secName}${s.own ? ` (${prop})` : ''}`, section: sec, category: s.field === 'richContent' ? 'rich-content' : s.field === 'image' ? 'image' : 'content' };
						records.push(target);
						if (!s.own && !rec) rec = target;
					}
					target[s.field] = value;
					if (x.type === 'button' && x.action?.type === 'link' && typeof x.action.href === 'string') target.url = x.action.href;
					x.bind = { ...(x.bind || {}), [prop]: { from: 'content', slug: target.slug, field: s.field } };
				}
			}
			kids(x).forEach(l => visit(l, sec, secName));
		}
	};
	// (a grid of cards is replaced in its list — at the top level, in `nodes` itself)
	visit(nodes, '', '');
	return { nodes, records, copies };
};

/* --------------------------------------------------------- with the DB */

const CARD_KEYS = new Set(CARD_FIELDS);

/** Whether the project's Contents model can hold a list of cards. */
export const holdsCards = (def: any) => {
	const f = def?.fields?.find((x: any) => x.key === 'card' && x.kind === 'sectionlist');
	return !!f && [...CARD_KEYS].every(k => (f.fields || []).some((s: any) => s.key === k));
};

/**
 * connectTree, then the records made in Contents (linked to the page's Pages
 * record). Without a Contents model the nodes come back as they were.
 */
export const connectNodes = async (nodes: any[], o: ConnectOptions & { page?: any }) => {
	const kit = await kitModel(KIT_ROUTES.contents);
	if (!kit) return { nodes, records: 0 };
	const copy = JSON.parse(JSON.stringify(nodes));
	const out = connectTree(copy, { ...o, cards: o.cards ?? holdsCards(kit.def) });
	const allowed = new Set<string>(kit.def.fields.map((f: any) => f.key));
	const kitPage = o.page ? await pushPage(o.page) : null;
	const docs: any[] = [];
	for (const r of out.records) docs.push(r);
	for (const c of out.copies) {
		const from: any = await kit.Model.findOne({ slug: c.from, archivedAt: null }).lean();
		docs.push({ slug: c.to, name: c.name, section: c.section, category: 'card', card: (from?.card || []).map(({ _id, ...rest }: any) => rest) });
	}
	await saveNew(kit, docs, kitPage, allowed);
	return { nodes: out.nodes, records: docs.length };
};

const saveNew = async (kit: any, docs: any[], kitPage: any, allowed: Set<string>) => {
	for (const d of docs) {
		const fields: any = Object.fromEntries(Object.entries(d).filter(([k, v]) => allowed.has(k) && v !== undefined));
		if (kitPage && allowed.has('page')) fields.page = kitPage;
		if (allowed.has('status')) fields.status = 'published';
		if (allowed.has('isVisible')) fields.isVisible = true;
		const current: any = await kit.Model.findOne({ slug: d.slug, archivedAt: null }, { _id: 1 }).lean();
		if (current) await kit.Model.updateOne({ _id: current._id }, { $set: fields });
		else await kit.Model.create(fields);
	}
};

/* ---------------------------------------------------- tree ⇄ Contents */

type Bound = { slug: string; field: string; value: any; kind?: string; name: string };

/** Each content-bound prop in `trees`: its slug, field and the value the tree holds. */
const boundValues = (trees: any[][]) => {
	const kinds = propKinds();
	const out = new Map<string, Bound>();
	trees.forEach(t =>
		walk(Array.isArray(t) ? t : [], n => {
			for (const [prop, b] of Object.entries<any>(n.bind || {})) {
				if (b?.from !== 'content' || typeof b.slug !== 'string' || typeof b.field !== 'string') continue;
				const v = n.props?.[prop];
				if (typeof v !== 'string') continue;
				out.set(`${b.slug}\u0000${b.field}`, { slug: b.slug, field: b.field, value: v, kind: kinds.get(n.type)?.get(prop), name: n.name || n.type });
			}
		})
	);
	return out;
};

/** The Contents records `trees` bind to (any status: the builder shows drafts too). */
const recordsFor = async (kit: any, trees: any[][]) => {
	const slugs = new Set<string>();
	trees.forEach(t =>
		walk(Array.isArray(t) ? t : [], n => {
			for (const b of Object.values<any>(n.bind || {})) if (b?.from === 'content' && typeof b.slug === 'string') slugs.add(b.slug);
		})
	);
	if (!slugs.size) return new Map<string, any>();
	const docs: any[] = await kit.Model.find({ slug: { $in: [...slugs].slice(0, 1000) }, archivedAt: null }).lean();
	return new Map(docs.map(d => [d.slug, d]));
};

/**
 * What the panel changed in Contents, into the tree's copies. Returns the
 * tree (a copy) and whether anything changed.
 */
export const pullTreeContents = async (tree: any[]) => {
	const kit = await kitModel(KIT_ROUTES.contents);
	if (!kit || !Array.isArray(tree)) return { tree, changed: false };
	const recs = await recordsFor(kit, [tree]);
	if (!recs.size) return { tree, changed: false };
	const kinds = propKinds();
	const copy = JSON.parse(JSON.stringify(tree));
	let changed = false;
	walk(copy, n => {
		for (const [prop, b] of Object.entries<any>(n.bind || {})) {
			if (b?.from !== 'content') continue;
			const rec = recs.get(b.slug);
			if (!rec || rec[b.field] === undefined || rec[b.field] === null) continue;
			const v = propValue(rec[b.field], kinds.get(n.type)?.get(prop));
			if (v !== '' && v !== n.props?.[prop]) {
				n.props = { ...(n.props || {}), [prop]: v };
				changed = true;
			}
		}
	});
	return { tree: changed ? copy : tree, changed };
};

/**
 * The bound values a save changed (`before` → `after`), into their Contents
 * records — made when one's missing. Values that didn't change aren't
 * written, so an edit made in the panel meanwhile isn't overwritten; nor are
 * bindings the save adds (connectNodes made their records already, and a
 * block bound to an existing record shows that record's words).
 */
export const pushTreeContents = async (before: any[][], after: any[][], page?: any) => {
	const now = boundValues(after);
	if (!now.size) return 0;
	const was = boundValues(before);
	// Only bindings the page already had: a block just bound to a record takes the record's words (pull), not the other way.
	const changed = [...now.entries()].filter(([k, v]) => was.has(k) && was.get(k)!.value !== v.value).map(([, v]) => v);
	if (!changed.length) return 0;
	const kit = await kitModel(KIT_ROUTES.contents);
	if (!kit) return 0;
	const allowed = new Set<string>(kit.def.fields.map((f: any) => f.key));
	const bySlug = new Map<string, Bound[]>();
	for (const c of changed) if (allowed.has(c.field)) bySlug.set(c.slug, [...(bySlug.get(c.slug) || []), c]);
	let kitPage: any;
	for (const [slug, list] of bySlug) {
		const $set: any = Object.fromEntries(list.map(c => [c.field, c.value]));
		const res = await kit.Model.updateOne({ slug, archivedAt: null }, { $set });
		if (!res.matchedCount) {
			if (kitPage === undefined) kitPage = page ? await pushPage(page) : null;
			await saveNew(kit, [{ slug, name: `${page?.name || 'Site'} — ${list[0].name}`, category: list[0].field === 'richContent' ? 'rich-content' : 'content', ...$set }], kitPage, allowed);
		}
	}
	return changed.length;
};

/* ----------------------------------------------- pages and the layouts */

const pageKeyOf = (page: any) => (page?.isHome || page?.path === '/' ? 'home' : slugPart(page?.name || '') || 'page');

/**
 * A page as the builder opens it: what the panel changed in Contents read
 * into its tree and, when `connect`, its unbound words connected (a page made
 * before SB-29, or by hand). A new draft rev only when something changed.
 */
export const syncPage = async (page: any, { connect }: { connect: boolean }) => {
	if (!page?.draft) return page;
	const pulled = await pullTreeContents(page.draft.tree || []);
	let tree = pulled.tree;
	let made = 0;
	if (connect) {
		const r = await connectNodes(tree, { pageKey: pageKeyOf(page), pageName: page.name, page, slugs: 'random' });
		if (r.records) {
			tree = r.nodes;
			made = r.records;
		}
	}
	if (!pulled.changed && !made) return page;
	const saved = await SitePage.findOneAndUpdate({ _id: page._id, 'draft.rev': page.draft.rev }, { $set: { 'draft.tree': tree }, $inc: { 'draft.rev': 1 } }, { new: true }).lean();
	return saved || page;
};

/** The header and footer of every layout, the same way (their records belong to no page). */
export const syncLayouts = async (design: any, { connect }: { connect: boolean }) => {
	const layouts = design?.draft?.layouts;
	if (!layouts || typeof layouts !== 'object') return design;
	const next: any = {};
	let changed = false;
	for (const [key, l] of Object.entries<any>(layouts)) {
		next[key] = { ...(l || {}) };
		for (const part of ['header', 'footer'] as const) {
			const tree = Array.isArray(l?.[part]) ? l[part] : null;
			if (!tree) continue;
			const pulled = await pullTreeContents(tree);
			let t = pulled.tree;
			if (pulled.changed) changed = true;
			if (connect) {
				const name = part === 'header' ? 'Header' : 'Footer';
				const r = await connectNodes(t, { pageKey: key === 'default' ? part : `${key}-${part}`, pageName: key === 'default' ? name : `${name} (${key})`, slugs: 'random' });
				if (r.records) {
					t = r.nodes;
					changed = true;
				}
			}
			next[key][part] = t;
		}
	}
	if (!changed) return design;
	const saved = await SiteDesign.findOneAndUpdate({ _id: design._id, 'draft.rev': design.draft.rev }, { $set: { 'draft.layouts': next }, $inc: { 'draft.rev': 1 } }, { new: true }).lean();
	return saved || design;
};

/** The header and footer trees of a design's layouts, in one list (for pushTreeContents). */
export const layoutTrees = (layouts: any): any[][] =>
	Object.values<any>(layouts || {}).flatMap(l => [Array.isArray(l?.header) ? l.header : [], Array.isArray(l?.footer) ? l.footer : []]);
