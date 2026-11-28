/**
 * The books' posting rules (docs/accounting D3, D4; WORK_ORDERS AC-03). Pure: a document and a context of lookups in,
 * out come the journal lines it posts (always balanced), the stock moves it makes at weighted average cost, the
 * fields the engine owns on it (status, cost of goods, line costs) and product prices it updates. No database — the
 * engine (`engine.ts`) loads the context and writes the result; the tests drive this directly.
 *
 * Accounts are DiziCashier's seeded chart, found by `systemKey` (inventory § Accounts): stock is one perpetual
 * inventory account (*Resale Items*), sales income *Sales*, cost *Cost of Goods Sold*.
 */

export type Kind =
	| 'sale'
	| 'sale_return'
	| 'product_return'
	| 'exchange'
	| 'purchase'
	| 'purchase_return'
	| 'payment'
	| 'expense'
	| 'income'
	| 'transfer'
	| 'voucher'
	| 'cheque'
	| 'stock_adjustment'
	| 'stock_transfer'
	| 'production'
	| 'product_opening'
	| 'trader_opening'
	| 'account_opening';

/** The Journal model's `sourceType` for each kind (its select's options). */
export const JOURNAL_SOURCE: Record<Kind, string> = {
	sale: 'sale',
	sale_return: 'sale_return',
	product_return: 'product_return',
	exchange: 'exchange',
	purchase: 'purchase',
	purchase_return: 'purchase_return',
	payment: 'payment',
	expense: 'expense',
	income: 'income',
	transfer: 'transfer',
	voucher: 'voucher',
	cheque: 'cheque',
	stock_adjustment: 'stock_adjustment',
	stock_transfer: 'stock_adjustment',
	production: 'production',
	product_opening: 'opening',
	trader_opening: 'opening',
	account_opening: 'opening',
};

/** The StockMove model's `sourceType` for each kind that moves stock. */
export const MOVE_SOURCE: Partial<Record<Kind, string>> = {
	sale: 'sale',
	sale_return: 'sale_return',
	product_return: 'product_return',
	exchange: 'exchange',
	purchase: 'purchase',
	purchase_return: 'purchase_return',
	stock_adjustment: 'adjustment',
	stock_transfer: 'transfer',
	production: 'production',
	product_opening: 'opening',
};

export type SystemKey =
	| 'petty_cash'
	| 'accounts_receivable'
	| 'accounts_payable'
	| 'cheque_clearing'
	| 'cheque_payable'
	| 'resale_items'
	| 'tax_collected'
	| 'tax_paid'
	| 'sales'
	| 'purchases'
	| 'cogs'
	| 'stock_adjustment'
	| 'opening_stock'
	| 'opening_customer_balance'
	| 'opening_supplier_balance'
	| 'owners_equity'
	| 'miscellaneous';

export type Line = { account: string; debit: number; credit: number; trader?: string; warehouse?: string; costCentre?: string; note?: string };
export type Move = { product: string; warehouse: string; quantity: number; unitCost: number };
export type Level = { inHand: number; avgCost: number };
export type ProductInfo = { kind?: string; name?: string; buyingPrice?: number };

export type Ctx = {
	/** The chart's account for a system key (throws if the books don't have it). */
	acct: (key: SystemKey) => string;
	/** A payment method's deposit account. */
	methodAccount: (id: any) => string | undefined;
	product: (id: any) => ProductInfo | undefined;
	/** Stock of a product at a warehouse before this document (its own earlier moves already taken out). */
	level: (product: string, warehouse: string) => Level;
	/** What a product cost on a sale (its line's unit cost), for a return against that slip. */
	saleCost: (sale: any, product: string) => number | undefined;
	defaultWarehouse: string;
	allowNegativeStock: boolean;
};

export type Posting = {
	lines: Line[];
	moves: Move[];
	/** Engine-owned fields written back on the document. */
	patch: Record<string, any>;
	/** Product fields to set (a purchase's buying / selling prices). */
	products: { id: string; set: Record<string, number> }[];
};

/** A document the books refuse: answered 400 with this message, nothing saved. */
export class BooksError extends Error {
	status = 400;
	code: string;
	constructor(message: string, code = 'books_refused') {
		super(message);
		this.code = code;
	}
}

const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const r2 = (n: number) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((num(n) + Number.EPSILON) * 10000) / 10000;
const id = (v: any) => (v && typeof v === 'object' && v._id ? String(v._id) : v ? String(v) : '');
const rows = (v: any): any[] => (Array.isArray(v) ? v.filter(r => r && typeof r === 'object') : []);

/** A stock level after a move: stock in averages its cost in; stock out leaves the average (it went out at it). */
export const applyMove = (l: Level, quantity: number, unitCost: number): Level => {
	const inHand = num(l.inHand) + quantity;
	if (quantity > 0 || Math.abs(inHand) < 1e-9) {
		const value = num(l.inHand) * num(l.avgCost) + quantity * unitCost;
		return { inHand: r4(inHand), avgCost: inHand > 1e-9 ? r4(value / inHand) : quantity > 0 ? r4(unitCost) : num(l.avgCost) };
	}
	// Out at a cost other than the average (a purchase return at its price) moves the average with it.
	if (Math.abs(unitCost - num(l.avgCost)) > 1e-9 && inHand > 1e-9) {
		const value = num(l.inHand) * num(l.avgCost) + quantity * unitCost;
		return { inHand: r4(inHand), avgCost: r4(value / inHand) };
	}
	return { inHand: r4(inHand), avgCost: num(l.avgCost) };
};

/** Builds one document's posting: balanced lines and stock moves against a running copy of the levels. */
class Builder {
	lines: Line[] = [];
	moves: Move[] = [];
	private levels = new Map<string, Level>();
	constructor(private ctx: Ctx) {}

	/** amount > 0 debits `account`, < 0 credits it; zero posts nothing. */
	post(account: string, amount: number, extra: Omit<Line, 'account' | 'debit' | 'credit'> = {}) {
		const a = r2(amount);
		if (!a) return;
		if (!account) throw new BooksError('Choose an account for every line', 'books_account');
		const clean = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined && v !== ''));
		this.lines.push({ account: String(account), debit: a > 0 ? a : 0, credit: a < 0 ? -a : 0, ...clean });
	}
	pair(debitAccount: string, creditAccount: string, amount: number, dx: Omit<Line, 'account' | 'debit' | 'credit'> = {}, cx = dx) {
		if (!r2(amount)) return;
		this.post(debitAccount, amount, dx);
		this.post(creditAccount, -amount, cx);
	}

	level(product: string, warehouse: string) {
		const k = `${product}@${warehouse}`;
		if (!this.levels.has(k)) this.levels.set(k, this.ctx.level(product, warehouse));
		return this.levels.get(k)!;
	}
	isStock(product: string) {
		const p = this.ctx.product(product);
		return !!p && p.kind !== 'service';
	}
	/** Stock in at a cost; returns the value. */
	stockIn(product: string, warehouse: string, quantity: number, unitCost: number) {
		if (!(quantity > 0)) return 0;
		const cost = r4(unitCost);
		this.levels.set(`${product}@${warehouse}`, applyMove(this.level(product, warehouse), quantity, cost));
		this.moves.push({ product, warehouse, quantity, unitCost: cost });
		return quantity * cost;
	}
	/** Stock out — at the average unless a cost is given; refused below zero unless settings allow it. Returns the value. */
	stockOut(product: string, warehouse: string, quantity: number, atCost?: number) {
		if (!(quantity > 0)) return 0;
		const l = this.level(product, warehouse);
		if (!this.ctx.allowNegativeStock && l.inHand - quantity < -1e-9) {
			const name = this.ctx.product(product)?.name || 'This product';
			throw new BooksError(l.inHand > 0 ? `Only ${l.inHand} of ${name} in stock` : `${name} is out of stock`, 'not_enough_stock');
		}
		const avg = num(l.avgCost) || (l.inHand <= 0 ? num(this.ctx.product(product)?.buyingPrice) : 0);
		const cost = r4(atCost ?? avg);
		this.levels.set(`${product}@${warehouse}`, applyMove(l, -quantity, cost));
		this.moves.push({ product, warehouse, quantity: -quantity, unitCost: cost });
		return quantity * cost;
	}
	/** What a product costs now at a warehouse (the running average, else its buying price). */
	costNow(product: string, warehouse: string) {
		return num(this.level(product, warehouse).avgCost) || num(this.ctx.product(product)?.buyingPrice);
	}
}

const statusOf = (net: number, paid: number) => {
	const due = r2(net - paid);
	return due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
};

const need = (v: any, message: string) => {
	if (!id(v)) throw new BooksError(message, 'books_missing');
	return id(v);
};

export const postingFor = (kind: Kind, doc: any, ctx: Ctx): Posting => {
	const b = new Builder(ctx);
	const A = (k: SystemKey) => ctx.acct(k);
	const wh = id(doc.warehouse) || ctx.defaultWarehouse;
	const patch: Record<string, any> = {};
	const products: Posting['products'] = [];

	switch (kind) {
		case 'sale': {
			const customer = need(doc.customer, 'Choose a customer');
			const net = r2(doc.netReceivable);
			const tax = r2(doc.taxAmount);
			b.post(A('accounts_receivable'), net, { trader: customer });
			b.post(A('sales'), -(net - tax));
			b.post(A('tax_collected'), -tax);
			let paid = 0;
			for (const p of rows(doc.payments)) {
				const amount = r2(p.amount);
				if (!amount) continue;
				paid += amount;
				b.pair(ctx.methodAccount(id(p.paymentMethod)) || A('petty_cash'), A('accounts_receivable'), amount, {}, { trader: customer });
			}
			let cost = 0;
			patch.items = rows(doc.items).map(it => {
				const product = id(it.product);
				const q = num(it.quantity);
				if (!product || !(q > 0) || !b.isStock(product)) return it;
				const value = b.stockOut(product, wh, q);
				cost += value;
				return { ...it, unitCost: r4(value / q) };
			});
			b.pair(A('cogs'), A('resale_items'), cost, { warehouse: wh });
			patch.costOfGoods = r2(cost);
			patch.status = statusOf(net, r2(paid + num(doc.receivedLater)));
			break;
		}

		case 'purchase': {
			const supplier = need(doc.supplier, 'Choose a supplier');
			const net = r2(doc.netPayable);
			const tax = r2(doc.taxAmount);
			const subtotal = rows(doc.items).reduce((s, it) => s + num(it.total), 0);
			const factor = subtotal > 0 ? (subtotal - num(doc.discount)) / subtotal : 1;
			let services = 0;
			for (const it of rows(doc.items)) {
				const product = id(it.product);
				const q = num(it.quantity);
				if (!product || !(q > 0)) continue;
				if (b.isStock(product)) b.stockIn(product, wh, q, (num(it.total) * factor) / q);
				else services += num(it.total) * factor;
				const set: Record<string, number> = {};
				if (doc.updateBuyingPrice && num(it.price) > 0) set.buyingPrice = num(it.price);
				if (num(it.sellingPrice) > 0) set.sellingPrice = num(it.sellingPrice);
				if (Object.keys(set).length) products.push({ id: product, set });
			}
			b.post(A('resale_items'), net - tax - r2(services), { warehouse: wh });
			b.post(A('purchases'), services);
			b.post(A('tax_paid'), tax);
			b.post(A('accounts_payable'), -net, { trader: supplier });
			let paid = 0;
			for (const p of rows(doc.payments)) {
				const amount = r2(p.amount);
				if (!amount) continue;
				paid += amount;
				b.pair(A('accounts_payable'), id(p.account) || A('petty_cash'), amount, { trader: supplier }, {});
			}
			patch.status = statusOf(net, r2(paid + num(doc.paidLater)));
			break;
		}

		case 'sale_return':
		case 'product_return': {
			const customer = need(doc.customer, 'Choose a customer');
			const total = r2(doc.total ?? rows(doc.items).reduce((s, it) => s + num(it.total), 0));
			b.pair(A('sales'), A('accounts_receivable'), total, {}, { trader: customer });
			let cost = 0;
			for (const it of rows(doc.items)) {
				const product = id(it.product);
				const q = num(it.quantity);
				if (!product || !(q > 0) || !b.isStock(product)) continue;
				const unit = (kind === 'sale_return' && doc.sale ? ctx.saleCost(id(doc.sale), product) : undefined) ?? b.costNow(product, wh);
				cost += b.stockIn(product, wh, q, unit);
			}
			b.pair(A('resale_items'), A('cogs'), cost, { warehouse: wh });
			if (doc.refundType === 'cash_back') b.pair(A('accounts_receivable'), id(doc.refundAccount) || A('petty_cash'), num(doc.refundAmount), { trader: customer }, {});
			break;
		}

		case 'exchange': {
			const customer = need(doc.customer, 'Choose a customer');
			const back = r2(doc.returnTotal ?? rows(doc.returnItems).reduce((s, it) => s + num(it.total), 0));
			const out = r2(doc.newTotal ?? rows(doc.newItems).reduce((s, it) => s + num(it.total), 0));
			b.pair(A('accounts_receivable'), A('sales'), out, { trader: customer }, {});
			b.pair(A('sales'), A('accounts_receivable'), back, {}, { trader: customer });
			let cost = 0;
			for (const it of rows(doc.returnItems)) {
				const product = id(it.product);
				if (product && num(it.quantity) > 0 && b.isStock(product)) cost -= b.stockIn(product, wh, num(it.quantity), b.costNow(product, wh));
			}
			for (const it of rows(doc.newItems)) {
				const product = id(it.product);
				if (product && num(it.quantity) > 0 && b.isStock(product)) cost += b.stockOut(product, wh, num(it.quantity));
			}
			b.pair(A('cogs'), A('resale_items'), cost, { warehouse: wh });
			const account = id(doc.account) || A('petty_cash');
			if (out - back >= 0) b.pair(account, A('accounts_receivable'), num(doc.paidAmount), {}, { trader: customer });
			else b.pair(A('accounts_receivable'), account, num(doc.paidAmount), { trader: customer }, {});
			break;
		}

		case 'purchase_return': {
			const supplier = need(doc.supplier, 'Choose a supplier');
			let goods = 0;
			let other = 0;
			for (const it of rows(doc.items)) {
				const product = id(it.product);
				const q = num(it.quantity);
				if (!product || !(q > 0)) continue;
				if (b.isStock(product)) goods += b.stockOut(product, wh, q, num(it.price));
				else other += num(it.total);
			}
			const total = r2(doc.total ?? goods + other);
			b.post(A('accounts_payable'), total, { trader: supplier });
			b.post(A('resale_items'), -r2(goods), { warehouse: wh });
			b.post(A('purchases'), -(total - r2(goods)));
			if (doc.refundType === 'cash_back') b.pair(id(doc.refundAccount) || A('petty_cash'), A('accounts_payable'), num(doc.refundAmount), {}, { trader: supplier });
			break;
		}

		case 'payment': {
			const trader = need(doc.trader, 'Choose a customer or supplier');
			const amount = r2(doc.amount);
			if (!(amount > 0)) throw new BooksError('Enter an amount', 'books_amount');
			const received = doc.direction !== 'given';
			const cheque = !!String(doc.chequeNo || '').trim();
			const money = cheque ? A(received ? 'cheque_clearing' : 'cheque_payable') : id(doc.account) || ctx.methodAccount(id(doc.paymentMethod)) || A('petty_cash');
			if (received) b.pair(money, A('accounts_receivable'), amount, {}, { trader });
			else b.pair(A('accounts_payable'), money, amount, { trader }, {});
			break;
		}

		case 'expense': {
			const from = need(doc.payFrom, 'Choose the account to pay from');
			const cc = id(doc.costCentre) || undefined;
			let total = 0;
			for (const it of rows(doc.items)) {
				const amount = r2(it.amount);
				if (!amount) continue;
				total += amount;
				b.post(need(it.account, 'Choose an expense for every row'), amount, { costCentre: cc, note: it.note });
			}
			b.post(from, -total, { costCentre: cc });
			break;
		}

		case 'income': {
			const to = need(doc.depositTo, 'Choose the account to deposit to');
			let total = 0;
			for (const it of rows(doc.items)) {
				const amount = r2(it.amount);
				if (!amount) continue;
				total += amount;
				b.post(need(it.account, 'Choose an income for every row'), -amount, { note: it.note });
			}
			b.post(to, total);
			break;
		}

		case 'transfer': {
			const from = need(doc.fromAccount, 'Choose the account to take from');
			const to = need(doc.toAccount, 'Choose the account to put into');
			if (from === to) throw new BooksError('Choose two different accounts', 'books_same_account');
			if (!(num(doc.amount) > 0)) throw new BooksError('Enter an amount', 'books_amount');
			b.pair(to, from, num(doc.amount));
			b.pair(A('miscellaneous'), from, num(doc.charge));
			break;
		}

		case 'voucher': {
			let debit = 0;
			let credit = 0;
			for (const l of rows(doc.lines)) {
				const d = r2(l.debit);
				const c = r2(l.credit);
				if (!d && !c) continue;
				const account = need(l.account, 'Choose an account for every line');
				debit += d;
				credit += c;
				b.post(account, d, { note: l.note });
				b.post(account, -c, { note: l.note });
			}
			if (!(r2(debit) > 0)) throw new BooksError('Add debit and credit lines', 'voucher_empty');
			if (r2(debit) !== r2(credit)) throw new BooksError(`Debit (${r2(debit)}) and credit (${r2(credit)}) must be equal`, 'voucher_unbalanced');
			break;
		}

		case 'cheque': {
			const amount = num(doc.amount);
			const received = doc.direction !== 'issued';
			if (doc.status === 'cleared') {
				const bank = need(doc.bankAccount, 'Choose the bank account');
				if (received) b.pair(bank, A('cheque_clearing'), amount);
				else b.pair(A('cheque_payable'), bank, amount);
			} else if (doc.status === 'bounced') {
				const trader = need(doc.trader, 'Choose a customer or supplier');
				if (received) b.pair(A('accounts_receivable'), A('cheque_clearing'), amount, { trader }, {});
				else b.pair(A('cheque_payable'), A('accounts_payable'), amount, {}, { trader });
			}
			break;
		}

		case 'stock_adjustment': {
			let gain = 0;
			let loss = 0;
			for (const it of rows(doc.items)) {
				const product = id(it.product);
				if (!product || !b.isStock(product)) continue;
				const delta = it.adjustedQty !== undefined && it.adjustedQty !== null ? num(it.adjustedQty) : num(it.newQty) - num(it.availableQty);
				if (delta > 0) gain += b.stockIn(product, wh, delta, num(it.unitCost) || b.costNow(product, wh));
				else if (delta < 0) loss += b.stockOut(product, wh, -delta);
			}
			b.pair(A('resale_items'), A('stock_adjustment'), gain, { warehouse: wh }, {});
			b.pair(A('stock_adjustment'), A('resale_items'), loss, {}, { warehouse: wh });
			break;
		}

		case 'stock_transfer': {
			const from = need(doc.fromWarehouse, 'Choose the warehouse to move from');
			const to = need(doc.toWarehouse, 'Choose the warehouse to move to');
			if (from === to) throw new BooksError('Choose two different warehouses', 'books_same_warehouse');
			for (const it of rows(doc.items)) {
				const product = id(it.product);
				const q = num(it.quantity);
				if (!product || !(q > 0) || !b.isStock(product)) continue;
				const value = b.stockOut(product, from, q);
				b.stockIn(product, to, q, value / q);
			}
			break;
		}

		case 'production': {
			let cost = 0;
			patch.rawItems = rows(doc.rawItems).map(it => {
				const product = id(it.product);
				const q = num(it.quantity);
				if (!product || !(q > 0) || !b.isStock(product)) return it;
				const value = b.stockOut(product, wh, q);
				cost += value;
				return { ...it, unitCost: r4(value / q) };
			});
			const made = rows(doc.finishedItems).filter(it => id(it.product) && num(it.quantity) > 0);
			const units = made.reduce((s, it) => s + num(it.quantity), 0);
			const unit = units > 0 ? cost / units : 0;
			patch.finishedItems = rows(doc.finishedItems).map(it => {
				if (!made.includes(it)) return it;
				b.stockIn(id(it.product), wh, num(it.quantity), unit);
				return { ...it, unitCost: r4(unit) };
			});
			patch.totalCost = r2(cost);
			break;
		}

		case 'product_opening': {
			if (doc.kind === 'service' || !(num(doc.openingQty) > 0)) break;
			const product = need(doc._id, 'Save the product first');
			const w = id(doc.openingWarehouse) || ctx.defaultWarehouse;
			const value = b.stockIn(product, w, num(doc.openingQty), num(doc.openingCost));
			b.pair(A('resale_items'), A('opening_stock'), value, { warehouse: w }, {});
			break;
		}

		case 'trader_opening': {
			const amount = num(doc.openingBalance);
			if (!(amount > 0)) break;
			const trader = need(doc._id, 'Save the trader first');
			const advance = doc.openingType === 'advance';
			if (doc.kind === 'supplier') {
				if (advance) b.pair(A('accounts_payable'), A('opening_supplier_balance'), amount, { trader }, {});
				else b.pair(A('opening_supplier_balance'), A('accounts_payable'), amount, {}, { trader });
			} else if (advance) b.pair(A('opening_customer_balance'), A('accounts_receivable'), amount, {}, { trader });
			else b.pair(A('accounts_receivable'), A('opening_customer_balance'), amount, { trader }, {});
			break;
		}

		case 'account_opening': {
			const amount = num(doc.openingBalance);
			const account = need(doc._id, 'Save the account first');
			if (!amount || account === A('owners_equity')) break;
			const debitNature = doc.type === 'asset' || doc.type === 'expense';
			if (debitNature) b.pair(account, A('owners_equity'), amount);
			else b.pair(A('owners_equity'), account, amount);
			break;
		}
	}

	return { lines: b.lines, moves: b.moves, patch, products };
};
