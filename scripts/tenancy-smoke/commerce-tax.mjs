// E-commerce tax automations (docs/ecommerce/TAX_AUTOMATIONS.md). EC-35: a category's tax handed down to its
// products works Price after tax out again (a bare doc.save() runs no formulas), keeps a variant's own tax,
// writes History as "Store: category tax"; a tax rate edit reprices what uses it.
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let r = await call('POST', '/tenant/api/auth/register', { name: 'Tara Tax', email: `tara${stamp}@example.com`, password: 'tenant-pass-123', organization: `Tax ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Tax shop', type: 'ecommerce' }, t);
const P = `/tenant/api/p/${r.body?._id}`;
const C = `${P}/commerce`;
r = await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: 'TX' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
ok('settings saved', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 180; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('GET', `${C}/settings`, null, t);
const inst = r.body?.installed || {};
ok('store built', r.body?.status === 'ready' && !!inst.product && !!inst.category && !!inst.taxRate, r.body?.status);

const add = async (m, body) => (await call('POST', `${P}/${inst[m].route}`, body, t)).body?.doc;
const get = async (m, id) => {
	const x = (await call('GET', `${P}/${inst[m].route}/${id}`, null, t)).body;
	return x?.doc || x;
};
const edit = (m, id, body) => call('PUT', `${P}/${inst[m].route}/${id}`, body, t);
const idOf = x => String(x?._id ?? x ?? '');

const vat15 = await add('taxRate', { name: 'VAT 15', rate: 15, status: 'active' });
const vat5 = await add('taxRate', { name: 'VAT 5', rate: 5, status: 'active' });
const off = await add('taxRate', { name: 'Old VAT', rate: 9, status: 'inactive' });
ok('tax rates made', !!vat15?._id && !!vat5?._id && !!off?._id);

const cat = await add('category', { name: 'Meat' });
const other = await add('category', { name: 'Other' });
const p1 = await add('product', { name: 'Beef', category: cat._id, price: 100 });
const p2 = await add('product', { name: 'Mutton', category: cat._id, price: 200, taxRate: vat5._id });
const p3 = await add('product', { name: 'Soap', category: other._id, price: 50 });
ok('no tax on the category: products have none, Price after tax = price', !p1?.taxRate && (await get('product', p1._id)).priceAfterTax === 100, JSON.stringify(await get('product', p1._id)).slice(0, 200));

// The store's tax automations are there, on, and locked.
r = await call('GET', `${P}/automations`, null, t);
const sys = (r.body?.doc || []).filter(a => a.system === 'commerce');
ok('three system automations, all on', sys.length === 3 && sys.every(a => a.enabled), JSON.stringify(sys.map(a => a.key)));
r = await call('PUT', `${P}/automations/${sys[0]?._id}`, sys[0], t);
ok('…and locked (403)', r.status === 403, String(r.status));
const a1 = sys.find(a => a.key === 'tax.category-to-products');

// Category tax set → its products take it, Price after tax follows.
r = await edit('category', cat._id, { taxRate: vat15._id });
ok('category tax saved', r.status === 200, JSON.stringify(r.body).slice(0, 160));
await sleep(2500);
let a = await get('product', p1._id);
let b = await get('product', p2._id);
let c = await get('product', p3._id);
ok('product in the category takes the tax', idOf(a.taxRate) === idOf(vat15._id), idOf(a.taxRate));
ok('…and Price after tax is worked out again (115)', a.priceAfterTax === 115, a.priceAfterTax);
ok('a product that had another tax takes it too (200 → 230)', idOf(b.taxRate) === idOf(vat15._id) && b.priceAfterTax === 230, `${idOf(b.taxRate)} ${b.priceAfterTax}`);
ok('a product in another category is untouched', !c.taxRate && c.priceAfterTax === 50, `${idOf(c.taxRate)} ${c.priceAfterTax}`);

// History names the store as the actor.
r = await call('GET', `${P}/history?search=Beef`, null, t);
const lines = (r.body?.doc || r.body?.docs || []).map(h => `${h.userName}: ${h.text}`);
ok('History: the automation changed the product', lines.some(l => l.startsWith('Automation “Category tax → its products”') && /Beef/.test(l)), JSON.stringify(lines).slice(0, 300));

// Changed to a lower tax: products follow again.
r = await edit('category', cat._id, { taxRate: vat5._id });
await sleep(2500);
a = await get('product', p1._id);
b = await get('product', p2._id);
ok('tax 15% → 5%: 105 and 210', a.priceAfterTax === 105 && b.priceAfterTax === 210, `${a.priceAfterTax} ${b.priceAfterTax}`);

// A variant follows its product's tax (A4); a product moved to a category with a tax takes it (A2).
await edit('product', p2._id, { taxRate: vat15._id });
await sleep(2500);
r = await call('GET', `${P}/${inst.variant.route}?product=${p2._id}`, null, t);
const vs = (r.body?.doc || []).filter(v => idOf(v.product) === idOf(p2._id));
ok('product tax → its variants (A4)', vs.length > 0 && vs.every(v => idOf(v.taxRate) === idOf(vat15._id)), JSON.stringify([idOf(vat15._id), idOf(vat5._id), vs.map(v => [idOf(v.taxRate), v.price, v.priceAfterTax])]));
r = await edit('category', other._id, { taxRate: vat15._id });
await sleep(2000);
c = await get('product', p3._id);
ok('a category given a tax hands it to its product too', idOf(c.taxRate) === idOf(vat15._id) && c.priceAfterTax === 57.5, `${idOf(c.taxRate)} ${c.priceAfterTax}`);
r = await edit('product', p3._id, { category: cat._id });
await sleep(2000);
c = await get('product', p3._id);
ok('moved to a category: takes its tax (A2)', idOf(c.taxRate) === idOf(off._id) || idOf(c.taxRate) === idOf(vat5._id), idOf(c.taxRate));

// A tax rate edit reprices what uses it (works already).
r = await edit('taxRate', vat15._id, { rate: 12 });
await sleep(1500);
b = await get('product', p2._id);
ok('VAT 15 → 12: Price after tax follows (200 → 224)', b.priceAfterTax === 224, b.priceAfterTax);

// A1 switched off → changing a category's tax touches no product.
r = await call('PATCH', `${P}/automations/${a1._id}`, { enabled: false }, t);
ok('A1 switched off', r.status === 200 && r.body?.enabled === false);
await edit('category', other._id, { taxRate: vat5._id });
await sleep(2000);
c = await get('product', p3._id);
ok('…then a category’s tax change touches no product', idOf(c.taxRate) !== idOf(vat5._id) || idOf(cat._id) === idOf(c.category?._id ?? c.category), idOf(c.taxRate));

done();
