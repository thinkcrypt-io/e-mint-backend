// Public API, customers and the login widget. Uses projects.mjs's state (pat's CRM project).
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const stamp = Date.now();

let r = await call('GET', `/tenant/api/projects/${s.crm}`, null, s.pat);
const slug = r.body?.publicSlug;
ok('project public slug', !!slug, slug);
const make = async body => (await call('POST', P(s.crm, '/builder/models'), body, s.pat)).body?.doc;
const product = await make({ name: 'Product', title: 'Products', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'price', label: 'Price', kind: 'number', min: 0 },
	{ key: 'internalNote', label: 'Internal note', kind: 'text' },
] });
const order = await make({ name: 'Order', title: 'Orders', code: { enabled: true, prefix: 'ORD' }, displayField: 'code', fields: [
	{ key: 'item', label: 'Item', kind: 'reference', ref: 'Product', required: true },
	{ key: 'quantity', label: 'Quantity', kind: 'number', min: 1, required: true },
	{ key: 'unitPrice', label: 'Unit price', kind: 'number' },
	{ key: 'total', label: 'Total', kind: 'formula', formula: 'quantity * unitPrice' },
] });
ok('models made', !!product?._id && !!order?._id);
r = await call('PUT', P(s.crm, `/builder/models/${product._id}/public-api`), { enabled: true, actions: ['list', 'get'], auth: 'none' }, s.pat);
ok('Products: public list/get, open', r.status === 200 && r.body?.publicApi?.enabled, `${r.status} ${r.body?.message || ''}`);
r = await call('PUT', P(s.crm, `/builder/models/${order._id}/public-api`), { enabled: true, actions: ['list', 'get', 'create'], auth: 'none', ownerOnly: true }, s.pat);
ok('owner-only without customer auth refused', r.status === 400, r.body?.message);
r = await call('PUT', P(s.crm, `/builder/models/${order._id}/public-api`), { enabled: true, actions: ['list', 'get', 'create', 'update', 'delete'], auth: 'customer', ownerOnly: true }, s.pat);
ok('Orders: customers only, owner-only', r.status === 200, r.body?.message);
const admin = (await call('POST', '/admin/api/auth/login', { email: 'admin@example.com', password: 'tenancy-dev-pass-1' })).body.token;
const am = await call('GET', '/admin/api/builder/models', null, admin);
r = await call('PUT', `/admin/api/builder/models/${(am.body?.doc || am.body || [])[0]?._id || '000000000000000000000000'}/public-api`, { enabled: true, actions: ['list'] }, admin);
ok('platform models have no public API', r.status === 404, r.status);

r = await call('POST', P(s.crm, '/products'), { name: 'Widget', price: 12.5, internalNote: 'cost 3' }, s.pat);
const widgetId = r.body?._id || r.body?.doc?._id;
await call('POST', P(s.crm, '/products'), { name: 'Gadget', price: 30 }, s.pat);

const pub = (path, init = {}) => fetch(`${ROOT}/public/api/${slug}/${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }).then(async x => ({ status: x.status, body: await x.json().catch(() => null), headers: x.headers }));
r = await pub('');
ok('public info lists the two models', r.status === 200 && r.body?.models?.length === 2, JSON.stringify(r.body?.models?.map(m => `${m.route}:${m.actions}`)));
r = await pub('products?sort=price');
ok('list products without a token', r.status === 200 && r.body?.total === 2 && r.body.doc[0].name === 'Widget', r.status);
ok('only the model’s fields come out', r.body?.doc?.[0] && !('customer' in r.body.doc[0]) && !('__v' in r.body.doc[0]));
r = await pub(`products/${widgetId}`);
ok('get one', r.status === 200 && r.body?.price === 12.5);
r = await pub('products', { method: 'POST', body: JSON.stringify({ name: 'Hack' }) });
ok('actions not turned on answer 404', r.status === 404);
r = await pub('clients');
ok('models without a public API are 404', r.status === 404);
r = await fetch(`${ROOT}/public/api/no-such-project/products`);
ok('unknown project 404', r.status === 404);

// Customers
r = await pub('auth/register', { method: 'POST', body: JSON.stringify({ name: 'Cara', email: `cara${stamp}@example.com`, password: 'customer-pass-1' }) });
ok('customer signs up', r.status === 200 && r.body?.token, r.body?.message);
const cara = r.body.token;
r = await pub('auth/register', { method: 'POST', body: JSON.stringify({ name: 'Dan', email: `dan${stamp}@example.com`, password: 'customer-pass-1' }) });
const dan = r.body.token;
r = await pub('auth/login', { method: 'POST', body: JSON.stringify({ email: `cara${stamp}@example.com`, password: 'wrong-pass' }) });
ok('wrong password refused', r.status === 400);
const as = t => ({ headers: { authorization: `Bearer ${t}` } });
r = await pub('auth/me', as(cara));
ok('me', r.status === 200 && r.body?.name === 'Cara');
r = await pub('orders');
ok('orders need a signed-in customer', r.status === 401 && r.body?.code === 'customer_required');
r = await pub('orders', { method: 'POST', body: JSON.stringify({ item: widgetId, quantity: 3, unitPrice: 12.5, total: 1 }), ...as(cara) });
ok('Cara orders (formula computed, not taken)', r.status === 201 && r.body?.total === 37.5, `${r.status} ${JSON.stringify(r.body)}`);
const caraOrder = r.body?._id;
r = await pub('orders', { method: 'POST', body: JSON.stringify({ item: widgetId, quantity: 0 }), ...as(cara) });
ok('validation from the model (min 1)', r.status === 400, r.body?.message);
r = await pub('orders', as(cara));
ok('Cara sees her order, item populated', r.body?.total === 1 && r.body.doc[0].item?.name === 'Widget', JSON.stringify(r.body?.doc?.[0]?.item));
r = await pub('orders', as(dan));
ok("Dan doesn't see Cara's", r.status === 200 && r.body?.total === 0);
r = await pub(`orders/${caraOrder}`, as(dan));
ok("Dan can't open Cara's order", r.status === 404);
r = await pub(`orders/${caraOrder}`, { method: 'DELETE', ...as(dan) });
ok("Dan can't delete it", r.status === 404);
r = await pub(`orders/${caraOrder}`, { method: 'PUT', body: JSON.stringify({ quantity: 4 }), ...as(cara) });
ok('Cara updates it (total recalculated)', r.status === 200 && r.body?.total === 50, JSON.stringify(r.body));
r = await pub('auth/logout-everywhere', { method: 'POST', ...as(cara) });
r = await pub('orders', as(cara));
ok('signed out everywhere', r.status === 401);
// A customer token of this project means nothing to another project or to the panels
r = await call('GET', '/tenant/api/auth/self', null, `Bearer ${dan}`);
ok('customer token refused by the tenant API', r.status === 401);
r = await call('GET', '/admin/api/auth/self', null, `Bearer ${dan}`);
ok('customer token refused by the admin API', r.status === 401);
// The tenant's view
r = await call('GET', P(s.crm, '/customers'), null, s.pat);
ok('tenant sees its customers, no passwords', r.status === 200 && r.body?.doc?.length === 2 && !JSON.stringify(r.body).includes('password'), r.body?.doc?.length);
r = await call('GET', P(s.site, '/customers'), null, s.pat);
ok("not in the organization's other project", r.status === 200 && r.body?.doc?.length === 0);
r = await call('GET', P(s.crm, '/products'), null, s.pat);
ok('records made in the panel keep their internal fields there', JSON.stringify(r.body).includes('cost 3'));
// Widget
r = await fetch(`${ROOT}/public/widget.js`);
const js = await r.text();
ok('widget.js served', r.status === 200 && /javascript/.test(r.headers.get('content-type')) && js.includes('MintAuth'), r.headers.get('content-type'));
ok('loadable from other sites (CORP cross-origin)', r.headers.get('cross-origin-resource-policy') === 'cross-origin', r.headers.get('cross-origin-resource-policy'));
done();
