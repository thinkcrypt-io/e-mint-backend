// E-commerce EC-09 (docs/ecommerce): the Orders page's list (quick filters and their counts, search by number /
// customer / phone, channel and outlet filters, paging, held sales never listed), the order page's data with
// "More details", and the Returns page (list, counts, search, a return's page, its status flow and refusals).
// A return is written straight into the scratch DB (SMOKE_MONGO, local only) — making returns is EC-08's.
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let r = await call('POST', '/tenant/api/auth/register', { name: 'Lia Lists', email: `lia${stamp}@example.com`, password: 'tenant-pass-123', organization: `Lists ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Fish shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
r = await call(
	'PUT',
	`${C}/settings`,
	{
		answers: {
			store: { currency: 'BDT', orderPrefix: 'FS' },
			outlets: [{ name: 'Banani', code: 'BAN' }],
			payments: { tenders: ['cash', 'card'] },
			returns: { allowed: true, windowDays: 7 },
			delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }] },
			pos: { held: true },
		},
	},
	t
);
ok('settings saved', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 180; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('GET', `${C}/pos/setup`, null, t);
const BAN = r.body?.outlets?.[0]?._id;
const REG = r.body?.registers?.[0]?._id;
ok('store built: an outlet and its register', BAN && REG);

const variantOf = async pid => {
	for (let i = 0; i < 20; i++) {
		const v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
		if (v) return v;
		await sleep(300);
	}
};
const hilsa = await variantOf((await call('POST', `${P}/products`, { name: 'Hilsa', price: 1200, status: 'active', sku: 'HIL' }, t)).body?.doc?._id);
await call('POST', `${C}/stock/set`, { variant: hilsa, outlet: BAN, onHand: 50, reason: 'opening' }, t);
const rina = (await call('POST', `${P}/store-customers`, { name: 'Rina Akter', phone: '01711111111' }, t)).body?.doc?._id;
const babu = (await call('POST', `${P}/store-customers`, { name: 'Babu Mia', phone: '01822222222' }, t)).body?.doc?._id;
ok('a product with stock and two customers', hilsa && rina && babu);

// Orders: a POS sale (paid, fulfilled), a phone order for Rina (unpaid, to deliver), one for Babu (part paid), one cancelled, one held.
await call('POST', `${C}/shifts`, { register: REG, openingFloat: 0 }, t);
r = await call('POST', `${C}/sales`, { register: REG, lines: [{ variant: hilsa, quantity: 1 }], payments: [{ method: 'cash', amount: 1200 }] }, t);
const saleId = r.body?.order?._id;
const order = (body, extra = {}) => call('POST', `${C}/orders`, { outlet: BAN, lines: [{ variant: hilsa, quantity: 2 }], ...body, ...extra }, t);
r = await order({ customer: rina, delivery: { address: 'Road 11, Banani', phone: '01799999999', rate: 'Inside Dhaka' } });
const rinaOrder = r.body?.order;
r = await order({ customer: babu, payments: [{ method: 'card', amount: 1000 }] });
const babuOrder = r.body?.order;
r = await order({ customer: babu });
const gone = r.body?.order?._id;
await call('POST', `${C}/orders/${gone}/cancel`, { reason: 'changed mind' }, t);
await call('POST', `${C}/held`, { register: REG, lines: [{ variant: hilsa, quantity: 1 }] }, t);
ok('five orders made (one held)', saleId && rinaOrder?._id && babuOrder?._id && gone);

const list = async (q = '') => (await call('GET', `${C}/orders${q}`, null, t)).body;
let L = await list();
ok('all: 4 orders, the held sale left out, newest first', L?.total === 4 && L.doc.every(o => o.status !== 'held') && L.doc[0]._id === gone, JSON.stringify(L?.doc?.map(o => [o.code, o.status])));
ok('…with customer and outlet names and item counts', L.doc.find(o => o._id === rinaOrder._id)?.customerInfo?.name === 'Rina Akter' && L.doc[0].outletInfo?.name === 'Banani' && L.doc.find(o => o._id === rinaOrder._id)?.itemCount === 2);
ok(
	'quick filter counts: all 4, today 4, unpaid 2, to fulfil 2, returns 0, cancelled 1',
	JSON.stringify(L.views) === JSON.stringify({ all: 4, today: 4, unpaid: 2, 'to-ship': 2, returns: 0, cancelled: 1 }),
	JSON.stringify(L.views)
);
L = await list('?view=unpaid');
ok('unpaid: Rina’s (nothing paid) and Babu’s (part paid) — not the cancelled one', L.total === 2 && L.doc.every(o => [rinaOrder._id, babuOrder._id].includes(o._id)), JSON.stringify(L.doc.map(o => o.paymentStatus)));
L = await list('?view=to-ship');
ok('to fulfil: the two open phone orders', L.total === 2 && L.doc.every(o => o.channel === 'manual' && o.status === 'open'));
L = await list('?q=rina');
ok('search by customer name', L.total === 1 && L.doc[0]._id === rinaOrder._id, JSON.stringify(L.doc.map(o => o.code)));
L = await list(`?q=${encodeURIComponent(babuOrder.code)}`);
ok('search by order number', L.total === 1 && L.doc[0]._id === babuOrder._id);
L = await list('?q=01799999');
ok('search by the delivery phone', L.total === 1 && L.doc[0]._id === rinaOrder._id);
L = await list('?q=(unclosed[');
ok('a search with regex characters is taken literally', L.total === 0);
L = await list('?channel=pos');
ok('channel filter: the POS sale', L.total === 1 && L.doc[0]._id === saleId && L.views.all === 1);
L = await list('?q=babu&view=cancelled');
ok('search and a quick filter together, counts follow the search', L.total === 1 && L.views.all === 2 && L.views.cancelled === 1, JSON.stringify(L.views));
L = await list('?limit=2&page=2');
ok('paging: page 2 of 2', L.doc.length === 2 && L.page === 2 && L.total === 4);
L = await list(`?outlet=${'0'.repeat(24)}`);
ok('another outlet: nothing', L.total === 0);

r = await call('GET', `${C}/orders/${rinaOrder._id}`, null, t);
ok('order page: lines, movements, customer, outlet and More details (none added)', r.body?.order?.items?.length === 1 && r.body.movements.length === 1 && r.body.customer?.name === 'Rina Akter' && r.body.outlet?.name === 'Banani' && Array.isArray(r.body.extra) && !r.body.extra.length, JSON.stringify(r.body?.extra));

// A field someone added to Orders shows in More details.
const models = (await call('GET', `${P}/builder/models`, null, t)).body;
const orderDef = (models?.doc || models || []).find?.(m => m.route === 'orders');
if (orderDef?._id) {
	r = await call('PUT', `${P}/builder/models/${orderDef._id}`, { ...orderDef, fields: [...orderDef.fields, { key: 'giftNote', label: 'Gift note', kind: 'text' }] }, t);
	if (r.status === 200) {
		r = await call('GET', `${C}/orders/${rinaOrder._id}`, null, t);
		ok('a field added to Orders is in More details', r.body?.extra?.some(f => f.key === 'giftNote' && f.label === 'Gift note'), JSON.stringify(r.body?.extra));
	} else console.log('SKIP  adding a field to Orders —', r.status, r.body?.message);
} else console.log('SKIP  adding a field to Orders — the builder route wasn’t found');

// Returns.
r = await call('GET', `${C}/returns`, null, t);
ok('returns: none yet, counts all zero', r.body?.total === 0 && Object.values(r.body?.views || {}).every(n => n === 0), JSON.stringify(r.body?.views));
const uri = process.env.SMOKE_MONGO;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri)) console.log('SKIP  returns detail and status flow — set a local SMOKE_MONGO');
else {
	const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
	const mc = await new MongoClient(uri).connect();
	const def = await mc.db().collection('modeldefinitions').findOne({ route: 'returns', project: new ObjectId(shopId) });
	const now = new Date();
	const ins = await mc
		.db()
		.collection(def.collectionName)
		.insertOne({
			_model: def.name,
			code: 'RET-00001',
			order: new ObjectId(babuOrder._id),
			customer: new ObjectId(babu),
			outlet: new ObjectId(BAN),
			lines: [{ line: 0, variant: hilsa, name: 'Hilsa', sku: 'HIL', quantity: 1, unitRefund: 1200, total: 1200, reason: 'damaged', condition: 'damaged', restock: false }],
			refundDue: 1200,
			refunded: 0,
			restocked: false,
			status: 'requested',
			createdAt: now,
			updatedAt: now,
		});
	await mc.close();
	const RID = String(ins.insertedId);
	r = await call('GET', `${C}/returns`, null, t);
	ok('returns list: one, open, with its order number and customer', r.body?.total === 1 && r.body.views.open === 1 && r.body.doc[0].orderInfo?.code === babuOrder.code && r.body.doc[0].customerInfo?.name === 'Babu Mia' && r.body.doc[0].itemCount === 1, JSON.stringify(r.body?.doc?.[0]?.orderInfo));
	r = await call('GET', `${C}/returns?q=${encodeURIComponent(babuOrder.code)}`, null, t);
	ok('search returns by the order number', r.body?.total === 1);
	r = await call('GET', `${C}/returns?q=rina`, null, t);
	ok('…and by customer (none for Rina)', r.body?.total === 0);
	r = await call('GET', `${C}/returns/${RID}`, null, t);
	ok('return page: the return, its order, customer and outlet', r.body?.return?.code === 'RET-00001' && r.body.order?.code === babuOrder.code && r.body.customer?.name === 'Babu Mia' && r.body.outlet?.name === 'Banani' && Array.isArray(r.body.payments));
	r = await call('GET', `${C}/orders/${babuOrder._id}`, null, t);
	ok('the order page lists the return', r.body?.returns?.length === 1);
	const move = (to, note) => call('POST', `${C}/returns/${RID}/status`, { to, note }, t);
	r = await move('refunded');
	ok('requested → refunded by hand: refused (refunds are the engine’s)', r.status === 409, r.body?.message);
	r = await move('approved', 'photo checked');
	ok('requested → approved, the note kept', r.status === 200 && r.body?.return?.status === 'approved' && /Approved by Lia Lists: photo checked/.test(r.body.return.note), r.body?.return?.note);
	r = await move('received');
	ok('approved → received', r.body?.return?.status === 'received');
	r = await move('closed');
	ok('received → closed: refused until refunded', r.status === 409);
	r = await call('GET', `${C}/returns?view=open`, null, t);
	ok('still open', r.body?.total === 1);
	r = await call('GET', `${C}/returns/${'0'.repeat(24)}`, null, t);
	ok('an unknown return: 404', r.status === 404);
}

// Returns switched off: the pages say so.
r = await call('POST', '/tenant/api/projects', { name: 'No returns', type: 'ecommerce' }, t);
const P2 = `/tenant/api/p/${r.body?._id}/commerce`;
await call('PUT', `${P2}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'One', code: 'ONE' }], returns: { allowed: false } } }, t);
await call('POST', `${P2}/setup`, {}, t);
for (let i = 0; i < 180; i++) {
	await sleep(1000);
	if ((await call('GET', `${P2}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('GET', `${P2}/returns`, null, t);
ok('a store without returns: 404 returns_off', r.status === 404 && r.body?.code === 'returns_off', JSON.stringify(r.body));
r = await call('GET', `${P2}/orders`, null, t);
ok('…its Orders list works, empty', r.status === 200 && r.body?.total === 0);
done();
