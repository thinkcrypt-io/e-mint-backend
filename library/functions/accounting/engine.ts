import mongoose from 'mongoose';
import { compiledByRoute, routeOfModel, syncDynamicModels } from '../dynamicModels.function.js';
import { isAccountingProject } from '../accountingPanel.function.js';
import { BooksError, JOURNAL_SOURCE, Kind, Level, MOVE_SOURCE, Move, Posting, applyMove, postingFor, r2, Ctx, SystemKey } from './posting.js';

/**
 * The accounting engine (docs/accounting D3, D4; WORK_ORDERS AC-03). Runs beside Linked Relationships in the generic
 * create / update / delete / copy controllers of an accounting project's books: before the save it checks the
 * document posts (an unbalanced voucher, selling stock that isn't there → 400, nothing saved); after it, it takes the
 * document's earlier journal lines and stock moves back, writes the new ones, updates stock levels at weighted average
 * cost, writes the fields it owns on the document (status, cost of goods) and recomputes the balances it touched
 * (accounts, customers / suppliers, products' stock, a slip paid against). If writing fails, what it had is put back
 * and the controller puts the record back.
 *
 * Models are found by their blueprint route in the project (`compiledByRoute`), so the engine is off for a project
 * that lacks the books' core models.
 */

/** Which document each blueprint route is. */
export const KIND_BY_ROUTE: Record<string, Kind> = {
	sales: 'sale',
	'sale-returns': 'sale_return',
	'product-returns': 'product_return',
	exchanges: 'exchange',
	purchases: 'purchase',
	'purchase-returns': 'purchase_return',
	'trader-payments': 'payment',
	expenses: 'expense',
	incomes: 'income',
	transfers: 'transfer',
	vouchers: 'voucher',
	cheques: 'cheque',
	'stock-adjustments': 'stock_adjustment',
	'stock-transfers': 'stock_transfer',
	productions: 'production',
	products: 'product_opening',
	traders: 'trader_opening',
	accounts: 'account_opening',
};

const CORE = ['journal', 'stock-moves', 'stocks', 'accounts', 'products', 'traders', 'payment-methods', 'warehouses'] as const;

type Books = { M: (route: string) => mongoose.Model<any>; has: (route: string) => boolean };

const booksOf = async (): Promise<Books | null> => {
	await syncDynamicModels();
	if (!CORE.every(r => compiledByRoute(r))) return null;
	return {
		M: route => {
			const Model = compiledByRoute(route);
			if (!Model) throw new Error(`The books’ ${route} model is missing`);
			return Model as mongoose.Model<any>;
		},
		has: route => !!compiledByRoute(route),
	};
};

const sid = (v: any) => (v && typeof v === 'object' && v._id ? String(v._id) : v ? String(v) : '');
const isId = (v: any) => mongoose.Types.ObjectId.isValid(sid(v)) && /^[a-f0-9]{24}$/i.test(sid(v));
const oid = (v: any) => new mongoose.Types.ObjectId(sid(v));
const uniq = (xs: any[]) => [...new Set(xs.map(sid).filter(isId))];

/** Product ids a document's line lists (or the product itself, for its opening stock). */
const productsIn = (kind: Kind, doc: any) => {
	if (kind === 'product_opening') return uniq([doc._id]);
	const lists = ['items', 'returnItems', 'newItems', 'rawItems', 'finishedItems'].flatMap(k => (Array.isArray(doc?.[k]) ? doc[k] : []));
	return uniq(lists.map((r: any) => r?.product));
};

/** Settings switches the engine obeys. Unset means allowed (the seeded settings leave them unset). */
const settingsOf = async (books: Books) => {
	const s: any = books.has('accounting-settings') ? await books.M('accounting-settings').findOne({}).lean() : null;
	return { allowNegativeStock: s?.inventory?.allowNegativeStock !== false };
};

/** The lookups a posting reads, with stock levels as they stood before this document (its own moves taken out). */
const contextFor = async (books: Books, kind: Kind, doc: any, sourceId: string): Promise<Ctx> => {
	const [accounts, methods, warehouses, settings]: any[] = await Promise.all([
		books.M('accounts').find({ systemKey: { $nin: [null, ''] } }, { systemKey: 1 }).lean(),
		books.M('payment-methods').find({}, { depositTo: 1 }).lean(),
		books.M('warehouses').find({}, { isDefault: 1 }).sort({ isDefault: -1, createdAt: 1 }).lean(),
		settingsOf(books),
	]);
	const bySystem = new Map<string, string>(accounts.map((a: any) => [a.systemKey, String(a._id)]));
	const byMethod = new Map<string, string>(methods.filter((m: any) => m.depositTo).map((m: any) => [String(m._id), sid(m.depositTo)]));
	const ids = productsIn(kind, doc);
	const [products, stocks, own]: any[] = await Promise.all([
		ids.length ? books.M('products').find({ _id: { $in: ids.map(oid) } }, { kind: 1, name: 1, buyingPrice: 1 }).lean() : [],
		ids.length ? books.M('stocks').find({ product: { $in: ids.map(oid) } }, { product: 1, warehouse: 1, inHand: 1, avgCost: 1 }).lean() : [],
		books.M('stock-moves').find({ sourceId }).lean(),
	]);
	const productMap = new Map<string, any>(products.map((p: any) => [String(p._id), p]));
	const levels = new Map<string, Level>(stocks.map((s: any) => [`${sid(s.product)}@${sid(s.warehouse)}`, { inHand: Number(s.inHand) || 0, avgCost: Number(s.avgCost) || 0 }]));
	// Before an edit is written, this document's own earlier moves still count in the levels: take them out.
	for (const m of [...own].reverse()) {
		const k = `${sid(m.product)}@${sid(m.warehouse)}`;
		if (levels.has(k)) levels.set(k, applyMove(levels.get(k)!, -Number(m.quantity), Number(m.unitCost) || 0));
	}
	let saleCosts: Map<string, number> | null = null;
	if (kind === 'sale_return' && isId(doc.sale) && books.has('sales')) {
		const sale: any = await books.M('sales').findById(sid(doc.sale), { items: 1 }).lean();
		saleCosts = new Map((sale?.items || []).filter((it: any) => it?.product && Number(it.unitCost) > 0).map((it: any) => [String(it.product), Number(it.unitCost)]));
	}
	return {
		acct: (key: SystemKey) => {
			const a = bySystem.get(key);
			if (!a) throw new BooksError(`The chart of accounts has no ${key.replace(/_/g, ' ')} account`, 'books_chart');
			return a;
		},
		methodAccount: (id: any) => byMethod.get(sid(id)),
		product: (id: any) => productMap.get(sid(id)),
		level: (p, w) => levels.get(`${p}@${w}`) || { inHand: 0, avgCost: 0 },
		saleCost: (_sale, product) => saleCosts?.get(product),
		defaultWarehouse: warehouses[0] ? String(warehouses[0]._id) : '',
		allowNegativeStock: settings.allowNegativeStock,
	};
};

/** Applies moves to the product × warehouse stock records, in order. */
const applyMoves = async (books: Books, moves: Move[]) => {
	if (!moves.length) return;
	const Stock = books.M('stocks');
	const ids = uniq(moves.map(m => m.product));
	const products: any[] = await books.M('products').find({ _id: { $in: ids.map(oid) } }, { name: 1, barcode: 1 }).lean();
	const names = new Map(products.map(p => [String(p._id), p]));
	for (const m of moves) {
		if (!isId(m.product) || !isId(m.warehouse)) continue;
		const cur: any = await Stock.findOne({ product: oid(m.product), warehouse: oid(m.warehouse) }).lean();
		const next = applyMove({ inHand: Number(cur?.inHand) || 0, avgCost: Number(cur?.avgCost) || 0 }, Number(m.quantity), Number(m.unitCost) || 0);
		const p = names.get(sid(m.product));
		const set = { inHand: next.inHand, avgCost: next.avgCost, stockValue: r2(next.inHand * next.avgCost), productName: p?.name || '', barcode: p?.barcode || '' };
		if (cur) await Stock.updateOne({ _id: cur._id }, { $set: set });
		else await Stock.create({ product: oid(m.product), warehouse: oid(m.warehouse), ...set });
	}
};

/** Recomputes the balances a posting touched: accounts, customers / suppliers, products' stock, slips paid against. */
const refresh = async (books: Books, touched: { accounts: string[]; traders: string[]; products: string[] }) => {
	const J = books.M('journal');
	if (touched.accounts.length) {
		const accounts: any[] = await books.M('accounts').find({ _id: { $in: touched.accounts.map(oid) } }, { type: 1 }).lean();
		const sums: any[] = await J.aggregate([{ $match: { account: { $in: touched.accounts.map(oid) } } }, { $group: { _id: '$account', d: { $sum: '$debit' }, c: { $sum: '$credit' } } }]);
		const by = new Map(sums.map(s => [String(s._id), s]));
		for (const a of accounts) {
			const s = by.get(String(a._id));
			const net = (Number(s?.d) || 0) - (Number(s?.c) || 0);
			await books.M('accounts').collection.updateOne({ _id: a._id }, { $set: { balance: r2(a.type === 'asset' || a.type === 'expense' ? net : -net) } });
		}
	}
	if (touched.traders.length) {
		const keys: any[] = await books.M('accounts').find({ systemKey: { $in: ['accounts_receivable', 'accounts_payable'] } }, { _id: 1 }).lean();
		const traders: any[] = await books.M('traders').find({ _id: { $in: touched.traders.map(oid) } }, { kind: 1 }).lean();
		const sums: any[] = await J.aggregate([
			{ $match: { trader: { $in: touched.traders.map(oid) }, account: { $in: keys.map(k => k._id) } } },
			{ $group: { _id: '$trader', d: { $sum: '$debit' }, c: { $sum: '$credit' }, last: { $max: '$date' } } },
		]);
		const by = new Map(sums.map(s => [String(s._id), s]));
		for (const t of traders) {
			const s = by.get(String(t._id));
			const net = (Number(s?.d) || 0) - (Number(s?.c) || 0);
			// A customer's balance is what they owe; a supplier's, what is owed to them.
			await books.M('traders').collection.updateOne({ _id: t._id }, { $set: { balance: r2(t.kind === 'supplier' ? -net : net), ...(s?.last && { lastTradingDate: s.last }) } });
		}
	}
	if (touched.products.length) {
		const stocks: any[] = await books.M('stocks').find({ product: { $in: touched.products.map(oid) } }, { product: 1, inHand: 1, avgCost: 1 }).lean();
		for (const p of touched.products) {
			const mine = stocks.filter(s => sid(s.product) === p);
			const qty = mine.reduce((n, s) => n + (Number(s.inHand) || 0), 0);
			const value = mine.reduce((n, s) => n + (Number(s.inHand) || 0) * (Number(s.avgCost) || 0), 0);
			await books.M('products').collection.updateOne({ _id: oid(p) }, { $set: { inStock: Math.round(qty * 10000) / 10000, avgCost: qty > 0 ? Math.round((value / qty) * 10000) / 10000 : 0 } });
		}
	}
};

/** A slip's money received / paid later (payments against it), due and status, from its payments. */
const refreshSlips = async (books: Books, sales: string[], purchases: string[]) => {
	if (!books.has('trader-payments')) return;
	const P = books.M('trader-payments');
	const run = async (route: string, field: 'sale' | 'purchase', later: string, net: string, ids: string[]) => {
		if (!ids.length || !books.has(route)) return;
		const Slip = books.M(route);
		for (const id of ids) {
			const slip: any = await Slip.findById(id).lean();
			if (!slip) continue;
			const pays: any[] = await P.find({ [field]: oid(id), against: 'slip' }, { amount: 1 }).lean();
			const paidLater = r2(pays.reduce((n, p) => n + (Number(p.amount) || 0), 0));
			const paid = r2((Number(slip.paidAmount) || 0) + paidLater);
			const due = r2((Number(slip[net]) || 0) - paid);
			await Slip.collection.updateOne({ _id: slip._id }, { $set: { [later]: paidLater, due, status: due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid' } });
		}
	};
	await run('sales', 'sale', 'receivedLater', 'netReceivable', sales);
	await run('purchases', 'purchase', 'paidLater', 'netPayable', purchases);
};

/** Takes a document's earlier posting back and writes the new one (none for a delete). */
const repost = async (books: Books, Model: mongoose.Model<any>, kind: Kind, sourceId: string, doc: any | null, before: any | null) => {
	const J = books.M('journal');
	const SM = books.M('stock-moves');
	const oldLines: any[] = await J.find({ sourceId }).lean();
	const oldMoves: any[] = await SM.find({ sourceId }).sort({ _id: 1 }).lean();
	const undoOld = oldMoves.map(m => ({ product: sid(m.product), warehouse: sid(m.warehouse), quantity: -Number(m.quantity), unitCost: Number(m.unitCost) || 0 })).reverse();
	await applyMoves(books, undoOld);
	await J.deleteMany({ sourceId });
	await SM.deleteMany({ sourceId });

	let posting: Posting | null = null;
	let applied = false;
	try {
		if (doc) {
			const ctx = await contextFor(books, kind, doc, sourceId);
			posting = postingFor(kind, doc, ctx);
			const date = doc.date || doc.openingDate || doc.createdAt || new Date();
			const voucherNo = doc.code || '';
			if (posting.lines.length) await J.insertMany(posting.lines.map(l => ({ ...l, date, voucherNo, sourceType: JOURNAL_SOURCE[kind], sourceId })));
			await applyMoves(books, posting.moves);
			applied = true;
			if (posting.moves.length)
				await SM.insertMany(posting.moves.map(m => ({ ...m, value: r2(m.quantity * m.unitCost), date, voucherNo, sourceType: MOVE_SOURCE[kind], sourceId })));
			if (Object.keys(posting.patch).length) await Model.collection.updateOne({ _id: doc._id }, { $set: posting.patch });
			for (const p of posting.products) if (isId(p.id)) await books.M('products').collection.updateOne({ _id: oid(p.id) }, { $set: p.set });
		}
	} catch (e) {
		// Put back what the document had posted.
		await J.deleteMany({ sourceId });
		await SM.deleteMany({ sourceId });
		if (applied && posting) await applyMoves(books, posting.moves.map(m => ({ ...m, quantity: -m.quantity })).reverse());
		if (oldLines.length) await J.collection.insertMany(oldLines);
		if (oldMoves.length) await SM.collection.insertMany(oldMoves);
		await applyMoves(books, undoOld.map(m => ({ ...m, quantity: -m.quantity })).reverse());
		throw e;
	}

	const lines = [...oldLines, ...(posting?.lines || [])];
	const moves = [...oldMoves, ...(posting?.moves || [])];
	await refresh(books, {
		accounts: uniq(lines.map(l => l.account)),
		traders: uniq(lines.map(l => l.trader)),
		products: uniq([...moves.map(m => m.product), ...(posting?.products || []).map(p => p.id)]),
	});
	if (kind === 'payment') {
		const docs = [before, doc].filter(Boolean);
		await refreshSlips(books, uniq(docs.map(d => d.sale)), uniq(docs.map(d => d.purchase)));
	}
	return posting;
};

/** Records the books won't let go: system accounts, and anything other documents have posted to. */
const checkDelete = async (books: Books, kind: Kind, doc: any) => {
	const id = sid(doc?._id);
	if (!isId(id)) return;
	if (kind === 'account_opening') {
		if (doc.systemKey) throw new BooksError('This is one of the books’ own accounts; it can’t be deleted', 'books_system_account');
		if (await books.M('journal').exists({ account: oid(id), sourceId: { $ne: id } })) throw new BooksError('This account has transactions; it can’t be deleted', 'books_in_use');
	}
	if (kind === 'trader_opening' && (await books.M('journal').exists({ trader: oid(id), sourceId: { $ne: id } })))
		throw new BooksError('This customer / supplier has transactions; they can’t be deleted', 'books_in_use');
	if (kind === 'product_opening' && (await books.M('stock-moves').exists({ product: oid(id), sourceId: { $ne: id } })))
		throw new BooksError('This product has stock movements; it can’t be deleted', 'books_in_use');
};

export type BooksPlan = { error?: { message: string; code: string }; apply?: (saved: any) => Promise<Posting | null> };

/**
 * For the generic controllers, beside `linkedFor`: null when the record isn't a posting document of an accounting
 * project; `{ error }` when the books refuse it (answer 400, save nothing); else `{ apply }`, called with the saved
 * record (a delete: the deleted one). `apply` throws if writing fails, having put the books back.
 */
export const booksFor = async (req: any, Model: mongoose.Model<any>, action: 'create' | 'update' | 'delete', before: any, after: any): Promise<BooksPlan | null> => {
	if (!isAccountingProject(req?.project)) return null;
	const route = routeOfModel(Model);
	const kind = route ? KIND_BY_ROUTE[route] : undefined;
	if (!kind) return null;
	const books = await booksOf();
	if (!books) return null;
	const sourceId = sid((after || before)?._id);
	try {
		if (action === 'delete') await checkDelete(books, kind, before);
		else postingFor(kind, after, await contextFor(books, kind, after, sourceId));
	} catch (e: any) {
		if (e instanceof BooksError) return { error: { message: e.message, code: e.code } };
		throw e;
	}
	return {
		apply: async (saved: any) => {
			const doc = action === 'delete' ? null : typeof saved?.toObject === 'function' ? saved.toObject() : saved;
			return repost(books, Model, kind, sourceId, doc, before);
		},
	};
};

/** A failed `apply`, as the controller's answer. */
export const booksFailure = (res: any, e: any) =>
	e instanceof BooksError ? res.status(400).json({ message: e.message, code: e.code }) : res.status(500).json({ message: e?.message || 'The books could not be written' });

/**
 * Router middleware for bulk changes and imports: refused for an accounting project's posting documents (and the
 * accounts, traders and products whose openings post), which must go through the engine one at a time.
 */
export const booksOneAtATime = (Model: any) => (req: any, res: any, next: any) => {
	if (!isAccountingProject(req?.project)) return next();
	const route = routeOfModel(Model);
	if (route && KIND_BY_ROUTE[route])
		return res.status(400).json({ message: 'Change these one at a time: each one posts to the books.', code: 'books_one_at_a_time' });
	return next();
};
