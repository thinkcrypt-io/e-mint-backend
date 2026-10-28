// E-commerce EC-13a / EC-16a (docs/ecommerce): a store over MCP — create_records keeps to the store's rules (engine
// fields and engine-only models refused, taken SKUs, a product's variants made after it's saved), sync_variants,
// set_stock (checked first, movements, totals), store_stock; the store tools only in a store; GET /public/api/store
// with guest checkout from Store settings; a variant's image.
import { call, ok, done, ROOT, projectKey } from './lib.mjs';
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rpc = async (key, method, params) => {
	const r = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
	return (await r.json().catch(() => null))?.result;
};
const tool = async (key, name, args) => {
	const r = await rpc(key, 'tools/call', { name, arguments: args });
	return { text: r?.content?.[0]?.text || '', data: r?.structuredContent, isError: !!r?.isError };
};

let r = await call('POST', '/tenant/api/auth/register', { name: 'Mina MCP', email: `mina${stamp}@example.com`, password: 'tenant-pass-123', organization: `Store MCP ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Meat shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const shopSlug = r.body?.publicSlug;
const P = `/tenant/api/p/${shopId}`;
await call('PUT', `${P}/commerce/settings`, { answers: { outlets: [{ name: 'Mohammadpur', code: 'MPR' }, { name: 'Depot', code: 'WH', kind: 'warehouse' }] } }, t);
await call('POST', `${P}/commerce/setup`, {}, t);
for (let i = 0; i < 180; i++) {
	await sleep(1000);
	if ((await call('GET', `${P}/commerce/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('GET', `${P}/commerce/settings`, null, t);
ok('store ready; guest checkout on by default', r.body?.status === 'ready' && r.body?.answers?.store?.guestCheckout === true, JSON.stringify(r.body?.answers?.store));

r = await call('POST', `${P}/builder/api-keys`, { name: 'Claude', scopes: ['read', 'build', 'data'] }, t);
const key = r.body?.secret || r.body?.key || r.body?.doc?.secret;
ok('a project key', typeof key === 'string' && key.startsWith('emk_'));
const list = await rpc(key, 'tools/list', {});
const names = (list?.tools || []).map(x => x.name);
ok('the store tools are offered in a store', ['store_stock', 'sync_variants', 'set_stock'].every(n => names.includes(n)), names.join(','));

// create_records keeps to the store's rules.
let o = await tool(key, 'create_records', { route: 'products', records: [{ name: 'Beef', price: 900, status: 'active', sku: 'BF-1', totalStock: 50 }] });
ok('an engine field (In stock) given on a product is refused', o.isError && /In stock .* kept by the store/.test(o.text), o.text);
o = await tool(key, 'create_records', { route: 'products', records: [{ name: 'Beef', price: 900, status: 'active', sku: 'BF-1' }, { name: 'Sonali', price: 420, status: 'active', sku: 'SN-1', options: [{ name: 'Size', values: 'Large, Small' }] }, { name: 'Paya', price: 650, status: 'active', sku: 'PY-1' }] });
ok('products are added', !o.isError && o.data?.created === 3, o.text);
o = await tool(key, 'create_records', { route: 'products', records: [{ name: 'Beef again', price: 1, status: 'active', sku: 'BF-1' }] });
ok('a SKU another product has is refused', o.isError && /Beef already has the SKU BF-1/.test(o.text), o.text);
o = await tool(key, 'create_records', { route: 'stock', records: [{ onHand: 5 }] });
ok('stock rows can’t be added as records', o.isError && /Stock changes through/.test(o.text), o.text);
o = await tool(key, 'create_records', { route: 'orders', records: [{ total: 5 }] });
ok('orders can’t be added as records', o.isError && /Orders are made at the POS/.test(o.text), o.text);

// The products' variants follow, as a save from a page does.
const variantsOf = async name => {
	const p = (await call('GET', `${P}/products?limit=50`, null, t)).body?.doc?.find(x => x.name === name);
	return { p, vs: (await call('GET', `${P}/variants?product=${p?._id}&limit=50`, null, t)).body?.doc || [] };
};
let sn;
for (let i = 0; i < 20 && !(sn?.vs.filter(v => v.active).length === 2); i++) {
	await sleep(300);
	sn = await variantsOf('Sonali');
}
ok('a product added over MCP gets its variants from its options', sn.vs.filter(v => v.active).map(v => v.title).sort().join() === 'Large,Small', JSON.stringify(sn.vs.map(v => v.title)));
const beef = await variantsOf('Beef');
ok('…and one without options its default variant', beef.vs.length === 1 && beef.vs[0].isDefault && beef.vs[0].sku === 'BF-1');

// A variant's image (blueprint) and price, set as a record.
const small = sn.vs.find(v => v.title === 'Small');
o = await tool(key, 'create_records', { route: 'variants', matchOn: 'title', records: [{ title: 'Small', product: sn.p._id, image: 'https://example.com/small.webp', price: 260 }] });
r = await call('GET', `${P}/variants/${small._id}`, null, t);
const smallNow = r.body?.doc || r.body;
ok('a variant takes its own image and price', !o.isError && smallNow?.image === 'https://example.com/small.webp' && smallNow?.price === 260, o.text);
o = await tool(key, 'create_records', { route: 'variants', records: [{ title: 'X', product: sn.p._id, totalStock: 3 }] });
ok('a variant’s In stock is the store’s', o.isError && /kept by the store/.test(o.text), o.text);

// set_stock: checked first, then each change a movement.
o = await tool(key, 'set_stock', { items: [{ product: 'BF-1', onHand: 10 }, { product: 'Sonali', onHand: 4 }] });
ok('set_stock names a product sold in variants without one, and changes nothing', o.isError && /Sonali is sold as (Large, Small|Small, Large) — name the variant/.test(o.text), o.text);
r = await call('GET', `${P}/products/${beef.p._id}`, null, t);
ok('…Beef unchanged', (r.body?.doc || r.body)?.totalStock === 0);
o = await tool(key, 'set_stock', { items: [{ product: 'nope', onHand: 1 }, { product: 'BF-1', outlet: 'Gulshan', onHand: 1 }] });
ok('an unknown product and outlet are named', o.isError && /no product “nope”/.test(o.text) && /no outlet “Gulshan” \(Mohammadpur, Depot\)|no outlet “Gulshan” \(Depot, Mohammadpur\)/.test(o.text), o.text);
o = await tool(key, 'set_stock', {
	items: [
		{ product: 'BF-1', onHand: 10, reason: 'opening' },
		{ product: 'Sonali', variant: 'Large', onHand: 10, reason: 'opening' },
		{ product: 'Sonali', variant: 'small', onHand: 6, reason: 'opening' },
		{ product: 'Sonali', variant: 'Large', outlet: 'WH', change: 5 },
	],
});
ok('opening stock set per variant and outlet', !o.isError && /Beef at Mohammadpur: \+10 → 10/.test(o.text) && /Sonali — Large at Depot: \+5 → 5/.test(o.text), o.text);
o = await tool(key, 'set_stock', { items: [{ product: 'BF-1', onHand: 10 }] });
ok('the same count again changes nothing', !o.isError && /unchanged/.test(o.text), o.text);
r = await call('GET', `${P}/products?limit=50`, null, t);
const tot = n => r.body?.doc?.find(x => x.name === n)?.totalStock;
ok('product totals follow (Beef 10, Sonali 21, Paya 0)', tot('Beef') === 10 && tot('Sonali') === 21 && tot('Paya') === 0, JSON.stringify([tot('Beef'), tot('Sonali'), tot('Paya')]));
r = await call('GET', `${P}/stock-movements?limit=50`, null, t);
ok('each change is a movement by the key’s owner (AI)', r.body?.doc?.length === 4 && r.body.doc.every(m => m.by === 'Mina MCP (AI)'), JSON.stringify(r.body?.doc?.map(m => [m.change, m.by])));
o = await tool(key, 'store_stock', {});
ok('store_stock lists every product', !o.isError && /Paya \[PY-1\]: 0/.test(o.text) && /Sonali \[SN-1\]: 21/.test(o.text), o.text);
o = await tool(key, 'store_stock', { product: 'Sonali' });
ok('…and one product by variant and outlet', !o.isError && /Sonali — Large: Mohammadpur 10, Depot 5 — total 15|Sonali — Large: Depot 5, Mohammadpur 10 — total 15/.test(o.text), o.text);
o = await tool(key, 'sync_variants', {});
ok('sync_variants runs over every product', !o.isError && /3 product/.test(o.text) && /Sonali: (Large, Small|Small, Large)/.test(o.text), o.text);

// The store's settings its website reads.
const apiKey = await projectKey(shopSlug);
const pub = async () => call('GET', `/public/api/store?apiKey=${apiKey}`);
r = await pub();
ok('GET /public/api/store: currency, guest checkout on, stock floor', r.status === 200 && r.body?.currency === 'BDT' && r.body?.guestCheckout === true && r.body?.negativeStock === false, JSON.stringify(r.body));
await call('PUT', `${P}/commerce/settings`, { answers: { store: { guestCheckout: false }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }] } } }, t);
r = await pub();
ok('…guest checkout switched off in Store settings, delivery rates shown', r.body?.guestCheckout === false && r.body?.delivery?.rates?.[0]?.amount === 60, JSON.stringify(r.body));

// Not a store: no store tools, no /store.
r = await call('POST', '/tenant/api/projects', { name: 'Plain app', type: 'app' }, t);
const appId = r.body?._id;
r = await call('POST', `/tenant/api/p/${appId}/builder/api-keys`, { name: 'Claude', scopes: ['read', 'build', 'data'] }, t);
const appKey = r.body?.secret || r.body?.key || r.body?.doc?.secret;
const appTools = ((await rpc(appKey, 'tools/list', {}))?.tools || []).map(x => x.name);
ok('another kind of project has no store tools', appKey && !appTools.includes('set_stock') && appTools.includes('create_records'), appTools.length);
done();
