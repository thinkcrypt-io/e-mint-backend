// Key values (docs/key-values): a new project starts with the Key values model (/key-values: name,
// description, keys); a Key-value pairs field shows its groups always, per value of a choice or a picked
// record (rules), through the picked record's own list (via), or the picked records themselves.
// Builder checks, the groups endpoint, saving (tidied), and isolation from another project.
// Stands alone (its own account). Local scratch server only.
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const tok = (await call('POST', '/tenant/api/auth/register', { name: 'Kv', email: `kv${stamp}@example.com`, password: 'keyvalue-pass-123', organization: `KV Co ${stamp}`, country: 'BD' })).body.token;
const pid = (await call('POST', '/tenant/api/projects', { name: 'Shop', type: 'app' }, tok)).body?._id;
const pid2 = (await call('POST', '/tenant/api/projects', { name: 'Other', type: 'app' }, tok)).body?._id;
const P = (p, id = pid) => `/tenant/api/p/${id}${p}`;
const said = r => JSON.stringify(r.body?.problems || r.body?.message);

let r = await call('GET', P('/builder/models'), null, tok);
const kvModel = (r.body?.doc || r.body || []).find?.(m => m.route === 'key-values');
ok('a new project has the Key values model', !!kvModel, JSON.stringify((r.body?.doc || []).map?.(m => m.route)));
r = await call('GET', P('/sidebar/web/server'), null, tok);
ok('…in the sidebar', JSON.stringify(r.body).includes('/t/key-values'));

const mk = async (name, description, keys, id = pid) => (await call('POST', P('/key-values', id), { name, description, keys }, tok)).body?.doc;
const display = await mk('Display', 'The screen', ['Size', 'Resolution', 'Panel']);
const cpu = await mk('Processor', '', ['Brand', 'Cores']);
const warranty = await mk('Warranty', 'After-sales', ['Length']);
ok('key values records', display?._id && cpu?._id && warranty?._id);
const otherGroup = await mk('Elsewhere', '', ['X'], pid2);

const cat = await call('POST', P('/builder/models'), { name: 'Category', title: 'Categories', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'specifications', label: 'Specifications', kind: 'references', ref: 'KeyValue' },
] }, tok);
ok('Category links to Key values', cat.status === 201, said(cat));
const laptops = (await call('POST', P('/categories'), { name: 'Laptops', specifications: [display._id, cpu._id] }, tok)).body?.doc;
const phones = (await call('POST', P('/categories'), { name: 'Phones', specifications: [display._id] }, tok)).body?.doc;

const base = [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'category', label: 'Category', kind: 'reference', ref: 'Category' },
	{ key: 'condition', label: 'Condition', kind: 'select', options: [{ value: 'New' }, { value: 'Used' }] },
];
const product = specs => call('POST', P('/builder/models'), { name: 'Product', title: 'Products', displayField: 'name', fields: [...base, { key: 'specs', label: 'Specifications', kind: 'keyvalue', ...specs }] }, tok);
r = await product({});
ok('builder: a key-value field needs groups or a field', r.status === 400 && /groups/.test(said(r)), said(r));
r = await product({ from: 'condition' });
ok('builder: a choice needs a value → groups', r.status === 400 && /each value/.test(said(r)), said(r));
r = await product({ from: 'category', via: 'nope' });
ok('builder: via must be a link of the picked record', r.status === 400 && /no link field/.test(said(r)), said(r));
r = await product({ groups: [warranty._id], from: 'category', via: 'specifications' });
ok('Product with specs (always Warranty + the category’s)', r.status === 201, said(r));
const pdef = r.body?.doc;

r = await call('GET', P('/products/get/schema'), null, tok);
const kv = r.body?.specs?.kv || r.body?.find?.(x => x.name === 'specs')?.kv;
ok('schema sends kv', kv?.route === 'products' && kv?.from === 'category' && kv?.fixed === true, JSON.stringify(r.body?.specs));

const groups = async (v, route = 'products', field = 'specs') => (await call('GET', P(`/${route}/get/keyvalue/${field}?value=${v}`), null, tok)).body?.groups?.map(g => g.title);
ok('nothing picked: the always-shown', JSON.stringify(await groups('')) === '["Warranty"]', JSON.stringify(await groups('')));
ok('laptops: Warranty, Display, Processor', JSON.stringify(await groups(laptops._id)) === '["Warranty","Display","Processor"]', JSON.stringify(await groups(laptops._id)));
ok('phones: Warranty, Display', JSON.stringify(await groups(phones._id)) === '["Warranty","Display"]');
r = await call('GET', P(`/products/get/keyvalue/specs?value=${laptops._id}`), null, tok);
const d = r.body.groups.find(g => g.title === 'Display');
ok('a group: description and keys', d.description === 'The screen' && JSON.stringify(d.keys) === '["Size","Resolution","Panel"]');

// Rules: by a choice, and per picked category.
r = await call('PUT', P(`/builder/models/${pdef._id}`), { ...pdef, fields: [...base, { key: 'specs', label: 'Specifications', kind: 'keyvalue', from: 'condition', rules: [{ value: 'Used', groups: [warranty._id] }, { value: 'New', groups: [display._id, warranty._id] }] }] }, tok);
ok('rules by a choice saved', r.status === 200, said(r));
ok('Used → Warranty', JSON.stringify(await groups('Used')) === '["Warranty"]', JSON.stringify(await groups('Used')));
ok('new (any case) → Display, Warranty', JSON.stringify(await groups('new')) === '["Display","Warranty"]');
const pdef2 = (await call('GET', P(`/builder/models/${pdef._id}`), null, tok)).body?.doc || pdef;
r = await call('PUT', P(`/builder/models/${pdef._id}`), { ...pdef2, fields: [...base, { key: 'specs', label: 'Specifications', kind: 'keyvalue', from: 'category', rules: [{ value: phones._id, groups: [cpu._id] }] }] }, tok);
ok('rules per category saved', r.status === 200, said(r));
ok('phones → Processor (by rule, not its own list)', JSON.stringify(await groups(phones._id)) === '["Processor"]', JSON.stringify(await groups(phones._id)));
ok('laptops → nothing', JSON.stringify(await groups(laptops._id)) === '[]');
ok('another project’s group never shows', !(await groups(phones._id)).includes('Elsewhere') && !!otherGroup);

// Saving a record: tidied.
r = await call('POST', P('/products'), { name: 'P1', category: phones._id, specs: [
	{ group: cpu._id, title: 'Processor', items: [{ key: 'Brand', value: ' Intel ' }, { key: 'Cores', value: '' }, { key: 'brand', value: 'dup' }] },
	{ title: 'Empty', items: [] },
] }, tok);
ok('a record saves', r.status === 201, said(r));
const saved = (await call('GET', P(`/products/${r.body?.doc?._id}`), null, tok)).body;
ok('blank values, duplicate keys and empty sections dropped', JSON.stringify(saved?.specs) === JSON.stringify([{ group: cpu._id, title: 'Processor', items: [{ key: 'Brand', value: 'Intel' }] }]), JSON.stringify(saved?.specs));
done();
