// Mint Accounting AC-02 + AC-03 (docs/accounting D2–D4): a fresh accounting project sets up its own books (36
// models from the blueprint, the seeded chart and defaults), then the ledger engine through the real API: posts each
// kind of document and checks the journal, stock, balances and refusals. The trial
// balance must net to 0 after every step.
import { call, ok, done } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Ada Books', email: `ada${stamp}@example.com`, password: 'tenant-pass-123', organization: `Books ${stamp}`, country: 'BD' });
const t = r.body?.token;
ok('owner registers', !!t, JSON.stringify(r.body).slice(0, 200));
r = await call('POST', '/tenant/api/projects', { name: 'Engine Books', type: 'accounting' }, t);
const P = `/tenant/api/p/${r.body?._id}`;
ok('an accounting project', r.body?.type === 'accounting', JSON.stringify(r.body).slice(0, 200));

// AC-02: a new accounting project builds its books by itself — poll until ready.
let books;
for (let i = 0; i < 150; i++) {
	books = (await call('GET', `${P}/accounting/books`, null, t)).body;
	if (books?.status !== 'building') break;
	await new Promise(res => setTimeout(res, 2000));
}
ok('the books set themselves up', books?.status === 'ready', JSON.stringify(books).slice(0, 300));
r = await call('GET', P, null, t);
ok('the project says its books are ready', r.body?.books?.status === 'ready', JSON.stringify(r.body?.books));
r = await call('POST', `${P}/accounting/books/retry`, {}, t);
ok('trying again while ready is refused', r.status === 409, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

// ---- helpers
const post = async (route, body) => (await call('POST', `${P}/${route}`, body, t));
const put = async (route, id, body) => (await call('PUT', `${P}/${route}/${id}`, body, t));
const del = async (route, id) => (await call('DELETE', `${P}/${route}/${id}`, null, t));
const one = async (route, id) => (await call('GET', `${P}/${route}/${id}`, null, t)).body;
const all = async (route, q = '') => (await call('GET', `${P}/${route}?limit=999${q}`, null, t)).body?.doc || [];
const made = async (route, body, label) => {
	const x = await post(route, body);
	ok(label, x.status === 201, `${x.status} ${JSON.stringify(x.body).slice(0, 300)}`);
	return x.body?.doc;
};
const trial = async label => {
	const lines = await all('journal');
	const d = lines.reduce((s, l) => s + (l.debit || 0), 0);
	const c = lines.reduce((s, l) => s + (l.credit || 0), 0);
	ok(`trial balance nets to 0 — ${label}`, Math.abs(d - c) < 0.005, `debit ${d} credit ${c} (${lines.length} lines)`);
	return lines;
};

// ---- the seeded chart, warehouse and Cash method; a bank and a second warehouse of our own
const chart = await all('accounts');
const A = Object.fromEntries(chart.filter(x => x.systemKey).map(x => [x.systemKey, x._id]));
ok('chart seeded: 30 system accounts', Object.keys(A).length === 30, Object.keys(A).join(', '));
ok('seeded once — no duplicates', chart.length === 30, chart.length);
const W1 = (await all('warehouses')).find(w => w.name === 'Main')?._id;
ok('Main warehouse seeded', !!W1);
const cash = (await all('payment-methods')).find(m => m.name === 'Cash');
ok('Cash payment method seeded into Petty Cash', String(cash?.depositTo?._id || cash?.depositTo) === String(A.petty_cash), JSON.stringify(cash).slice(0, 200));
ok('units, tax, settings and organization info seeded', (await all('units')).length === 4 && (await all('tax-categories')).length === 1 && (await all('accounting-settings')).length === 1 && (await all('organization-info')).length === 1);
r = await del('accounts', A.sales);
ok('a system account can’t be deleted', r.status === 400, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
const bank = await made('accounts', { name: 'City Bank', type: 'asset', group: 'bank', openingBalance: 50000, isActive: true }, 'a bank with an opening balance');
const W2 = (await made('warehouses', { name: 'Shop' }, 'second warehouse'))?._id;
await trial('opening bank');
ok('bank balance from its opening', (await one('accounts', bank._id))?.balance === 50000, JSON.stringify((await one('accounts', bank._id))?.balance));

// ---- masters with openings
const pen = await made('products', { name: 'Pen', kind: 'product', sellingPrice: 20, buyingPrice: 10, openingQty: 100, openingCost: 10, openingWarehouse: W1 }, 'product with opening stock');
const book = await made('products', { name: 'Book', kind: 'product', sellingPrice: 300, buyingPrice: 200 }, 'second product');
const fix = await made('products', { name: 'Repair', kind: 'service', sellingPrice: 500 }, 'a service');
const cust = await made('traders', { kind: 'customer', name: 'Rahim', openingType: 'due', openingBalance: 1000 }, 'customer with opening due');
const supp = await made('traders', { kind: 'supplier', name: 'Karim Traders', openingType: 'due', openingBalance: 2000 }, 'supplier with opening due');
await trial('openings');
let s = (await all('stocks', `&product=${pen._id}`))[0];
ok('opening stock in the stock list', s?.inHand === 100 && s?.avgCost === 10, JSON.stringify(s));
ok('customer owes their opening due', (await one('traders', cust._id))?.balance === 1000);
ok('supplier is owed their opening due', (await one('traders', supp._id))?.balance === 2000);

// ---- purchase: stock in at cost, supplier owed, part paid from the bank
const purchase = await made(
	'purchases',
	{
		date: new Date().toISOString(),
		supplier: supp._id,
		warehouse: W1,
		items: [
			{ product: pen._id, productName: 'Pen', quantity: 100, price: 12, discount: 0 },
			{ product: book._id, productName: 'Book', quantity: 10, price: 200, discount: 0, sellingPrice: 320 },
		],
		taxAmount: 0,
		discount: 0,
		payments: [{ account: bank._id, accountName: 'City Bank', amount: 1000 }],
		updateBuyingPrice: true,
	},
	'a purchase'
);
await trial('purchase');
ok('purchase status partial', purchase?.status === 'partial', purchase?.status);
s = (await all('stocks', `&product=${pen._id}`))[0];
ok('pen averages to 11 over 200', s?.inHand === 200 && s?.avgCost === 11, JSON.stringify(s));
ok('buying and selling prices updated', (await one('products', book._id))?.sellingPrice === 320 && (await one('products', pen._id))?.buyingPrice === 12);
ok('supplier now owed 2000 + 3200 − 1000', (await one('traders', supp._id))?.balance === 4200, (await one('traders', supp._id))?.balance);

// ---- sale: cost at average, paid in part by cash
const sale = await made(
	'sales',
	{
		date: new Date().toISOString(),
		customer: cust._id,
		warehouse: W1,
		items: [
			{ product: pen._id, productName: 'Pen', quantity: 10, price: 20, discount: 0 },
			{ product: fix._id, productName: 'Repair', quantity: 1, price: 500, discount: 0 },
		],
		taxAmount: 35,
		discountType: 'amount',
		discount: 0,
		roundUpDiscount: 0,
		shippingCharge: 0,
		payments: [{ paymentMethod: cash._id, methodName: 'Cash', paymentType: 'cash', amount: 400 }],
		receivedLater: 0,
	},
	'a sale'
);
await trial('sale');
ok('sale cost of goods 10 × 11', sale?.costOfGoods === 110, sale?.costOfGoods);
ok('sale partial', sale?.status === 'partial');
ok('customer owes 1000 + 735 − 400', (await one('traders', cust._id))?.balance === 1335, (await one('traders', cust._id))?.balance);
const cashAcc = await one('accounts', A.petty_cash);
ok('cash got the payment', cashAcc?.balance === 400, cashAcc?.balance);

// ---- refusals
r = await post('sales', { customer: cust._id, warehouse: W1, items: [{ product: book._id, productName: 'book', quantity: 999, price: 1 }], payments: [] });
ok('selling more than in stock is allowed while settings leave it unset', r.status === 201, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
if (r.body?.doc?._id) await del('sales', r.body.doc._id);
await post('accounting-settings', { language: 'en', currency: '৳', inventory: { allowNegativeStock: false } });
r = await post('sales', { customer: cust._id, warehouse: W1, items: [{ product: book._id, productName: 'book', quantity: 999, price: 1 }], payments: [] });
ok('…and refused once settings say no', r.status === 400 && r.body?.code === 'not_enough_stock', `${r.status} ${JSON.stringify(r.body)}`);
r = await post('vouchers', { date: new Date().toISOString(), voucherType: 'journal', lines: [{ account: A.office_rent, accountName: 'Rent', debit: 100 }, { account: A.petty_cash, accountName: 'Cash', credit: 90 }] });
ok('an unbalanced voucher is refused, nothing saved', r.status === 400 && r.body?.code === 'voucher_unbalanced' && (await all('vouchers')).length === 0, `${r.status} ${JSON.stringify(r.body)}`);
r = await del('accounts', A.petty_cash);
ok('a system account can’t be deleted', r.status === 400, r.status);
r = await del('traders', cust._id);
ok('a customer with transactions can’t be deleted', r.status === 400, r.status);

// ---- payment against the slip: the sale’s due and status follow
const pay = await made('trader-payments', { date: new Date().toISOString(), direction: 'received', trader: cust._id, account: A.petty_cash, paymentMethod: cash._id, amount: 335, against: 'slip', sale: sale._id }, 'customer pays the rest of the sale');
await trial('payment');
let sl = await one('sales', sale._id);
ok('sale now paid', sl?.status === 'paid' && sl?.receivedLater === 335 && sl?.due === 0, JSON.stringify({ s: sl?.status, rl: sl?.receivedLater, due: sl?.due }));
await del('trader-payments', pay._id);
sl = await one('sales', sale._id);
ok('deleting the payment makes it partial again', sl?.status === 'partial' && sl?.receivedLater === 0, sl?.status);
await trial('payment deleted');

// ---- edit a sale: its old posting is replaced, stock follows
r = await put('sales', sale._id, { items: [{ product: pen._id, productName: 'Pen', quantity: 20, price: 20, discount: 0 }], taxAmount: 0 });
ok('sale edited', r.status === 200, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
await trial('sale edited');
s = (await all('stocks', `&product=${pen._id}`))[0];
ok('stock follows the edit (200 − 20)', s?.inHand === 180, JSON.stringify(s));
const saleLines = (await all('journal')).filter(l => l.sourceId === sale._id);
ok('only the edited posting remains', saleLines.reduce((n, l) => n + l.debit, 0) === 400 + 400 + 220, JSON.stringify(saleLines.map(l => [l.debit, l.credit])));

// ---- returns, exchange
await made('sale-returns', { date: new Date().toISOString(), sale: sale._id, customer: cust._id, warehouse: W1, items: [{ product: pen._id, productName: 'pen', quantity: 2, price: 20 }], refundType: 'cash_back', refundAmount: 40, refundAccount: A.petty_cash }, 'a sale return with cash back');
await trial('sale return');
s = (await all('stocks', `&product=${pen._id}`))[0];
ok('returned pens back in stock at sale cost', s?.inHand === 182 && s?.avgCost === 11, JSON.stringify(s));
await made('purchase-returns', { date: new Date().toISOString(), purchase: purchase._id, supplier: supp._id, warehouse: W1, items: [{ product: book._id, productName: 'book', quantity: 1, price: 200 }], refundType: 'reduce_due' }, 'a purchase return');
await trial('purchase return');
await made('exchanges', { date: new Date().toISOString(), sale: sale._id, customer: cust._id, warehouse: W1, returnItems: [{ product: pen._id, productName: 'pen', quantity: 1, price: 20 }], newItems: [{ product: book._id, productName: 'book', quantity: 1, price: 320 }], paidAmount: 300, account: A.petty_cash }, 'an exchange');
await trial('exchange');

// ---- money
await made('expenses', { date: new Date().toISOString(), payFrom: A.petty_cash, items: [{ account: A.office_rent, accountName: 'Rent', amount: 150 }] }, 'an expense');
await made('incomes', { date: new Date().toISOString(), depositTo: bank._id, items: [{ account: A.sales, accountName: 'Sales', amount: 75 }] }, 'an income');
await made('transfers', { date: new Date().toISOString(), type: 'deposit', fromAccount: A.petty_cash, toAccount: bank._id, amount: 100, charge: 5 }, 'a transfer with a charge');
await made('vouchers', { date: new Date().toISOString(), voucherType: 'journal', lines: [{ account: A.office_rent, accountName: 'Rent', debit: 50 }, { account: bank._id, accountName: 'Bank', credit: 50 }] }, 'a balanced voucher');
const chq = await made('cheques', { trader: cust._id, direction: 'received', chequeNo: '991', amount: 100, status: 'open' }, 'an open cheque posts nothing');
await made('trader-payments', { date: new Date().toISOString(), direction: 'received', trader: cust._id, account: bank._id, amount: 100, chequeNo: '991', against: 'on_account' }, 'a payment by cheque');
r = await put('cheques', chq._id, { status: 'cleared', bankAccount: bank._id });
ok('the cheque clears', r.status === 200, r.status);
await trial('money');
ok('cheque clearing back to 0', (await one('accounts', A.cheque_clearing))?.balance === 0, (await one('accounts', A.cheque_clearing))?.balance);

// ---- stock documents
await made('stock-adjustments', { date: new Date().toISOString(), warehouse: W1, reason: 'damaged', items: [{ product: pen._id, productName: 'pen', availableQty: 183, newQty: 180 }] }, 'a stock adjustment');
await made('stock-transfers', { date: new Date().toISOString(), fromWarehouse: W1, toWarehouse: W2, items: [{ product: pen._id, productName: 'pen', quantity: 30 }] }, 'a stock transfer');
const kit = await made('products', { name: 'Pen kit', kind: 'product' }, 'a product to make');
await made('productions', { date: new Date().toISOString(), warehouse: W2, rawItems: [{ product: pen._id, productName: 'pen', quantity: 10 }], finishedItems: [{ product: kit._id, productName: 'kit', quantity: 2 }] }, 'a production');
const lines = await trial('stock');
const stocks = await all('stocks');
const stockValue = stocks.reduce((n, x) => n + x.inHand * x.avgCost, 0);
const inv = lines.filter(l => (l.account?._id || l.account) === A.resale_items).reduce((n, l) => n + l.debit - l.credit, 0);
ok('inventory account equals the stock list’s value', Math.abs(inv - stockValue) < 0.05, `account ${inv} stock ${stockValue}`);
const kitStock = stocks.find(x => (x.product?._id || x.product) === kit._id);
ok('made kits carry the raw cost (10 × 11 / 2)', kitStock?.avgCost === 55 && kitStock?.inHand === 2, JSON.stringify(kitStock));

// ---- bulk changes go one at a time
r = await call('POST', `${P}/sales/bulk/delete`, { ids: [sale._id] }, t);
ok('bulk delete of sales is refused', r.status === 400 && r.body?.code === 'books_one_at_a_time', `${r.status} ${JSON.stringify(r.body)}`);

// ---- deleting a sale takes it all back
await del('sales', sale._id);
await trial('sale deleted');
ok('no journal lines left for the deleted sale', (await all('journal')).every(l => l.sourceId !== sale._id));

done();
