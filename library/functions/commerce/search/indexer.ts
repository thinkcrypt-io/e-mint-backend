/**
 * Store search — keeping every store's search documents current (docs/search SI5).
 *
 * Three ways a change reaches the index, from fastest to safest:
 *  1. **Touches.** A product, variant, category, brand or collection saved from the panel or over MCP (fireCommerce),
 *     a stock move, a discount reaching products: the products it affects are queued (`SearchQueue`, one row per
 *     product). The tick (every 5 s) claims a store's rows with a lease and builds them.
 *  2. **The sweep** (every 2 minutes): anything updated since the last sweep is queued — products, variants,
 *     categories, brands, collections. It catches what no hook saw (the public API, bulk imports, engine updates).
 *  3. **The drift check** (daily): findable products against documents; a store that doesn't match is rebuilt. It
 *     catches what neither saw (deletes outside the panel).
 * The sweep also runs the rollups (`rollup.ts`, SI-13) when they're due: daily totals hourly, signals daily.
 * A store never indexed is rebuilt by its first sweep, so every store gets search without a migration.
 *
 * State lives in the store's CommerceSettings under `search.index`: version (goes up on every write — the search
 * caches' key, SI19), builtAt, sweptAt, driftAt, lastDrift, rebuild { status, done, total, … }.
 */
import crypto from 'crypto';
import CommerceSettings from '../../../models/tenancy/commerceSettings.model.js';
import SearchDoc from '../../../models/tenancy/searchDoc.model.js';
import SearchQueue from '../../../models/tenancy/searchQueue.model.js';
import { currentScope, runInScope, runUnscoped } from '../../tenantScope.function.js';
import { storeOf, type Store } from '../store.js';
import { buildDocs } from './document.js';
import { rollupStore } from './rollup.js';
import { learnStore } from './learn.js';

const TICK_MS = () => Number(process.env.SEARCH_TICK_MS) || 5000;
const SWEEP_MS = () => Number(process.env.SEARCH_SWEEP_MS) || 2 * 60 * 1000;
const DRIFT_MS = () => Number(process.env.SEARCH_DRIFT_MS) || 24 * 3600 * 1000;
const BATCH = 500;
const LEASE_MS = 2 * 60 * 1000;
const REBUILD_LEASE_MS = 10 * 60 * 1000;
/** Clocks of two servers can differ a little: a sweep looks back this much further. */
const OVERLAP_MS = 5000;

const sid = (v: any) => (v == null ? '' : String(v?._id ?? v));

const scopeIds = () => {
	const s = currentScope();
	return s?.project ? { organization: s.organization, project: s.project } : null;
};

const indexState = async (): Promise<any> => ((await CommerceSettings.findOne({}, { 'search.index': 1 }).lean()) as any)?.search?.index || {};
const bumpVersion = () => CommerceSettings.updateOne({}, { $inc: { 'search.index.version': 1 } });

/* ------------------------------------------------------------------- touches */

/** Queues these products to be built again. In a store's scope. */
export const touch = async (productIds: any[], reason = '') => {
	const scope = scopeIds();
	const ids = [...new Set(productIds.map(sid).filter(x => /^[a-f0-9]{24}$/i.test(x)))];
	if (!scope || !ids.length) return 0;
	const at = new Date();
	for (let i = 0; i < ids.length; i += BATCH)
		// bulkWrite isn't confined by the tenant plugin: the scope goes in by hand. A claimed row loses its claim, so
		// the build that holds it won't delete it and the change is built again.
		await SearchQueue.bulkWrite(
			ids.slice(i, i + BATCH).map(p => ({
				updateOne: { filter: { ...scope, product: p }, update: { $set: { reason, at, token: null, leaseUntil: null } }, upsert: true },
			})),
			{ ordered: false }
		);
	return ids.length;
};

/** The same, in the background: never slows or fails the caller. */
export const touchLater = (productIds: any[], reason = '') => {
	const scope = currentScope();
	if (!scope?.project || !productIds?.length) return;
	setImmediate(() => runInScope(scope, () => touch(productIds, reason)).catch((e: any) => console.error('search queue:', e?.message)));
};

/** A category and every category under it. */
const withSubCategories = async (store: Store, ids: string[]) => {
	const all: any[] = await store.M('category').find({}, { parent: 1 }).lean();
	const kids = new Map<string, string[]>();
	for (const c of all) {
		const p = sid(c.parent);
		if (!p) continue;
		if (!kids.has(p)) kids.set(p, []);
		kids.get(p)!.push(sid(c._id));
	}
	const out = new Set(ids);
	const todo = [...ids];
	while (todo.length) for (const k of kids.get(todo.pop()!) || []) if (!out.has(k)) out.add(k), todo.push(k);
	return [...out];
};

/** The products a saved category / brand / collection / variant reaches. */
export const productsOf = async (store: Store, key: 'category' | 'brand' | 'collection' | 'variant', ids: any[]): Promise<any[]> => {
	const list = ids.map(sid).filter(Boolean);
	if (!list.length || !store.installed.product) return [];
	if (key === 'variant') return store.installed.variant ? (await store.M('variant').find({ _id: { $in: list } }, { product: 1 }).lean()).map((v: any) => v.product) : [];
	const field = key === 'category' ? 'category' : key === 'brand' ? 'brand' : 'collections';
	const reach = key === 'category' ? await withSubCategories(store, list) : list;
	return (await store.M('product').find({ [field]: { $in: reach } }, { _id: 1 }).lean()).map((p: any) => p._id);
};

/** From a store record's save or delete (fireCommerce): queue what it changes. */
export const touchForSave = async (store: Store, model: string, doc: any) => {
	if (store.is('product', model)) return touch([doc._id], 'product');
	if (store.is('variant', model)) return touch([doc.product ?? (await productsOf(store, 'variant', [doc._id]))[0]], 'variant');
	for (const key of ['category', 'brand', 'collection'] as const) if (store.is(key, model)) return touch(await productsOf(store, key, [doc._id]), key);
	return 0;
};

/* ------------------------------------------------------------------ building */

/** Claims up to `max` of this store's queued products with a lease, builds them, and lets the rows go. */
export const drainStore = async (store: Store, max = BATCH) => {
	const now = new Date();
	const free = { $or: [{ leaseUntil: null }, { leaseUntil: { $lt: now } }] };
	const rows: any[] = await SearchQueue.find({ ...free, at: { $lte: now } }, { _id: 1 }).sort({ at: 1 }).limit(max).lean();
	if (!rows.length) return 0;
	const token = crypto.randomBytes(8).toString('hex');
	await SearchQueue.updateMany({ _id: { $in: rows.map(r => r._id) }, ...free }, { $set: { token, leaseUntil: new Date(now.getTime() + LEASE_MS) } });
	const mine: any[] = await SearchQueue.find({ token }, { product: 1 }).lean();
	if (!mine.length) return 0;
	await buildDocs(store, mine.map(r => r.product));
	// Rows touched again while building lost the token: they stay, to be built once more.
	await SearchQueue.deleteMany({ token });
	await bumpVersion();
	return mine.length;
};

/**
 * Builds every product of the store again; documents it didn't write (products gone) are dropped. One rebuild at a
 * time per store (a lease on the settings). Returns the counts, or `{ skipped: true }` when one is already running.
 */
export const rebuildSearch = async (store: Store, { reason = 'rebuild' }: { reason?: string } = {}) => {
	const startedAt = new Date();
	const claim = await CommerceSettings.updateOne(
		{ $or: [{ 'search.index.rebuild.status': { $ne: 'running' } }, { 'search.index.rebuild.leaseUntil': { $lt: startedAt } }] },
		{ $set: { 'search.index.rebuild': { status: 'running', reason, startedAt, done: 0, total: 0, leaseUntil: new Date(startedAt.getTime() + REBUILD_LEASE_MS) } } }
	);
	if (!claim.modifiedCount) return { skipped: true as const };
	try {
		if (!store.installed.product) throw new Error('The store has no Products model');
		const Product = store.M('product');
		const total = await Product.countDocuments({});
		await CommerceSettings.updateOne({}, { $set: { 'search.index.rebuild.total': total } });
		let last: any = null;
		let done = 0;
		for (;;) {
			const page: any[] = await Product.find(last ? { _id: { $gt: last } } : {}, { _id: 1 }).sort({ _id: 1 }).limit(BATCH).lean();
			if (!page.length) break;
			await buildDocs(store, page.map(p => p._id), startedAt);
			last = page[page.length - 1]._id;
			done += page.length;
			await CommerceSettings.updateOne({}, { $set: { 'search.index.rebuild.done': done, 'search.index.rebuild.leaseUntil': new Date(Date.now() + REBUILD_LEASE_MS) } });
		}
		// Documents older than this rebuild belong to products that are gone.
		const dropped = (await SearchDoc.deleteMany({ $or: [{ builtAt: { $lt: startedAt } }, { builtAt: null }] })).deletedCount || 0;
		// What was queued before it started is built now.
		await SearchQueue.deleteMany({ at: { $lt: startedAt }, token: null });
		const docs = await SearchDoc.countDocuments({});
		const finishedAt = new Date();
		await CommerceSettings.updateOne(
			{},
			{
				$set: {
					'search.index.builtAt': startedAt,
					'search.index.sweptAt': startedAt,
					'search.index.rebuild': { status: 'done', reason, startedAt, finishedAt, done, total, docs, dropped, ms: finishedAt.getTime() - startedAt.getTime() },
				},
				$inc: { 'search.index.version': 1 },
			}
		);
		return { skipped: false as const, products: done, docs, dropped };
	} catch (e: any) {
		await CommerceSettings.updateOne({}, { $set: { 'search.index.rebuild.status': 'failed', 'search.index.rebuild.error': String(e?.message || e), 'search.index.rebuild.finishedAt': new Date() } });
		throw e;
	}
};

/* ------------------------------------------------------- sweep and drift check */

/**
 * Queues everything updated since the last sweep. The first sweep of a store never indexed rebuilds it instead.
 * Claimed by moving `sweptAt` first, so two servers never sweep one store at once.
 */
export const sweepStore = async (store: Store) => {
	const idx = await indexState();
	if (idx.rebuild?.status === 'running' && new Date(idx.rebuild.leaseUntil).getTime() > Date.now()) return { queued: 0 };
	if (!idx.builtAt) {
		const r = await rebuildSearch(store, { reason: 'first' });
		return { queued: 0, rebuilt: !r.skipped };
	}
	const start = new Date();
	const claim = await CommerceSettings.updateOne({ 'search.index.sweptAt': idx.sweptAt ?? null }, { $set: { 'search.index.sweptAt': start } });
	if (!claim.modifiedCount) return { queued: 0 };
	const since = { $gt: new Date(new Date(idx.sweptAt || idx.builtAt).getTime() - OVERLAP_MS) };
	const ids = (rows: any[], k = '_id') => rows.map(r => r[k]);
	const changed = async (key: 'category' | 'brand' | 'collection') =>
		store.installed[key] ? productsOf(store, key, ids(await store.M(key).find({ updatedAt: since }, { _id: 1 }).lean())) : [];
	const products = [
		...(store.installed.product ? ids(await store.M('product').find({ updatedAt: since }, { _id: 1 }).lean()) : []),
		...(store.installed.variant ? ids(await store.M('variant').find({ updatedAt: since }, { product: 1 }).lean(), 'product') : []),
		...(await changed('category')),
		...(await changed('brand')),
		...(await changed('collection')),
	];
	return { queued: await touch(products, 'sweep') };
};

/** Once a day: findable products against documents; a store that doesn't match is rebuilt. */
export const driftStore = async (store: Store) => {
	const idx = await indexState();
	if (!idx.builtAt || (idx.driftAt && Date.now() - new Date(idx.driftAt).getTime() < DRIFT_MS())) return null;
	const at = new Date();
	const claim = await CommerceSettings.updateOne({ 'search.index.driftAt': idx.driftAt ?? null }, { $set: { 'search.index.driftAt': at } });
	if (!claim.modifiedCount || !store.installed.product) return null;
	const [products, docs, queued] = await Promise.all([
		store.M('product').countDocuments({ status: 'active', archivedAt: null }),
		SearchDoc.countDocuments({}),
		SearchQueue.countDocuments({}),
	]);
	// Rows still queued may be the difference: only a store with nothing waiting is judged.
	const rebuilt = !queued && products !== docs;
	await CommerceSettings.updateOne({}, { $set: { 'search.index.lastDrift': { at, products, docs, queued, rebuilt } } });
	if (rebuilt) await rebuildSearch(store, { reason: 'drift' });
	return { products, docs, queued, rebuilt };
};

/** What the panel shows (Store settings → Search, docs/search SI-06). */
export const searchIndexStatus = async (store: Store) => {
	const [idx, rollup, docs, queued, products] = await Promise.all([
		indexState(),
		CommerceSettings.findOne({}, { 'search.rollup': 1, 'search.learn': 1 }).lean().then((s: any) => ({ ...(s?.search?.rollup || {}), learn: s?.search?.learn?.last || null })),
		SearchDoc.countDocuments({}),
		SearchQueue.countDocuments({}),
		store.installed.product ? store.M('product').countDocuments({ status: 'active', archivedAt: null }) : Promise.resolve(0),
	]);
	return { docs, products, queued, version: idx.version || 0, builtAt: idx.builtAt || null, sweptAt: idx.sweptAt || null, rebuild: idx.rebuild || null, lastDrift: idx.lastDrift || null, rollup: { dailyAt: rollup.dailyAt || null, lastDay: rollup.lastDay || null, signals: rollup.lastSignals || null }, learn: rollup.learn };
};

/* ---------------------------------------------------------------- schedules */

const inStore = async <T>(scope: { organization: any; project: any }, fn: (store: Store) => Promise<T>) =>
	runInScope(scope, async () => {
		const s: any = await CommerceSettings.findOne({}, { status: 1 }).lean();
		if (s?.status !== 'ready') return null;
		return fn(await storeOf());
	});

/** Every store with queued products: drain them (a few rounds each, so one big store can't hold up the rest). */
export const runSearchTick = async () => {
	const groups: any[] = await runUnscoped(() => SearchQueue.aggregate([{ $group: { _id: { organization: '$organization', project: '$project' } } }, { $limit: 500 }]));
	let built = 0;
	for (const g of groups) {
		if (!g._id?.project) continue;
		try {
			built += (await inStore(g._id, async store => {
				let n = 0;
				for (let round = 0; round < 4; round++) {
					const k = await drainStore(store);
					n += k;
					if (k < BATCH) break;
				}
				return n;
			})) || 0;
		} catch (e: any) {
			console.error('search tick:', e?.message);
		}
	}
	return built;
};

/** Every built store: the sweep, the daily drift check, the rollups (rollup.ts, SI-13) and learning (learn.ts, SI-16) when due. */
export const runSearchSweep = async () => {
	const stores: any[] = await runUnscoped(() => CommerceSettings.find({ status: 'ready', project: { $ne: null } }, { organization: 1, project: 1 }).lean());
	for (const s of stores)
		try {
			await inStore({ organization: s.organization, project: s.project }, async store => {
				await sweepStore(store);
				await driftStore(store);
				await rollupStore(store);
				await learnStore(store);
			});
		} catch (e: any) {
			console.error('search sweep:', e?.message);
		}
	return stores.length;
};

const every = (ms: number, fn: () => Promise<any>) => {
	let running = false;
	setInterval(async () => {
		if (running) return;
		running = true;
		try {
			await fn();
		} catch (e: any) {
			console.error('search index:', e?.message);
		} finally {
			running = false;
		}
	}, ms).unref();
};

/** Starts the tick and the sweep (server.ts). `SEARCH_INDEX=off` leaves them off (a one-off script, a test). */
export const scheduleSearchIndex = () => {
	if (process.env.SEARCH_INDEX === 'off') return;
	every(TICK_MS(), runSearchTick);
	every(SWEEP_MS(), runSearchSweep);
};
