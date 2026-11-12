import mongoose from 'mongoose';
import { storeOf, Store } from '../../functions/commerce/store.js';
import { clearSearchCache, storeSearch } from '../../functions/commerce/search/engine.js';
import { dropVocab } from '../../functions/commerce/search/vocab.js';
import { searchInsights, searchQueryInsight } from '../../functions/commerce/search/insights.js';
import { listSuggestions, saveAiSuggestion } from '../../functions/commerce/search/learn.js';
import { buildDocs } from '../../functions/commerce/search/document.js';
import { touch } from '../../functions/commerce/search/indexer.js';
import { mayWrite } from './website.tools.js';
import { routePermission } from '../builder/builder.controller.js';
import type { Caller, ToolDef } from './mcp.router.js';

/**
 * A store's website search over MCP (docs/search SI-18): the owner's own AI reads Insights, tries searches with every
 * result explained, drafts fixes (synonyms, redirects, rules) that wait in Suggested fixes for the owner to accept,
 * and adds search words to products — a dry run first. No AI runs on our servers (the user's rule: AI via MCP).
 */

type Out = { text: string; data?: any; isError?: boolean };
const refuse = (text: string): Out => ({ text, isError: true });
const clean = (v: any) => String(v ?? '').trim();
const isId = (v: any) => mongoose.isValidObjectId(v) && String(v).length === 24;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const theStore = async (): Promise<Store | Out> => {
	try {
		return await storeOf();
	} catch (e: any) {
		return refuse(e?.message || 'This project has no store.');
	}
};
const isOut = (x: any): x is Out => typeof x?.text === 'string' && x.isError;

/** Reading search needs the right to see the store's products. */
const mayView = (req: any, caller: Caller, store: Store) => {
	const route = store.installed.product.route;
	return caller.allows(`view-${routePermission(req.app, route) || route}`) ? null : `${caller.user?.name || 'The key’s owner'} can’t see /${route}.`;
};

/** A product by id, SKU or exact name (any case). */
const findProduct = async (store: Store, q: any) => {
	const v = clean(q);
	if (!v) return null;
	const P = store.M('product');
	if (isId(v)) return P.findById(v).lean();
	return (await P.findOne({ sku: v }).lean()) || (await P.findOne({ name: v }).lean()) || (await P.findOne({ name: new RegExp(`^${esc(v)}$`, 'i') }).lean());
};

const pct = (n: any) => (n == null ? '—' : `${Math.round(Number(n) * 1000) / 10}%`);

/* ------------------------------------------------------- search_insights */

const insightsTool = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const store = await theStore();
	if (isOut(store)) return store;
	const denied = mayView(req, caller, store);
	if (denied) return refuse(denied);
	if (clean(args?.q)) {
		const one: any = await searchQueryInsight(store, { q: clean(args.q), days: args?.days });
		return { text: `“${clean(args.q)}” over ${one?.days ?? 30} days:\n${JSON.stringify(one, null, 1).slice(0, 6000)}`, data: one };
	}
	const r: any = await searchInsights(store, { days: args?.days });
	const open: any[] = (await listSuggestions({ status: 'open', limit: 20 })) as any;
	const row = (x: any) => `- “${x.q}”: ${x.searches} searches${x.zero ? `, ${x.zero} with no results` : ''}, click rate ${pct(x.clickRate)}${x.orders ? `, ${x.orders} orders` : ''}`;
	const t = r.totals || {};
	const lines = [
		`Website search, last ${r.days} days (${r.from} → ${r.to}, ${r.timeZone}):`,
		`Searches ${t.searches ?? 0}, no results ${pct(t.zeroRate)}, click rate ${pct(t.clickRate)}, orders from search ${t.orders ?? 0}, revenue ${t.revenue ?? 0}.`,
		'',
		'Top searches:',
		...(r.top || []).slice(0, 15).map(row),
		'',
		'No results (add a synonym, a redirect, search words on a product — or the product):',
		...((r.noResults || []).slice(0, 15).map(row) as string[]),
		'',
		'Low click rate (results shoppers don’t want — try_search them):',
		...((r.lowClicks || []).slice(0, 15).map(row) as string[]),
		'',
		'Trending this week:',
		...((r.trending || []).slice(0, 10).map((x: any) => `- “${x.q}”: ${x.searches} (was ${x.before})${x.zero ? `, ${x.zero} with no results` : ''}`) as string[]),
		'',
		`Suggested fixes waiting for the owner: ${open.length}${open.length ? `\n${open.map((s: any) => `- [${s.source === 'your-ai' ? 'your AI' : 'learned'}] ${s.title}`).join('\n')}` : ''}`,
	];
	return { text: lines.join('\n'), data: { ...r, suggestions: open } };
};

/* ------------------------------------------------------------ try_search */

const trySearchTool = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const store = await theStore();
	if (isOut(store)) return store;
	const denied = mayView(req, caller, store);
	if (denied) return refuse(denied);
	const q = clean(args?.q).slice(0, 100);
	const r: any = await storeSearch(store, { q, limit: Math.min(48, Number(args?.limit) || 10), page: Number(args?.page) || 1, ...(args?.sort && { sort: String(args.sort) as any }), explain: true });
	const u = r.understood || {};
	const lines = [
		`“${q}”: ${r.total} result(s), ${r.ms} ms.`,
		...(r.redirect ? [`Shoppers are sent to ${r.redirect.url} (a search redirect).`] : []),
		...(r.showing ? [`Showing instead: “${r.showing.q}” (${r.showing.reason}${r.showing.dropped?.length ? `, left out ${r.showing.dropped.join(', ')}` : ''}).`] : []),
		...(r.didYouMean ? [`Did you mean “${r.didYouMean}”?`] : []),
		`Words: ${(r.query?.words || []).join(', ') || '—'}; understood: ${JSON.stringify(u)}.`,
		...((r.query?.synonyms || []).length ? [`Synonyms used: ${r.query.synonyms.map((s: any) => `${s.word} → ${s.with.join(', ')}`).join('; ')}.`] : []),
		...((r.query?.typos || []).length ? [`Spellings tried: ${r.query.typos.map((t: any) => `${t.word} → ${t.tried.slice(0, 3).join(', ')}`).join('; ')}.`] : []),
		...((r.rules || []).length ? [`Rules that fired: ${r.rules.map((x: any) => x.name).join('; ')}.`] : []),
		'',
		...(r.doc || []).map((d: any, i: number) => `${i + 1}. ${d.name} [${d._id}]${d.pinned ? ` (pinned #${d.pinned})` : ''}${d.inStock === false ? ' (out of stock)' : ''} — ${d.explain || `score ${d.score}`}`),
		...(!(r.doc || []).length && r.fallback?.doc?.length ? [`Nothing found; shoppers see ${r.fallback.kind === 'category' ? `popular in ${r.fallback.category?.name}` : 'popular products'}: ${r.fallback.doc.map((d: any) => d.name).join(', ')}.`] : []),
	];
	return { text: lines.join('\n'), data: r };
};

/* ------------------------------------------------ save_search_suggestion */

const saveSuggestionTool = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const store = await theStore();
	if (isOut(store)) return store;
	const denied = mayView(req, caller, store);
	if (denied) return refuse(denied);
	const record = { ...(args?.record || {}) };
	// A rule may name products by SKU or name; the suggestion keeps their ids.
	if (args?.kind === 'rule' && Array.isArray(record.products)) {
		const found = await Promise.all(record.products.slice(0, 20).map((p: any) => findProduct(store, p)));
		const missing = record.products.filter((_: any, i: number) => !found[i]);
		if (missing.length) return refuse(`No product ${missing.map((m: any) => `“${m}”`).join(', ')} — give ids, SKUs or exact names.`);
		record.products = found.map((p: any) => String(p._id));
	}
	try {
		const r: any = await saveAiSuggestion(store, { kind: args?.kind, title: args?.title, why: args?.why, record });
		return {
			text: `${r.fresh ? 'Saved' : 'Updated'} for the owner to review: “${r.suggestion?.title}”. It waits in Store → Search insights → Suggested fixes (${caller.link('/store/search#store-search-suggestions')}); nothing changes until they accept it.${r.suggestion?.status && r.suggestion.status !== 'open' ? ` (They already ${r.suggestion.status} this one.)` : ''}`,
			data: r.suggestion,
		};
	} catch (e: any) {
		return refuse(e?.message || 'Couldn’t save the suggestion.');
	}
};

/* -------------------------------------------------------- enrich_products */

const MAX_WORDS = 20;

const enrichTool = async (req: any, args: any, caller: Caller): Promise<Out> => {
	const store = await theStore();
	if (isOut(store)) return store;
	const items: any[] = Array.isArray(args?.items) ? args.items : [];
	const apply = args?.apply === true;
	if (!items.length) {
		// Without items: the products with the fewest search words, for the AI to write some.
		const denied = mayView(req, caller, store);
		if (denied) return refuse(denied);
		const rows: any[] = await store
			.M('product')
			.aggregate([
				{ $match: { status: 'active', isArchived: { $ne: true } } },
				{ $addFields: { n: { $size: { $ifNull: ['$keywords', []] } } } },
				{ $sort: { n: 1, name: 1 } },
				{ $limit: Math.min(100, Number(args?.limit) || 30) },
				{ $project: { name: 1, sku: 1, keywords: 1, description: { $substrCP: [{ $ifNull: ['$description', ''] }, 0, 200] } } },
			]);
		return { text: `Products with the fewest search words:\n${rows.map(p => `- ${p.name} [${p._id}]: ${(p.keywords || []).join(', ') || 'none'}`).join('\n')}\nSend items: [{ product, add: [...] }] to see the change, then again with apply: true.`, data: { products: rows } };
	}
	if (items.length > 100) return refuse('Up to 100 products per call.');
	const route = store.installed.product.route;
	if (apply) {
		const denied = mayWrite(req, caller, route);
		if (denied) return refuse(denied);
	} else {
		const denied = mayView(req, caller, store);
		if (denied) return refuse(denied);
	}
	const plan: { id: any; name: string; before: string[]; after: string[] }[] = [];
	const problems: string[] = [];
	for (const [i, it] of items.entries()) {
		const p: any = await findProduct(store, it?.product);
		if (!p) {
			problems.push(`items[${i}]: no product “${it?.product}”`);
			continue;
		}
		const before: string[] = Array.isArray(p.keywords) ? p.keywords.map(String) : [];
		const words = (v: any) => (Array.isArray(v) ? v : []).map((w: any) => clean(w).toLowerCase().slice(0, 40)).filter(Boolean);
		const drop = new Set(words(it?.remove));
		const seen = new Set<string>();
		const after = [...before.filter(w => !drop.has(w.toLowerCase())), ...words(it?.add)].filter(w => {
			const k = w.toLowerCase();
			if (seen.has(k) || k === clean(p.name).toLowerCase()) return false;
			seen.add(k);
			return true;
		});
		if (after.length > MAX_WORDS) {
			problems.push(`items[${i}]: ${p.name} would have ${after.length} search words — keep it to ${MAX_WORDS}`);
			continue;
		}
		plan.push({ id: p._id, name: p.name, before, after });
	}
	if (problems.length) return refuse(`Nothing changed:\n${problems.join('\n')}`);
	const changed = plan.filter(x => x.before.join('\u0001') !== x.after.join('\u0001'));
	const lines = changed.map(x => `- ${x.name}: ${x.before.join(', ') || 'none'} → ${x.after.join(', ') || 'none'}`);
	if (!apply) return { text: `Dry run — nothing saved. ${changed.length} product(s) would change:\n${lines.join('\n') || '- none'}\nShow the user, then call again with apply: true.`, data: { dryRun: true, changes: changed } };
	const Product = store.M('product');
	for (const x of changed) {
		const doc: any = await Product.findById(x.id);
		if (!doc) continue;
		doc.keywords = x.after;
		await doc.save();
	}
	if (changed.length) {
		// Built now, and the store's words and answers forgotten, so a new word finds its product straight away (and
		// queued as well, so the sweep builds them again if this build fails).
		await touch(changed.map(x => x.id), 'mcp-keywords');
		await buildDocs(store, changed.map(x => x.id)).catch(() => null);
		dropVocab(String(caller.project?._id ?? ''));
		clearSearchCache();
	}
	return { text: `Saved search words on ${changed.length} product(s) — search finds them by these now:\n${lines.join('\n') || '- none'}`, data: { changes: changed } };
};

/* ----------------------------------------------------------------- tools */

export const SEARCH_INSTRUCTIONS = `

The store has its own WEBSITE SEARCH. To improve it: read search_insights (top searches, ones with no results, ones shoppers don't click, trending), try_search a search to see each result's reasons (words matched, lifts, rules), then fix — save_search_suggestion drafts a synonym, a redirect or a search rule for the owner to accept in Store → Search insights (it never changes search by itself), and enrich_products adds search words to products (always a dry run first, shown to the user, then apply: true). Prefer search words or a synonym over pinning; never invent products.`;

export const SEARCH_TOOLS: ToolDef[] = [
	{
		name: 'search_insights',
		title: 'Read website search insights',
		description: 'The store’s website search over `days` (7, 30 or 90; default 30): totals, top searches, searches with no results, searches with a low click rate, trending ones, and the Suggested fixes waiting. With `q`: that one search — its days, clicks by position and what shoppers searched next.',
		scope: 'data',
		only: 'ecommerce',
		inputSchema: { type: 'object', properties: { days: { type: 'number', enum: [7, 30, 90] }, q: { type: 'string' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: insightsTool,
	},
	{
		name: 'try_search',
		title: 'Try a website search',
		description: 'Runs a search exactly as shoppers get it (the same for everyone) and explains every result: the words it matched and where, each multiplier (all words, in stock, popular, new, on sale, learned, a rule) and the score; what was understood, synonyms and spellings used, rules that fired, any redirect, Showing results for / Did you mean, and the fallback. `sort`: relevance, popular, price, -price, newest, name.',
		scope: 'data',
		only: 'ecommerce',
		inputSchema: { type: 'object', required: ['q'], properties: { q: { type: 'string' }, page: { type: 'number' }, limit: { type: 'number', maximum: 48 }, sort: { type: 'string' } } },
		annotations: { readOnlyHint: true, openWorldHint: false },
		run: trySearchTool,
	},
	{
		name: 'save_search_suggestion',
		title: 'Suggest a search fix',
		description:
			'Saves a fix for the owner to accept in Store → Search insights → Suggested fixes (marked From your AI) — it changes nothing until they do. `kind` synonym: record { words: [...] } (all the same), or { words, to } (words also find to). `kind` redirect: { queries: [...], url, match: exact|contains }. `kind` rule: { when: exact|contains|category|always, queries, action: pin|boost|bury|hide|filter, products (ids, SKUs or names), brands, categories, collections (ids), onSale, strength }. Give `why` in a sentence the owner will read, from what search_insights / try_search showed.',
		scope: 'data',
		only: 'ecommerce',
		inputSchema: {
			type: 'object',
			required: ['kind', 'record', 'why'],
			properties: { kind: { type: 'string', enum: ['synonym', 'redirect', 'rule'] }, title: { type: 'string' }, why: { type: 'string' }, record: { type: 'object' } },
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: saveSuggestionTool,
	},
	{
		name: 'enrich_products',
		title: 'Add search words to products',
		description:
			'Search words are the other words shoppers type for a product (“eid”, “party wear”, “kurta”); search finds the product by them. Without `items`: the active products with the fewest. With `items: [{ product (id, SKU or exact name), add: [...], remove: [...] }]`: a dry run showing each product’s words before and after — show it to the user, then send the same with `apply: true` to save. Up to 20 words a product, 100 products a call; words in the name are left out.',
		scope: 'build',
		only: 'ecommerce',
		inputSchema: {
			type: 'object',
			properties: {
				items: { type: 'array', maxItems: 100, items: { type: 'object', required: ['product'], properties: { product: { type: 'string' }, add: { type: 'array', items: { type: 'string' } }, remove: { type: 'array', items: { type: 'string' } } } } },
				apply: { type: 'boolean' },
				limit: { type: 'number' },
			},
		},
		annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		run: enrichTool,
	},
];
