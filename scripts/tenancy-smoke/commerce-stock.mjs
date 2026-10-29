// E-commerce EC-05 (docs/ecommerce): the catalogue (variants from options, the default variant, codes, lookup)
// and stock per outlet (counts, movements, totals, transfers with a floor that holds under parallel sends, adjustments).
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let r = await call('POST', '/tenant/api/auth/register', { name: 'Sid Stock', email: `sid${stamp}@example.com`, password: 'tenant-pass-123', organization: `Stock ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Shoe shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
await call('PUT', `${P}/commerce/settings`, { answers: { outlets: [{ name: 'Gulshan', code: 'GUL' }, { name: 'Banani', code: 'BAN' }, { name: 'Depot', code: 'WH', kind: 'warehouse' }] } }, t);
await call('POST', `${P}/commerce/setup`, {}, t);
for (let i = 0; i < 180; i++) {
	await sleep(1000);
	if ((await call('GET', `${P}/commerce/settings`, null, t)).body?.status !== 'building') break;
}
const outlets = (await call('GET', `${P}/outlets`, null, t)).body?.doc || [];
const GUL = outlets.find(o => o.outletCode === 'GUL')?._id;
const BAN = outlets.find(o => o.outletCode === 'BAN')?._id;
ok('store ready with three outlets', outlets.length === 3 && GUL && BAN);

const variantsOf = async pid => (await call('GET', `${P}/variants?product=${pid}&limit=100`, null, t)).body?.doc || [];
const waitVariants = async (pid, test) => {
	for (let i = 0; i < 20; i++) {
		const v = await variantsOf(pid);
		if (test(v)) return v;
		await sleep(300);
	}
	return variantsOf(pid);
};

// Variants from options.
r = await call('POST', `${P}/products`, { name: 'Runner', price: 4000, status: 'active', productType: 'variation', options: [{ name: 'Size', values: '40, 41' }, { name: 'Colour', values: 'Red,Blue' }] }, t);
const runner = r.body?.doc?._id;
ok('a product with options is made', !!runner, r.body?.message);
let vs = await waitVariants(runner, v => v.filter(x => x.active).length === 4);
ok('its four variants are made from the options', vs.filter(v => v.active).length === 4 && vs.some(v => v.title === '41 / Blue'), JSON.stringify(vs.map(v => `${v.title}:${v.active}`)));
r = await call('POST', `${P}/products`, { name: 'Plain tee', price: 500, status: 'active', productType: 'simple', options: [{ name: 'Size', values: 'S,M' }] }, t);
const plain = r.body?.doc?._id;
const pv = await waitVariants(plain, v => v.length >= 1);
ok('a Simple product is one item whatever options it carries', pv.filter(v => v.active).length === 1 && pv[0]?.isDefault, JSON.stringify(pv.map(v => `${v.title}:${v.active}`)));
// A plain product: one hidden default variant mirroring it.
r = await call('POST', `${P}/products`, { name: 'Socks', price: 300, status: 'active', sku: 'SOCK-1', barcode: '8901' }, t);
const socks = r.body?.doc?._id;
vs = await waitVariants(socks, v => v.length === 1);
ok('a product without options gets one default variant with its codes', vs.length === 1 && vs[0].isDefault && vs[0].sku === 'SOCK-1' && vs[0].barcode === '8901' && vs[0].active, JSON.stringify(vs[0]));
const sockV = vs[0]?._id;

r = await call('POST', `${P}/products`, { name: 'Other', price: 1, sku: 'SOCK-1' }, t);
ok('a SKU another product has is refused', r.status === 409 && /Socks already has the SKU/.test(r.body?.message), r.body?.message);
const red40 = (await variantsOf(runner)).find(v => v.title === '40 / Red')?._id;
r = await call('PUT', `${P}/variants/${red40}`, { barcode: '8901' }, t);
ok('a barcode the socks have is refused on a variant', r.status === 409, r.body?.message);
r = await call('PUT', `${P}/variants/${red40}`, { barcode: '7001', sku: 'RUN-40-R', price: 4200 }, t);
ok('the variant gets its own barcode, SKU and price', r.status === 200, r.body?.message);
r = await call('GET', `${P}/commerce/lookup?code=7001&outlet=${GUL}`, null, t);
ok('lookup by barcode → the variant, its own price, stock at the outlet', r.status === 200 && r.body?.variant === red40 && r.body?.price === 4200 && r.body?.name === 'Runner — 40 / Red' && r.body?.onHand === 0, JSON.stringify(r.body));
r = await call('GET', `${P}/commerce/lookup?code=SOCK-1`, null, t);
ok('lookup by the product’s SKU → its default variant, the product’s price', r.body?.variant === sockV && r.body?.price === 300 && r.body?.name === 'Socks');
r = await call('GET', `${P}/commerce/lookup?code=nope`, null, t);
ok('an unknown code is 404 with a plain reason', r.status === 404 && /Nothing for sale/.test(r.body?.message));

// Counts and totals.
r = await call('POST', `${P}/commerce/stock/set`, { variant: red40, outlet: GUL, onHand: 10, reason: 'opening' }, t);
ok('opening stock counted in (10)', r.status === 200 && r.body?.after === 10, JSON.stringify(r.body));
r = await call('POST', `${P}/commerce/stock/set`, { variant: red40, outlet: BAN, change: 3 }, t);
ok('a change adds to another outlet (3)', r.body?.after === 3);
r = await call('GET', `${P}/commerce/products/${runner}/stock`, null, t);
const row = r.body?.variants?.find(v => v._id === red40);
ok('the product’s stock grid: per outlet and in total', row?.stock?.[GUL]?.onHand === 10 && row?.stock?.[BAN]?.onHand === 3 && row.total === 13 && r.body.outlets.length === 3, JSON.stringify(row));
r = await call('GET', `${P}/products/${runner}`, null, t);
ok('the product’s total follows (13)', (r.body?.doc || r.body)?.totalStock === 13, JSON.stringify((r.body?.doc || r.body)?.totalStock));
r = await call('GET', `${P}/stock-movements?limit=50`, null, t);
ok('each change is a movement with the on hand after it', r.body?.doc?.length === 2 && r.body.doc.some(m => m.change === 10 && m.after === 10 && m.reason === 'opening'), JSON.stringify(r.body?.doc?.map(m => [m.change, m.after, m.reason])));
r = await call('POST', `${P}/stock-movements`, { change: 5 }, t);
ok('movements can’t be written by hand', r.status === 403);

// Transfers.
const transfer = async qty => (await call('POST', `${P}/stock-transfers`, { from: GUL, to: BAN, lines: [{ variant: red40, label: 'Runner 40 Red', quantity: qty }] }, t)).body?.doc?._id;
let tr = await transfer(12);
r = await call('POST', `${P}/commerce/transfers/${tr}/send`, {}, t);
ok('sending more than the outlet has is refused, nothing moves', r.status === 409 && /Only 10 of Runner — 40 \/ Red left at Gulshan/.test(r.body?.message), r.body?.message);
r = await call('GET', `${P}/stock-transfers/${tr}`, null, t);
ok('…and it stays a draft', (r.body?.doc || r.body)?.status === 'draft');
tr = await transfer(4);
r = await call('POST', `${P}/commerce/transfers/${tr}/send`, {}, t);
ok('a transfer of 4 is sent', r.status === 200 && r.body?.status === 'sent', r.body?.message);
r = await call('POST', `${P}/commerce/transfers/${tr}/send`, {}, t);
ok('sending twice is refused', r.status === 409);
r = await call('POST', `${P}/commerce/transfers/${tr}/receive`, {}, t);
ok('…and received', r.status === 200 && r.body?.status === 'received');
r = await call('GET', `${P}/commerce/products/${runner}/stock`, null, t);
let g = r.body?.variants?.find(v => v._id === red40);
ok('Gulshan 6, Banani 7, total unchanged 13', g?.stock?.[GUL]?.onHand === 6 && g?.stock?.[BAN]?.onHand === 7 && g.total === 13, JSON.stringify(g?.stock));
r = await call('POST', `${P}/commerce/transfers/${tr}/cancel`, {}, t);
ok('a received transfer can’t be cancelled', r.status === 409);

// The floor holds when five transfers of 3 are sent at once from 6 in stock.
const many = [];
for (let i = 0; i < 5; i++) many.push(await transfer(3));
const results = await Promise.all(many.map(id => call('POST', `${P}/commerce/transfers/${id}/send`, {}, t)));
const sent = results.filter(x => x.status === 200).length;
r = await call('GET', `${P}/commerce/products/${runner}/stock`, null, t);
g = r.body?.variants?.find(v => v._id === red40);
ok(`five parallel sends of 3 from 6: exactly two go (${sent}), Gulshan at 0, never below`, sent === 2 && g?.stock?.[GUL]?.onHand === 0, JSON.stringify(results.map(x => x.status)));
const sentOne = many[results.findIndex(x => x.status === 200)];
r = await call('POST', `${P}/commerce/transfers/${sentOne}/cancel`, {}, t);
r = await call('GET', `${P}/commerce/products/${runner}/stock`, null, t);
g = r.body?.variants?.find(v => v._id === red40);
ok('cancelling a sent transfer puts its stock back (3)', g?.stock?.[GUL]?.onHand === 3, JSON.stringify(g?.stock?.[GUL]));

// Adjustments.
r = await call('POST', `${P}/stock-adjustments`, { outlet: GUL, reason: 'count', lines: [{ variant: red40, counted: 20 }, { variant: sockV, change: 5 }] }, t);
const adj = r.body?.doc?._id;
ok('a draft adjustment is made', !!adj, r.body?.message);
r = await call('POST', `${P}/stock-adjustments`, { outlet: GUL, reason: 'count', status: 'applied' }, t);
ok('an adjustment can’t be made already applied', r.status === 403);
r = await call('POST', `${P}/commerce/adjustments/${adj}/apply`, {}, t);
ok('applying it moves both lines', r.status === 200 && r.body?.applied === 2, r.body?.message);
r = await call('POST', `${P}/commerce/adjustments/${adj}/apply`, {}, t);
ok('applying twice is refused', r.status === 409);
r = await call('GET', `${P}/commerce/lookup?code=7001&outlet=${GUL}`, null, t);
ok('the count set Gulshan to 20', r.body?.onHand === 20);
r = await call('GET', `${P}/commerce/catalogue?outlet=${GUL}&q=sock`, null, t);
ok('the catalogue finds socks by name, with stock at the outlet (5)', r.body?.doc?.length === 1 && r.body.doc[0].variants[0].onHand === 5, JSON.stringify(r.body?.doc?.[0]?.variants));
r = await call('GET', `${P}/commerce/catalogue?q=RUN-40`, null, t);
ok('…and the runner by a variant’s SKU', r.body?.doc?.length === 1 && r.body.doc[0].name === 'Runner' && r.body.doc[0].variants.length === 4);

// Options changed.
await call('PUT', `${P}/products/${runner}`, { name: 'Runner', price: 4000, productType: 'variation', options: [{ name: 'Size', values: '40,41' }, { name: 'Colour', values: 'Red' }] }, t);
vs = await waitVariants(runner, v => v.filter(x => x.active).length === 2);
ok('a colour dropped: its variants stop selling, none deleted', vs.length === 4 && vs.filter(v => v.active).length === 2 && vs.filter(v => v.active).every(v => v.title.endsWith('Red')));
r = await call('PUT', `${P}/products/${runner}`, { name: 'Runner', price: 4000, productType: 'variation', options: [{ name: 'Size', values: Array.from({ length: 11 }, (_, i) => i).join(',') }, { name: 'Colour', values: Array.from({ length: 10 }, (_, i) => `c${i}`).join(',') }] }, t);
r = await call('POST', `${P}/commerce/products/${runner}/variants`, {}, t);
ok('more than 100 combinations is refused with a reason', r.status === 400 && /more than 100 variants/.test(r.body?.message), r.body?.message);
r = await call('PUT', `${P}/commerce/settings`, { answers: { products: { variations: false } } }, t);
ok('variations can’t go off while a product has several variants', r.status === 409 && /several variants/.test(r.body?.message), r.body?.message);

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('cleaned up', r.status === 200);
done();
