import mongoose from 'mongoose';

/**
 * The navbar search over records (docs/multi-tenancy WO-54).
 *
 * A page joins it in its config — `route.search = { enabled, fields? }` on the
 * Fields & rules tab — and is off until someone turns it on. It matches the
 * query against the page's searchable fields (settings `search: true`, what
 * the table's search box reads), or the ones `fields` picks of those.
 *
 * Who sees what is the page's own list route's business: `defineRoutes` hangs
 * `searchRecords` on each router, which runs that route's list middlewares —
 * read permission, the filter middleware (archived rows stay out), per-record
 * access and anything else it injects — on a copy of the request before the
 * one query. A route whose list controller was replaced doesn't take part:
 * its rules live in code this can't run.
 */

/** Per page, and in all; a page's best hits are picked from its newest CANDIDATES matches. */
export const PER_MODEL = 5;
export const CANDIDATES = 25;
export const TOTAL = 30;
export const MIN_QUERY = 2;
const MAX_QUERY = 80;

export type SearchOptions = { enabled?: boolean; fields?: string[] };

export type SearchHit = {
	_id: string;
	/** The record's name (its display field), or its code / id when it has none. */
	name: string;
	/** The field that matched, when the name didn't. */
	match?: { field: string; label: string; value: string };
};

export type SearchGroup = { route: string; title: string; hits: SearchHit[]; more: boolean };

/** A page's search switch from its resolved config — off unless turned on. */
export const searchOptionsOf = (frontendConfig: any): SearchOptions | null => {
	const s = frontendConfig?.route?.search;
	return s && typeof s === 'object' && s.enabled === true ? s : null;
};

/** The query as a literal, case-insensitive pattern: what's typed is never a regex. */
export const literalPattern = (q: string) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const cleanQuery = (q: any) =>
	String(q ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_QUERY);

/**
 * Runs Express middlewares on `req` with a stand-in response. True when every
 * one called next(); false when one answered instead (a 403, a 404…).
 */
export const runChain = (chain: any[], req: any) =>
	new Promise<boolean>((resolve, reject) => {
		const stop = function (this: any) {
			resolve(false);
			return this;
		};
		const res: any = {
			statusCode: 200,
			locals: {},
			status(code: number) {
				this.statusCode = code;
				return this;
			},
			json: stop,
			send: stop,
			end: stop,
			sendStatus: stop,
			redirect: stop,
			setHeader() {
				return this;
			},
			set() {
				return this;
			},
			header() {
				return this;
			},
			getHeader: () => undefined,
		};
		let i = 0;
		const next = (err?: any) => {
			if (err) return reject(err);
			const mw = chain[i++];
			if (!mw) return resolve(true);
			try {
				const r = mw(req, res, next);
				if (r && typeof r.catch === 'function') r.catch(reject);
			} catch (e) {
				reject(e);
			}
		};
		next();
	});

/** A copy of the request for one route's list middlewares: its own query and queryHelper. */
export const subRequest = (req: any, query: Record<string, any>) => {
	const sub = Object.create(req);
	Object.defineProperty(sub, 'query', { value: query, writable: true, configurable: true, enumerable: true });
	sub.queryHelper = undefined;
	sub.params = {};
	return sub;
};

const valueAt = (doc: any, path: string) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), doc);

/** A field's value as one line of text: arrays joined, objects by their name. */
const textOf = (v: any): string => {
	if (v == null) return '';
	if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(', ');
	if (v instanceof Date) return v.toISOString().slice(0, 10);
	if (typeof v === 'object') return textOf(v.name ?? v.title ?? v.label ?? (mongoose.isValidObjectId(v) ? String(v) : ''));
	return String(v);
};

/** One page's hits: names, and the field that matched when the name doesn't show it. */
export const toHits = (docs: any[], { display, fields, labels, q }: { display: string; fields: string[]; labels: Record<string, string>; q: string }): SearchHit[] => {
	const needle = q.toLowerCase();
	return docs.map(doc => {
		const named = display && display !== '_id' ? textOf(valueAt(doc, display)) : '';
		const name = named || textOf(doc.code) || String(doc._id);
		const hit: SearchHit = { _id: String(doc._id), name };
		if (!name.toLowerCase().includes(needle))
			for (const f of fields) {
				const value = textOf(valueAt(doc, f));
				if (value.toLowerCase().includes(needle)) {
					hit.match = { field: f, label: labels[f] || f, value: value.length > 120 ? `${value.slice(0, 117)}…` : value };
					break;
				}
			}
		return hit;
	});
};

/** Best first: the name is the query, starts with it as a whole word, starts with it, has a word starting with it, has it; then other fields. */
const scoreOf = (hit: SearchHit, needle: string) => {
	const name = hit.name.toLowerCase();
	if (name === needle) return 0;
	if (name.startsWith(needle)) return /[a-z0-9]/i.test(name[needle.length]) ? 2 : 1;
	if (name.split(/[\s,.\-_/]+/).some(w => w.startsWith(needle))) return 3;
	if (name.includes(needle)) return 4;
	return 5;
};

/** Hits in order of how well they match — ties keep their order (newest first). */
export const rankHits = (hits: SearchHit[], q: string) => {
	const needle = q.toLowerCase();
	return hits
		.map((hit, i) => ({ hit, i, score: scoreOf(hit, needle) }))
		.sort((a, b) => a.score - b.score || a.i - b.i)
		.map(x => x.hit);
};

/** A code model's best guess at the field that names a record. */
export const guessDisplayField = (Model: mongoose.Model<any>) =>
	['name', 'title', 'code', 'email', 'label'].find(p => Model.schema.path(p)) || '_id';

type Searchable = {
	route: string;
	router: any;
	/** The field that names a record. */
	display: string;
	/** What the page is called, when its config has no title. */
	title?: string;
};

/**
 * Every page in `routes` that has search on, searched — those the person
 * can't list leave nothing behind. Groups in the order given, capped per page
 * and in all.
 */
export const searchRoutes = async (req: any, q: string, routes: Searchable[]): Promise<SearchGroup[]> => {
	const results = await Promise.all(
		routes.map(async r => {
			try {
				return await r.router.searchRecords(req, { key: r.route, q, limit: PER_MODEL, display: r.display, title: r.title });
			} catch (e: any) {
				console.error(`navbar search: ${r.route} —`, e?.message);
				return null;
			}
		})
	);
	const groups: SearchGroup[] = [];
	let left = TOTAL;
	for (const g of results) {
		if (!g || !g.hits.length || left <= 0) continue;
		const hits = g.hits.slice(0, left);
		left -= hits.length;
		groups.push({ ...g, hits, more: g.more || hits.length < g.hits.length });
	}
	return groups;
};
