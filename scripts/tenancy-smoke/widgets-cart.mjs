// Site widgets W-05: the shop (which model is the catalogue, what its fields
// mean), the cart widget's API — priced by the server from the catalogue, never
// from the browser — a guest cart joining the customer's on sign-in, and carts
// kept in MINT or in the project's own cart model.
import { call, ok, done, ROOT } from './lib.mjs';

const stamp = Date.now();
const P = (pid, path = '') => `/tenant/api/p/${pid}${path}`;
const idOf = r => r.body?._id || r.body?.doc?._id;
let r = await call('POST', '/tenant/api/auth/register', { name: 'Sami Shop', email: `sami${stamp}@example.com`, password: 'tenant-pass-123', organization: `Sami ${stamp}`, country: 'BD' });
const T = r.body.token;
r = await call('POST', '/tenant/api/projects', { name: 'Candle shop', type: 'website' }, T);
const site = r.body;
const pub = path => `/public/api/${site.publicSlug}${path}`;

/* ---------------------------------------------------------- the models */
r = await call('POST', P(site._id, '/builder/models'), {
	name: 'Product',
	title: 'Products',
	displayField: 'name',
	fields: [
		{ key: 'name', label: 'Name', kind: 'text', required: true },
		{ key: 'price', label: 'Price', kind: 'number', required: true },
		{ key: 'compareAtPrice', label: 'Compare-at price', kind: 'number' },
		{ key: 'images', label: 'Images', kind: 'images' },
		{ key: 'stock', label: 'Stock', kind: 'number' },
		{ key: 'status', label: 'Status', kind: 'select', default: 'active', options: [{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }] },
		{ key: 'variants', label: 'Variants', kind: 'sectionlist', fields: [{ key: 'name', label: 'Variant', kind: 'text' }, { key: 'priceChange', label: 'Price +/-', kind: 'number' }, { key: 'stock', label: 'Stock', kind: 'number' }] },
	],
}, T);
ok('a products model', r.status === 201, `${r.status} ${r.body?.message}`);
r = await call('POST', P(site._id, '/builder/models'), {
	name: 'CartItem',
	title: 'Cart items',
	displayField: 'label',
	fields: [
		{ key: 'label', label: 'Label', kind: 'text' },
		{ key: 'product', label: 'Product', kind: 'reference', ref: 'Product', required: true },
		{ key: 'variant', label: 'Variant', kind: 'text' },
		{ key: 'quantity', label: 'Quantity', kind: 'number', required: true },
	],
}, T);
const cartDef = idOf(r);
ok('a cart items model', r.status === 201, `${r.status} ${r.body?.message}`);

const candle = idOf(await call('POST', P(site._id, '/products'), { name: 'Fig candle', price: 28, compareAtPrice: 34, images: ['https://img.example/fig.jpg'], stock: 5, status: 'active', variants: [{ name: 'Small', priceChange: -8, stock: 2 }, { name: 'Large', priceChange: 0, stock: 0 }] }, T));
const mug = idOf(await call('POST', P(site._id, '/products'), { name: 'Speckled mug', price: 22, stock: 3, status: 'active' }, T));
const draft = idOf(await call('POST', P(site._id, '/products'), { name: 'Not yet', price: 9, stock: 9, status: 'draft' }, T));
ok('three products (one a draft)', candle && mug && draft);

/* ------------------------------------------------------------- the shop */
r = await call('PUT', P(site._id, '/widgets'), { widgets: { cart: { enabled: true } } }, T);
ok('the cart can’t go on before the shop is set up', r.status === 400 && r.body?.code === 'shop_not_set_up', `${r.status} ${r.body?.message}`);
r = await call('POST', pub('/cart/price'), { lines: [] });
ok('…and its API answers 404 while it’s off', r.status === 404 && r.body?.code === 'cart_off', `${r.status} ${r.body?.code}`);

r = await call('GET', P(site._id, '/widgets/shop'), null, T);
const guess = r.body?.guess;
ok('a suggestion from the models: products, their fields, variants', r.status === 200 && !r.body.shop && guess?.product.model === 'Product' && guess.product.fields.price === 'price' && guess.product.fields.image === 'images' && guess.product.fields.stock === 'stock' && guess.product.activeValues?.[0] === 'active' && guess.product.variant?.priceChange === 'priceChange' && guess.product.variant.stock === 'stock', JSON.stringify(guess));
ok('…in the organization’s currency (Bangladesh → BDT), and not the cart model — its public API is off', guess?.currency === 'BDT' && guess.cart === null, JSON.stringify(guess?.cart));
ok('…with the models and fields for the form', r.body.models?.some(m => m.name === 'CartItem' && m.fields.some(f => f.key === 'product' && f.ref === 'Product')), '');

r = await call('PUT', P(site._id, '/widgets/shop'), { shop: { ...guess, product: { ...guess.product, fields: { ...guess.product.fields, price: 'name' } } } }, T);
ok('a price that isn’t a number is refused, saying why', r.status === 400 && /price must be a number/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/widgets/shop'), { shop: { ...guess, cart: { model: 'CartItem', fields: { product: 'product', quantity: 'quantity', variant: 'variant' } } } }, T);
ok('a cart model without its public API is refused', r.status === 400 && /public API/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/widgets/shop'), { shop: { ...guess, currency: 'taka' } }, T);
ok('a currency that isn’t a code is refused', r.status === 400 && /currency/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/widgets/shop'), { shop: guess }, T);
ok('the suggestion saved', r.status === 200 && r.body.shop?.product.model === 'Product' && !r.body.problem, `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/widgets'), { widgets: { cart: { enabled: true, options: { checkoutUrl: '/checkout' } } } }, T);
ok('now the cart goes on', r.status === 200 && r.body.widgets.cart.enabled && r.body.widgets.cart.options.checkoutUrl === '/checkout', `${r.status} ${r.body?.message}`);
r = await call('GET', pub('/widgets'));
ok('a site is told about the cart and the shop’s currency', r.body.widgets.cart?.texts?.title && r.body.shop?.currency === 'BDT', JSON.stringify(r.body).slice(0, 200));

/* -------------------------------------------------------- the catalogue */
r = await call('GET', pub(`/shop/products/${candle}`));
ok('a product as widgets see it: variants priced from the price change, their stock', r.status === 200 && r.body.name === 'Fig candle' && r.body.price === 28 && r.body.compareAtPrice === 34 && r.body.image === 'https://img.example/fig.jpg' && r.body.variants.map(v => `${v.name}:${v.price}:${v.stock}`).join() === 'Small:20:2,Large:28:0' && r.body.available, JSON.stringify(r.body));
r = await call('GET', pub(`/shop/products/${draft}`));
ok('a draft product isn’t for sale (404)', r.status === 404, r.status);
r = await call('GET', pub('/shop/products/nope'));
ok('…nor a made-up id', r.status === 404, r.status);

/* ------------------------------------------------------ a guest's cart */
r = await call('POST', pub('/cart/price'), {
	lines: [
		{ product: candle, variant: 'Small', quantity: 3 },
		{ product: mug, quantity: 1, price: 0.01, unitPrice: 0.01, total: 0 },
		{ product: mug, quantity: 1 },
		{ product: draft, quantity: 1 },
		{ product: candle, variant: 'Large', quantity: 1 },
		{ product: candle, quantity: 1 },
	],
});
const by = k => r.body?.lines?.find(l => `${l.product === candle ? 'candle' : l.product === mug ? 'mug' : 'draft'}:${l.variant}` === k);
ok('priced by the server: a price sent in is ignored, the same product twice is one line', r.status === 200 && by('mug:')?.quantity === 2 && by('mug:')?.unitPrice === 22 && by('mug:')?.total === 44, JSON.stringify(by('mug:')));
ok('more than in stock → cut to the stock, saying so', by('candle:Small')?.quantity === 2 && by('candle:Small')?.problem === 'limited' && by('candle:Small')?.total === 40, JSON.stringify(by('candle:Small')));
ok('sold out, not for sale, and a variant not chosen → flagged and not counted', by('candle:Large')?.problem === 'sold_out' && by('draft:')?.problem === 'unavailable' && by('candle:')?.problem === 'choose_variant', JSON.stringify(r.body.lines.map(l => l.problem)));
ok('the subtotal and count from what can be bought, in the shop’s currency', r.body.subtotal === 84 && r.body.count === 4 && r.body.currency === 'BDT', `${r.body.subtotal} ${r.body.count} ${r.body.currency}`);
r = await call('POST', pub('/cart/price'), { lines: [{ product: 'x', quantity: 1 }] });
ok('a bad product id → 400', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('POST', pub('/cart/price'), { lines: [{ product: mug, quantity: 0 }] });
ok('a quantity under 1 → 400', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('POST', pub('/cart/price'), { lines: Array.from({ length: 51 }, (_, i) => ({ product: candle, variant: `v${i}`, quantity: 1 })) });
ok('more than 50 lines → 400', r.status === 400, `${r.status} ${r.body?.message}`);

/* ------------------------------------------ the customer's cart (in MINT) */
r = await call('POST', pub('/auth/register'), { name: 'Rina', email: `rina${stamp}@example.com`, password: 'customer-pass-1' });
const C = `Bearer ${r.body.token}`;
r = await call('GET', pub('/cart'));
ok('the server cart needs a signed-in customer', r.status === 401, r.status);
r = await call('GET', pub('/cart'), null, C);
ok('a new customer’s cart is empty', r.status === 200 && r.body.lines.length === 0 && r.body.subtotal === 0, JSON.stringify(r.body));
r = await call('POST', pub('/cart/merge'), { lines: [{ product: candle, variant: 'Small', quantity: 1 }, { product: mug, quantity: 1 }] }, C);
ok('signing in brings the guest cart along', r.status === 200 && r.body.count === 2 && r.body.subtotal === 42, JSON.stringify(r.body));
r = await call('POST', pub('/auth/login'), { email: `rina${stamp}@example.com`, password: 'customer-pass-1' });
const C2 = `Bearer ${r.body.token}`;
r = await call('GET', pub('/cart'), null, C2);
ok('on another device (a new sign-in) it’s the same cart', r.status === 200 && r.body.count === 2 && r.body.lines.map(l => l.name).sort().join() === 'Fig candle,Speckled mug', JSON.stringify(r.body.lines));
r = await call('POST', pub('/cart/merge'), { lines: [{ product: mug, quantity: 5 }] }, C2);
ok('merging adds quantities up, to what’s in stock', r.body.lines.find(l => l.product === mug)?.quantity === 3 && r.body.lines.find(l => l.product === mug)?.problem === 'limited', JSON.stringify(r.body.lines));
r = await call('PUT', pub('/cart'), { lines: [{ product: mug, quantity: 1 }, { product: draft, quantity: 1 }] }, C);
ok('replacing it; what isn’t for sale shows once…', r.status === 200 && r.body.subtotal === 22 && r.body.lines.some(l => l.problem === 'unavailable'), JSON.stringify(r.body));
r = await call('GET', pub('/cart'), null, C);
ok('…and isn’t kept', r.body.lines.length === 1 && r.body.lines[0].product === mug, JSON.stringify(r.body.lines));
await call('PUT', P(site._id, `/products/${mug}`), { price: 25 }, T);
r = await call('GET', pub('/cart'), null, C);
ok('a price changed in the panel shows in the cart at once', r.body.subtotal === 25, `${r.body.subtotal}`);
r = await call('POST', pub('/auth/register'), { name: 'Omar', email: `omar${stamp}@example.com`, password: 'customer-pass-1' });
const O = `Bearer ${r.body.token}`;
r = await call('GET', pub('/cart'), null, O);
ok('another customer has their own cart', r.status === 200 && r.body.lines.length === 0, JSON.stringify(r.body));

/* ------------------------------------ carts in the project's own model */
await call('PUT', P(site._id, `/builder/models/${cartDef}/public-api`), { enabled: true, actions: ['list', 'create', 'update', 'delete'], auth: 'customer', ownerOnly: true }, T);
r = await call('GET', P(site._id, '/widgets/shop'), null, T);
ok('with its public API on, the cart model is suggested', r.body.guess?.cart?.model === 'CartItem' && r.body.guess.cart.fields.label === 'label' && r.body.guess.cart.fields.variant === 'variant', JSON.stringify(r.body.guess?.cart));
r = await call('PUT', P(site._id, '/widgets/shop'), { shop: { ...r.body.shop, cart: { model: 'CartItem', fields: { product: 'product', quantity: 'quantity' } } } }, T);
ok('products with variants need the cart’s variant field', r.status === 400 && /variant/.test(r.body?.message), `${r.status} ${r.body?.message}`);
const view = (await call('GET', P(site._id, '/widgets/shop'), null, T)).body;
r = await call('PUT', P(site._id, '/widgets/shop'), { shop: { ...view.shop, cart: view.guess.cart } }, T);
ok('carts kept in Cart items now', r.status === 200 && r.body.shop?.cart?.model === 'CartItem', `${r.status} ${r.body?.message}`);
r = await call('PUT', pub('/cart'), { lines: [{ product: candle, variant: 'Small', quantity: 2 }, { product: mug, quantity: 1 }] }, C);
ok('a cart saved…', r.status === 200 && r.body.count === 3 && r.body.subtotal === 65, JSON.stringify(r.body));
r = await call('GET', P(site._id, '/cartitems'), null, T);
const rows = r.body?.doc || [];
ok('…is rows the team sees in Cart items, labelled', rows.length === 2 && rows.some(x => x.label === 'Fig candle — Small' && x.quantity === 2), JSON.stringify(rows.map(x => [x.label, x.quantity])));
r = await call('GET', pub('/cartitems'), null, C);
ok('…and the customer’s own on the public API (owner-only)', r.status === 200 && r.body.doc.length === 2, `${r.status} ${r.body?.doc?.length}`);
r = await call('GET', pub('/cartitems'), null, O);
ok('…not another customer’s', r.body.doc.length === 0, `${r.body?.doc?.length}`);
r = await call('PUT', pub('/cart'), { lines: [{ product: candle, variant: 'Small', quantity: 1 }] }, C);
r = await call('GET', P(site._id, '/cartitems'), null, T);
ok('changing it updates the row and removes what’s gone', (r.body?.doc || []).length === 1 && r.body.doc[0].quantity === 1, JSON.stringify((r.body?.doc || []).map(x => [x.label, x.quantity])));
r = await call('GET', pub('/cart'), null, C);
ok('read back from the rows', r.body.count === 1 && r.body.lines[0].variant === 'Small' && r.body.subtotal === 20, JSON.stringify(r.body));

/* ------------------------------------------------------------- scripts */
let res = await fetch(`${ROOT}/public/mint.js`);
let js = await res.text();
const parses = code => { try { new Function(code); return true; } catch (e) { return e.message; } };
ok('mint.js has the headless cart (Mint.cart)', parses(js) === true && js.includes('cart: cart') && js.includes("'cart/merge'"), parses(js));
res = await fetch(`${ROOT}/public/widgets/cart.js`);
js = await res.text();
ok('the cart widget script is served and parses', res.status === 200 && parses(js) === true && js.includes("Mint.define('cart'") && js.includes('data-mint-add'), parses(js));

/* ---------------------------------------------------------- switched off */
r = await call('PUT', P(site._id, '/widgets/shop'), { shop: null }, T);
ok('clearing the shop switches the cart off', r.status === 200 && r.body.shop === null, `${r.status}`);
r = await call('GET', P(site._id, '/widgets'), null, T);
ok('…in the settings', r.body.widgets.cart.enabled === false, JSON.stringify(r.body.widgets.cart));
r = await call('GET', pub('/cart'), null, C);
ok('…and on the site', r.status === 404, r.status);
r = await call('GET', P(site._id, '/widgets/shop'));
ok('the shop settings need a sign-in', r.status === 401, r.status);

done();
