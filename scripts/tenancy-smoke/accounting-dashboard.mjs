// Mint Accounting AC-06 (docs/accounting; inventory § Dashboard): the dashboard's cards and charts equal what the books
// hold — today's sale (paid / credit), today's expense, receivable / payable, cash / bank, top customers and items,
// asset analysis, sale analysis by period, profit and loss by month — and each login's Dashboard Settings.
import { call, ok, done } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Dee Board', email: `dash${stamp}@example.com`, password: 'tenant-pass-123', organization: `Dash ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Dash Books', type: 'accounting' }, t);
const P = `/tenant/api/p/${r.body?._id}`;
let books;
for (let i = 0; i < 150; i++) {
	books = (await call('GET', `${P}/accounting/books`, null, t)).body;
	if (books?.status !== 'building') break;
	await new Promise(res => setTimeout(res, 2000));
}
ok('books ready', books?.status === 'ready', JSON.stringify(books));

const all = async (route, q = '') => (await call('GET', `${P}/${route}?limit=999${q}`, null, t)).body?.doc || [];
const one = async (route, id) => (await call('GET', `${P}/${route}/${id}`, null, t)).body;
const made = async (route, body, label) => {
	const x = await call('POST', `${P}/${route}`, body, t);
	ok(label, x.status === 201, `${x.status} ${JSON.stringify(x.body).slice(0, 300)}`);
	return x.body?.doc;
};
const tz = new Date().getTimezoneOffset();
const dash = async (q = '') => (await call('GET', `${P}/accounting/dashboard?tz=${tz}${q}`, null, t)).body;

const A = Object.fromEntries((await all('accounts')).filter(a => a.systemKey).map(a => [a.systemKey, a._id]));
const W = (await all('warehouses'))[0]?._id;
const cash = (await all('payment-methods')).find(m => m.name === 'Cash');

let d = await dash();
ok('empty books: everything 0', d?.cards?.todays_sale?.total === 0 && d?.cards?.cash?.total === 0 && d?.charts?.top_customers?.length === 0, JSON.stringify(d?.cards));
ok('all six cards and five charts by default', Object.keys(d?.cards || {}).length === 6 && Object.keys(d?.charts || {}).length === 5, Object.keys(d?.charts || {}).join(','));
ok('profit and loss covers 12 months', d?.charts?.profit_loss?.length === 12);

const bank = await made('accounts', { name: 'City Bank', type: 'asset', group: 'bank', openingBalance: 5000, isActive: true }, 'a bank with 5000');
const pen = await made('products', { name: 'Pen', kind: 'product', sellingPrice: 20, buyingPrice: 10, openingQty: 100, openingCost: 10, openingWarehouse: W }, 'a product with stock');
const rahim = await made('traders', { kind: 'customer', name: 'Rahim' }, 'a customer');
const karim = await made('traders', { kind: 'customer', name: 'Karim' }, 'another customer');
const supp = await made('traders', { kind: 'supplier', name: 'Supply Co', openingType: 'due', openingBalance: 700 }, 'a supplier we owe 700');
const now = new Date().toISOString();
const sale = (customer, qty, pay) => ({
	date: now,
	customer,
	warehouse: W,
	items: [{ product: pen._id, productName: 'Pen', quantity: qty, price: 20, discount: 0 }],
	taxAmount: 0,
	discountType: 'amount',
	discount: 0,
	roundUpDiscount: 0,
	shippingCharge: 0,
	payments: pay ? [{ paymentMethod: cash._id, methodName: 'Cash', paymentType: 'cash', amount: pay }] : [],
	receivedLater: 0,
});
await made('sales', sale(rahim._id, 10, 150), 'sale 1: 200, 150 paid');
await made('sales', sale(karim._id, 5, 0), 'sale 2: 100 on credit');
await made('expenses', { date: now, payFrom: A.petty_cash, items: [{ account: A.office_rent, accountName: 'Rent', amount: 40 }] }, 'an expense of 40 from cash');

d = await dash();
const c = d?.cards || {};
ok("today's sale 300: 150 paid, 150 credit", c.todays_sale?.total === 300 && c.todays_sale?.paid === 150 && c.todays_sale?.credit === 150, JSON.stringify(c.todays_sale));
ok("today's expense 40", c.todays_expense?.total === 40, JSON.stringify(c.todays_expense));
const owed = (await one('traders', rahim._id)).balance + (await one('traders', karim._id)).balance;
ok('receivable = customers’ balances (50 + 100)', c.receivable?.total === owed && owed === 150, `${c.receivable?.total} vs ${owed}`);
ok('payable = what suppliers are owed (700)', c.payable?.total === 700 && (await one('traders', supp._id)).balance === 700, JSON.stringify(c.payable));
ok('cash = Petty Cash balance (150 − 40)', c.cash?.total === (await one('accounts', A.petty_cash)).balance && c.cash.total === 110, JSON.stringify(c.cash));
ok('bank = bank accounts (5000)', c.bank?.total === 5000 && (await one('accounts', bank._id)).balance === 5000, JSON.stringify(c.bank));
const ch = d?.charts || {};
ok('top customers: Rahim then Karim', ch.top_customers?.[0]?.label === 'Rahim' && ch.top_customers?.[0]?.value === 200 && ch.top_customers?.[1]?.label === 'Karim', JSON.stringify(ch.top_customers));
ok('top items: Pen × 15', ch.top_items?.[0]?.label === 'Pen' && ch.top_items[0].value === 15 && ch.top_items[0].amount === 300, JSON.stringify(ch.top_items));
const stockLeft = (await one('accounts', A.resale_items)).balance;
ok('asset analysis has stock at its value', ch.asset_analysis?.find(x => x.label === 'Stock')?.value === stockLeft && stockLeft === 850, JSON.stringify(ch.asset_analysis));
const month = ch.profit_loss?.at(-1);
ok('this month: income 300, expense 150 cost + 40 rent', month?.income === 300 && month?.expense === 190 && month?.profit === 110, JSON.stringify(month));
ok('sale analysis (month) ends today with 300', ch.sale_analysis?.at(-1)?.value === 300, JSON.stringify(ch.sale_analysis?.slice(-2)));
d = await dash('&period=week');
ok('week: 7 days', d?.charts?.sale_analysis?.length === 7 && d.charts.sale_analysis.at(-1).value === 300);
d = await dash('&period=year');
ok('year: 12 months, this one 300', d?.charts?.sale_analysis?.length === 12 && d.charts.sale_analysis.at(-1).value === 300);

// ---- Dashboard Settings: per login
r = await call('PUT', `${P}/accounting/dashboard/prefs`, { cards: ['todays_sale', 'cash', 'nonsense'], charts: ['profit_loss'] }, t);
ok('settings saved, unknown keys dropped', r.status === 200 && r.body?.cards?.join() === 'todays_sale,cash' && r.body?.charts?.join() === 'profit_loss', JSON.stringify(r.body));
d = await dash();
ok('dashboard shows only the chosen ones', Object.keys(d?.cards || {}).sort().join() === 'cash,todays_sale' && Object.keys(d?.charts || {}).join() === 'profit_loss', JSON.stringify(Object.keys(d?.cards || {})));
r = await call('POST', `${P}/panel-users`, { name: 'Clerk', username: `clerk${stamp}`, password: 'books-pass-1234', superAdmin: true }, t);
r = await call('POST', '/tenant/api/panel/auth/login', { username: `clerk${stamp}`, password: 'books-pass-1234', app: 'accounting' });
const pt = r.body?.token;
ok('a panel login signs in', !!pt, JSON.stringify(r.body).slice(0, 200));
r = await call('GET', `${P}/accounting/dashboard?tz=${tz}`, null, pt);
ok('another login still sees all of it', r.status === 200 && Object.keys(r.body?.cards || {}).length === 6, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
const prefsDocs = await all('dashboard-prefs');
ok('one prefs record, for the owner', prefsDocs.length === 1, prefsDocs.length);

done();
