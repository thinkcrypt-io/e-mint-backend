import { NODE_ID } from './ids.js';
import { loadManifest, type LoadedManifest, type PropDef, type StyleKeyDef } from './manifest.js';

/**
 * The site builder's safety check (docs/site-builder D5, D14, "Node" limits):
 * every page tree, layout and design is checked against the block manifest
 * before it is saved or published. Nothing here rewrites data — it lists
 * problems, each with the node and the path in the tree:
 *
 *   level 'error'    — never saved (wrong shape, unknown block / prop / style,
 *                      unsafe URL, duplicate id, too big or too deep)
 *   level 'publish'  — saved as a draft, but blocks Publish (an action that
 *                      points at a node or page that doesn't exist)
 *   level 'warning'  — shown, never blocks (accessibility hints, SB-08)
 */

export type Problem = { level: 'error' | 'publish' | 'warning'; nodeId?: string; path: string; message: string };
export type Result = { ok: boolean; problems: Problem[] };

const BREAKPOINTS = ['base', 'md', 'lg'];
const NODE_KEYS = new Set(['id', 'type', 'name', 'props', 'style', 'hidden', 'bind', 'children', 'slots', 'action', 'locked']);
const BINDING_FROM = ['record', 'item', 'site', 'content', 'customer'];
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){0,4}$/;
const WIDGET = /^[a-z0-9-]{1,40}$/;
const MAX_PROBLEMS = 100;

/* ------------------------------------------------------------ values */

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Relative paths, anchors, http(s), mailto, tel and `#node:<id>` — never javascript:, data: or //host. */
export const isSafeHref = (href: unknown): href is string => {
	if (typeof href !== 'string') return false;
	const h = href.trim();
	if (!h || h.length > 2048 || /[\u0000-\u001f\s]/.test(h)) return false;
	if (h.startsWith('/') && !h.startsWith('//')) return true;
	if (h.startsWith('#') || h.startsWith('?')) return true;
	return /^(https?:\/\/[^/]|mailto:|tel:)/i.test(h);
};

/** A media URL: relative or http(s), no spaces. */
export const isSafeMediaUrl = (v: unknown): v is string =>
	typeof v === 'string' && v.length <= 2048 && (/^https?:\/\/[^\s]+$/i.test(v) || /^\/[^\s/][^\s]*$/.test(v) || v === '/');

const isPlaceholder = (v: unknown) => typeof v === 'string' && /^placeholder:\d{1,4}x\d{1,4}(:.{0,60})?$/.test(v);
const isImage = (v: unknown) => v === '' || isSafeMediaUrl(v) || isPlaceholder(v);

const isLength = (v: any, units: Record<string, number> = {}) =>
	isObj(v) && typeof v.n === 'number' && Number.isFinite(v.n) && v.n >= 0 && units[v.unit] !== undefined && v.n <= units[v.unit];

const isInt = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** One style value against the manifest's style schema (mirrors mint-sites styleSchema.ts). */
export const validStyleValue = (def: StyleKeyDef | undefined, v: unknown): boolean => {
	if (!def) return false;
	const values = (def.values || []) as unknown[];
	switch (def.kind) {
		case 'enum':
		case 'space':
		case 'color':
			return values.includes(v);
		case 'int':
			return isInt(v, def.min ?? 0, def.max ?? 0) || (def.also || []).includes(v as string);
		case 'length':
			return values.includes(v) || isLength(v, def.units);
		case 'url':
			return isSafeMediaUrl(v);
		case 'gradient': {
			const colors = (loadManifest().style.bgColor?.values || []) as unknown[];
			return isObj(v) && colors.includes(v.from) && colors.includes(v.to) && isInt(v.angle, 0, 360);
		}
	}
	return false;
};

const STRING_MAX: Record<string, number> = { text: 2000, textarea: 10000, richtext: 100000, page: 64, model: 100, field: 100 };

/** Why `value` doesn't fit `def`, or null. */
const propProblem = (def: PropDef, value: any, m: LoadedManifest, depth = 0): string | null => {
	if (value === undefined || value === null) return null; // falls back to the default
	switch (def.kind) {
		case 'text':
		case 'textarea':
		case 'richtext':
		case 'page':
		case 'model':
		case 'field':
			return typeof value === 'string' && value.length <= STRING_MAX[def.kind] ? null : `${def.label} must be text (at most ${STRING_MAX[def.kind]} characters)`;
		case 'number':
			if (typeof value !== 'number' || !Number.isFinite(value)) return `${def.label} must be a number`;
			if (def.min !== undefined && value < def.min) return `${def.label} is at least ${def.min}`;
			if (def.max !== undefined && value > def.max) return `${def.label} is at most ${def.max}`;
			return null;
		case 'boolean':
			return typeof value === 'boolean' ? null : `${def.label} must be on or off`;
		case 'select':
			return (def.options || []).some(o => o.value === value) ? null : `${def.label}: “${String(value).slice(0, 40)}” isn’t one of the choices`;
		case 'color':
			return ((m.style.color?.values || []) as unknown[]).includes(value) ? null : `${def.label} must be one of the theme’s colours`;
		case 'image':
			return isImage(value) ? null : `${def.label} must be an image address (https://… or /…)`;
		case 'images':
			return Array.isArray(value) && value.length <= 50 && value.every(isImage) ? null : `${def.label} must be a list of up to 50 image addresses`;
		case 'video':
			return value === '' || isSafeMediaUrl(value) ? null : `${def.label} must be a video address (https://…)`;
		case 'link':
			return value === '' || isSafeHref(value) ? null : `${def.label} must be a page path, a web address, mailto: or tel:`;
		case 'icon':
			return value === '' || m.iconSet.has(value) ? null : `${def.label}: there is no icon “${String(value).slice(0, 40)}”`;
		case 'list': {
			if (!Array.isArray(value) || value.length > 100) return `${def.label} must be a list of up to 100 rows`;
			if (depth > 2) return `${def.label} nests too deep`;
			const fields = new Map((def.fields || []).map(f => [f.key, f]));
			for (const [i, row] of value.entries()) {
				if (!isObj(row)) return `${def.label} row ${i + 1} must be an object`;
				for (const [k, v] of Object.entries(row)) {
					const f = fields.get(k);
					if (!f) return `${def.label} row ${i + 1}: unknown field “${k}”`;
					const p = propProblem(f, v, m, depth + 1);
					if (p) return `${def.label} row ${i + 1}: ${p}`;
				}
			}
			return null;
		}
		case 'section':
			return value === '' || (typeof value === 'string' && NODE_ID.test(value)) ? null : `${def.label} must be a saved section’s id`;
		case 'source':
			// The collection block's data source (SB-09 checks it against the public API).
			return isObj(value) && typeof value.model === 'string' && value.model.length <= 100 ? null : `${def.label} must name a model`;
		default:
			return `${def.label} has a kind the builder doesn’t know (${def.kind})`;
	}
};

const bindingProblem = (b: any): string | null => {
	if (!isObj(b) || !BINDING_FROM.includes(b.from)) return `a binding comes from ${BINDING_FROM.join(', ')}`;
	if (typeof b.field !== 'string' || !FIELD_PATH.test(b.field)) return 'a binding names a field (like title or author.name)';
	if (b.from === 'content' && (typeof b.slug !== 'string' || !/^[a-z0-9-]{1,120}$/.test(b.slug))) return 'a content binding names the content’s slug';
	return null;
};

/* ------------------------------------------------------------- trees */

type TreeOptions = {
	/** Ids of nodes outside this tree that actions may target (the layout's, the page's). */
	externalIds?: Set<string>;
	/** Page ids that `{ type: 'page' }` actions may point at; unchecked when absent. */
	pageIds?: Set<string>;
	/** Where the tree sits, for messages ('page', 'header', 'footer', 'section …'). */
	label?: string;
	/** The design's saved sections, for section-ref blocks; unchecked when absent. */
	sectionIds?: Set<string>;
	/** The tree is a saved section's own: no saved sections or overlays in it. */
	inSection?: boolean;
};

export const validateTree = (tree: unknown, opts: TreeOptions = {}): Result => {
	const m = loadManifest();
	const problems: Problem[] = [];
	const add = (level: Problem['level'], path: string, message: string, nodeId?: string) => {
		if (problems.length < MAX_PROBLEMS) problems.push({ level, path, message, ...(nodeId && { nodeId }) });
	};
	const where = opts.label || 'page';

	if (!Array.isArray(tree)) {
		add('error', '', `The ${where} must be a list of blocks`);
		return { ok: false, problems };
	}
	const bytes = Buffer.byteLength(JSON.stringify(tree));
	if (bytes > m.limits.maxBytes) {
		add('error', '', `The ${where} is too big (${Math.round(bytes / 1024)} KB; the limit is ${Math.round(m.limits.maxBytes / 1024)} KB)`);
		return { ok: false, problems };
	}

	const ids = new Set<string>();
	const typeOf = new Map<string, string>();
	const actions: { node: any; path: string }[] = [];
	const headings: { level: number; at: string; id?: string }[] = [];
	let count = 0;

	const visit = (nodes: unknown, path: string, depth: number, parent: any, slot: string | null) => {
		if (!Array.isArray(nodes)) return add('error', path, `${slot ? `Slot “${slot}”` : 'Children'} must be a list of blocks`, parent?.id);
		if (depth > m.limits.maxDepth) return add('error', path, `Blocks are nested too deep (the limit is ${m.limits.maxDepth} levels)`, parent?.id);
		nodes.forEach((n: any, i: number) => {
			const at = `${path}[${i}]`;
			count++;
			if (count === m.limits.maxNodes + 1) add('error', at, `The ${where} has too many blocks (the limit is ${m.limits.maxNodes})`);
			if (count > m.limits.maxNodes) return;
			if (!isObj(n)) return add('error', at, 'A block must be an object');
			const id = typeof n.id === 'string' && NODE_ID.test(n.id) ? n.id : undefined;
			if (!id) add('error', at, 'A block needs an id (4–32 letters, digits, _ or -)');
			else if (ids.has(id)) add('error', at, `Two blocks have the id “${id}”`, id);
			else ids.add(id);

			const def = m.byType.get(n.type);
			if (!def) return add('error', at, `There is no block type “${String(n.type).slice(0, 40)}”`, id);
			if (id) typeOf.set(id, n.type);

			for (const k of Object.keys(n)) if (!NODE_KEYS.has(k)) add('error', `${at}.${k}`, `A block has no “${k}”`, id);
			if (n.name !== undefined && (typeof n.name !== 'string' || n.name.length > 80)) add('error', `${at}.name`, 'A name is text of at most 80 characters', id);
			if (n.locked !== undefined && typeof n.locked !== 'boolean') add('error', `${at}.locked`, 'locked is true or false', id);

			// Where it sits
			if (opts.inSection && def.type === 'section-ref') add('error', at, 'A saved section can’t hold another saved section', id);
			if (opts.inSection && def.category === 'overlay') add('error', at, `A ${def.label.toLowerCase()} can’t be part of a saved section`, id);
			if (def.type === 'section-ref' && !opts.inSection) {
				const ref = isObj(n.props) ? n.props.section : undefined;
				if (!ref) add('warning', `${at}.props.section`, 'This saved section block doesn’t show anything yet — choose a section', id);
				else if (typeof ref === 'string' && NODE_ID.test(ref) && opts.sectionIds && !opts.sectionIds.has(ref)) add('publish', `${at}.props.section`, 'This saved section was deleted', id);
			}
			if (parent && def.category === 'overlay') add('error', at, `A ${def.label.toLowerCase()} goes at the top level of the page, not inside another block`, id);
			if (def.canBeChildOf?.length && (!parent || !def.canBeChildOf.includes(parent.type)))
				add('error', at, `${def.label} can only go inside ${def.canBeChildOf.map(t => m.byType.get(t)?.label.toLowerCase() || t).join(' or ')}`, id);
			if (parent) {
				const allow = slot === null ? m.byType.get(parent.type)?.slots?.children?.allow : m.byType.get(parent.type)?.slots?.[slot]?.allow;
				if (allow?.length && !allow.includes(n.type)) add('error', at, `${def.label} can’t go in ${slot ? `“${slot}”` : 'there'} (allowed: ${allow.join(', ')})`, id);
			}

			// Props
			const known = m.propsOf.get(def.type)!;
			const bound = isObj(n.bind) ? n.bind : {};
			if (n.props !== undefined && !isObj(n.props)) add('error', `${at}.props`, 'props must be an object', id);
			else
				for (const [k, v] of Object.entries<any>(n.props || {})) {
					const p = known.get(k);
					if (!p) add('error', `${at}.props.${k}`, `${def.label} has no setting “${k}”`, id);
					else if (!(k in bound)) {
						const why = propProblem(p, v, m);
						if (why) add('error', `${at}.props.${k}`, why, id);
					}
				}

			// Accessibility hints (SB-08) — warnings, never blocking
			const props = isObj(n.props) ? n.props : {};
			if (def.type === 'image' && !(isObj(n.bind) && 'alt' in n.bind) && !(typeof props.alt === 'string' && props.alt.trim()))
				add('warning', `${at}.props.alt`, 'This picture has no alt text — describe it for people who can’t see it', id);
			if (def.type === 'gallery' && Array.isArray(props.items) && props.items.some((r: any) => isObj(r) && !(typeof r.alt === 'string' && r.alt.trim())))
				add('warning', `${at}.props.items`, 'Some pictures in this gallery have no alt text — describe each one', id);
			if (def.type === 'heading') headings.push({ level: [1, 2, 3, 4].includes(props.level) ? props.level : 2, at, id });

			// Bindings
			if (n.bind !== undefined) {
				if (!isObj(n.bind)) add('error', `${at}.bind`, 'bind must be an object', id);
				else
					for (const [k, b] of Object.entries<any>(n.bind)) {
						const p = known.get(k);
						if (!p) add('error', `${at}.bind.${k}`, `${def.label} has no setting “${k}”`, id);
						else if (!p.bindable) add('error', `${at}.bind.${k}`, `${p.label} can’t come from data`, id);
						else {
							const why = bindingProblem(b);
							if (why) add('error', `${at}.bind.${k}`, why, id);
						}
					}
			}

			// Style and visibility
			if (n.style !== undefined) {
				if (!isObj(n.style)) add('error', `${at}.style`, 'style must be an object', id);
				else
					for (const [bp, s] of Object.entries<any>(n.style)) {
						if (!BREAKPOINTS.includes(bp)) {
							add('error', `${at}.style.${bp}`, `Styles are per screen size: ${BREAKPOINTS.join(', ')}`, id);
							continue;
						}
						if (!isObj(s)) {
							add('error', `${at}.style.${bp}`, 'A style must be an object', id);
							continue;
						}
						for (const [k, v] of Object.entries(s)) {
							const sd = m.style[k];
							if (!sd) add('error', `${at}.style.${bp}.${k}`, `There is no style “${k}”`, id);
							else if (def.style !== 'all' && !def.style.includes(sd.group)) add('error', `${at}.style.${bp}.${k}`, `${def.label} doesn’t take ${sd.group} styles`, id);
							else if (!validStyleValue(sd, v)) add('error', `${at}.style.${bp}.${k}`, `“${JSON.stringify(v)?.slice(0, 40)}” isn’t an allowed ${k}`, id);
						}
					}
			}
			if (n.hidden !== undefined) {
				if (!isObj(n.hidden) || Object.entries(n.hidden).some(([bp, v]) => !BREAKPOINTS.includes(bp) || typeof v !== 'boolean'))
					add('error', `${at}.hidden`, 'hidden is { base?, md?, lg? } with true or false', id);
			}

			// Action
			if (n.action !== undefined && n.action !== null) {
				if (!def.actions) add('error', `${at}.action`, `${def.label} can’t have an action`, id);
				else actions.push({ node: n, path: `${at}.action` });
			}

			// Children and slots
			if (n.children !== undefined) {
				if (!def.slots?.children) add('error', `${at}.children`, `${def.label} can’t hold other blocks`, id);
				else visit(n.children, `${at}.children`, depth + 1, n, null);
			}
			if (n.slots !== undefined) {
				if (!isObj(n.slots)) add('error', `${at}.slots`, 'slots must be an object', id);
				else
					for (const [name, list] of Object.entries(n.slots)) {
						if (name === 'children' || !def.slots?.[name]) add('error', `${at}.slots.${name}`, `${def.label} has no slot “${name}”`, id);
						else visit(list, `${at}.slots.${name}`, depth + 1, n, name);
					}
			}
		});
	};
	visit(tree, '', 1, null, null);

	// Headings in order (a page's own tree only — the header and footer sit around it).
	if (where === 'page') {
		const h1 = headings.filter(h => h.level === 1);
		if (h1.length > 1) add('warning', h1[1].at, 'A page should have one main title (level 1) — make this one level 2', h1[1].id);
		headings.forEach((h, i) => {
			const prev = i ? headings[i - 1].level : 1;
			if (h.level > prev + 1) add('warning', h.at, `This heading skips a level (H${prev} → H${h.level}) — screen readers use the levels to find their way`, h.id);
		});
	}

	// Actions last: their targets may come later in the tree.
	const exists = (target: string) => ids.has(target) || !!opts.externalIds?.has(target);
	for (const { node, path } of actions) {
		const a = node.action;
		const id = node.id;
		if (!isObj(a)) {
			add('error', path, 'An action must be an object', id);
			continue;
		}
		switch (a.type) {
			case 'link':
				if (!isSafeHref(a.href)) add('error', path, 'A link goes to a page path, a web address, #node:<id>, mailto: or tel: (never javascript:)', id);
				else if (a.href.startsWith('#node:') && !exists(a.href.slice(6))) add('publish', path, 'This link scrolls to a block that no longer exists', id);
				if (a.newTab !== undefined && typeof a.newTab !== 'boolean') add('error', path, 'newTab is true or false', id);
				break;
			case 'page':
				if (typeof a.pageId !== 'string' || !a.pageId) add('error', path, 'A page link names the page', id);
				else if (opts.pageIds && !opts.pageIds.has(a.pageId)) add('publish', path, 'This link goes to a page that no longer exists', id);
				break;
			case 'open':
			case 'close':
			case 'toggle':
			case 'scroll':
				if (typeof a.target !== 'string' || !NODE_ID.test(a.target)) add('error', path, `A ${a.type} action names the block it ${a.type === 'scroll' ? 'scrolls to' : 'opens or closes'}`, id);
				else if (!exists(a.target)) add('publish', path, `This ${a.type === 'scroll' ? 'scrolls to' : 'opens'} a block that no longer exists`, id);
				else if (a.type !== 'scroll' && typeOf.has(a.target) && m.byType.get(typeOf.get(a.target)!)?.category !== 'overlay')
					add('error', path, `Only a pop-up, drawer or popover can be opened or closed — “${a.target}” is a ${m.byType.get(typeOf.get(a.target)!)?.label.toLowerCase()}`, id);
				break;
			case 'widget':
				if (typeof a.widget !== 'string' || !WIDGET.test(a.widget)) add('error', path, 'A widget action names the widget (cart, login …)', id);
				if (a.op !== undefined && !['open', 'add'].includes(a.op)) add('error', path, 'A widget action opens or adds', id);
				if (a.bind !== undefined) {
					const why = bindingProblem(a.bind);
					if (why) add('error', path, why, id);
				}
				break;
			default:
				add('error', path, `There is no action “${String(a.type).slice(0, 30)}”`, id);
		}
	}

	return { ok: !problems.some(p => p.level !== 'warning'), problems };
};

/** Every id in a tree (for actions that cross from the page into the layout and back). */
export const treeIds = (tree: unknown, out = new Set<string>()): Set<string> => {
	if (!Array.isArray(tree)) return out;
	for (const n of tree) {
		if (!isObj(n)) continue;
		if (typeof n.id === 'string') out.add(n.id);
		treeIds(n.children, out);
		if (isObj(n.slots)) Object.values(n.slots).forEach(s => treeIds(s, out));
	}
	return out;
};

/* ------------------------------------------------------------ design */

const COLOR = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\([0-9.,%\s/+-]+\))$/i;
const LENGTH = /^(0|-?[0-9]*\.?[0-9]+(px|rem|em|%))$/;
const SHADOW = /^(none|([0-9a-z.,%#()\s/-]+))$/i;
const FAMILY = /^([A-Za-z0-9 ]{1,40}|system-ui|sans-serif|serif|monospace|ui-sans-serif|ui-serif|ui-monospace)$/;
const LAYOUT_KEY = /^[a-z0-9-]{1,40}$/;

/** The fonts a design may use: the manifest's Google list and the system stacks. */
const fontFamilies = () => {
	const f: any = (loadManifest() as any).fonts;
	return new Set<string>([...(f?.google || []).map((x: any) => x.family), ...(f?.system || [])]);
};
export const COLOR_SCHEMES = ['light', 'dark', 'system'];

/** Token overrides (SiteDesign.tokens) — the keys a theme has, values checked like the renderer does. */
const tokenProblems = (tokens: unknown, add: (path: string, message: string) => void) => {
	if (tokens === undefined || tokens === null) return;
	if (!isObj(tokens)) return add('tokens', 'tokens must be an object');
	const schema = loadManifest().tokens as any;
	for (const [group, value] of Object.entries<any>(tokens)) {
		const at = `tokens.${group}`;
		if (group === 'container') {
			if (!isInt(value, 640, 1920)) add(at, 'The container width is 640–1920 px');
			continue;
		}
		if (group === 'button') {
			if (!isObj(value)) add(at, 'button must be an object');
			else
				for (const [k, v] of Object.entries(value)) {
					if (k === 'radius' && !(schema.button?.radius || []).includes(v)) add(`${at}.radius`, 'The button radius is one of the radius tokens');
					else if (k === 'weight' && !(schema.button?.weight || []).includes(v)) add(`${at}.weight`, 'The button weight is 400–800');
					else if (k === 'uppercase' && typeof v !== 'boolean') add(`${at}.uppercase`, 'uppercase is true or false');
					else if (!['radius', 'weight', 'uppercase'].includes(k)) add(`${at}.${k}`, `There is no button token “${k}”`);
				}
			continue;
		}
		const keys: string[] | undefined = schema[group]?.keys;
		if (!keys) {
			add(at, `There is no token group “${group}”`);
			continue;
		}
		if (!isObj(value)) {
			add(at, `${group} must be an object`);
			continue;
		}
		for (const [k, v] of Object.entries<any>(value)) {
			const p = `${at}.${k}`;
			if (!keys.includes(k)) add(p, `There is no ${group} token “${k}”`);
			else if (group === 'colors') {
				if (!isObj(v) || Object.entries(v).some(([mode, c]) => !['light', 'dark'].includes(mode) || typeof c !== 'string' || c.length > 64 || !COLOR.test(c)))
					add(p, 'A colour is { light, dark } with values like #0f766e');
			} else if (group === 'fonts') {
				if (isObj(v) && v.family !== undefined && FAMILY.test(v.family) && !fontFamilies().has(v.family))
					add(p, `“${v.family}” isn’t one of the fonts the builder offers`);
				else if (!isObj(v) || (v.family !== undefined && !FAMILY.test(v.family)) || (v.weights !== undefined && !(Array.isArray(v.weights) && v.weights.length <= 6 && v.weights.every((w: any) => isInt(w, 100, 900) && w % 100 === 0))))
					add(p, 'A font is { family, weights } — a Google Fonts family name and weights like 400, 700');
			} else if (group === 'shadow') {
				if (typeof v !== 'string' || v.length > 200 || !SHADOW.test(v) || /url|expression|var\(/i.test(v)) add(p, 'A shadow is a CSS box-shadow value');
			} else if (typeof v !== 'string' || !LENGTH.test(v)) add(p, 'A size is like 8px, 0.5rem or 1em');
		}
	}
};

type DesignInput = { theme?: unknown; tokens?: unknown; layouts?: unknown; sections?: unknown; colorScheme?: unknown };

/** A design (or the parts of one being changed); trees are checked like pages. */
export const validateDesign = (design: DesignInput, opts: { pageIds?: Set<string>; sectionIds?: Set<string> } = {}): Result => {
	const m = loadManifest();
	const problems: Problem[] = [];
	const add = (path: string, message: string) => problems.push({ level: 'error', path, message });

	if (design.theme !== undefined && !(typeof design.theme === 'string' && m.themeKeys.has(design.theme)))
		add('theme', `There is no theme “${String(design.theme).slice(0, 40)}” (themes: ${[...m.themeKeys].join(', ')})`);
	if (design.colorScheme !== undefined && !COLOR_SCHEMES.includes(design.colorScheme as string)) add('colorScheme', 'The colour scheme is light, dark or system');
	tokenProblems(design.tokens, add);
	// Saved sections that section-ref blocks may place: the ones sent, else the ones the caller knows.
	const sectionIds = isObj(design.sections) ? new Set(Object.keys(design.sections)) : opts.sectionIds;

	if (design.layouts !== undefined) {
		if (!isObj(design.layouts)) add('layouts', 'layouts must be an object');
		else {
			const entries = Object.entries<any>(design.layouts);
			if (entries.length > 10) add('layouts', 'At most 10 layouts');
			for (const [key, layout] of entries.slice(0, 10)) {
				if (!LAYOUT_KEY.test(key) || key === 'none') {
					add(`layouts.${key}`, 'A layout’s key is lowercase letters, digits and dashes (and not “none”)');
					continue;
				}
				if (!isObj(layout) || Object.keys(layout).some(k => !['header', 'footer'].includes(k))) {
					add(`layouts.${key}`, 'A layout is { header, footer }');
					continue;
				}
				const header = layout.header ?? [];
				const footer = layout.footer ?? [];
				const both = treeIds(header, treeIds(footer));
				for (const [part, tree] of [['header', header], ['footer', footer]] as const) {
					const r = validateTree(tree, { externalIds: both, pageIds: opts.pageIds, sectionIds, label: `${key} ${part}` });
					problems.push(...r.problems.map(p => ({ ...p, path: `layouts.${key}.${part}${p.path}` })));
				}
			}
		}
	}

	if (design.sections !== undefined) {
		if (!isObj(design.sections)) add('sections', 'sections must be an object');
		else {
			const entries = Object.entries<any>(design.sections);
			if (entries.length > 100) add('sections', 'At most 100 saved sections');
			for (const [id, section] of entries.slice(0, 100)) {
				if (!NODE_ID.test(id)) add(`sections.${id}`, 'A section’s id is 4–32 letters, digits, _ or -');
				else if (!isObj(section) || typeof section.name !== 'string' || !section.name.trim() || section.name.length > 80)
					add(`sections.${id}`, 'A section has a name (at most 80 characters) and a tree');
				else {
					const r = validateTree(section.tree, { pageIds: opts.pageIds, inSection: true, label: `section “${section.name}”` });
					problems.push(...r.problems.map(p => ({ ...p, path: `sections.${id}.tree${p.path}` })));
				}
			}
		}
	}
	return { ok: !problems.some(p => p.level !== 'warning'), problems };
};

/* ------------------------------------------------------------- pages */

/** '/', '/about', '/blog/[slug]' — lowercase letters, digits and dashes; one [param] at most (template pages). */
export const PATH = /^\/$|^(\/([a-z0-9][a-z0-9-]{0,79}|\[[a-z][a-zA-Z0-9]{0,29}\])){1,6}$/;
export const RESERVED_PATHS = ['/_next', '/api', '/__mint', '/_s', '/sitemap.xml', '/robots.txt', '/favicon.ico'];

const urlOrEmpty = (v: unknown) => v === '' || isSafeMediaUrl(v);

export const validateSeo = (seo: unknown, add: (path: string, message: string) => void) => {
	if (seo === undefined) return;
	if (!isObj(seo)) return add('seo', 'seo must be an object');
	const KEYS = ['title', 'description', 'image', 'noIndex', 'canonical', 'keywords'];
	for (const k of Object.keys(seo)) if (!KEYS.includes(k)) add(`seo.${k}`, `SEO has no “${k}”`);
	if (seo.title !== undefined && (typeof seo.title !== 'string' || seo.title.length > 200)) add('seo.title', 'The SEO title is at most 200 characters');
	if (seo.description !== undefined && (typeof seo.description !== 'string' || seo.description.length > 500)) add('seo.description', 'The description is at most 500 characters');
	if (seo.image !== undefined && !urlOrEmpty(seo.image)) add('seo.image', 'The share image is an image address');
	if (seo.noIndex !== undefined && typeof seo.noIndex !== 'boolean') add('seo.noIndex', 'noIndex is true or false');
	if (seo.canonical !== undefined && !(seo.canonical === '' || /^https?:\/\/\S+$/.test(seo.canonical))) add('seo.canonical', 'The canonical address starts with https://');
	if (seo.keywords !== undefined && !(Array.isArray(seo.keywords) && seo.keywords.length <= 20 && seo.keywords.every((k: any) => typeof k === 'string' && k.length <= 60)))
		add('seo.keywords', 'Keywords are up to 20 short words');
};

type PageInput = { name?: unknown; path?: unknown; kind?: unknown; layout?: unknown; showInMenu?: unknown; menuLabel?: unknown; priority?: unknown; seo?: unknown; source?: unknown };

/** A page's own fields (not its tree). */
export const validatePageFields = (page: PageInput, { layouts }: { layouts?: string[] } = {}): Result => {
	const problems: Problem[] = [];
	const add = (path: string, message: string) => problems.push({ level: 'error', path, message });
	if (page.name !== undefined && (typeof page.name !== 'string' || !page.name.trim() || page.name.length > 80)) add('name', 'A page needs a name (at most 80 characters)');
	if (page.path !== undefined) {
		if (typeof page.path !== 'string' || !PATH.test(page.path)) add('path', 'A path starts with / and has lowercase letters, digits and dashes, like /about or /blog/[slug]');
		else if (RESERVED_PATHS.some(r => page.path === r || (page.path as string).startsWith(`${r}/`))) add('path', `${page.path} is kept for the site itself — pick another path`);
	}
	const kind = page.kind ?? 'static';
	if (!['static', 'template'].includes(kind as string)) add('kind', 'A page is static or a template');
	if (typeof page.path === 'string') {
		const params = (page.path.match(/\[/g) || []).length;
		if (kind === 'static' && params) add('path', 'Only template pages have a [parameter] in their path');
		if (kind === 'template' && params !== 1) add('path', 'A template page’s path has one [parameter], like /blog/[slug]');
	}
	if (page.source !== undefined && page.source !== null && !(isObj(page.source) && typeof page.source.model === 'string'))
		add('source', 'A template page’s source names a model');
	if (page.layout !== undefined && !(page.layout === 'none' || (typeof page.layout === 'string' && (!layouts || layouts.includes(page.layout)))))
		add('layout', `There is no layout “${String(page.layout).slice(0, 40)}”`);
	if (page.showInMenu !== undefined && typeof page.showInMenu !== 'boolean') add('showInMenu', 'showInMenu is true or false');
	if (page.menuLabel !== undefined && (typeof page.menuLabel !== 'string' || page.menuLabel.length > 40)) add('menuLabel', 'The menu label is at most 40 characters');
	if (page.priority !== undefined && !isInt(page.priority, -1000, 1000)) add('priority', 'Priority is a whole number from -1000 to 1000');
	validateSeo(page.seo, add);
	return { ok: !problems.length, problems };
};
