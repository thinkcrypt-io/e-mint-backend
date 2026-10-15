import crypto from 'crypto';
import { asText, pathValue } from './bind.js';
import { loadManifest } from './manifest.js';
import SitePage from '../models/siteBuilder/sitePage.model.js';
import SiteDesign from '../models/siteBuilder/siteDesign.model.js';
import { KIT_ROUTES, flatContent, isTyped, kitModel, orderContents, pushPage, typedItem, typedPath } from './kit.js';
import { contentTypes } from './contentTypes.js';

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
	/** the project's content types, when its Contents holds typed records (docs/cms D1): words go into one typed record per section */
	types?: TypeInfo[];
};

/**
 * Binds every unbound word in `nodes` to a new Contents record, and turns
 * grids of look-alike cards into lists of cards. Returns the nodes (changed in
 * place — pass a copy) and the records to make. Words inside a list of
 * records stay bound to the list.
 */
export const connectTree = (nodes: any[], o: ConnectOptions) => {
	if (o.types?.length) return connectTyped(nodes, o);
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

/* ------------------------------------------------------ typed records */

/** A content type as connecting needs it: its fields and its rows' (`items`), by key → kind. */
export type TypeInfo = { uid: string; fields: Map<string, string>; rows: Map<string, string> | null };

export const typeInfos = (types: any[]): TypeInfo[] =>
	types.map(t => {
		const items = (t.fields || []).find((f: any) => f.key === 'items' && f.kind === 'sectionlist');
		return {
			uid: t.uid,
			fields: new Map((t.fields || []).map((f: any) => [f.key, f.kind])),
			rows: items ? new Map((items.fields || []).map((f: any) => [f.key, f.kind])) : null,
		};
	});

/** The type a section's words go into, by what the section is (its name, as the presets name them). */
const TYPE_BY_NAME: [RegExp, string][] = [
	[/^hero/i, 'hero'],
	[/call to action|newsletter|countdown|sign.?up|cta/i, 'cta'],
	[/question|faq/i, 'faq'],
	[/number|stat/i, 'stats'],
	[/testimonial|review|quote/i, 'testimonials'],
	[/logo/i, 'logos'],
	[/gallery|photo/i, 'gallery'],
	[/feature|team|step|pricing|plan|service|product|blog|card/i, 'cards'],
	[/page title|title/i, 'text'],
	[/header/i, 'header'],
	[/footer/i, 'footer'],
];
const typeFor = (x: any, o: ConnectOptions, types: Map<string, TypeInfo>) => {
	const key = String(o.pageKey || '');
	const part = /(^|-)header$/.test(key) ? 'header' : /(^|-)footer$/.test(key) ? 'footer' : null;
	const name = part || TYPE_BY_NAME.find(([rx]) => rx.test(String(x?.name || '')))?.[1] || 'section';
	return types.get(`content.${name}`) || types.get('content.section') || null;
};

/** Where a word goes in a record, by its role: the first of these the type has and hasn't filled. */
const TOP: Record<Role, string[]> = {
	title: ['heading', 'subheading', 'eyebrow'],
	subTitle: ['eyebrow', 'subheading', 'heading'],
	description: ['text', 'body', 'caption', 'subheading'],
	image: ['image'],
	alt: ['imageAlt'],
};
const BUTTONS = [
	['buttonLabel', 'buttonUrl'],
	['secondaryLabel', 'secondaryUrl'],
] as const;
const ROW: Record<Role, string[]> = {
	title: ['title', 'subTitle', 'description'],
	subTitle: ['subTitle', 'title', 'description'],
	description: ['description', 'subTitle', 'title'],
	image: ['image'],
	alt: [],
};
/** Blocks that stand for one row of a list (a number, a quote, a question) when the type has rows. */
const ROW_BLOCKS = new Set(['stat', 'quote', 'accordion-item']);

/** A value as a field of `kind` keeps it: rich text as HTML, anything else as plain words. */
const asKind = (value: string, kind?: string) => {
	if (kind === 'editor') return looksLikeHtml(value) ? value : `<p>${escapeHtml(value)}</p>`;
	return looksLikeHtml(value) ? plainOf(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : value;
};

type Rec = ContentRecord & { type: string; block: any[] };

/**
 * connectTree for typed Contents (docs/cms D1): each top-level section's words
 * go into one record of the type the section is (a Hero, Cards, Questions…),
 * bound by path — `heading`, `buttonLabel`, `items.2.title`. A grid of
 * look-alike cards becomes the record's `items`, drawn by a list
 * (`source.content`) so a card added in the panel shows on the site; other
 * look-alike rows (questions, quotes, numbers) bind to `items.<n>.<field>`.
 * Words the type has no room for go into a Section record of their own.
 */
const connectTyped = (nodes: any[], o: ConnectOptions) => {
	const defaults = blockDefaults();
	const types = new Map((o.types || []).map(t => [t.uid, t]));
	const records: Rec[] = [];
	const copies: { from: string; to: string; name: string; section: string }[] = [];
	let n = 0;
	const slugFor = (section: string) => {
		const base = `${slugPart(o.pageKey) || 'page'}-${slugPart(section) || 'section'}`.slice(0, 100);
		return o.slugs === 'count' ? `${base}-${++n}` : `${base}-${rand()}`;
	};
	const make = (t: TypeInfo, sec: string, name: string): Rec => {
		const r: Rec = { slug: slugFor(sec), name, section: sec, type: t.uid, order: records.length, block: [{ __component: t.uid }] };
		records.push(r);
		return r;
	};

	// A copy's Contents bindings (o.fresh) get records of their own: the words are in the tree, so they're connected anew.
	if (o.fresh)
		walk(nodes, x => {
			if (x.bind) for (const k of Object.keys(x.bind)) if (x.bind[k]?.from === 'content') delete x.bind[k];
			if (x.bind && !Object.keys(x.bind).length) delete x.bind;
		});

	for (let i = 0; i < nodes.length; i++) {
		const x = nodes[i];
		if (!x || typeof x !== 'object') continue;
		const sec = o.section || slugPart(x.name || x.type);
		const secName = x.name || x.type;
		const kind = typeFor(x, o, types);
		if (!kind) continue;
		let rec: Rec | null = null;
		const more: Rec[] = [];
		let rowsUsed = false;
		const own = () => (rec ||= make(kind, sec, `${o.pageName} — ${secName}`));
		/** The section's latest extra Section record — or, `fresh`, a new one (a section with more words than one holds). */
		const extra = (fresh = false) => {
			const t = types.get('content.section');
			if (!t) return null;
			if (!fresh && more.length) return more[more.length - 1];
			const r = make(t, sec, `${o.pageName} — ${secName} (more${more.length ? ` ${more.length + 1}` : ''})`);
			more.push(r);
			return r;
		};
		const item = (r: Rec) => r.block[0];
		const typeOf = (r: Rec) => types.get(r.type)!;

		/** A free top-level field for a role, in `r` or else the extra record. */
		const place = (role: Role, isButton: boolean): { r: Rec; key: string; urlKey?: string } | null => {
			const tryIn = (r: Rec | null) => {
				if (!r) return null;
				const t = typeOf(r);
				if (isButton) {
					for (const [label, url] of BUTTONS) if (t.fields.has(label) && item(r)[label] === undefined) return { r, key: label as string, urlKey: t.fields.has(url) ? (url as string) : undefined };
					return null;
				}
				for (const key of TOP[role]) if (t.fields.has(key) && item(r)[key] === undefined) return { r, key };
				return null;
			};
			// An extra Section only when the section's own record has no room — and another when that's full.
			return tryIn(own()) || (more.length ? tryIn(more[more.length - 1]) : null) || tryIn(extra(true));
		};

		/** One block's own words, each to a free field (or a row's). */
		const bindNode = (node: any, row?: { r: Rec; i: number }) => {
			const slots = slotsOf(node.type);
			if (!slots) return;
			for (const [prop, sl] of Object.entries(slots)) {
				if (node.bind?.[prop]) continue;
				const raw = node.props?.[prop];
				if (raw !== undefined && typeof raw !== 'string') continue;
				if (typeof raw === 'string' && raw.includes('{{')) continue;
				const value = sl.role === 'image' || sl.role === 'alt' ? raw || '' : filled(node.type, prop, raw, defaults);
				if (!value) continue;
				if (value !== raw) node.props = { ...(node.props || {}), [prop]: value };
				const isButton = (node.type === 'button' && prop === 'label') || (node.type === 'link' && prop === 'text');
				const rowKinds = row ? typeOf(row.r).rows! : null;
				const cell = row ? item(row.r).items[row.i] : null;
				// A row with no room for this word: it goes where a word on its own would (so nothing stays unbound).
				const key = row ? (isButton ? ['title', 'subTitle'] : ROW[sl.role]).find(k => rowKinds!.has(k) && cell[k] === undefined) : undefined;
				if (row && key) {
					cell[key] = asKind(value, rowKinds!.get(key));
					if ((isButton || node.type === 'link') && typeof node.action?.href === 'string' && rowKinds!.has('url') && cell.url === undefined) cell.url = node.action.href;
					node.bind = { ...(node.bind || {}), [prop]: { from: 'content', slug: row.r.slug, field: `items.${row.i}.${key}` } };
					continue;
				}
				if (sl.role === 'alt' && !(rec && item(rec).image !== undefined)) continue;
				const spot = place(sl.role, isButton);
				if (!spot) continue;
				item(spot.r)[spot.key] = asKind(value, typeOf(spot.r).fields.get(spot.key));
				if (spot.urlKey && node.action?.type === 'link' && typeof node.action.href === 'string') item(spot.r)[spot.urlKey] = node.action.href;
				node.bind = { ...(node.bind || {}), [prop]: { from: 'content', slug: spot.r.slug, field: spot.key } };
			}
		};

		/** Whether a block (or one inside it) has a word not bound yet — a part already connected is left as it is. */
		const unbound = (top: any) => {
			let found = false;
			walk([top], t => {
				for (const prop of Object.keys(slotsOf(t.type) || {})) if (!t.bind?.[prop] && typeof t.props?.[prop] === 'string' && t.props[prop] && !t.props[prop].includes('{{')) found = true;
			});
			return found;
		};
		/** Look-alike children of `p` (two or more, the same blocks in the same places) with words in them not bound yet. */
		const rowsOf = (p: any) => {
			const list: any[] = p.children || [];
			if (list.length < MIN_CARDS || p.type === 'collection') return null;
			const first = sig(list[0]);
			if (list.some(c => !c || sig(c) !== first || c.type === 'collection' || c.type === 'section-ref')) return null;
			return list.some(c => cardSlots(c).length) && list.some(unbound) ? list : null;
		};
		/** A record with room for rows: this one, or the extra Section. */
		const rowHome = () => {
			if (!rowsUsed && typeOf(own()).rows) {
				rowsUsed = true;
				return own();
			}
			const last = more[more.length - 1];
			const e = last && !item(last).items ? last : extra(true);
			return e && typeOf(e).rows ? e : null;
		};

		const visit = (list: any[], _parent: any | null) => {
			for (let k = 0; k < (list || []).length; k++) {
				const node = list[k];
				if (!node || typeof node !== 'object') continue;
				// A list of records keeps its own words; a new, empty one gets three demo cards in its own Cards record.
				if (node.type === 'collection') {
					const src = node.props?.source;
					const cards = types.get('content.cards');
					if (!o.fresh && cards && (!src || (!src.model && !src.content))) {
						const r = make(cards, sec, `${o.pageName} — ${secName} cards`);
						item(r).items = DEMO_CARDS.map(c => ({ title: c.title, subTitle: c.subTitle, description: c.description, image: c.image }));
						node.props = { ...(node.props || {}), source: { content: r.slug } };
					} else if (o.fresh && src && typeof src.content === 'string') {
						const to = slugFor(sec);
						copies.push({ from: src.content, to, name: `${o.pageName} — ${secName} cards`, section: sec });
						node.props = { ...node.props, source: { ...src, content: to } };
					}
					continue;
				}
				// A grid of look-alike cards: the record's rows, drawn by a list so cards added in the panel show.
				const plan = cardPlan(node);
				if (plan) {
					const home = rowHome();
					if (home) {
						const rowKinds = typeOf(home).rows!;
						item(home).items = plan.items.map(it => Object.fromEntries(Object.entries(it).filter(([key]) => rowKinds.has(key)).map(([key, v]) => [key, asKind(String(v), rowKinds.get(key))])));
						const template = JSON.parse(JSON.stringify(node.children[0]));
						let c = 0;
						walk([template], t => {
							const order = c++;
							if (t.bind) for (const p of Object.keys(t.bind)) if (t.bind[p]?.from === 'content') delete t.bind[p];
							for (const prop of Object.keys(slotsOf(t.type) || {})) {
								const f = plan.assign.get(`${order}:${prop}`);
								if (f && rowKinds.has(f)) t.bind = { ...(t.bind || {}), [prop]: { from: 'item', field: f } };
							}
							if (t.bind && !Object.keys(t.bind).length) delete t.bind;
						});
						const pr = node.props || {};
						const clamp = (v: any, max: number, d: number) => Math.min(Math.max(Number.isInteger(v) ? v : d, 1), max);
						list[k] = {
							id: node.id,
							type: 'collection',
							...(node.name && { name: node.name }),
							props: {
								source: { content: home.slug },
								layout: 'grid',
								columns: clamp(pr.columns, 6, 3),
								columnsTablet: clamp(pr.columnsTablet, 4, 2),
								columnsMobile: clamp(pr.columnsMobile, 2, 1),
								gap: pr.gap ?? 6,
								pagination: false,
							},
							...(node.style && { style: node.style }),
							...(node.hidden && { hidden: node.hidden }),
							children: [template],
						};
						continue;
					}
				}
				// Other look-alike rows — questions, quotes, numbers, links — bound to items.<n>.
				const rows = rowsOf(node);
				if (rows) {
					const home = rowHome();
					if (home) {
						item(home).items = item(home).items || [];
						for (const r of rows) {
							const i = item(home).items.push({}) - 1;
							walk([r], t => bindNode(t, { r: home, i }));
						}
						continue;
					}
				}
				// One row-like block on its own (a single quote): a row when the type has rows.
				if (ROW_BLOCKS.has(node.type) && unbound(node) && typeOf(own()).rows && !rowsUsed) {
					rowsUsed = true;
					item(own()).items = [{}];
					walk([node], t => bindNode(t, { r: own(), i: 0 }));
					continue;
				}
				bindNode(node);
				kids(node).forEach(l => visit(l, node));
			}
		};
		// (a grid at the top level is swapped for a list in its holder — put it back in the page's list)
		const holder = [x];
		visit(holder, null);
		nodes[i] = holder[0];
	}
	// A record nothing went into (its section had no words, or they were bound already) isn't made.
	const hasWords = (r: Rec) =>
		Object.entries(r.block[0]).some(([k, v]) => k !== '__component' && (Array.isArray(v) ? v.some(x => x && typeof x === 'object' && Object.keys(x).length) : true));
	return { nodes, records: records.filter(hasWords), copies };
};

/* --------------------------------------------------------- with the DB */

const CARD_KEYS = new Set(CARD_FIELDS);

/** Whether the project's Contents model can hold a list of cards. */
export const holdsCards = (def: any) => {
	const f = def?.fields?.find((x: any) => x.key === 'card' && x.kind === 'sectionlist');
	return !!f && [...CARD_KEYS].every(k => (f.fields || []).some((s: any) => s.key === k));
};

/** The project's content types for connecting, when its Contents holds typed records (CMS-06) — else none. */
export const typesForConnect = async (def: any): Promise<TypeInfo[] | undefined> => (isTyped(def) ? typeInfos(await contentTypes()) : undefined);

/**
 * connectTree, then the records made in Contents (linked to the page's Pages
 * record). Without a Contents model the nodes come back as they were.
 */
export const connectNodes = async (nodes: any[], o: ConnectOptions & { page?: any }) => {
	const kit = await kitModel(KIT_ROUTES.contents);
	if (!kit) return { nodes, records: 0 };
	const copy = JSON.parse(JSON.stringify(nodes));
	const types = await typesForConnect(kit.def);
	const out = connectTree(copy, { ...o, types, cards: o.cards ?? holdsCards(kit.def) });
	const allowed = new Set<string>(kit.def.fields.map((f: any) => f.key));
	const kitPage = o.page ? await pushPage(o.page) : null;
	const docs: any[] = [];
	for (const r of out.records) docs.push(r);
	for (const c of out.copies) {
		const from: any = await kit.Model.findOne({ slug: c.from, archivedAt: null }).lean();
		const item = typedItem(from);
		if (types) {
			// A copy of a list of cards: the same type and words, a record of its own.
			const { _key, __component, ...fields } = item || { __component: 'content.cards', items: (from?.card || []).map(({ _id, ...rest }: any) => rest) };
			docs.push({ slug: c.to, name: c.name, section: c.section, type: __component, block: [{ __component, ...fields }] });
		} else docs.push({ slug: c.to, name: c.name, section: c.section, category: 'card', card: (from?.card || []).map(({ _id, ...rest }: any) => rest) });
	}
	await saveNew(kit, docs, kitPage, allowed);
	return { nodes: out.nodes, records: docs.length };
};

export const saveNew = async (kit: any, docs: any[], kitPage: any, allowed: Set<string>) => {
	for (const d of docs) {
		const fields: any = Object.fromEntries(Object.entries(d).filter(([k, v]) => allowed.has(k) && v !== undefined));
		if (kitPage && allowed.has('page')) fields.page = kitPage;
		if (allowed.has('status')) fields.status = 'published';
		if (allowed.has('isVisible')) fields.isVisible = true;
		const current: any = await kit.Model.findOne({ slug: d.slug, archivedAt: null }, { _id: 1 }).lean();
		if (current) {
			const doc: any = await kit.Model.findById(current._id);
			doc.set(fields);
			await doc.save();
		} else await kit.Model.create(fields);
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
			const raw = rec ? pathValue(flatContent(rec), b.field) : undefined;
			if (raw === undefined || raw === null) continue;
			const v = propValue(raw, kinds.get(n.type)?.get(prop));
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
	for (const c of changed) bySlug.set(c.slug, [...(bySlug.get(c.slug) || []), c]);
	const recs: any[] = await kit.Model.find({ slug: { $in: [...bySlug.keys()] }, archivedAt: null }, { slug: 1, block: 1 }).lean();
	const bySlugRec = new Map(recs.map(r => [r.slug, r]));
	const types = await typesForConnect(kit.def);
	let kitPage: any;
	for (const [slug, all] of bySlug) {
		const rec = bySlugRec.get(slug);
		const item = typedItem(rec);
		if (item) {
			// A typed record: each word at its path in the item (its type's kind: rich text as HTML, the rest as words).
			const kinds = types?.find(t => t.uid === item.__component);
			const $set: any = { updatedAt: new Date() };
			for (const c of all) {
				const path = typedPath(c.field);
				const [head, , cell] = path.split('.');
				if (kinds && !(cell ? kinds.rows?.has(cell) : kinds.fields.has(head))) continue;
				$set[`block.0.${path}`] = asKind(c.value, cell ? kinds?.rows?.get(cell) : kinds?.fields.get(head));
			}
			if (Object.keys($set).length > 1) await kit.Model.collection.updateOne({ _id: rec._id }, { $set });
			continue;
		}
		const list = all.filter(c => allowed.has(c.field));
		if (!list.length) continue;
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

export const pageKeyOf = (page: any) => (page?.isHome || page?.path === '/' ? 'home' : slugPart(page?.name || '') || 'page');

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
	if (made) await orderContents(page.kitPage || (await pushPage(page)), tree);
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
