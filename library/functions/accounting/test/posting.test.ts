import { postingFor, applyMove, BooksError, Ctx, Kind, Posting, Level } from '../posting';

/**
 * The books' posting rules (docs/accounting D3, D4; WORK_ORDERS AC-03): every document makes balanced journal lines,
 * stock moves at weighted average cost, and the fields the engine owns on it (status, cost of goods). Pure — no
 * database: the lookups are a fake context.
 */

const ACC: Record<string, string> = {
	petty_cash: 'A-cash',
	accounts_receivable: 'A-ar',
	accounts_payable: 'A-ap',
	cheque_clearing: 'A-chq-in',
	cheque_payable: 'A-chq-out',
	resale_items: 'A-inv',
	tax_collected: 'A-taxout',
	tax_paid: 'A-taxin',
	sales: 'A-sales',
	purchases: 'A-purch',
	cogs: 'A-cogs',
	stock_adjustment: 'A-adj',
	opening_stock: 'A-openstock',
	opening_customer_balance: 'A-opencust',
	opening_supplier_balance: 'A-opensupp',
	owners_equity: 'A-equity',
	miscellaneous: 'A-misc',
};

const ctxWith = (levels: Record<string, Level> = {}, over: Partial<Ctx> = {}): Ctx => ({
	acct: key => {
		if (!ACC[key]) throw new Error(`no ${key}`);
		return ACC[key];
	},
	methodAccount: id => (id === 'M-bkash' ? 'A-bkash' : id === 'M-cash' ? 'A-cash' : undefined),
	product: id => (id === 'P-svc' ? { kind: 'service', name: 'Repair' } : id?.startsWith('P-') ? { kind: 'product', name: id, buyingPrice: 50 } : undefined),
	level: (p, w) => levels[`${p}@${w}`] || { inHand: 0, avgCost: 0 },
	saleCost: () => undefined,
	defaultWarehouse: 'W1',
	allowNegativeStock: false,
	...over,
});

const totals = (p: Posting) => ({
	debit: Math.round(p.lines.reduce((s, l) => s + l.debit, 0) * 100) / 100,
	credit: Math.round(p.lines.reduce((s, l) => s + l.credit, 0) * 100) / 100,
});
const sumOn = (p: Posting, account: string) => Math.round(p.lines.filter(l => l.account === account).reduce((s, l) => s + l.debit - l.credit, 0) * 100) / 100;
const balanced = (p: Posting) => {
	const t = totals(p);
	expect(t.debit).toBeCloseTo(t.credit, 2);
	for (const l of p.lines) expect(l.debit * l.credit).toBe(0);
};

describe('applyMove (weighted average)', () => {
	it('averages stock in and keeps the cost on stock out', () => {
		let l: Level = { inHand: 0, avgCost: 0 };
		l = applyMove(l, 10, 100);
		l = applyMove(l, 10, 120);
		expect(l).toEqual({ inHand: 20, avgCost: 110 });
		l = applyMove(l, -5, 110);
		expect(l).toEqual({ inHand: 15, avgCost: 110 });
	});
	it('is undone exactly by the opposite move', () => {
		const a = applyMove(applyMove({ inHand: 0, avgCost: 0 }, 7, 33.3), 3, 41);
		const back = applyMove(a, -3, 41);
		expect(back.inHand).toBe(7);
		expect(back.avgCost).toBeCloseTo(33.3, 6);
	});
});

describe('sale', () => {
	const sale = {
		code: 'S00001',
		date: '2026-11-28',
		customer: 'T-cust',
		items: [
			{ product: 'P-a', productName: 'A', quantity: 2, price: 150, discount: 0, total: 300 },
			{ product: 'P-svc', productName: 'Repair', quantity: 1, price: 100, discount: 0, total: 100 },
		],
		subtotal: 400,
		taxAmount: 20,
		netReceivable: 420,
		payments: [{ paymentMethod: 'M-bkash', amount: 200 }],
		paidAmount: 200,
		receivedLater: 0,
		due: 220,
	};
	const ctx = ctxWith({ 'P-a@W1': { inHand: 10, avgCost: 90 } });
	const p = postingFor('sale', sale, ctx);

	it('balances', () => balanced(p));
	it('posts receivable, sales and tax', () => {
		expect(sumOn(p, 'A-sales')).toBe(-400);
		expect(sumOn(p, 'A-taxout')).toBe(-20);
	});
	it('takes the payment into the method’s account and off the receivable', () => {
		expect(sumOn(p, 'A-bkash')).toBe(200);
		expect(sumOn(p, 'A-ar')).toBe(220);
		expect(p.lines.filter(l => l.account === 'A-ar').every(l => l.trader === 'T-cust')).toBe(true);
	});
	it('costs goods at average, services not at all', () => {
		expect(sumOn(p, 'A-cogs')).toBe(180);
		expect(sumOn(p, 'A-inv')).toBe(-180);
		expect(p.moves).toEqual([{ product: 'P-a', warehouse: 'W1', quantity: -2, unitCost: 90 }]);
		expect(p.patch.costOfGoods).toBe(180);
		expect(p.patch.items[0].unitCost).toBe(90);
	});
	it('sets status from what is due', () => {
		expect(p.patch.status).toBe('partial');
		expect(postingFor('sale', { ...sale, payments: [], paidAmount: 0, due: 420 }, ctx).patch.status).toBe('unpaid');
		expect(postingFor('sale', { ...sale, payments: [{ paymentMethod: 'M-cash', amount: 420 }], paidAmount: 420, due: 0 }, ctx).patch.status).toBe('paid');
	});
	it('refuses to sell what is not in stock unless settings allow it', () => {
		const big = { ...sale, items: [{ product: 'P-a', quantity: 11, price: 1, total: 11 }] };
		expect(() => postingFor('sale', big, ctx)).toThrow(BooksError);
		expect(() => postingFor('sale', big, ctxWith({ 'P-a@W1': { inHand: 10, avgCost: 90 } }, { allowNegativeStock: true }))).not.toThrow();
	});
	it('a payment with no method lands in petty cash', () => {
		const q = postingFor('sale', { ...sale, payments: [{ amount: 50 }] }, ctx);
		expect(sumOn(q, 'A-cash')).toBe(50);
	});
	it('a percent discount and shipping still balance', () => {
		const q = postingFor('sale', { ...sale, discountType: 'percent', discount: 10, shippingCharge: 30, netReceivable: 410 }, ctx);
		balanced(q);
		expect(sumOn(q, 'A-sales')).toBe(-390);
	});
});

describe('purchase', () => {
	const purchase = {
		code: 'P00001',
		date: '2026-11-28',
		supplier: 'T-supp',
		items: [
			{ product: 'P-a', quantity: 10, price: 100, discount: 0, total: 1000, sellingPrice: 150 },
			{ product: 'P-b', quantity: 5, price: 200, discount: 0, total: 1000 },
		],
		subtotal: 2000,
		taxAmount: 100,
		discount: 200,
		netPayable: 1900,
		payments: [{ account: 'A-bank', amount: 1000 }],
		paidAmount: 1000,
		paidLater: 0,
		due: 900,
		updateBuyingPrice: true,
	};
	const p = postingFor('purchase', purchase, ctxWith());

	it('balances', () => balanced(p));
	it('puts goods into stock net of the discount', () => {
		expect(sumOn(p, 'A-inv')).toBe(1800);
		expect(p.moves).toEqual([
			{ product: 'P-a', warehouse: 'W1', quantity: 10, unitCost: 90 },
			{ product: 'P-b', warehouse: 'W1', quantity: 5, unitCost: 180 },
		]);
		expect(sumOn(p, 'A-taxin')).toBe(100);
	});
	it('owes the supplier, less what was paid', () => {
		expect(sumOn(p, 'A-ap')).toBe(-900);
		expect(sumOn(p, 'A-bank')).toBe(-1000);
		expect(p.patch.status).toBe('partial');
	});
	it('updates buying and selling prices when asked', () => {
		expect(p.products).toEqual([
			{ id: 'P-a', set: { buyingPrice: 100, sellingPrice: 150 } },
			{ id: 'P-b', set: { buyingPrice: 200 } },
		]);
		expect(postingFor('purchase', { ...purchase, updateBuyingPrice: false }, ctxWith()).products).toEqual([{ id: 'P-a', set: { sellingPrice: 150 } }]);
	});
	it('a service line is an expense, not stock', () => {
		const q = postingFor('purchase', { ...purchase, items: [{ product: 'P-svc', quantity: 1, price: 300, total: 300 }], subtotal: 300, discount: 0, taxAmount: 0, netPayable: 300, payments: [] }, ctxWith());
		balanced(q);
		expect(sumOn(q, 'A-purch')).toBe(300);
		expect(q.moves).toEqual([]);
	});
});

describe('returns and exchange', () => {
	const levels = { 'P-a@W1': { inHand: 4, avgCost: 90 } };
	it('a sale return takes sales back, credits the customer and restocks at sale cost', () => {
		const p = postingFor('sale_return', { sale: 'S1', customer: 'T-cust', items: [{ product: 'P-a', quantity: 1, price: 150, total: 150 }], total: 150, refundType: 'cash_back', refundAmount: 150 }, ctxWith(levels, { saleCost: () => 80 }));
		balanced(p);
		expect(sumOn(p, 'A-sales')).toBe(150);
		expect(sumOn(p, 'A-ar')).toBe(0);
		expect(sumOn(p, 'A-cash')).toBe(-150);
		expect(sumOn(p, 'A-inv')).toBe(80);
		expect(sumOn(p, 'A-cogs')).toBe(-80);
		expect(p.moves).toEqual([{ product: 'P-a', warehouse: 'W1', quantity: 1, unitCost: 80 }]);
	});
	it('a customer product return without a slip restocks at average cost', () => {
		const p = postingFor('product_return', { customer: 'T-cust', items: [{ product: 'P-a', quantity: 2, price: 100, total: 200 }], total: 200, refundType: 'reduce_due' }, ctxWith(levels));
		balanced(p);
		expect(sumOn(p, 'A-ar')).toBe(-200);
		expect(p.moves[0].unitCost).toBe(90);
	});
	it('a purchase return reduces what is owed and stock at the returned price', () => {
		const p = postingFor('purchase_return', { supplier: 'T-supp', items: [{ product: 'P-a', quantity: 2, price: 100, total: 200 }], total: 200, refundType: 'cash_back', refundAmount: 200, refundAccount: 'A-bank' }, ctxWith(levels));
		balanced(p);
		expect(sumOn(p, 'A-ap')).toBe(0);
		expect(sumOn(p, 'A-bank')).toBe(200);
		expect(sumOn(p, 'A-inv')).toBe(-200);
		expect(p.moves).toEqual([{ product: 'P-a', warehouse: 'W1', quantity: -2, unitCost: 100 }]);
	});
	it('an exchange returns one item, sells another and takes the difference', () => {
		const p = postingFor(
			'exchange',
			{ customer: 'T-cust', returnItems: [{ product: 'P-a', quantity: 1, price: 150, total: 150 }], newItems: [{ product: 'P-b', quantity: 1, price: 200, total: 200 }], returnTotal: 150, newTotal: 200, difference: 50, paidAmount: 50 },
			ctxWith({ ...levels, 'P-b@W1': { inHand: 3, avgCost: 120 } })
		);
		balanced(p);
		expect(sumOn(p, 'A-sales')).toBe(-50);
		expect(sumOn(p, 'A-ar')).toBe(0);
		expect(sumOn(p, 'A-cash')).toBe(50);
		expect(sumOn(p, 'A-cogs')).toBe(30);
		expect(p.moves.map(m => m.quantity)).toEqual([1, -1]);
	});
});

describe('money documents', () => {
	it('a payment received by cheque waits in cheque clearing', () => {
		const p = postingFor('payment', { direction: 'received', trader: 'T-cust', amount: 500, chequeNo: '123', account: 'A-bank' }, ctxWith());
		balanced(p);
		expect(sumOn(p, 'A-chq-in')).toBe(500);
		expect(sumOn(p, 'A-ar')).toBe(-500);
	});
	it('a payment given comes off what is owed', () => {
		const p = postingFor('payment', { direction: 'given', trader: 'T-supp', amount: 300, paymentMethod: 'M-bkash' }, ctxWith());
		expect(sumOn(p, 'A-ap')).toBe(300);
		expect(sumOn(p, 'A-bkash')).toBe(-300);
	});
	it('a payment needs a trader and an amount', () => {
		expect(() => postingFor('payment', { direction: 'given', amount: 300 }, ctxWith())).toThrow(BooksError);
		expect(() => postingFor('payment', { direction: 'given', trader: 'T', amount: 0 }, ctxWith())).toThrow(BooksError);
	});
	it('an expense debits each head, with its cost centre', () => {
		const p = postingFor('expense', { payFrom: 'A-cash', costCentre: 'CC1', items: [{ account: 'A-rent', amount: 1000 }, { account: 'A-bills', amount: 250 }], total: 1250 }, ctxWith());
		balanced(p);
		expect(sumOn(p, 'A-cash')).toBe(-1250);
		expect(p.lines.find(l => l.account === 'A-rent')?.costCentre).toBe('CC1');
	});
	it('an expense needs an account to pay from', () => {
		expect(() => postingFor('expense', { items: [{ account: 'A-rent', amount: 1 }] }, ctxWith())).toThrow(BooksError);
	});
	it('an income credits each head', () => {
		const p = postingFor('income', { depositTo: 'A-bank', items: [{ account: 'A-int', amount: 40 }], total: 40 }, ctxWith());
		balanced(p);
		expect(sumOn(p, 'A-int')).toBe(-40);
	});
	it('a transfer moves money and books the charge', () => {
		const p = postingFor('transfer', { type: 'transfer', fromAccount: 'A-bank', toAccount: 'A-cash', amount: 1000, charge: 10 }, ctxWith());
		balanced(p);
		expect(sumOn(p, 'A-bank')).toBe(-1010);
		expect(sumOn(p, 'A-misc')).toBe(10);
		expect(() => postingFor('transfer', { fromAccount: 'A-bank', toAccount: 'A-bank', amount: 5 }, ctxWith())).toThrow(BooksError);
	});
	it('a voucher posts its lines and must balance', () => {
		const p = postingFor('voucher', { voucherType: 'journal', lines: [{ account: 'A-rent', debit: 100 }, { account: 'A-cash', credit: 100 }] }, ctxWith());
		balanced(p);
		expect(() => postingFor('voucher', { lines: [{ account: 'A-rent', debit: 100 }, { account: 'A-cash', credit: 90 }] }, ctxWith())).toThrow(/equal/);
		expect(() => postingFor('voucher', { lines: [] }, ctxWith())).toThrow(BooksError);
	});
	it('a cheque clears into the bank or bounces back to the trader', () => {
		const cleared = postingFor('cheque', { direction: 'received', status: 'cleared', amount: 500, bankAccount: 'A-bank', trader: 'T-cust' }, ctxWith());
		balanced(cleared);
		expect(sumOn(cleared, 'A-bank')).toBe(500);
		expect(sumOn(cleared, 'A-chq-in')).toBe(-500);
		const bounced = postingFor('cheque', { direction: 'received', status: 'bounced', amount: 500, trader: 'T-cust' }, ctxWith());
		expect(sumOn(bounced, 'A-ar')).toBe(500);
		const issued = postingFor('cheque', { direction: 'issued', status: 'cleared', amount: 200, bankAccount: 'A-bank', trader: 'T-supp' }, ctxWith());
		expect(sumOn(issued, 'A-chq-out')).toBe(200);
		expect(postingFor('cheque', { direction: 'received', status: 'open', amount: 500 }, ctxWith()).lines).toEqual([]);
	});
});

describe('stock documents', () => {
	const levels = { 'P-a@W1': { inHand: 10, avgCost: 90 }, 'P-b@W1': { inHand: 5, avgCost: 20 } };
	it('an adjustment books gains and losses to Stock Adjustment', () => {
		const p = postingFor(
			'stock_adjustment',
			{ warehouse: 'W1', items: [{ product: 'P-a', availableQty: 10, newQty: 8 }, { product: 'P-b', availableQty: 5, newQty: 6, unitCost: 25 }] },
			ctxWith(levels)
		);
		balanced(p);
		expect(sumOn(p, 'A-adj')).toBe(155);
		expect(p.moves).toEqual([
			{ product: 'P-a', warehouse: 'W1', quantity: -2, unitCost: 90 },
			{ product: 'P-b', warehouse: 'W1', quantity: 1, unitCost: 25 },
		]);
	});
	it('a transfer moves stock at its cost and posts nothing', () => {
		const p = postingFor('stock_transfer', { fromWarehouse: 'W1', toWarehouse: 'W2', items: [{ product: 'P-a', quantity: 3 }] }, ctxWith(levels));
		expect(p.lines).toEqual([]);
		expect(p.moves).toEqual([
			{ product: 'P-a', warehouse: 'W1', quantity: -3, unitCost: 90 },
			{ product: 'P-a', warehouse: 'W2', quantity: 3, unitCost: 90 },
		]);
		expect(() => postingFor('stock_transfer', { fromWarehouse: 'W1', toWarehouse: 'W1', items: [{ product: 'P-a', quantity: 1 }] }, ctxWith(levels))).toThrow(BooksError);
	});
	it('production rolls the raw cost into what it makes', () => {
		const p = postingFor('production', { warehouse: 'W1', rawItems: [{ product: 'P-a', quantity: 2 }, { product: 'P-b', quantity: 5 }], finishedItems: [{ product: 'P-c', quantity: 4 }] }, ctxWith(levels));
		expect(p.patch.totalCost).toBe(280);
		expect(p.moves.at(-1)).toEqual({ product: 'P-c', warehouse: 'W1', quantity: 4, unitCost: 70 });
		expect(p.lines).toEqual([]);
	});
});

describe('opening balances', () => {
	it('a product’s opening stock', () => {
		const p = postingFor('product_opening', { _id: 'P-a', kind: 'product', openingQty: 10, openingCost: 80, openingWarehouse: 'W2' }, ctxWith());
		balanced(p);
		expect(sumOn(p, 'A-inv')).toBe(800);
		expect(sumOn(p, 'A-openstock')).toBe(-800);
		expect(p.moves).toEqual([{ product: 'P-a', warehouse: 'W2', quantity: 10, unitCost: 80 }]);
		expect(postingFor('product_opening', { _id: 'P-svc', kind: 'service', openingQty: 10, openingCost: 80 }, ctxWith()).moves).toEqual([]);
	});
	it('a customer’s opening due and a supplier’s opening advance', () => {
		const c = postingFor('trader_opening', { _id: 'T-c', kind: 'customer', openingType: 'due', openingBalance: 500 }, ctxWith());
		balanced(c);
		expect(sumOn(c, 'A-ar')).toBe(500);
		const s = postingFor('trader_opening', { _id: 'T-s', kind: 'supplier', openingType: 'advance', openingBalance: 300 }, ctxWith());
		expect(sumOn(s, 'A-ap')).toBe(300);
		expect(s.lines.every(l => !l.trader || l.trader === 'T-s')).toBe(true);
	});
	it('an account’s opening balance against owners’ equity', () => {
		const a = postingFor('account_opening', { _id: 'A-bank', type: 'asset', openingBalance: 10000 }, ctxWith());
		balanced(a);
		expect(sumOn(a, 'A-bank')).toBe(10000);
		const l = postingFor('account_opening', { _id: 'A-loan', type: 'liability', openingBalance: 4000 }, ctxWith());
		expect(sumOn(l, 'A-loan')).toBe(-4000);
		expect(postingFor('account_opening', { _id: 'A-equity', type: 'liability', openingBalance: 5 }, ctxWith()).lines).toEqual([]);
	});
});

describe('every document balances', () => {
	const kinds: [Kind, any][] = [
		['sale', { customer: 'T', items: [{ product: 'P-a', quantity: 1, price: 10, total: 10 }], netReceivable: 10, payments: [{ amount: 3 }] }],
		['purchase', { supplier: 'T', items: [{ product: 'P-a', quantity: 3, price: 3.33, total: 9.99 }], subtotal: 9.99, discount: 1, netPayable: 8.99 }],
		['voucher', { lines: [{ account: 'X', debit: 0.1 }, { account: 'Y', debit: 0.2 }, { account: 'Z', credit: 0.3 }] }],
	];
	it.each(kinds)('%s', (kind, doc) => balanced(postingFor(kind, doc, ctxWith({ 'P-a@W1': { inHand: 9, avgCost: 3 } }))));
});
