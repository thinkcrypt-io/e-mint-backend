/**
 * Store search — what shoppers do with it (docs/search SI17, SI18, SI-12): the search log, clicks and adds to the bag
 * from the storefront's beacon, order lines counted as from search, the store's popular searches, and each order's
 * units on the products' search documents.
 *
 * Privacy (SI17): a query is cleaned before it's stored — anything that looks like an email, a phone number (BD or
 * E.164) or a card number becomes [email], [phone] or [number]. No IP is kept. Popular searches are only ever ones
 * made by 3 visitors or more, so one person's typing is never shown to others.
 *
 * Attribution (SI18): an order line is from search when its product was opened (or added to the bag) from a search in
 * the 24 hours before the order, by the same visitor or in the same session (the search ids the storefront kept).
 * The last search wins, and only that line's total counts.
 */
import { randomBytes } from 'crypto';
import mongoose from 'mongoose';
import SearchDoc from '../../../models/tenancy/searchDoc.model.js';
import SearchEvent from '../../../models/tenancy/searchEvent.model.js';
import { scopeFilter, scopeKey } from '../../tenantScope.function.js';
import type { SearchRequest, SearchResult } from './engine.js';
import { normalise } from './normalise.js';

const DAY = 24 * 60 * 60 * 1000;
const isId = (v: any) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
const oid = (v: any) => new mongoose.Types.ObjectId(String(v));

/* ------------------------------------------------------------------ cleaning */

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯';
const EMAIL = /[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}/gi;
// A BD mobile (01[3-9] + 8 digits), with or without +88 / 0088, spaces or dashes between the digits.
const PHONE_BD = /(?<![\d+])(?:(?:\+|00)?88[\s-]?)?01[3-9](?:[\s-]?\d){8}(?!\d)/g;
// Any other E.164 number: a plus, then 8–15 digits.
const PHONE_E164 = /(?<![\d+])\+\d(?:[\s-]?\d){7,14}(?!\d)/g;
// A card: 13–19 digits (spaces or dashes allowed) passing the Luhn check. Barcodes are 8, 12, 13 or 14 digits and
// mostly fail it; the few that pass are only hidden in the log — the search itself is never changed.
const LONG_DIGITS = /(?<!\d)\d(?:[\s-]?\d){12,18}(?!\d)/g;
const luhn = (digits: string) => {
	let sum = 0;
	for (let i = 0; i < digits.length; i++) {
		let d = Number(digits[digits.length - 1 - i]);
		if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
		sum += d;
	}
	return sum % 10 === 0;
};

/** A query as it may be stored: emails, phone numbers and card numbers taken out (SI17). */
export const cleanQuery = (q: any): string => {
	let s = String(q ?? '')
		.replace(/[০-৯]/g, d => String(BANGLA_DIGITS.indexOf(d)))
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 100);
	s = s.replace(EMAIL, '[email]');
	s = s.replace(PHONE_BD, '[phone]').replace(PHONE_E164, '[phone]');
	s = s.replace(LONG_DIGITS, m => (luhn(m.replace(/\D/g, '')) ? '[number]' : m));
	return s;
};

const PLACEHOLDER = /\[(?:email|phone|number)\]/g;
/** The normalised form of a cleaned query (stems in order), the key Insights groups by: "Shirts" and "shirt" are one. */
export const normalisedOf = (cleaned: string): string => {
	const parts: string[] = [];
	let at = 0;
	for (const m of cleaned.matchAll(PLACEHOLDER)) {
		parts.push(...normalise(cleaned.slice(at, m.index)).tokens.map(t => t.stem), m[0]);
		at = (m.index || 0) + m[0].length;
	}
	parts.push(...normalise(cleaned.slice(at)).tokens.map(t => t.stem));
	return parts.filter(Boolean).join(' ').slice(0, 100);
};

/* --------------------------------------------------------------- who and ids */

const ID = /^[A-Za-z0-9_-]{8,64}$/;
/** A visitor or session id as the storefront sent it (track.js's), or null. */
export const visitorIdOf = (v: any) => (typeof v === 'string' && ID.test(v) ? v : null);
export const newSearchId = () => randomBytes(12).toString('base64url');
const searchIdOf = (v: any) => (typeof v === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(v) ? v : null);

/** The shopper's own filters, short, for the log. */
const filtersOf = (req: SearchRequest) => {
	const f: any = req.filters || {};
	const out: any = {
		...(f.categories?.length && { categories: f.categories.slice(0, 10) }),
		...(f.collections?.length && { collections: f.collections.slice(0, 10) }),
		...(f.brands?.length && { brands: f.brands.slice(0, 10) }),
		...(f.price && { price: f.price }),
		...(f.inStock && { inStock: true }),
		...(f.onSale && { onSale: true }),
		...(f.opts && Object.keys(f.opts).length && { opts: f.opts }),
		...(req.sort && req.sort !== 'relevance' && { sort: req.sort }),
	};
	return Object.keys(out).length ? out : undefined;
};

/**
 * The engine's words, for the log — but when anything was cleaned out of the query, only those still in the cleaned
 * query: a phone number is a word to the engine too ("017 1234 5678" is three).
 */
const wordsToKeep = (raw: any, cleaned: string, words: string[]) => {
	const asTyped = String(raw ?? '').replace(/[০-৯]/g, d => String(BANGLA_DIGITS.indexOf(d))).replace(/\s+/g, ' ').trim().slice(0, 100);
	if (asTyped === cleaned) return words.slice(0, 20);
	const kept = new Set(normalise(cleaned.replace(PLACEHOLDER, ' ')).words);
	return words.filter(w => kept.has(w)).slice(0, 20);
};

const quietly = (p: Promise<any>) => p.catch(e => console.error('[search events]', e?.message || e));

/* ------------------------------------------------------------------ the log */

/**
 * Logs a shopper's search and returns its id (for the storefront to send with clicks, the bag and the order). The
 * write happens in the background: a search is never slower for being logged. Category pages (no words) aren't.
 */
export const logSearch = (req: SearchRequest, r: SearchResult, who: { visitor?: any; session?: any }) => {
	const q = cleanQuery(req.q);
	if (!q) return null;
	const searchId = newSearchId();
	const page = r.page || 1;
	quietly(
		SearchEvent.create({
			type: 'search',
			searchId,
			visitor: visitorIdOf(who.visitor),
			session: visitorIdOf(who.session),
			q,
			nq: normalisedOf(q),
			words: wordsToKeep(req.q, q, r.query?.words || []),
			results: r.total,
			top: r.doc.map(d => d._id).filter(id => isId(String(id))).slice(0, 60),
			page,
			limit: r.limit,
			filters: filtersOf(req),
			showing: r.showing?.reason || (!r.total && r.fallback ? 'fallback' : undefined),
			ms: r.ms,
		})
	);
	return searchId;
};

/**
 * The storefront's beacon (`POST /store/search/events`): clicks and adds to the bag from a search, and picks from
 * the suggestions. A click or an add must name a search of this store whose page showed that product; the position
 * is worked out here from that page. Anything else is dropped. Returns how many were kept.
 */
export const recordEvents = async (body: any, who: { visitor?: any; session?: any }) => {
	const visitor = visitorIdOf(body?.visitor) || visitorIdOf(who.visitor);
	const session = visitorIdOf(body?.session) || visitorIdOf(who.session);
	const events: any[] = (Array.isArray(body?.events) ? body.events : []).slice(0, 20);
	const ids = [...new Set(events.map(e => searchIdOf(e?.searchId)).filter(Boolean))] as string[];
	const searches = new Map<string, any>(
		ids.length ? ((await SearchEvent.find({ searchId: { $in: ids }, type: 'search' }, { searchId: 1, q: 1, nq: 1, top: 1, page: 1, limit: 1 }).lean()) as any[]).map(s => [s.searchId, s]) : []
	);
	const docs: any[] = [];
	const seen = new Set<string>();
	for (const e of events) {
		const type = String(e?.type || '');
		if (type === 'click' || type === 'cart') {
			const s = searches.get(searchIdOf(e.searchId) || '');
			if (!s || !isId(e.product)) continue;
			const at = (s.top || []).findIndex((p: any) => String(p) === e.product);
			if (at < 0) continue;
			const key = `${type}:${s.searchId}:${e.product}`;
			if (seen.has(key)) continue;
			seen.add(key);
			docs.push({ type, searchId: s.searchId, visitor, session, q: s.q, nq: s.nq, product: e.product, position: ((s.page || 1) - 1) * (s.limit || 0) + at + 1 });
		} else if (type === 'suggest') {
			const q = cleanQuery(e.q);
			if (!q) continue;
			docs.push({ type, visitor, session, q, nq: normalisedOf(q), ...(isId(e.product) && { product: e.product }), ...(searchIdOf(e.searchId) && { searchId: searchIdOf(e.searchId) }) });
		}
	}
	if (docs.length) await SearchEvent.insertMany(docs);
	return docs.length;
};

/**
 * An order placed on the website: which of its lines came from search (SI18), logged as `order` events, and each
 * product's units added to its search document's sales (SI14; the nightly rollup, SI-13, counts them again from the
 * orders). Never fails the order: it runs after, in the background.
 */
export const afterWebsiteOrder = (
	orderId: any,
	lines: { product: any; quantity: number; total: number }[],
	search: { ids?: any; visitor?: any; session?: any } | undefined
) =>
	quietly(
		(async () => {
			const byProduct = new Map<string, { quantity: number; total: number }>();
			for (const l of lines) {
				const p = String(l.product || '');
				if (!isId(p)) continue;
				const was = byProduct.get(p) || { quantity: 0, total: 0 };
				byProduct.set(p, { quantity: was.quantity + (Number(l.quantity) || 0), total: was.total + (Number(l.total) || 0) });
			}
			if (!byProduct.size) return;
			const products = [...byProduct.keys()];
			// bulkWrite isn't scoped by the plugin: the store is named here.
			const scope = scopeFilter() || {};
			await SearchDoc.bulkWrite(products.map(p => ({ updateOne: { filter: { ...scope, product: oid(p) }, update: { $inc: { 'signals.sold30': byProduct.get(p)!.quantity } } } })) as any);

			const ids = [...new Set((Array.isArray(search?.ids) ? search!.ids : []).slice(0, 50).map(searchIdOf).filter(Boolean))];
			const visitor = visitorIdOf(search?.visitor);
			const session = visitorIdOf(search?.session);
			if (!ids.length && !visitor) return;
			const from = [...(ids.length ? [{ searchId: { $in: ids } }] : []), ...(visitor ? [{ visitor }] : [])];
			const touched: any[] = await SearchEvent.find(
				{ type: { $in: ['click', 'cart'] }, product: { $in: products.map(oid) }, at: { $gte: new Date(Date.now() - DAY) }, $or: from },
				{ searchId: 1, product: 1, q: 1, nq: 1, at: 1 }
			)
				.sort({ at: -1 })
				.lean();
			const last = new Map<string, any>();
			for (const t of touched) if (!last.has(String(t.product))) last.set(String(t.product), t);
			if (!last.size) return;
			await SearchEvent.insertMany(
				[...last.entries()].map(([p, t]) => ({
					type: 'order',
					searchId: t.searchId,
					visitor,
					session,
					q: t.q,
					nq: t.nq,
					product: p,
					order: orderId,
					quantity: byProduct.get(p)!.quantity,
					revenue: byProduct.get(p)!.total,
				}))
			);
		})()
	);

/* ---------------------------------------------------------- popular searches */

const MIN_VISITORS = 3;
const popularCache = new Map<string, { at: number; list: { q: string; searches: number }[] }>();

/**
 * The store's most searched queries that found something, over the last `days`, each made by at least 3 different
 * visitors. Shown as the query people typed most often for it. Cached 5 minutes.
 */
export const popularQueries = async ({ days = 7, limit = 10 } = {}) => {
	const key = `${scopeKey()}:${days}:${limit}`;
	const hit = popularCache.get(key);
	if (hit && Date.now() - hit.at < 5 * 60 * 1000) return hit.list;
	const rows: any[] = await SearchEvent.aggregate([
		{ $match: { type: 'search', page: 1, results: { $gt: 0 }, at: { $gte: new Date(Date.now() - days * DAY) }, visitor: { $type: 'string' }, nq: { $ne: '' }, q: { $not: /\[(email|phone|number)\]/ } } },
		{ $group: { _id: { nq: '$nq', q: { $toLower: '$q' } }, n: { $sum: 1 }, visitors: { $addToSet: '$visitor' } } },
		{ $sort: { n: -1 } },
		{ $group: { _id: '$_id.nq', q: { $first: '$_id.q' }, searches: { $sum: '$n' }, visitors: { $push: '$visitors' } } },
		{ $project: { q: 1, searches: 1, visitors: { $size: { $reduce: { input: '$visitors', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } } } } },
		{ $match: { visitors: { $gte: MIN_VISITORS } } },
		{ $sort: { searches: -1, visitors: -1, q: 1 } },
		{ $limit: limit },
	]);
	const list = rows.map(r => ({ q: r.q, searches: r.searches }));
	popularCache.set(key, { at: Date.now(), list });
	if (popularCache.size > 2000) popularCache.delete(popularCache.keys().next().value as string);
	return list;
};
export const clearPopularCache = () => popularCache.clear();

/** Popular searches that start with what the shopper has typed, for the suggestions (SI11). */
export const popularStartingWith = async (typed: string, max = 6) => {
	const t = String(typed || '').toLowerCase().replace(/\s+/g, ' ').trim();
	if (!t) return [];
	const list = await popularQueries({ days: 30, limit: 200 });
	return list
		.map(p => p.q)
		.filter(q => q.startsWith(t) && q !== t)
		.slice(0, max);
};
