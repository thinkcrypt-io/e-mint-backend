// E-commerce wishlist + product views (docs/ecommerce CARTS_AND_WISHLISTS EC-31): a new store has the Wishlist model;
// a signed-in customer adds / lists / removes (asking twice doesn't double); a guest's hearts merge on sign-in; each
// product counts its wishes (Wished by) and its page views, by id or web address; signed-out calls are refused;
// the wishlist table is the store's own (no plain create).
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let r = await call('POST', '/tenant/api/auth/register', { name: 'Wil Wish', email: `wil${stamp}@example.com`, password: 'tenant-pass-123', organization: `Wish ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Wish shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const publicSlug = r.body?.publicSlug;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
r = await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
ok('settings saved', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 180; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
const PUB = (path, o) => `/public/api/${publicSlug}${path}`;
const mk = async (name, price) => (await call('POST', `${P}/products`, { name, price, status: 'active', sku: name.slice(0, 3).toUpperCase() }, t)).body?.doc;
const a = await mk('Panjabi', 2450);
const b = await mk('Polo', 1200);
ok('two products made', a?._id && b?._id);
ok('a product starts with 0 views and 0 wishes', a.views === 0 && a.wishlistCount === 0, JSON.stringify([a.views, a.wishlistCount]));
r = await call('GET', `${P}/wishlist-items`, null, t);
ok('the store has a Wishlist table', r.status === 200 && Array.isArray(r.body?.doc), String(r.status));
r = await call('POST', `${P}/wishlist-items`, { product: a._id }, t);
ok('a plain create on Wishlist is refused', r.status >= 400, String(r.status));

// Signed out.
r = await call('GET', PUB('/store/my/wishlist'));
ok('signed out: the wishlist is 401', r.status === 401, String(r.status));
r = await call('POST', PUB('/store/my/wishlist'), { product: a._id });
ok('signed out: adding is 401', r.status === 401, String(r.status));

// A customer.
const reg = async (n, e) => (await call('POST', PUB('/auth/register'), { name: n, email: e, password: 'customer-pass-1' })).body?.token;
const tok = await reg('Cara', `cara${stamp}@example.com`);
const tok2 = await reg('Dan', `dan${stamp}@example.com`);
const bearer = x => `Bearer ${x}`;
ok('two customers signed up', tok && tok2);
r = await call('POST', PUB('/store/my/wishlist'), { product: a._id }, bearer(tok));
const one = x => x?.body?.doc ?? x?.body;
ok('Cara hearts the Panjabi', r.status === 200 && one(r)?.product?.name === 'Panjabi' && one(r)?.priceWhenAdded === 2450, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
const wishId = one(r)?._id;
r = await call('POST', PUB('/store/my/wishlist'), { product: a._id }, bearer(tok));
ok('hearting it again doesn’t double', r.status === 200 && one(r)?._id === wishId, `${r.status}`);
r = await call('POST', PUB('/store/my/wishlist'), { product: 'no-such-thing' }, bearer(tok));
ok('an unknown product is 404', r.status === 404, String(r.status));
r = await call('POST', PUB('/store/my/wishlist'), { product: a._id }, bearer(tok2));
ok('Dan hearts it too', r.status === 200);
r = await call('GET', `${P}/products/${a._id}`, null, t);
ok('the Panjabi is wished by 2', (r.body?.doc || r.body)?.wishlistCount === 2, JSON.stringify((r.body?.doc || r.body)?.wishlistCount));

// The list.
r = await call('GET', PUB('/store/my/wishlist'), null, bearer(tok));
ok('Cara’s list has one item, hers only', r.body?.doc?.length === 1 && r.body.doc[0].product.name === 'Panjabi', JSON.stringify(r.body).slice(0, 200));

// Merge a guest's hearts: one already there, one new, one gone.
r = await call('POST', PUB('/store/my/wishlist/merge'), { items: [{ product: a._id }, { product: b._id }, { product: '64b000000000000000000000' }] }, bearer(tok));
ok('merge: Panjabi stays once, Polo comes in, the gone one is left out', r.status === 200 && r.body?.doc?.length === 2, `${r.status} ${r.body?.doc?.length}`);
r = await call('GET', `${P}/products/${b._id}`, null, t);
ok('the Polo is wished by 1', (r.body?.doc || r.body)?.wishlistCount === 1);

// Remove.
r = await call('DELETE', PUB(`/store/my/wishlist/${wishId}`), null, bearer(tok2));
ok('Dan can’t remove Cara’s item', r.status === 404, String(r.status));
r = await call('DELETE', PUB(`/store/my/wishlist/${wishId}`), null, bearer(tok));
ok('Cara removes it', r.status === 200, String(r.status));
r = await call('GET', `${P}/products/${a._id}`, null, t);
ok('the Panjabi is wished by 1 again', (r.body?.doc || r.body)?.wishlistCount === 1, JSON.stringify((r.body?.doc || r.body)?.wishlistCount));

r = await call('DELETE', PUB(`/store/my/wishlist/${b._id}`), null, bearer(tok));
ok('a heart can be taken away by the product’s id too', r.status === 200, String(r.status));
r = await call('GET', `${P}/products/${b._id}`, null, t);
ok('the Polo is wished by 0 again', (r.body?.doc || r.body)?.wishlistCount === 0, JSON.stringify((r.body?.doc || r.body)?.wishlistCount));
r = await call('POST', PUB('/store/my/wishlist'), { product: b._id }, bearer(tok));
r = await call('POST', PUB('/store/my/wishlist'), { product: b._id }, bearer(tok2));
r = await call('DELETE', PUB(`/store/my/wishlist/${b._id}`), null, bearer(tok2));
r = await call('POST', PUB('/store/my/wishlist'), { product: b._id }, bearer(tok2));
r = await call('DELETE', PUB(`/store/my/wishlist/${b._id}`), null, bearer(tok2));
r = await call('DELETE', PUB(`/store/my/wishlist/${b._id}`), null, bearer(tok));
r = await call('POST', PUB('/store/my/wishlist'), { product: b._id }, bearer(tok));

// The staff table.
r = await call('GET', `${P}/wishlist-items`, null, t);
ok('the staff table lists the wishes with who and what', r.body?.doc?.length === 2 && r.body.doc.every(x => x.email && x.product), JSON.stringify(r.body?.doc?.map(x => [x.customerName, x.product?.name || x.product])));

// Views.
const slug = (await call('GET', `${P}/products/${a._id}`, null, t)).body;
for (let i = 0; i < 3; i++) r = await call('POST', PUB(`/store/products/${a._id}/view`));
ok('a view is counted without signing in', r.status === 200, String(r.status));
r = await call('POST', PUB('/store/products/no-such-thing/view'));
ok('a view of an unknown product is 404', r.status === 404, String(r.status));
r = await call('GET', `${P}/products/${a._id}`, null, t);
ok('the Panjabi has 3 views', (r.body?.doc || r.body)?.views === 3, JSON.stringify((r.body?.doc || r.body)?.views));
r = await call('PUT', `${P}/products/${a._id}`, { views: 999 }, t);
r = await call('GET', `${P}/products/${a._id}`, null, t);
ok('views can’t be typed in the panel', (r.body?.doc || r.body)?.views === 3, JSON.stringify((r.body?.doc || r.body)?.views));
done();
