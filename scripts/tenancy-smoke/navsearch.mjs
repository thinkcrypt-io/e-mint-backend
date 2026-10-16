// WO-54: the navbar search over records — a page's "Show in search" switch
// (its published config, `route.search`), its Searchable fields, and only
// what the searcher could list: project roles per model, per-record access,
// archived rows. The super admin's /admin/api/search too.
// Stands alone (its own accounts). Local scratch server only.
import mongoose from 'mongoose';
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const PASS = 'search-pass-123';
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const MONGO = process.env.MONGO_CONNECTION_URI || process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
await mongoose.connect(MONGO);
const email = key => `${key}${stamp}@example.com`;
const register = async (name, key) =>
	(await call('POST', '/tenant/api/auth/register', { name, email: email(key), password: PASS, organization: `${name} Co ${stamp}`, country: 'BD' })).body.token;

// Alma owns the project; Bea joins as a Member, Ivy with a role that only views Deals.
const alma = await register('Alma', 'alma');
let bea = await register('Bea', 'bea');
let ivy = await register('Ivy', 'ivy');
await mongoose.connection.db.collection('tenantusers').updateMany({ email: { $in: [email('bea'), email('ivy')] } }, { $set: { emailVerified: true } });
const shop = (await call('POST', '/tenant/api/projects', { name: 'Shop', type: 'app' }, alma)).body;
const join = async token => {
	const inv = (await call('GET', '/tenant/api/invitations/for-me', null, token)).body?.doc?.[0];
	return (await call('POST', `/tenant/api/invitations/for-me/${inv?._id}/accept`, null, token)).body?.token;
};

let r = await call('POST', P(shop._id, '/builder/models'), {
	name: 'Client', title: 'Clients',
	fields: [
		{ key: 'name', label: 'Name', kind: 'text', required: true },
		{ key: 'email', label: 'Email', kind: 'email' },
		{ key: 'city', label: 'City', kind: 'text' },
	],
}, alma);
ok('Clients made', r.status === 201 && r.body?.doc?.route === 'clients', r.body?.message || r.body?.doc?.route);
r = await call('POST', P(shop._id, '/builder/models'), { name: 'Supplier', title: 'Suppliers', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] }, alma);
ok('Suppliers made', r.status === 201, r.body?.message);
r = await call('POST', P(shop._id, '/builder/models'), { name: 'Deal', title: 'Deals', access: { enabled: true }, fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }] }, alma);
ok('Deals made (per-record access)', r.status === 201, r.body?.message);

r = await call('POST', P(shop._id, '/people/roles'), { name: 'Deal desk', permissions: ['view-deals'] }, alma);
const desk = r.body?._id;
ok('a project role that only views Deals', r.status === 201, r.body?.message);
await call('POST', P(shop._id, '/people/invitations'), { email: email('bea'), role: 'member' }, alma);
await call('POST', P(shop._id, '/people/invitations'), { email: email('ivy'), role: desk }, alma);
bea = await join(bea);
ivy = await join(ivy);
ok('Bea and Ivy are in Shop', !!bea && !!ivy);
const beaId = (await call('GET', '/tenant/api/auth/self', null, bea)).body?._id;

const add = async (route, body) => { const b = (await call('POST', P(shop._id, `/${route}`), body, alma)).body; return b?._id || b?.doc?._id; };
const jane = await add('clients', { name: 'Jane Doe', email: 'jane@acme-co.com', city: 'Dhaka' });
const gone = await add('clients', { name: 'Jane Archived', email: 'old@acme-co.com' });
await add('clients', { name: 'Axb Ltd', email: 'axb@other.com' });
for (let i = 1; i <= 7; i++) await add('clients', { name: `Janelle ${i}`, email: `j${i}@many.com` });
await add('suppliers', { name: 'Jane Supplies' });
await add('deals', { title: 'Jane public deal', privacy: 'public' });
const privDeal = await add('deals', { title: 'Jane quiet deal', privacy: 'private', access: [beaId] });
await add('deals', { title: 'Jane secret deal', privacy: 'only-me' });
ok('records made', !!jane && !!gone && !!privDeal);
await mongoose.connection.db.collection(`t_${shop._id}`).updateOne({ _id: new mongoose.Types.ObjectId(gone) }, { $set: { archivedAt: new Date() } });

const search = (q, who = alma) => call('GET', P(shop._id, `/search?q=${encodeURIComponent(q)}`), null, who);
const group = (body, route) => body?.groups?.find(g => g.route === route);
const names = g => (g?.hits || []).map(h => h.name);

/* ---- off by default: nothing changes until a page turns it on */
r = await search('Jane');
ok('search is off on every page by default', r.status === 200 && Array.isArray(r.body?.groups) && r.body.groups.length === 0, JSON.stringify(r.body));

const setSearch = async (route, search, who = alma) => {
	const b = (await call('GET', P(shop._id, `/builder/route?route=${route}`), null, who)).body;
	const config = b?.config?.data || b?.code?.config || {};
	const d = await call('PUT', P(shop._id, '/builder/draft'), { route, kind: 'config', draft: { ...config, route: { ...(config.route || {}), search } } }, who);
	if (d.status !== 200) return d;
	return call('POST', P(shop._id, '/builder/publish'), { route, kinds: ['config'] }, who);
};
r = await setSearch('clients', { enabled: true });
ok('Customers: Show in search on, published', r.status === 200, r.body?.message);
r = await setSearch('deals', { enabled: true });
ok('Deals: on', r.status === 200, r.body?.message);
r = await setSearch('clients', { enabled: true }, bea);
ok("a Member can't change the setting", r.status === 403, r.status);

/* ---- what Alma finds */
r = await search('Jane');
let customers = group(r.body, 'clients');
ok('Customers match, under the page title', customers?.title === 'Clients' && names(customers).includes('Jane Doe'), JSON.stringify(r.body));
ok('…an archived customer stays out', !names(customers).includes('Jane Archived'), names(customers).join());
ok('…Suppliers (search off) do not show', !group(r.body, 'suppliers'));
ok('…five per page at most, and the rest is flagged', customers?.hits?.length === 5 && customers?.more === true, `${customers?.hits?.length} more=${customers?.more}`);
let deals = group(r.body, 'deals');
ok('Alma sees all her deals', names(deals).sort().join() === 'Jane public deal,Jane quiet deal,Jane secret deal', names(deals).join());
ok('a hit names its record and id', /^[a-f0-9]{24}$/.test(customers?.hits?.[0]?._id || ''));

r = await search('acme-co.com');
customers = group(r.body, 'clients');
const byEmail = customers?.hits?.find(h => h.name === 'Jane Doe');
ok('matched by a Searchable field: the hit says which', byEmail?.match?.label === 'Email' && byEmail?.match?.value === 'jane@acme-co.com', JSON.stringify(customers));
r = await search('a.b');
ok('what is typed is literal, not a pattern (a.b finds no Axb)', !(group(r.body, 'clients')?.hits || []).some(h => h.name === 'Axb Ltd'), JSON.stringify(r.body));
r = await search('(((');
ok('…and a stray bracket is fine', r.status === 200, r.status);
r = await search('J');
ok('one letter searches nothing', r.status === 200 && r.body?.groups?.length === 0);
r = await search('Dhaka');
ok('a text field is Searchable by default (City finds her)', names(group(r.body, 'clients')).includes('Jane Doe'), JSON.stringify(r.body));

/* ---- a numbered model: the hit carries its record number */
r = await call('POST', P(shop._id, '/builder/models'), { name: 'Invoice', title: 'Invoices', code: { enabled: true, prefix: 'INV' }, fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }] }, alma);
ok('Invoices made (record numbers)', r.status === 201, r.body?.message);
await add('invoices', { title: 'Jane website' });
await setSearch('invoices', { enabled: true });
r = await search('Jane website');
const inv = group(r.body, 'invoices')?.hits?.[0];
ok('…its hit has the name and the record number', inv?.name === 'Jane website' && /^INV-\d+$/.test(inv?.code || ''), JSON.stringify(inv));
r = await search('Jane Doe');
ok('…a model without numbers sends none', group(r.body, 'clients')?.hits?.every(h => h.code === undefined), JSON.stringify(group(r.body, 'clients')));

/* ---- picking fields */
r = await setSearch('clients', { enabled: true, fields: ['name'] });
ok('Customers searched by Name only', r.status === 200, r.body?.message);
r = await search('acme-co.com');
ok('…an email no longer finds them', !group(r.body, 'clients'), JSON.stringify(r.body));
r = await search('Jane Doe');
ok('…a name still does', names(group(r.body, 'clients')).includes('Jane Doe'));
r = await setSearch('clients', { enabled: true, fields: ['password', 'nope'] });
r = await search('acme-co.com');
ok('fields that are not Searchable are ignored (back to all of them)', names(group(r.body, 'clients')).includes('Jane Doe'), JSON.stringify(r.body));

/* ---- who searches */
r = await search('Jane', bea);
deals = group(r.body, 'deals');
ok('Bea (Member) sees Customers', names(group(r.body, 'clients')).includes('Jane Doe'));
ok('…the public deal and the private one shared with her, not the only-me one', names(deals).sort().join() === 'Jane public deal,Jane quiet deal', names(deals).join());
r = await search('Jane', ivy);
ok('Ivy (views Deals only) never sees Customers', !group(r.body, 'clients'), JSON.stringify(r.body?.groups?.map(g => g.route)));
ok('…and only the public deal', names(group(r.body, 'deals')).join() === 'Jane public deal', names(group(r.body, 'deals')).join());

/* ---- turning it off again */
r = await setSearch('clients', { enabled: false });
r = await search('Jane');
ok('Customers off: gone from the search', !group(r.body, 'clients') && !!group(r.body, 'deals'), JSON.stringify(r.body?.groups?.map(g => g.route)));

/* ---- another organization's search never reaches this project */
const zoe = await register('Zoe', 'zoe');
r = await call('GET', P(shop._id, '/search?q=Jane'), null, zoe);
ok("someone outside the project gets a 404", r.status === 404, r.status);

/* ---- the super admin's own pages */
r = await call('POST', '/admin/api/auth/login', { email: 'admin@example.com', password: 'tenancy-dev-pass-1' });
const admin = r.body?.token;
if (admin) {
	r = await call('GET', '/admin/api/search?q=Jane', null, admin);
	ok('the super admin search answers (no tenant records)', r.status === 200 && Array.isArray(r.body?.groups) && !r.body.groups.some(g => g.route === 'clients' || g.route === 'deals'), JSON.stringify(r.body));
	r = await call('GET', '/admin/api/search?q=Jane');
	ok('…and needs a sign-in', r.status === 401, r.status);
	const A = path => `/admin/api${path}`;
	r = await call('POST', A('/builder/models'), { name: `Probe${stamp}`, title: 'Search probes', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] }, admin);
	const probe = r.body?.doc;
	ok('a super-admin model', r.status === 201 && !!probe?.route, r.body?.message);
	await call('POST', A(`/${probe?.route}`), { name: `Jane probe ${stamp}` }, admin);
	const b = (await call('GET', A(`/builder/route?route=${probe?.route}`), null, admin)).body;
	const config = b?.config?.data || b?.code?.config || {};
	await call('PUT', A('/builder/draft'), { route: probe?.route, kind: 'config', draft: { ...config, route: { ...(config.route || {}), search: { enabled: true } } } }, admin);
	r = await call('POST', A('/builder/publish'), { route: probe?.route, kinds: ['config'] }, admin);
	ok('…its search turned on', r.status === 200, r.body?.message);
	r = await call('GET', A(`/search?q=${encodeURIComponent(`probe ${stamp}`)}`), null, admin);
	const g = r.body?.groups?.find(x => x.route === probe?.route);
	ok('…found in the super admin search, by its page title', g?.title === 'Search probes' && g?.hits?.[0]?.name === `Jane probe ${stamp}`, JSON.stringify(r.body));
	r = await call('GET', P(shop._id, `/search?q=${encodeURIComponent(`probe ${stamp}`)}`), null, alma);
	ok("…never in a tenant project's", r.status === 200 && !r.body?.groups?.length, JSON.stringify(r.body));
	r = await call('DELETE', A(`/builder/models/${probe?._id}?force=true`), null, admin);
	ok('…removed again', r.status === 200, r.body?.message);
} else console.log('SKIP  super admin (no dev admin on this DB — seedTenancyDev.js)');

await call('DELETE', `/tenant/api/projects/${shop._id}?force=true`, null, alma);
await mongoose.disconnect();
done();
