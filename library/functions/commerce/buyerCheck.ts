import PhoneCheck from '../../models/tenancy/phoneCheck.model.js';
import CourierConnection from '../../models/tenancy/courierConnection.model.js';
import { TenancyError } from '../tenancy.function.js';
import { Store } from './store.js';
import { ADAPTERS } from './couriers/index.js';
import { CourierError, CourierRefusal, bdPhone } from './couriers/http.js';
import { usableConnection } from './connections.js';
import type { Risk } from './couriers/types.js';

/**
 * Buyer check (docs/couriers BUYER_CHECK.md, CR-19): how often a phone number takes its parcels — from every
 * courier the store has connected that can say (Steadfast's fraud check today; the merchant-panel sign-ins of
 * CR-20 / CR-26 join through the same `risk`), and from the store's own orders. Couriers are asked at most once
 * a day per phone (PhoneCheck, BC3), each on its own with a time limit, and a failing one only drops out.
 */

export type Level = 'safe' | 'check' | 'risky' | 'new';

export type SourceAnswer = {
	id: string;
	name: string;
	ok: boolean;
	/** Parcels delivered / refused (returned, cancelled at the door); null = the source didn't say. */
	delivered: number | null;
	refused: number | null;
	/** delivered ÷ (delivered + refused), as the source worked it out or we did. */
	ratio: number | null;
	reports: number | null;
	categories: string[];
	/** A courier's own label when it gives one (Pathao's customer rating, RedX's segment). */
	rating?: string | null;
	error?: string;
	/** The courier wasn't asked: its checks for today are kept for people pressing Check (BC6). */
	skipped?: boolean;
	at: Date;
};

export type OwnHistory = {
	orders: number;
	delivered: number;
	refused: number;
	cancelled: number;
	open: number;
	/** Delivered / refused counted in the combined rate: those not already in a courier's own numbers. */
	counted: { delivered: number; refused: number };
	recent: { id: string; code: string; at: Date; total: number; fulfilment: string; status: string; courier: string }[];
};

export type Thresholds = { safe: number; checkFirst: number; auto: boolean };
export const DEFAULT_THRESHOLDS: Thresholds = { safe: 80, checkFirst: 50, auto: true };

/** How long a courier's answer is kept (BC3). */
const KEEP_MS = 24 * 3600 * 1000;
/** Each courier gets this long (§3a); they're all asked at once. */
const SOURCE_MS = 6000;
/** Checks kept back for people pressing Check when the automatic ones run (BC6). */
const RESERVE = 3;
/** A merchant-panel source's own daily cap (§3a). */
const PANEL_DAILY = 300;

export const LEVEL_LABEL: Record<Level, string> = { safe: 'Safe', check: 'Check first', risky: 'Risky', new: 'New buyer' };

export const thresholdsOf = (store: Store): Thresholds => {
	const t: any = (store.answers as any)?.delivery?.buyerCheck || {};
	const safe = Number.isFinite(Number(t.safe)) ? Number(t.safe) : DEFAULT_THRESHOLDS.safe;
	const checkFirst = Number.isFinite(Number(t.checkFirst)) ? Number(t.checkFirst) : DEFAULT_THRESHOLDS.checkFirst;
	return { safe, checkFirst: Math.min(checkFirst, safe), auto: t.auto !== false };
};

/** The key a phone is kept under (BC7): 01XXXXXXXXX, else its digits; null when there's nothing to check. */
export const phoneKey = (v: any): string | null => {
	const bd = bdPhone(v);
	if (bd) return bd;
	const d = String(v ?? '').replace(/[^\d]/g, '');
	return d.length >= 6 && d.length <= 15 ? d : null;
};

/** Matches the phone as people type it in an order (spaces, dashes, +88…): its last 10 digits, at the end. */
const phonePattern = (key: string) => {
	const tail = key.slice(-10).split('');
	return new RegExp(`${tail.join('\\D*')}\\D*$`);
};

const dayOf = (d = new Date()) => d.toISOString().slice(0, 10);

/** Steadfast allows about 4 checks per parcel booked on its busiest day of the last week, plus 10 (CONNECTING.md). */
const steadfastLimit = async (store: Store) => {
	if (!store.installed.delivery) return 10;
	const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
	const rows: any[] = await store
		.M('delivery')
		.aggregate([
			{ $match: { courier: 'steadfast', bookedAt: { $gte: since } } },
			{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$bookedAt' } }, n: { $sum: 1 } } },
			{ $sort: { n: -1 } },
			{ $limit: 1 },
		])
		.catch(() => []);
	return 4 * (rows[0]?.n || 0) + 10;
};

const limitFor = (store: Store, id: string) => (id === 'steadfast' ? steadfastLimit(store) : Promise.resolve(PANEL_DAILY));

/** Takes one of today's checks on a connection, keeping `reserve` back; false when there are none left. */
const takeCheck = async (connId: any, limit: number, reserve: number) => {
	const day = dayOf();
	const room = limit - reserve;
	if (room <= 0) return false;
	const a = await CourierConnection.updateOne({ _id: connId, 'cache.checks.day': day, 'cache.checks.n': { $lt: room } }, { $inc: { 'cache.checks.n': 1 } });
	if (a.matchedCount) return true;
	const b = await CourierConnection.updateOne({ _id: connId, 'cache.checks.day': { $ne: day } }, { $set: { 'cache.checks': { day, n: 1 } } });
	return b.matchedCount > 0;
};

/** The courier said its checks for today are used up: none more today. */
const spendAll = (connId: any, limit: number) => CourierConnection.updateOne({ _id: connId }, { $set: { 'cache.checks': { day: dayOf(), n: limit } } });

const withLimit = <T>(p: Promise<T>, ms: number, name: string) =>
	Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new CourierError(`${name} didn’t answer in ${Math.round(ms / 1000)} seconds`, 'timeout')), ms))]);

const ratioOf = (delivered: number | null, refused: number | null) =>
	delivered === null || refused === null || delivered + refused === 0 ? null : Math.round((delivered / (delivered + refused)) * 1000) / 10;

/** One courier's answer in Mint's words (nulls stay unknown, never 0). */
const fromRisk = (id: string, name: string, r: Risk & { rating?: string | null }): SourceAnswer => {
	const delivered = r.delivered ?? null;
	const refused = r.cancelled ?? null;
	return {
		id,
		name,
		ok: true,
		delivered,
		refused,
		ratio: r.deliveryRatio ?? ratioOf(delivered, refused),
		reports: r.reports ?? null,
		categories: r.categories || [],
		rating: r.rating ?? r.volume ?? null,
		at: new Date(),
	};
};

/** The couriers the store has connected that can check a phone. */
const checkSources = async (project: any) => {
	const out: { id: string; usable: NonNullable<Awaited<ReturnType<typeof usableConnection>>> }[] = [];
	for (const a of Object.values(ADAPTERS)) {
		if (!a.risk) continue;
		const usable = await usableConnection(project, a.id).catch(() => null);
		if (usable) out.push({ id: a.id, usable });
	}
	return out;
};

/** Asks one courier, within its time and its daily checks. */
const askOne = async (store: Store, s: { id: string; usable: any }, phone: string, auto: boolean): Promise<SourceAnswer> => {
	const { adapter, conn, doc } = s.usable;
	const base = { id: s.id, name: adapter.name, delivered: null, refused: null, ratio: null, reports: null, categories: [], at: new Date() };
	const bd = bdPhone(phone);
	if (!bd) return { ...base, ok: false, skipped: true, error: `${adapter.name} only checks Bangladeshi mobile numbers` };
	const limit = await limitFor(store, s.id);
	if (!(await takeCheck(doc._id, limit, auto ? RESERVE : 0)))
		return { ...base, ok: false, skipped: true, error: `${adapter.name}’s checks for today are used up — the store’s own history is shown` };
	try {
		return fromRisk(s.id, adapter.name, await withLimit(adapter.risk(conn, bd), SOURCE_MS, adapter.name));
	} catch (e: any) {
		if (e instanceof CourierRefusal && /limit/i.test(e.message)) await spendAll(doc._id, limit);
		const known = e instanceof CourierRefusal || e instanceof CourierError;
		return { ...base, ok: false, error: known ? e.message : `${adapter.name} couldn’t check it just now` };
	}
};

/** The store's own orders to that phone (any courier, by hand too), newest first. */
export const ownHistory = async (store: Store, key: string, notOrder?: any): Promise<Omit<OwnHistory, 'counted'>> => {
	const rows: any[] = await store
		.M('order')
		.find({ 'delivery.phone': phonePattern(key), status: { $ne: 'held' }, ...(notOrder && { _id: { $ne: notOrder } }) })
		.select('code createdAt total fulfilment status courier.provider courier.status')
		.sort({ createdAt: -1 })
		.limit(500)
		.lean();
	const out = { orders: rows.length, delivered: 0, refused: 0, cancelled: 0, open: 0, recent: [] as OwnHistory['recent'], rows };
	for (const o of rows) {
		const kind = kindOf(o);
		out[kind]++;
	}
	out.recent = rows.slice(0, 10).map(o => ({
		id: String(o._id),
		code: o.code,
		at: o.createdAt,
		total: o.total,
		fulfilment: o.fulfilment,
		status: o.status,
		courier: o.courier?.provider || '',
	}));
	return out as any;
};

/** Where an order ended up, for the rate: delivered, refused at the door / sent back, cancelled before it went, or still open. */
const kindOf = (o: any): 'delivered' | 'refused' | 'cancelled' | 'open' => {
	const courier = String(o.courier?.status || '').toLowerCase();
	if (o.fulfilment === 'delivered' || courier === 'delivered' || courier === 'partly delivered') return 'delivered';
	if (o.fulfilment === 'returned' || courier === 'returned' || courier === 'coming back') return 'refused';
	if (o.status === 'cancelled') return 'cancelled';
	return 'open';
};

/** Every source into one answer (BC1): the rate over all known parcels, the level by the store's thresholds. */
export const combine = (sources: SourceAnswer[], own: Omit<OwnHistory, 'counted'> & { rows?: any[] }, t: Thresholds) => {
	const counted = sources.filter(s => s.ok && s.delivered !== null && s.refused !== null);
	// A store's own parcels with a courier are in that courier's numbers already: counted once.
	const names = new Set(counted.flatMap(s => [s.id, s.name.toLowerCase()]));
	const mine = { delivered: 0, refused: 0 };
	for (const o of own.rows || []) {
		const k = kindOf(o);
		if (k !== 'delivered' && k !== 'refused') continue;
		if (names.has(String(o.courier?.provider || '').toLowerCase())) continue;
		mine[k]++;
	}
	const delivered = counted.reduce((n, s) => n + (s.delivered as number), 0) + mine.delivered;
	const refused = counted.reduce((n, s) => n + (s.refused as number), 0) + mine.refused;
	const parcels = delivered + refused;
	const rate = parcels ? Math.round((delivered / parcels) * 100) : null;
	const level: Level = rate === null || parcels < 3 ? 'new' : rate >= t.safe ? 'safe' : rate >= t.checkFirst ? 'check' : 'risky';
	const reports = sources.reduce((n, s) => n + (s.reports || 0), 0);
	const warnings: string[] = [];
	if (reports) warnings.push(`${reports} fraud report${reports === 1 ? '' : 's'} on this number`);
	for (const s of sources) {
		if (s.rating && /fraud|risk|high.?return/i.test(s.rating)) warnings.push(`${s.name} rates this buyer “${s.rating.replace(/_/g, ' ')}”`);
	}
	if (own.refused) warnings.push(`Refused ${own.refused} of this store’s parcels before`);
	const words: Record<Level, string> = {
		new: 'Not enough parcels to this number yet to tell',
		safe: `Usually takes their parcels (${rate}% delivered)`,
		check: `Takes some parcels, refuses some (${rate}% delivered) — call before sending`,
		risky: `Often refuses parcels (${rate}% delivered) — call first, or ask for payment first (the delivery charge at least)`,
	};
	return {
		level,
		label: LEVEL_LABEL[level],
		rate,
		delivered,
		refused,
		parcels,
		reports,
		warnings,
		summary: words[level],
		counted: mine,
	};
};

export type CheckResult = Awaited<ReturnType<typeof checkPhone>>;

/**
 * Checks a phone (BC1–BC8): the couriers' answers kept a day unless `fresh`, the store's own history always now.
 * `via`: why (order = it came in, lookup = typed on Check a buyer, send = Send to courier, mcp). `auto` checks keep
 * a few of the day's courier checks back for people. Every call is logged on the PhoneCheck (BC8).
 */
export const checkPhone = async (
	store: Store,
	project: any,
	phone: any,
	opts: { fresh?: boolean; via: string; by?: string; order?: any; auto?: boolean } = { via: 'lookup' }
) => {
	const key = phoneKey(phone);
	if (!key) throw new TenancyError(400, 'Type a phone number to check');
	const t = thresholdsOf(store);
	const kept: any = await PhoneCheck.findOne({ phone: key }).lean();
	const recent = (s: any) => !!s?.at && Date.now() - new Date(s.at).getTime() < KEEP_MS;
	// Each courier on its own: asked when Check again is pressed, or when it has no answer from today (a courier
	// connected since, an answer older than a day). A skipped one (no checks left) is asked again next time.
	const connected = await checkSources(project);
	const toAsk = connected.filter(s => opts.fresh || !recent(kept?.sources?.[s.id]) || kept.sources[s.id].skipped);
	const asked = await Promise.all(toAsk.map(s => askOne(store, s, key, !!opts.auto)));
	const sources: SourceAnswer[] = connected.map(s => {
		const now = asked.find(a => a.id === s.id);
		const before = kept?.sources?.[s.id];
		if (!now) return before;
		// A courier that couldn't answer this time keeps its answer from earlier today, marked as such.
		return !now.ok && before?.ok && recent(before) ? { ...before, error: now.error } : now;
	});
	const fresh = asked.length > 0;
	const checkedAt: Date = fresh ? new Date() : kept?.checkedAt || new Date();

	const own = await ownHistory(store, key, opts.order);
	const result = combine(sources, own as any, t);
	const { rows, ...history } = own as any;
	const answer = {
		phone: key,
		...result,
		sources,
		own: { ...history, counted: result.counted },
		checkedAt,
		thresholds: t,
	};
	const lookup = { by: String(opts.by || '').slice(0, 120), via: opts.via, order: opts.order ? String(opts.order) : '', at: new Date() };
	const toKeep = { ...answer, own: { ...answer.own, recent: undefined } };
	await PhoneCheck.updateOne(
		{ phone: key },
		{
			$set: {
				phone: key,
				...(fresh && { sources: Object.fromEntries(sources.map(s => [s.id, s])), checkedAt }),
				result: toKeep,
				lastLookupAt: lookup.at,
			},
			$push: { lookups: { $each: [lookup], $slice: -50 } },
		},
		{ upsert: true }
	);
	return answer;
};

/** The last lookups on this store (Check a buyer's list, BC8). */
export const recentLookups = async (limit = 20) => {
	const rows: any[] = await PhoneCheck.find({ lastLookupAt: { $exists: true } })
		.select('phone result.level result.label result.rate result.parcels lookups lastLookupAt')
		.sort({ lastLookupAt: -1 })
		.limit(Math.min(Math.max(Number(limit) || 20, 1), 100))
		.lean();
	return rows.map(r => ({
		phone: r.phone,
		level: r.result?.level || 'new',
		label: r.result?.label || LEVEL_LABEL.new,
		rate: r.result?.rate ?? null,
		parcels: r.result?.parcels ?? 0,
		last: (r.lookups || []).slice(-1)[0] || null,
		at: r.lastLookupAt,
	}));
};
