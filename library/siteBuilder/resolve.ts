import ModelDefinition from '../models/builder/modelDefinition.model.js';
import { compiledModel } from '../functions/dynamicModels.function.js';
import { isId, listFilters, listSort, outKeys, publicDefs, publicReach, refPopulates, shape } from '../functions/publicRecords.function.js';
import { TenancyError } from '../functions/tenancy.function.js';

/**
 * The data a builder page shows (docs/site-builder SB-09, D8): the records of
 * its `collection` blocks and, on a template page (`/blog/[slug]`), the page's
 * record. Everything goes through the public API's own rules
 * (functions/publicRecords) — only models whose public API answers `list` /
 * `get` without a signed-in customer, archived and private records never, the
 * public API's fields and filters — so a page can never show more than the
 * public API would. Runs inside the project's scope.
 *
 *   collection.props.source = { model, filter?: { <field>[_<op>]: value }, sort?: '-price,name', pageSize? }
 *   page.source             = { model, match: { param: 'slug', field: 'slug' } }
 */

export const MAX_COLLECTIONS = 12;
export const MAX_PAGE_SIZE = 48;
export const DEFAULT_PAGE_SIZE = 12;

export type CollectionData = { items: any[]; total: number; page: number; pageSize: number; totalPages: number; problem?: string };

const childLists = (n: any): any[][] => {
	const out: any[][] = [];
	if (Array.isArray(n?.children)) out.push(n.children);
	if (n?.slots && typeof n.slots === 'object') for (const v of Object.values<any>(n.slots)) if (Array.isArray(v)) out.push(v);
	return out;
};

/** The collection blocks in `trees`, outermost first; one inside another's item template is left out (`nested`). */
export const collectionsIn = (trees: any[][]) => {
	const found: any[] = [];
	const nested: any[] = [];
	const visit = (nodes: any[], inside: boolean) => {
		for (const n of nodes || []) {
			if (!n || typeof n !== 'object') continue;
			const here = n.type === 'collection';
			if (here) (inside ? nested : found).push(n);
			childLists(n).forEach(l => visit(l, inside || here));
		}
	};
	trees.forEach(t => visit(Array.isArray(t) ? t : [], false));
	return { found, nested };
};

/** Why a model can't feed the site, or null: it needs a public `action` that anyone may call. */
export const publicProblem = (def: any, action: 'list' | 'get', title = def?.title) => {
	if (!def) return `There is no model “${title}” with a public API`;
	if (!def.publicApi?.enabled || !(def.publicApi?.actions || []).includes(action)) return `Turn on ${def.title}’s public API (${action}) to show it on the site`;
	if (def.publicApi?.auth === 'customer') return `${def.title}’s public API is for signed-in customers only, so the site can’t show it`;
	return null;
};

/** Every active model by route — to name a private one in a problem. */
const allDefs = async () => {
	const defs: any[] = await ModelDefinition.find({ active: { $ne: false } }, { route: 1, title: 1, name: 1, publicApi: 1 }).lean();
	return new Map(defs.map(d => [d.route, d]));
};

/** The problem with showing `model` on the site: private, missing, or none. */
const sourceProblem = (route: string, action: 'list' | 'get', defs: Map<string, any>, all: Map<string, any>) =>
	defs.has(route) ? publicProblem(defs.get(route), action) : all.has(route) ? publicProblem(all.get(route), action) : `There is no model “${route}”`;

/** A source's filter as the public list's query: { price_gte: 10, tags: ['a', 'b'] } → strings. */
const queryOf = (filter: unknown) => {
	const q: Record<string, string | string[]> = {};
	if (!filter || typeof filter !== 'object' || Array.isArray(filter)) return q;
	for (const [k, v] of Object.entries<any>(filter).slice(0, 20)) {
		if (!/^[A-Za-z0-9_]{1,80}$/.test(k) || v === undefined || v === null || v === '') continue;
		q[k] = Array.isArray(v) ? v.slice(0, 100).map(String) : String(v);
	}
	return q;
};

const pageSizeOf = (props: any) => {
	const n = Number(props?.source?.pageSize ?? props?.pageSize);
	return Number.isInteger(n) ? Math.min(Math.max(n, 1), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
};

const empty = (pageSize: number, problem?: string): CollectionData => ({ items: [], total: 0, page: 1, pageSize, totalPages: 1, ...(problem && { problem }) });

/** One collection's records: its source's filter, sort and page size; `page` only when it pages. */
const readCollection = async (node: any, defs: Map<string, any>, page: number, all: () => Promise<Map<string, any>>): Promise<CollectionData> => {
	const props = node.props || {};
	const source = props.source || {};
	const pageSize = pageSizeOf(props);
	if (typeof source.model !== 'string' || !source.model) return empty(pageSize, 'Pick the model this list shows');
	const def = defs.get(source.model);
	const why = def ? publicProblem(def, 'list') : sourceProblem(source.model, 'list', defs, await all());
	if (why) return empty(pageSize, why);
	const Model = compiledModel(def.name);
	if (!Model) return empty(pageSize, `${def.title} isn’t available right now`);
	let and: any[];
	try {
		and = listFilters(def, queryOf(source.filter));
	} catch (e: any) {
		if (e instanceof TenancyError) return empty(pageSize, `Filter: ${e.message}`);
		throw e;
	}
	const current = props.pagination ? Math.max(1, Math.min(page || 1, 1000)) : 1;
	const query: any = { ...publicReach(def), ...(and.length && { $and: and }) };
	const keys = outKeys(def);
	const [docs, total] = await Promise.all([
		Model.find(query)
			.select(keys.join(' '))
			.sort(listSort(def, source.sort))
			.skip((current - 1) * pageSize)
			.limit(pageSize)
			.populate(await refPopulates(def))
			.lean(),
		Model.countDocuments(query),
	]);
	return { items: docs.map((d: any) => shape(d, def)), total, page: current, pageSize, totalPages: Math.ceil(total / pageSize) || 1 };
};

/** The records every collection in `trees` shows, by node id (at most MAX_COLLECTIONS; the rest say so). */
export const resolveCollections = async (trees: any[][], { page = 1 }: { page?: number } = {}) => {
	const { found } = collectionsIn(trees);
	if (!found.length) return {} as Record<string, CollectionData>;
	const defs = await publicDefs();
	let everyDef: Promise<Map<string, any>> | null = null;
	const all = () => (everyDef ||= allDefs());
	const out: Record<string, CollectionData> = {};
	await Promise.all(
		found.map(async (n, i) => {
			if (typeof n.id !== 'string') return;
			out[n.id] = i < MAX_COLLECTIONS ? await readCollection(n, defs, page, all) : empty(pageSizeOf(n.props), `At most ${MAX_COLLECTIONS} lists of records on one page`);
		})
	);
	return out;
};

/* ------------------------------------------------------- template pages */

/** '/blog/[slug]' → its parameter and a matcher; null for a static path. */
export const templatePattern = (path: string) => {
	const m = String(path || '').match(/\[([a-z][a-z0-9_]{0,39})\]/);
	if (!m) return null;
	const [before, after] = path.split(m[0]);
	const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return { param: m[1], regex: new RegExp(`^${esc(before)}([^/]{1,200})${esc(after)}$`) };
};

/** The record a template page shows: its source model's record whose `match.field` is `value`. */
export const findTemplateRecord = async (source: any, value: string) => {
	if (!source || typeof source.model !== 'string') return null;
	const defs = await publicDefs();
	const def = defs.get(source.model);
	if (!def || publicProblem(def, 'get')) return null;
	const Model = compiledModel(def.name);
	if (!Model) return null;
	const field = typeof source.match?.field === 'string' && source.match.field ? source.match.field : 'slug';
	let cond: any;
	if (field === '_id') {
		if (!isId(value)) return null;
		cond = { _id: value };
	} else {
		const f = def.fields.find((x: any) => x.key === field);
		if (!f) return null;
		cond = { [field]: f.kind === 'number' ? Number(value) : value };
	}
	const doc = await Model.findOne({ ...cond, ...publicReach(def) })
		.select(outKeys(def).join(' '))
		.populate(await refPopulates(def))
		.lean();
	return doc ? shape(doc, def) : null;
};

/** A record to show a template page with in the editor: `recordId`'s, or the newest. */
export const sampleRecord = async (source: any, recordId?: string) => {
	if (!source || typeof source.model !== 'string') return null;
	const def = (await publicDefs()).get(source.model);
	if (!def || publicProblem(def, 'get')) return null;
	const Model = compiledModel(def.name);
	if (!Model) return null;
	const doc = await Model.findOne({ ...publicReach(def), ...(recordId && isId(recordId) && { _id: recordId }) })
		.sort({ createdAt: -1, _id: -1 })
		.select(outKeys(def).join(' '))
		.populate(await refPopulates(def))
		.lean();
	return doc ? shape(doc, def) : null;
};

/* ------------------------------------------------------ the editor's view */

/** The project's models for the editor's data pickers and the MCP: fields, public API, a sample record. */
export const dataModels = async () => {
	const defs: any[] = await ModelDefinition.find({ active: { $ne: false } }, { name: 1, route: 1, title: 1, fields: 1, publicApi: 1 })
		.sort({ title: 1 })
		.lean();
	return Promise.all(
		defs.map(async d => {
			const pub = d.publicApi?.enabled ? d : null;
			const list = !!pub && !publicProblem(pub, 'list');
			const get = !!pub && !publicProblem(pub, 'get');
			const Model = list || get ? compiledModel(d.name) : null;
			const sample = Model ? await Model.findOne(publicReach(d)).sort({ createdAt: -1 }).select(outKeys(d).join(' ')).lean() : null;
			return {
				model: d.route,
				title: d.title,
				list,
				get,
				problem: list ? null : publicProblem(pub, 'list', d.title) || `Turn on ${d.title}’s public API to show it on the site`,
				fields: [
					...(d.fields || [])
						.filter((f: any) => f.kind !== 'password')
						.map((f: any) => ({ key: f.key, label: f.label || f.key, kind: f.kind, ...(f.ref && { ref: f.ref }), ...(f.options?.length && { options: f.options.map((o: any) => o.value) }) })),
					{ key: 'createdAt', label: 'Created', kind: 'date' },
				],
				sample: sample ? shape(sample, d) : null,
			};
		})
	);
};

/** What Publish checks about data: each collection and template page names a model the site may read. */
export const dataProblems = async (pages: any[], design: any) => {
	const [defs, all] = await Promise.all([publicDefs(), allDefs()]);
	const out: { level: 'publish' | 'warning'; path: string; message: string; nodeId?: string; page?: string; pageName?: string; part: 'page' | 'design' }[] = [];
	const layouts = Object.values<any>(design?.draft?.layouts || {});
	const check = (trees: any[][], where: { page?: string; pageName?: string; part: 'page' | 'design' }) => {
		const { found, nested } = collectionsIn(trees);
		found.forEach((n, i) => {
			const model = n.props?.source?.model;
			const why = !model ? 'Pick the model this list of records shows' : sourceProblem(model, 'list', defs, all);
			if (why) out.push({ level: 'publish', path: `${n.id}.props.source`, message: why, nodeId: n.id, ...where });
			else if (i >= MAX_COLLECTIONS) out.push({ level: 'publish', path: `${n.id}`, message: `At most ${MAX_COLLECTIONS} lists of records on one page`, nodeId: n.id, ...where });
		});
		nested.forEach(n => out.push({ level: 'warning', path: `${n.id}`, message: 'A list inside another list’s items shows nothing', nodeId: n.id, ...where }));
	};
	for (const p of pages) {
		if (p.status === 'unpublished') continue;
		const where = { page: String(p._id), pageName: p.name, part: 'page' as const };
		check([p.draft?.tree || []], where);
		if (p.kind === 'template') {
			const model = p.source?.model;
			const why = !model ? 'A template page needs the model it shows' : sourceProblem(model, 'get', defs, all);
			if (why) out.push({ level: 'publish', path: 'source', message: why, ...where });
		}
	}
	check(
		layouts.flatMap(l => [l?.header || [], l?.footer || []]),
		{ part: 'design' }
	);
	return out;
};
