// E-commerce EC-03 (docs/ecommerce): setting up a store — the models built from the answers, the sidebar,
// the first records, core fields locked in the builder (EC4) and the engine's fields refused on plain saves (EC5).
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Ina Install', email: `ina${stamp}@example.com`, password: 'tenant-pass-123', organization: `Install ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Fashion house', type: 'ecommerce' }, t);
const P = `/tenant/api/p/${r.body?._id}`;
const shopId = r.body?._id;

r = await call('PUT', `${P}/commerce/settings`, {
	answers: {
		store: { orderPrefix: 'FH' },
		outlets: [{ name: 'Gulshan', code: 'GUL' }, { name: 'Banani', code: 'BAN' }, { name: 'Depot', code: 'WH', kind: 'warehouse' }],
		pos: { tax: { mode: 'added', rates: [{ name: 'VAT', rate: 15, default: true }, { name: 'Zero', rate: 0 }] }, coupons: false },
		returns: { storeCredit: true },
	},
}, t);
ok('answers saved', r.status === 200, r.body?.message);
r = await call('POST', `${P}/commerce/setup`, {}, t);
ok('setup starts in the background (202, building)', r.status === 202 && r.body?.status === 'building', JSON.stringify({ s: r.status, st: r.body?.status, m: r.body?.message }));
r = await call('POST', `${P}/commerce/setup`, {}, t);
ok('a second setup while building is refused', r.status === 409);

let v;
const t0 = Date.now();
for (;;) {
	await new Promise(res => setTimeout(res, 1000));
	v = (await call('GET', `${P}/commerce/settings`, null, t)).body;
	if (v?.status !== 'building' || Date.now() - t0 > 180000) break;
}
ok(`the store is ready (${Math.round((Date.now() - t0) / 1000)} s)`, v?.status === 'ready', JSON.stringify({ s: v?.status, e: v?.error, p: v?.problems }));
const inst = v?.installed || {};
ok('19 models recorded by key', Object.keys(inst).length === 19 && inst.delivery?.route === 'deliveries' && inst.order?.route === 'orders' && inst.customer?.route === 'store-customers' && inst.payment?.route === 'order-payments', JSON.stringify(Object.fromEntries(Object.entries(inst).map(([k, m]) => [k, m.route]))));
ok('features follow the answers', ['variations', 'tax', 'shifts', 'returns', 'store-credit'].every(f => v.features.includes(f)) && !v.features.includes('coupons'), v.features.join());

r = await call('GET', `${P}/builder/models`, null, t);
const models = r.body?.doc || r.body || [];
const store = models.filter(m => m.system === 'commerce');
ok('every store model is marked as the store’s', store.length === 19, `${store.length} of ${models.length}`);

r = await call('GET', `${P}/sidebar/admin/server`, null, t);
const side = JSON.stringify(r.body || []);
ok('sidebar: Store section with POS, Orders, Returns, Store settings', ['/store/pos', '/store/orders', '/store/returns', '/store/settings'].every(h => side.includes(h)) && !side.includes('/store/setup'), side.slice(0, 200));
ok('sidebar: products, variants, stock, transfers (3 outlets), shifts, store credit shown', ['/t/products', '/t/variants', '/t/stock', '/t/stock-transfers', '/t/shifts', '/t/store-credit', '/t/tax-rates'].every(h => side.includes(`"${h}"`)), '');
ok('sidebar: the plain Orders and Returns tables, coupons (off) and brands (off) hidden', !['/t/orders', '/t/returns', '/t/coupons', '/t/brands'].some(h => side.includes(`"${h}"`)));

const list = async route => (await call('GET', `${P}/${route}?limit=50`, null, t)).body;
const outlets = await list('outlets');
ok('outlets made from the wizard', outlets?.doc?.length === 3 && outlets.doc.some(o => o.outletCode === 'WH' && o.kind === 'warehouse'), JSON.stringify(outlets?.doc?.map(o => o.outletCode)));
const taxes = await list('tax-rates');
ok('tax rates made, VAT the default', taxes?.doc?.length === 2 && taxes.doc.find(x => x.name === 'VAT')?.isDefault === true);
const regs = await list('registers');
ok('a register at each store (not the warehouse)', regs?.doc?.length === 2, regs?.doc?.map(x => x.name).join());

// EC4: core fields locked in the builder.
const product = models.find(m => m.name === 'Product');
r = await call('GET', `${P}/builder/models/${product._id}`, null, t);
const def = r.body?.doc || r.body;
const body = f => ({ name: def.name, route: def.route, title: def.title, description: def.description, displayField: def.displayField, code: def.code, access: def.access, fields: f });
r = await call('PUT', `${P}/builder/models/${product._id}`, body(def.fields.filter(f => f.key !== 'price')), t);
ok('removing a core field (price) is refused', r.status === 409 && JSON.stringify(r.body).includes('Price'), JSON.stringify(r.body).slice(0, 200));
r = await call('PUT', `${P}/builder/models/${product._id}`, body(def.fields.map(f => (f.key === 'price' ? { ...f, kind: 'text' } : f))), t);
ok('retyping a core field is refused', r.status === 409);
r = await call('PUT', `${P}/builder/models/${product._id}`, body([...def.fields.map(f => (f.key === 'price' ? { ...f, label: 'Selling price' } : f)), { key: 'season', label: 'Season', kind: 'text' }]), t);
ok('relabelling a core field and adding a field of your own work', r.status === 200, JSON.stringify(r.body).slice(0, 200));
r = await call('GET', `${P}/builder/models/${product._id}`, null, t);
ok('…and it is still the store’s', (r.body?.doc || r.body)?.system === 'commerce');
const order = models.find(m => m.name === 'Order');
r = await call('DELETE', `${P}/builder/models/${order._id}?dropData=true`, null, t);
ok('a store model can’t be deleted', r.status === 409, r.body?.message);

// EC5: plain saves.
r = await call('POST', `${P}/orders`, { note: 'hi' }, t);
ok('an order can’t be made from the plain table', r.status === 403 && r.body?.code === 'commerce_field', r.body?.message);
r = await call('POST', `${P}/order-payments`, { amount: 100 }, t);
ok('nor a payment', r.status === 403);
r = await call('POST', `${P}/stock`, { onHand: 5 }, t);
ok('nor a stock level', r.status === 403);
r = await call('POST', `${P}/products`, { name: 'Linen shirt', price: 2500, totalStock: 50 }, t);
ok('a product with stock typed in is refused', r.status === 403 && /In stock/.test(r.body?.message), r.body?.message);
r = await call('POST', `${P}/products`, { name: 'Linen shirt', price: 2500, status: 'active' }, t);
ok('a plain product is made', r.status === 200 || r.status === 201, JSON.stringify(r.body).slice(0, 200));
const pid = r.body?._id || r.body?.doc?._id;
r = await call('PUT', `${P}/products/${pid}`, { name: 'Linen shirt', price: 2500, totalStock: 7 }, t);
ok('its stock can’t be edited', r.status === 403);
r = await call('PUT', `${P}/products/${pid}`, { name: 'Linen shirt (white)', price: 2600 }, t);
ok('the rest can', r.status === 200, JSON.stringify(r.body).slice(0, 200));
r = await call('POST', `${P}/products/bulk/duplicate`, { ids: [pid] }, t);
ok('products can’t be duplicated in bulk (they’d copy stock)', r.status === 403);
r = await call('POST', `${P}/products/get/filters`, {}, t);
ok('reads that are POSTs still work', r.status !== 403);
r = await call('GET', `${P}/products/get/schema`, null, t);
ok('the form shows the stock as not editable', r.body?.totalStock?.noEdit === true && !r.body?.name?.noEdit, JSON.stringify(r.body?.totalStock));

// Store settings on a built store.
r = await call('PUT', `${P}/commerce/settings`, { answers: { pos: { coupons: true }, products: { brands: true } } }, t);
ok('coupons and brands switched on', r.status === 200 && r.body.features.includes('coupons'));
r = await call('GET', `${P}/sidebar/admin/server`, null, t);
ok('…and they show in the sidebar', JSON.stringify(r.body).includes('"/t/coupons"') && JSON.stringify(r.body).includes('"/t/brands"'));
r = await call('PUT', `${P}/commerce/settings`, { answers: { outlets: [] } }, t);
ok('outlets in settings are left to the Outlets page once built', r.status === 200 && r.body.answers.outlets.length === 3);
r = await call('POST', `${P}/commerce/setup`, {}, t);
ok('setting up again is refused', r.status === 409);

r = await call('GET', `${P}/dashboard`, null, t);
const kinds = (r.body?.widgets || []).map(w => w.type);
ok('the store has a home dashboard: quick actions, numbers, charts and the latest orders', kinds[0] === 'actions' && kinds.filter(k => k === 'stat').length >= 5 && kinds.includes('chart') && kinds.includes('recent'), JSON.stringify(kinds));
ok('…its quick actions open the POS, add a product and the orders', ['/store/pos', '/store/orders'].every(h => r.body?.widgets?.[0]?.items?.some(i => i.href === h)));

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('the store project deletes', r.status === 200, r.body?.message);
done();
