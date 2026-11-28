import express from 'express';
import { compiledByRoute, syncDynamicModels } from '../dynamicModels.function.js';
import { isAccountingProject } from '../accountingPanel.function.js';

/**
 * Mint Accounting's dashboard (docs/accounting AC-06; inventory § Dashboard): DiziCashier's six top cards and five
 * charts, from what the books already keep — the engine's account and trader balances, the sale and expense documents,
 * and the journal — so each number is the one its report shows. Which cards and charts show is per login (Dashboard
 * Settings), kept in the books' `dashboard-prefs`.
 *
 *   GET /accounting/dashboard?period=week|month|year&tz=<minutes, Date#getTimezoneOffset>
 *   GET /accounting/dashboard/prefs · PUT /accounting/dashboard/prefs { cards, charts }
 */

export const CARDS = ['todays_sale', 'todays_expense', 'receivable', 'payable', 'cash', 'bank'] as const;
export const CHARTS = ['top_customers', 'top_items', 'asset_analysis', 'sale_analysis', 'profit_loss'] as const;
const PERIODS = ['week', 'month', 'year'] as const;
type Period = (typeof PERIODS)[number];

const DAY = 86400000;
const r2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
const M = (route: string) => {
	const Model = compiledByRoute(route);
	if (!Model) throw Object.assign(new Error(`The books’ ${route} aren’t set up`), { status: 409 });
	return Model;
};

/** The viewer's local midnight as a UTC instant (tz = the browser's getTimezoneOffset, minutes behind UTC). */
const localDayStart = (now: Date, tz: number, daysBack = 0) => {
	const local = new Date(now.getTime() - tz * 60000);
	const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - daysBack * DAY;
	return new Date(start + tz * 60000);
};
const localMonthStart = (now: Date, tz: number, monthsBack = 0) => {
	const local = new Date(now.getTime() - tz * 60000);
	return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - monthsBack, 1) + tz * 60000);
};
/** A date's local day / month key, for grouping in Mongo ($dateToString with the viewer's offset). */
const offset = (tz: number) => {
	const m = -tz;
	const sign = m >= 0 ? '+' : '-';
	const a = Math.abs(m);
	return `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}${String(a % 60).padStart(2, '0')}`;
};

const ASSET_GROUPS: Record<string, string> = {
	cash: 'Cash',
	bank: 'Bank',
	mobile_bank: 'Mobile banking',
	receivable: 'Receivable',
	inventory: 'Stock',
	equipment: 'Equipment',
};

/** The cards and charts, as numbers. `want` limits the work to what the login shows. */
export const dashboardFigures = async (opts: { period?: Period; tz?: number; now?: Date; cards?: string[]; charts?: string[] } = {}) => {
	const now = opts.now || new Date();
	const tz = Number.isFinite(opts.tz) ? Number(opts.tz) : 0;
	const period: Period = PERIODS.includes(opts.period as any) ? (opts.period as Period) : 'month';
	const cards = new Set(opts.cards || CARDS);
	const charts = new Set(opts.charts || CHARTS);
	const today = localDayStart(now, tz);
	const Sale = M('sales');
	const out: any = { period, cards: {}, charts: {} };

	if (cards.has('todays_sale')) {
		const [s] = await Sale.aggregate([
			{ $match: { date: { $gte: today } } },
			{ $group: { _id: null, total: { $sum: '$netReceivable' }, paid: { $sum: '$paidAmount' }, count: { $sum: 1 } } },
		]);
		const total = r2(s?.total);
		const paid = r2(Math.min(s?.paid || 0, total));
		out.cards.todays_sale = { total, paid, credit: r2(total - paid), count: s?.count || 0 };
	}
	if (cards.has('todays_expense')) {
		const [e] = await M('expenses').aggregate([{ $match: { date: { $gte: today } } }, { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }]);
		out.cards.todays_expense = { total: r2(e?.total), count: e?.count || 0 };
	}
	if (cards.has('receivable') || cards.has('payable')) {
		const rows = await M('traders').aggregate([{ $group: { _id: '$kind', total: { $sum: { $max: ['$balance', 0] } }, count: { $sum: { $cond: [{ $gt: ['$balance', 0] }, 1, 0] } } } }]);
		const of = (k: string) => rows.find((r: any) => r._id === k);
		if (cards.has('receivable')) out.cards.receivable = { total: r2(of('customer')?.total), count: of('customer')?.count || 0 };
		if (cards.has('payable')) out.cards.payable = { total: r2(of('supplier')?.total), count: of('supplier')?.count || 0 };
	}
	const needAssets = cards.has('cash') || cards.has('bank') || charts.has('asset_analysis');
	if (needAssets) {
		const groups = await M('accounts').aggregate([{ $match: { type: 'asset' } }, { $group: { _id: '$group', total: { $sum: '$balance' } } }]);
		const g = (k: string) => r2(groups.find((r: any) => r._id === k)?.total);
		if (cards.has('cash')) out.cards.cash = { total: g('cash') };
		if (cards.has('bank')) out.cards.bank = { total: r2(g('bank') + g('mobile_bank')) };
		if (charts.has('asset_analysis'))
			out.charts.asset_analysis = groups
				.filter((r: any) => Math.abs(r.total || 0) >= 0.005)
				.map((r: any) => ({ label: ASSET_GROUPS[r._id] || r._id || 'Other', value: r2(r.total) }))
				.sort((a: any, b: any) => b.value - a.value);
	}

	const last30 = localDayStart(now, tz, 29);
	if (charts.has('top_customers')) {
		const rows = await Sale.aggregate([
			{ $match: { date: { $gte: last30 }, customer: { $ne: null } } },
			{ $group: { _id: '$customer', value: { $sum: '$netReceivable' }, count: { $sum: 1 } } },
			{ $sort: { value: -1 } },
			{ $limit: 5 },
		]);
		const names = new Map((await M('traders').find({ _id: { $in: rows.map((r: any) => r._id) } }, { name: 1 }).lean()).map((t: any) => [String(t._id), t.name]));
		out.charts.top_customers = rows.map((r: any) => ({ id: r._id, label: names.get(String(r._id)) || 'Customer', value: r2(r.value), count: r.count }));
	}
	if (charts.has('top_items')) {
		const rows = await Sale.aggregate([
			{ $match: { date: { $gte: last30 } } },
			{ $unwind: '$items' },
			{ $group: { _id: '$items.product', label: { $first: '$items.productName' }, qty: { $sum: '$items.quantity' }, value: { $sum: '$items.total' } } },
			{ $sort: { qty: -1 } },
			{ $limit: 5 },
		]);
		out.charts.top_items = rows.map((r: any) => ({ id: r._id, label: r.label || 'Item', value: r2(r.qty), amount: r2(r.value) }));
	}
	if (charts.has('sale_analysis')) {
		const from = period === 'week' ? localDayStart(now, tz, 6) : period === 'month' ? localMonthStart(now, tz) : localMonthStart(now, tz, 11);
		const fmt = period === 'year' ? '%Y-%m' : '%Y-%m-%d';
		const rows = await Sale.aggregate([
			{ $match: { date: { $gte: from } } },
			{ $group: { _id: { $dateToString: { date: '$date', format: fmt, timezone: offset(tz) } }, value: { $sum: '$netReceivable' }, paid: { $sum: '$paidAmount' } } },
		]);
		const by = new Map(rows.map((r: any) => [r._id, r]));
		const keys: string[] = [];
		if (period === 'year') for (let i = 11; i >= 0; i--) keys.push(localKey(localMonthStart(now, tz, i), tz, true));
		else {
			const days = period === 'week' ? 7 : Math.round((localDayStart(now, tz).getTime() - from.getTime()) / DAY) + 1;
			for (let i = days - 1; i >= 0; i--) keys.push(localKey(localDayStart(now, tz, i), tz, false));
		}
		out.charts.sale_analysis = keys.map(k => ({ label: k, value: r2((by.get(k) as any)?.value), paid: r2((by.get(k) as any)?.paid) }));
	}
	if (charts.has('profit_loss')) {
		const from = localMonthStart(now, tz, 11);
		const accounts = await M('accounts').find({ type: { $in: ['income', 'expense'] } }, { type: 1 }).lean();
		const typeOf = new Map(accounts.map((a: any) => [String(a._id), a.type]));
		const rows = await M('journal').aggregate([
			{ $match: { date: { $gte: from }, account: { $in: accounts.map((a: any) => a._id) } } },
			{ $group: { _id: { m: { $dateToString: { date: '$date', format: '%Y-%m', timezone: offset(tz) } }, a: '$account' }, d: { $sum: '$debit' }, c: { $sum: '$credit' } } },
		]);
		const months = new Map<string, { income: number; expense: number }>();
		for (let i = 11; i >= 0; i--) months.set(localKey(localMonthStart(now, tz, i), tz, true), { income: 0, expense: 0 });
		for (const r of rows) {
			const m = months.get(r._id.m);
			if (!m) continue;
			if (typeOf.get(String(r._id.a)) === 'income') m.income += (r.c || 0) - (r.d || 0);
			else m.expense += (r.d || 0) - (r.c || 0);
		}
		out.charts.profit_loss = [...months].map(([label, m]) => ({ label, income: r2(m.income), expense: r2(m.expense), profit: r2(m.income - m.expense) }));
	}
	return out;
};

const localKey = (d: Date, tz: number, month: boolean) => {
	const local = new Date(d.getTime() - tz * 60000).toISOString();
	return month ? local.slice(0, 7) : local.slice(0, 10);
};

/** Who the prefs belong to: the panel login, or the project's owner / member. */
const viewer = (req: any) => String(req.panelAdmin?._id || req.user?._id || '');

const prefsOf = async (req: any) => {
	const doc: any = await M('dashboard-prefs').findOne({ user: viewer(req) }).lean();
	const pick = (list: any, all: readonly string[]) => (Array.isArray(list) ? all.filter(k => list.includes(k)) : [...all]);
	return { cards: pick(doc?.dashCards, CARDS), charts: pick(doc?.dashCharts, CHARTS), period: PERIODS.includes(doc?.period) ? doc.period : 'month' };
};

export const accountingDashboardRouter = () => {
	const router = express.Router();
	router.use(async (req: any, res: any, next: any) => {
		if (!isAccountingProject(req.project)) return res.status(404).json({ message: 'Only accounting projects have this dashboard' });
		await syncDynamicModels();
		next();
	});
	const fail = (res: any, e: any) => res.status(e?.status || 500).json({ message: e?.message || 'The dashboard couldn’t load' });

	router.get('/', async (req: any, res: any) => {
		try {
			const prefs = await prefsOf(req);
			const period = (PERIODS.includes(req.query.period) ? req.query.period : prefs.period) as Period;
			const [figures, settings]: any = await Promise.all([
				dashboardFigures({ period, tz: Number(req.query.tz), cards: prefs.cards, charts: prefs.charts }),
				M('accounting-settings').findOne({}, { currency: 1 }).lean(),
			]);
			res.status(200).json({ ...figures, currency: settings?.currency || '৳', prefs });
		} catch (e) {
			fail(res, e);
		}
	});
	router.get('/prefs', async (req: any, res: any) => {
		try {
			res.status(200).json(await prefsOf(req));
		} catch (e) {
			fail(res, e);
		}
	});
	// The `cards` / `charts` fields of the model keep their own words; the dashboard's choices are DiziCashier's.
	router.put('/prefs', async (req: any, res: any) => {
		try {
			const user = viewer(req);
			if (!user) return res.status(401).json({ message: 'Sign in first' });
			const b = req.body || {};
			const set: any = {};
			if (Array.isArray(b.cards)) set.dashCards = CARDS.filter(k => b.cards.includes(k));
			if (Array.isArray(b.charts)) set.dashCharts = CHARTS.filter(k => b.charts.includes(k));
			if (PERIODS.includes(b.period)) set.period = b.period;
			// strict: false keeps the dashboard's own fields; the model fills in its scope and discriminator.
			await M('dashboard-prefs').updateOne({ user }, { $set: set, $setOnInsert: { user } }, { upsert: true, strict: false });
			res.status(200).json(await prefsOf(req));
		} catch (e) {
			fail(res, e);
		}
	});
	return router;
};
