// API builder (docs/api-builder AB-02): endpoints made from a model's publicApi, generated, custom paths,
// who (anyone / customers / server keys), conditions, fixed filters, fields, page sizes, keys, stats.
// Uses projects.mjs's state (pat); makes its own project.
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
const stamp = Date.now();

let r = await call('POST', '/tenant/api/projects', { name: `API builder ${stamp}`, type: 'app' }, s.pat);
const pid = r.body?._id;
const slug = r.body?.publicSlug;
ok('project made', !!pid && !!slug, r.body?.message);
const P = path => `/tenant/api/p/${pid}${path}`;
const AB = path => P(`/api-builder${path}`);
const make = async body => (await call('POST', P('/builder/models'), body, s.pat)).body?.doc;

const product = await make({ name: 'Product', title: 'Products', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'price', label: 'Price', kind: 'number', min: 0 },
	{ key: 'featured', label: 'Featured', kind: 'boolean' },
	{ key: 'status', label: 'Status', kind: 'select', default: 'draft', options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }] },
	{ key: 'internalNote', label: 'Internal note', kind: 'text' },
] });
const order = await make({ name: 'Order', title: 'Orders', displayField: 'note', fields: [
	{ key: 'item', label: 'Item', kind: 'reference', ref: 'Product' },
	{ key: 'quantity', label: 'Quantity', kind: 'number', min: 1 },
	{ key: 'note', label: 'Note', kind: 'text' },
	{ key: 'email', label: 'Email', kind: 'email' },
	{ key: 'stage', label: 'Stage', kind: 'select', default: 'new', options: [{ value: 'new', label: 'New' }, { value: 'done', label: 'Done' }] },
] });
ok('models made', !!product?._id && !!order?._id);

const add = async (route, body) => {
	const b = (await call('POST', P(`/${route}`), body, s.pat)).body;
	return b?.doc || b;
};
const p1 = await add('products', { name: 'Alpha', price: 10, featured: true, status: 'published', internalNote: 'a' });
await add('products', { name: 'Beta', price: 20, featured: true, status: 'draft', internalNote: 'b' });
await add('products', { name: 'Gamma', price: 30, featured: false, status: 'published', internalNote: 'c' });
await add('products', { name: 'Delta', price: 40, featured: true, status: 'published', internalNote: 'd' });
await add('products', { name: 'Epsilon', price: 50, featured: true, status: 'published', internalNote: 'e' });

const pub = (path, init = {}) =>
	fetch(`${ROOT}/public/api/${slug}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } }).then(async x => ({
		status: x.status,
		body: await x.json().catch(() => null),
	}));
const as = t => ({ authorization: `Bearer ${t}` });

/* ---- D9: a publicApi set the old way becomes standard endpoints */
r = await call('PUT', P(`/builder/models/${product._id}/public-api`), { enabled: true, actions: ['list', 'get'], auth: 'none' }, s.pat);
ok('old-style public API on Products', r.status === 200, r.body?.message);
r = await call('GET', AB('/endpoints'), null, s.pat);
const std = (r.body?.doc || []).filter(e => e.model === 'products');
ok('endpoints made from publicApi', r.status === 200 && std.length === 2 && std.every(e => e.standard && e.access.who === 'anyone'), JSON.stringify(std.map(e => `${e.method} ${e.path}`)));
ok('models come with their rule fields', (r.body?.models || []).find(m => m.route === 'products')?.ruleFields?.some(f => f.key === '_customer'));
const stdList = std.find(e => e.action === 'list');
const stdGet = std.find(e => e.action === 'get');
r = await pub('/products');
ok('old address still answers', r.status === 200 && r.body?.total === 5, r.status);

/* ---- Generate */
r = await call('POST', AB('/endpoints/generate'), { model: 'orders', actions: ['list', 'get', 'create', 'update', 'delete'], who: 'customer' }, s.pat);
ok('generate Orders (customers)', r.status === 201 && r.body?.made?.length === 5, JSON.stringify(r.body));
r = await call('POST', AB('/endpoints/generate'), { model: 'orders', actions: ['list'], who: 'customer' }, s.pat);
ok('generate again skips what exists', r.status === 201 && !r.body?.made?.length && r.body?.skipped?.length === 1, JSON.stringify(r.body));
r = await call('GET', `/tenant/api/p/${pid}/builder/models`, null, s.pat);
const orderDef = (r.body?.doc || r.body || []).find(m => m.route === 'orders');
ok('the model’s publicApi follows its endpoints', orderDef?.publicApi?.enabled && orderDef.publicApi.auth === 'customer' && orderDef.publicApi.actions.length === 5, JSON.stringify(orderDef?.publicApi));
r = await call('GET', AB('/endpoints'), null, s.pat);
const orderEps = (r.body?.doc || []).filter(e => e.model === 'orders');
const ep = action => orderEps.find(e => e.action === action);

/* ---- Customers + owner condition */
r = await pub('/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Cara', email: `cara${stamp}@example.com`, password: 'customer-pass-1' }) });
const cara = r.body?.token;
r = await pub('/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Dan', email: `dan${stamp}@example.com`, password: 'customer-pass-1' }) });
const dan = r.body?.token;
ok('two customers', !!cara && !!dan);
r = await pub('/orders');
ok('customers-only endpoint asks to sign in', r.status === 401 && r.body?.code === 'customer_required', r.status);
const own = { access: { who: 'customer', when: [{ field: '_customer', op: 'is', value: { ref: 'customer' } }] } };
for (const a of ['list', 'get', 'create', 'update', 'delete']) await call('PUT', AB(`/endpoints/${ep(a)._id}`), own, s.pat);
r = await pub('/orders', { method: 'POST', body: JSON.stringify({ item: p1._id, quantity: 2, note: 'Cara’s', email: `cara${stamp}@example.com` }), headers: as(cara) });
ok('create sets the owner', r.status === 201, JSON.stringify(r.body));
const caraOrder = r.body?._id;
r = await pub('/orders', { method: 'POST', body: JSON.stringify({ quantity: 1, note: 'Dan’s', email: `cara${stamp}@example.com` }), headers: as(dan) });
const danOrder = r.body?._id;
r = await pub('/orders', { headers: as(cara) });
ok('owner condition: Cara sees only hers', r.status === 200 && r.body?.total === 1 && r.body.doc[0].note === 'Cara’s', JSON.stringify(r.body));
r = await pub(`/orders/${danOrder}`, { headers: as(cara) });
ok('owner condition: someone else’s is Not found', r.status === 404);
r = await pub(`/orders/${danOrder}`, { method: 'DELETE', headers: as(cara) });
ok('owner condition: can’t delete someone else’s', r.status === 404);
r = await call('GET', `/tenant/api/p/${pid}/builder/models`, null, s.pat);
ok('ownerOnly in the summary', (r.body?.doc || r.body || []).find(m => m.route === 'orders')?.publicApi?.ownerOnly === true);

/* ---- Customer-field condition */
r = await call('POST', AB('/endpoints'), { name: 'Orders for my email', model: 'orders', action: 'list', path: '/my/orders-by-email', access: { who: 'customer', when: [{ field: 'email', op: 'is', value: { ref: 'customer.email' } }] } }, s.pat);
ok('custom endpoint with a customer.email rule', r.status === 201, r.body?.message);
r = await pub('/my/orders-by-email', { headers: as(cara) });
ok('customer.email: both orders sent with Cara’s email', r.status === 200 && r.body?.total === 2, JSON.stringify(r.body?.total));
r = await pub('/my/orders-by-email', { headers: as(dan) });
ok('customer.email: none for Dan', r.status === 200 && r.body?.total === 0);

/* ---- Custom list: fixed filters, no caller filters, fields, page sizes */
r = await call('POST', AB('/endpoints'), {
	name: 'Featured products',
	model: 'products',
	action: 'list',
	path: '/products/featured',
	access: { who: 'anyone', when: [{ field: 'status', op: 'is', value: 'published' }] },
	list: { filters: [{ field: 'featured', op: 'is', value: true }], callerFilters: false, sort: '-price', limit: 2, maxLimit: 2 },
	fields: { out: ['name', 'price'] },
}, s.pat);
ok('custom list endpoint made', r.status === 201, r.body?.message);
const featured = r.body;
r = await pub('/products/featured?limit=50&price_lte=10');
ok('fixed filters + rule: featured and published only', r.status === 200 && r.body?.total === 3, `${r.status} ${r.body?.total}`);
ok('page size capped by its maximum', r.body?.limit === 2 && r.body?.doc?.length === 2);
ok('caller filters off: price_lte ignored, its own sort', r.body?.doc?.[0]?.name === 'Epsilon', JSON.stringify(r.body?.doc));
ok('only its fields go out', r.body?.doc?.every(d => Object.keys(d).sort().join() === '_id,name,price'), JSON.stringify(r.body?.doc?.[0]));
r = await pub(`/products/${p1._id}`);
ok('literal path beats /:id; standard get still works', r.status === 200 && r.body?.name === 'Alpha' && r.body?.internalNote === 'a');

/* ---- Checks on save */
const bad = async (body, on, label) => {
	const x = await call('POST', AB('/endpoints'), { name: 'x', model: 'products', action: 'list', ...body }, s.pat);
	ok(`refused: ${label}`, x.status === 400 && (!on || x.body?.on === on), `${x.status} ${x.body?.on} ${x.body?.message}`);
};
await bad({ path: '/auth/products' }, 'path', 'a reserved first part');
await bad({ path: '/products/:id' }, 'path', ':id on a list');
await bad({ path: '/products/featured' }, 'path', 'a path another endpoint answers');
await bad({ path: '/Products Now!' }, 'path', 'bad characters');
await bad({ path: '/a/b/c/d/e' }, 'path', 'more than 4 parts');
await bad({ action: 'get', path: '/products/one' }, 'path', 'read one without /:id');
await bad({ path: '/x1', access: { who: 'anyone', when: [{ field: '_customer', op: 'is', value: { ref: 'customer' } }] } }, 'access.when.0', 'a customer rule without customers');
await bad({ path: '/x2', access: { who: 'anyone', when: [{ field: 'price', op: 'gt', value: 'lots' }] } }, 'access.when.0', 'a number compared with text');
await bad({ path: '/x3', access: { who: 'anyone', when: [{ field: 'nope', op: 'is', value: 1 }] } }, 'access.when.0', 'an unknown field');
await bad({ path: '/x4', fields: { out: ['nope'] } }, 'fields.out', 'an unknown out field');
await bad({ path: '/x5', model: 'nothing' }, 'model', 'an unknown model');

/* ---- Create rule */
r = await call('POST', AB('/endpoints'), { name: 'Suggest a product', model: 'products', action: 'create', path: '/products/suggest', access: { who: 'anyone', when: [{ field: 'status', op: 'is', value: 'draft' }] }, fields: { write: ['name', 'price', 'status'] } }, s.pat);
ok('create endpoint with a rule', r.status === 201, r.body?.message);
r = await pub('/products/suggest', { method: 'POST', body: JSON.stringify({ name: 'Zeta', status: 'published' }) });
ok('create refused when the rule fails', r.status === 403 && r.body?.code === 'rule_failed' && /status is draft/.test(r.body?.message), JSON.stringify(r.body));
r = await pub('/products/suggest', { method: 'POST', body: JSON.stringify({ name: 'Zeta', price: 5, internalNote: 'sneaky' }) });
ok('create passes on the default; fields outside “write” dropped', r.status === 201 && r.body?.status === 'draft' && !r.body?.internalNote, JSON.stringify(r.body));

/* ---- Update with chosen write fields */
r = await call('POST', AB('/endpoints'), { name: 'Rename', model: 'products', action: 'update', path: '/products/rename/:id', fields: { write: ['name'], out: ['name', 'price'] } }, s.pat);
ok('update endpoint with one writable field', r.status === 201, r.body?.message);
r = await pub(`/products/rename/${p1._id}`, { method: 'PUT', body: JSON.stringify({ name: 'Alpha 2', price: 999 }) });
ok('only the writable field changes', r.status === 200 && r.body?.name === 'Alpha 2' && r.body?.price === 10, JSON.stringify(r.body));

/* ---- Server keys */
r = await call('POST', AB('/endpoints'), { name: 'Import orders', model: 'orders', action: 'create', path: '/orders/import', access: { who: 'key' } }, s.pat);
ok('key endpoint made', r.status === 201, r.body?.message);
r = await pub('/orders/import', { method: 'POST', body: JSON.stringify({ quantity: 3, note: 'From the till' }) });
ok('no key: 401 key_required', r.status === 401 && r.body?.code === 'key_required' && /needs a server key/.test(r.body?.message), JSON.stringify(r.body));
r = await pub('/orders/import', { method: 'POST', body: JSON.stringify({ quantity: 3 }), headers: { 'x-api-key': 'mint_sk_wrong' } });
ok('wrong key: 401', r.status === 401 && /isn’t valid/.test(r.body?.message));
r = await pub('/orders/import', { method: 'POST', body: JSON.stringify({ quantity: 3 }), headers: as(cara) });
ok('a customer token doesn’t open a key endpoint', r.status === 401);
r = await call('POST', AB('/keys'), { name: '' }, s.pat);
ok('a key needs a name', r.status === 400 && r.body?.on === 'name');
r = await call('POST', AB('/keys'), { name: 'Till' }, s.pat);
const key = r.body?.secret;
ok('key made, secret shown once', r.status === 201 && /^mint_sk_/.test(key || '') && r.body?.last4 === key.slice(-4), JSON.stringify({ ...r.body, secret: '…' }));
r = await pub('/orders/import', { method: 'POST', body: JSON.stringify({ quantity: 3, note: 'From the till' }), headers: { authorization: `Bearer ${key}` } });
ok('with the key (Bearer)', r.status === 201 && r.body?.note === 'From the till', JSON.stringify(r.body));
r = await pub('/orders/import', { method: 'POST', body: JSON.stringify({ quantity: 4 }), headers: { 'x-api-key': key } });
ok('with the key (X-Api-Key)', r.status === 201);
r = await call('GET', AB('/keys'), null, s.pat);
const k = r.body?.doc?.find(x => x.name === 'Till');
ok('keys list: no secret, last used set', k && !('secret' in k) && !('hash' in k) && !!k.lastUsedAt, JSON.stringify(k));
r = await call('DELETE', AB(`/keys/${k._id}`), null, s.pat);
r = await pub('/orders/import', { method: 'POST', body: JSON.stringify({ quantity: 3 }), headers: { 'x-api-key': key } });
ok('revoked key refused', r.status === 401);

/* ---- Old writers keep working; rules set in the panel survive */
r = await call('PUT', AB(`/endpoints/${stdList._id}`), { access: { who: 'anyone', when: [{ field: 'status', op: 'is', value: 'published' }] } }, s.pat);
ok('rule on the standard list', r.status === 200, r.body?.message);
r = await pub('/products');
ok('standard list follows its rule', r.status === 200 && r.body?.total === 4, r.body?.total);
r = await call('PUT', P(`/builder/models/${product._id}/public-api`), { enabled: true, actions: ['list', 'get', 'create'], auth: 'none' }, s.pat);
r = await call('GET', AB('/endpoints'), null, s.pat);
const after = (r.body?.doc || []).filter(e => e.model === 'products' && e.standard);
ok('old-style save adds Create', after.some(e => e.action === 'create' && e.enabled), JSON.stringify(after.map(e => e.action)));
ok('…and keeps the list’s rule', after.find(e => e.action === 'list')?.access?.when?.length === 1);
ok('…and leaves custom endpoints alone', (r.body?.doc || []).some(e => e.path === '/products/featured' && e.enabled));
r = await call('PUT', P(`/builder/models/${product._id}/public-api`), { enabled: true, actions: ['list', 'get', 'create'], auth: 'customer' }, s.pat);
r = await pub('/products');
ok('old-style "customers only" reaches the standard endpoints', r.status === 401);
r = await pub('/products/featured');
ok('…not the custom ones', r.status === 200);

/* ---- On/off, delete, stats, GET / */
r = await call('PATCH', AB(`/endpoints/${featured._id}`), { enabled: false }, s.pat);
ok('turned off', r.status === 200 && r.body?.enabled === false);
r = await pub('/products/featured');
ok('an endpoint that’s off is 404', r.status === 404);
r = await call('PATCH', AB(`/endpoints/${featured._id}`), { enabled: true }, s.pat);
r = await pub('/');
const info = r.body;
ok('GET / lists the endpoints', r.status === 200 && info?.endpoints?.some(e => e.path === '/products/featured' && e.who === 'anyone' && e.list?.maxLimit === 2), JSON.stringify(info?.endpoints?.map(e => `${e.method} ${e.path} ${e.who}`)));
ok('…with each one’s fields in and out', info?.endpoints?.find(e => e.path === '/products/rename/:id')?.fields?.filter(f => f.write).map(f => f.key).join() === 'name');
ok('…and still the models for older callers', Array.isArray(info?.models) && info.models.length >= 2);
r = await call('GET', AB(`/endpoints/${featured._id}`), null, s.pat);
ok('calls counted', r.body?.stats?.calls >= 2 && !!r.body?.stats?.lastCalledAt && r.body?.modelInfo?.route === 'products', JSON.stringify(r.body?.stats));
r = await call('GET', AB('/overview'), null, s.pat);
ok('overview', r.status === 200 && r.body?.endpoints?.custom >= 4 && r.body?.who?.key >= 1 && r.body?.customers === 2, JSON.stringify(r.body?.endpoints));
r = await call('DELETE', AB(`/endpoints/${featured._id}`), null, s.pat);
r = await pub('/products/featured');
ok('deleted endpoint gone', r.status === 404 || r.status === 401, r.status);
r = await call('DELETE', AB(`/endpoints/${stdGet._id}`), null, s.pat);
r = await call('GET', `/tenant/api/p/${pid}/builder/models`, null, s.pat);
ok('deleting a standard endpoint takes its action off the summary', !(r.body?.doc || r.body || []).find(m => m.route === 'products')?.publicApi?.actions?.includes('get'));

/* ---- MCP: list_endpoints, generate_endpoints, save_endpoint (AB-05) */
r = await call('POST', P('/builder/api-keys'), { name: 'AI', scopes: ['read', 'build'] }, s.pat);
const mk = r.body?.secret || r.body?.key || r.body?.doc?.secret;
ok('MCP key', typeof mk === 'string' && mk.startsWith('emk_'), r.status);
const rpc = async (method, params) =>
	(await fetch(`${ROOT}/tenant/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${mk}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then(x => x.json())).result;
const tool = (name, args) => rpc('tools/call', { name, arguments: args });
const listed = await rpc('tools/list', {});
ok('MCP offers the endpoint tools', ['list_endpoints', 'generate_endpoints', 'save_endpoint'].every(n => listed?.tools?.some(t => t.name === n)));
let t = await tool('list_endpoints', {});
const tText = t?.content?.[0]?.text || '';
ok('list_endpoints shows paths, who and rules', /POST \/products\/suggest/.test(tText) && /rules: status is "draft"/.test(tText) && /rule fields:/.test(tText), tText.slice(0, 300));
t = await tool('generate_endpoints', { model: 'Order', actions: ['list'], who: 'customer' });
ok('generate_endpoints keeps what exists', /already there: GET \/orders/.test(t?.content?.[0]?.text || ''), t?.content?.[0]?.text);
t = await tool('save_endpoint', { model: 'products', action: 'list', path: '/products/cheap', name: 'Cheap products', who: 'anyone', rules: [{ field: 'price', op: 'lt', value: 25 }], sendBack: ['name', 'price'] });
ok('save_endpoint makes a custom endpoint', !t?.isError && /\/products\/cheap/.test(t?.content?.[0]?.text || ''), t?.content?.[0]?.text);
const cheapId = t?.structuredContent?._id || (t?.content?.[0]?.text || '').match(/\[id ([a-f0-9]{24})\]/)?.[1];
r = await pub('/products/cheap');
ok('…and it answers with its rule and fields', r.status === 200 && r.body?.doc?.every(d => d.price < 25 && !('internalNote' in d)), JSON.stringify(r.body));
t = await tool('save_endpoint', { model: 'products', action: 'list', path: '/auth/cheap' });
ok('save_endpoint refuses a reserved path', t?.isError && /path:/.test(t?.content?.[0]?.text || ''), t?.content?.[0]?.text);
t = await tool('save_endpoint', { id: cheapId, rules: [{ field: '_customer', op: 'is', value: { ref: 'customer' } }] });
ok('save_endpoint refuses a customer rule on an endpoint for anyone', t?.isError && /Signed-in customers/.test(t?.content?.[0]?.text || ''), t?.content?.[0]?.text);
t = await tool('save_endpoint', { id: cheapId, enabled: false });
r = await pub('/products/cheap');
ok('save_endpoint turns one off, keeping the rest', !t?.isError && r.status === 404 && /price lt 25/.test(t?.content?.[0]?.text || ''), `${r.status} ${t?.content?.[0]?.text}`);

/* ---- Project delete takes its endpoints */
r = await call('DELETE', `/tenant/api/projects/${pid}?force=1`, null, s.pat);
ok('project deleted', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('GET', AB('/endpoints'), null, s.pat);
ok('…with its endpoints', r.status === 404 || r.status === 403, r.status);

done();
