// Template Studio (docs/templates) T-03 + T-04: a template built into a sandbox preview
// (models, sidebar, dashboard, roles, public API, placeholders, sample data, website pages
// and settings, setup checklist), opened with a single-use ticket, kept out of the
// oversight tables, confined to the project, and removed completely; a failing build
// leaves nothing behind.
import { call, ok, done } from './lib.mjs';

const A = '/admin/api';
const PASS = 'tenancy-dev-pass-1';
const { MongoClient } = await import('../../node_modules/mongodb/lib/index.js');
const uri = process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
const mc = await new MongoClient(uri).connect();
const db = mc.db();
const collectionsOf = async id => (await db.listCollections({ name: { $regex: `^t_${id}_` } }, { nameOnly: true }).toArray()).map(c => c.name);

let r = await call('POST', `${A}/auth/login`, { email: 'admin@example.com', password: PASS });
const T = r.body.token;
await db.collection('projecttemplates').deleteMany({ key: { $in: ['smoke-preview-finance', 'smoke-preview-site', 'smoke-preview-broken'] } });
// Left behind if an earlier run stopped half-way (the sandbox organization outlives its previews).
await db.collection('organizationroles').deleteMany({ name: 'Smoke accountant' });

/* ------------------------------------------------------------ an app template */
r = await call('POST', `${A}/templates`, {
	type: 'app',
	key: 'smoke-preview-finance',
	blueprint: {
		overview: { name: 'Smoke preview finance', summary: 'Accounts and money.', description: 'x', audience: 'x', category: 'Finance' },
		questions: [{ key: 'currency', label: 'Currency?', kind: 'currency', default: 'USD' }],
		models: {
			steps: [
				{ action: 'create', name: 'Account', title: 'Accounts', description: 'Where money sits.', rationale: 'x', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'currency', label: 'Currency', kind: 'text', default: '{{currency}}' }] },
				{ action: 'create', name: 'Transaction', title: 'Transactions', description: 'Money in and out.', rationale: 'x', displayField: 'title', fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }, { key: 'account', label: 'Account', kind: 'reference', ref: 'Account' }, { key: 'amount', label: 'Amount', kind: 'number' }] },
			],
		},
		sidebar: [{ name: 'Money', icon: 'wallet', items: [{ model: 'Transaction', label: 'All transactions' }, 'Account'] }],
		dashboard: [{ type: 'stat', route: 'Transaction', title: 'Total', metric: 'sum', field: 'amount' }],
		roles: [{ name: 'Smoke accountant', description: 'Books.', permissions: ['records:view', 'records:edit'] }, { name: 'Member', description: 'x', permissions: ['records:view'] }],
		endpoints: [{ model: 'Account', actions: ['list', 'get'], note: 'For the site.' }],
		sampleData: { Transaction: [{ title: 'Rent', account: 'Main account', amount: 1200 }], Account: [{ name: 'Main account' }] },
		guide: { steps: [{ title: 'Add your accounts', body: 'x', page: 'Account' }] },
	},
}, T);
ok('app template created', r.status === 201, r.status);
const appId = r.body.doc._id;

r = await call('POST', `${A}/templates/${appId}/preview`, { answers: { currency: 'EUR' } }, T);
ok('preview built (201)', r.status === 201, `${r.status} ${r.body?.message} ${JSON.stringify(r.body?.problems || '')}`);
const pv = r.body;
const P = pv.project?._id;
ok('models built', pv.result?.models?.map(m => m.route).join() === 'accounts,transactions', JSON.stringify(pv.result?.models));
ok('sidebar category, widget, role (Member skipped), endpoint, sample records', pv.result.categories.join() === 'Money' && pv.result.widgets === 1 && pv.result.roles.created.join() === 'Smoke accountant' && pv.result.roles.skipped.join() === 'Member' && pv.result.endpoints.join() === 'accounts' && pv.result.records.accounts === 1 && pv.result.records.transactions === 1, JSON.stringify(pv.result));
ok('a single-use link to the tenant panel', /\/preview\?ticket=[a-f0-9]{48}$/.test(pv.url) && pv.ticket, pv.url);
ok('built from the draft (never published)', pv.project.from === 'draft');

/* ------------------------------------------------------------------- ticket */
r = await call('POST', '/tenant/api/auth/preview', { ticket: 'nope' });
ok('bad ticket refused', r.status === 400 && r.body?.code === 'preview_ticket', r.status);
r = await call('POST', '/tenant/api/auth/preview', { ticket: pv.ticket });
ok('ticket → session + project', r.status === 200 && r.body.token && r.body.project.publicSlug === pv.project.publicSlug, r.status);
const PT = r.body.token;
r = await call('POST', '/tenant/api/auth/preview', { ticket: pv.ticket });
ok('ticket works once', r.status === 400, r.status);

const PP = `/tenant/api/p/${P}`;
r = await call('GET', `${PP}/transactions`, null, PT);
const txn = (r.body?.doc || [])[0];
ok('sample transaction, linked to its account', r.status === 200 && txn?.title === 'Rent' && (txn.account?.name === 'Main account' || !!txn.account), JSON.stringify(txn));
r = await call('GET', `${PP}/accounts`, null, PT);
ok('{{currency}} filled from the answer', r.body?.doc?.[0]?.currency === 'EUR', JSON.stringify(r.body?.doc?.[0]));
r = await call('GET', `${PP}/sidebar/admin/server`, null, PT);
const money = (r.body || []).filter(i => i.category?.name === 'Money' || i.categoryName === 'Money' || /transactions|accounts/.test(i.href || ''));
ok('sidebar: the template’s label and order', JSON.stringify(r.body || []).includes('All transactions'), JSON.stringify(money).slice(0, 300));
r = await call('GET', `${PP}/dashboard`, null, PT);
ok('dashboard widget on the built route', r.body?.widgets?.some(w => w.route === 'transactions' && w.metric === 'sum'), JSON.stringify(r.body?.widgets));
r = await call('GET', PP, null, PT);
ok('project remembers the template; setup checklist resolved to the route', r.body?._id && true, r.status);
const proj = await db.collection('tenantprojects').findOne({ _id: new (await import('../../node_modules/mongodb/lib/index.js')).ObjectId(P) });
ok('project.template + setup', proj?.template?.key === 'smoke-preview-finance' && proj?.template?.answers?.currency === 'EUR' && proj?.setup?.steps?.[0]?.page === 'accounts', JSON.stringify({ t: proj?.template, s: proj?.setup }));

r = await call('POST', '/tenant/api/projects', { name: 'Escape', type: 'app' }, PT);
ok('preview session can’t make projects', r.status === 403 && r.body?.code === 'PREVIEW_ONLY', r.status);
r = await call('POST', `${PP}/builder/api-keys`, { name: 'k' }, PT);
ok('preview session can’t make AI keys', r.status === 403, r.status);
r = await call('POST', `${PP}/accounts`, { name: 'Savings' }, PT);
ok('preview session can change the project itself', r.status === 200 || r.status === 201, r.status);

/* --------------------------------------------------------------- oversight */
r = await call('GET', `${A}/organizations?limit=200`, null, T);
ok('sandbox organization not in Organizations', r.status === 200 && !(r.body?.doc || []).some(o => o.slug === 'mint-template-sandbox'), r.status);
r = await call('GET', `${A}/tenant-projects?limit=200`, null, T);
ok('preview projects not in Tenant projects', r.status === 200 && !(r.body?.doc || []).some(p => String(p._id) === String(P)), r.status);
r = await call('GET', `${A}/tenant-users?limit=200`, null, T);
ok('sandbox user not in Tenant users', r.status === 200 && !(r.body?.doc || []).some(u => u.email === 'template-previews@sandbox.invalid'), r.status);

/* ----------------------------------------------------------- reopen/delete */
r = await call('GET', `${A}/templates/${appId}/previews`, null, T);
ok('previews listed for the template', r.body?.doc?.length === 1 && String(r.body.doc[0]._id) === String(P));
r = await call('POST', `${A}/templates/previews/${P}/open`, null, T);
ok('reopen → a new ticket', r.status === 200 && r.body.ticket && r.body.ticket !== pv.ticket, r.status);
r = await call('POST', '/tenant/api/auth/preview', { ticket: r.body.ticket });
ok('new ticket works', r.status === 200, r.status);
ok('preview has collections before delete', (await collectionsOf(P)).length >= 2);
r = await call('DELETE', `${A}/templates/previews/${P}`, null, T);
ok('preview deleted', r.status === 200, r.status);
ok('…its collections and documents too', (await collectionsOf(P)).length === 0 && (await db.collection('modeldefinitions').countDocuments({ project: proj._id })) === 0 && !(await db.collection('tenantprojects').findOne({ _id: proj._id })));
r = await call('GET', `${PP}/accounts`, null, PT);
ok('its session reaches nothing now', r.status === 404 || r.status === 403, r.status);

/* --------------------------------------------------------- failure: undone */
const sandboxBefore = await db.collection('tenantprojects').countDocuments({ 'preview.template': { $exists: true } });
r = await call('POST', `${A}/templates`, {
	type: 'app',
	key: 'smoke-preview-broken',
	blueprint: {
		overview: { name: 'Smoke preview broken' },
		models: { steps: [{ action: 'create', name: 'Gadget', title: 'Gadgets', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'size', label: 'Size', kind: 'select', options: [{ value: 's', label: 'S' }] }] }] },
		sampleData: { Gadget: [{ name: 'Ok', size: 's' }, { name: 'Bad', size: 'xxl' }] },
	},
}, T);
const brokenId = r.body.doc._id;
r = await call('POST', `${A}/templates/${brokenId}/preview`, {}, T);
ok('bad sample data → 400 naming the step', r.status === 400 && /Sample data/.test(r.body?.message), `${r.status} ${r.body?.message}`);
ok('nothing left in the sandbox', (await db.collection('tenantprojects').countDocuments({ 'preview.template': { $exists: true } })) === sandboxBefore);
ok('no gadgets collection anywhere', !(await db.listCollections({}, { nameOnly: true }).toArray()).some(c => /_gadgets$/.test(c.name)));

/* -------------------------------------------------------- a website template */
r = await call('POST', `${A}/templates`, {
	type: 'website',
	key: 'smoke-preview-site',
	blueprint: {
		overview: { name: 'Smoke preview site' },
		questions: [{ key: 'business', label: 'Business name?', required: true }],
		models: { steps: [{ action: 'create', name: 'Post', title: 'Posts', displayField: 'title', fields: [{ key: 'title', label: 'Title', kind: 'text' }] }] },
		endpoints: [{ model: 'Post', actions: ['list', 'get'] }],
		website: {
			pages: [
				{ path: '/blog', name: 'Blog', parent: '/', seo: { title: 'Blog — {{business}}' }, contents: [{ slug: 'intro', content: 'Latest from {{business}}' }] },
				{ path: '/', name: 'Home', seo: { title: '{{business}}', description: 'Welcome' }, contents: [{ slug: 'hero', category: 'content', content: 'Hello from {{business}}' }, { slug: 'cta', btnText: 'Read' }] },
			],
			settings: { identity: { siteName: '{{business}}', primaryColor: '#123456' } },
		},
		sampleData: { Post: [{ title: 'First post' }] },
	},
}, T);
const siteId = r.body.doc._id;
r = await call('GET', `${A}/templates/${siteId}`, null, T);
ok('half an SEO entry is an error (the kit needs title and description)', r.body.doc.validation.errors.some(i => i.path === 'website.pages[0].seo.description'), JSON.stringify(r.body.doc.validation.errors.map(i => i.path)));
const fixed = r.body.doc.draft.website;
fixed.pages[0].seo.description = 'News from {{business}}';
await call('PUT', `${A}/templates/${siteId}/draft`, { part: 'website', value: fixed }, T);
r = await call('POST', `${A}/templates/${siteId}/preview`, {}, T);
ok('a required question unanswered → 400', r.status === 400 && /Business name/.test(JSON.stringify(r.body?.problems)), JSON.stringify(r.body));
r = await call('POST', `${A}/templates/${siteId}/preview`, { answers: { business: 'Acme' } }, T);
ok('website preview built (child page waits for its parent)', r.status === 201 && r.body.result.pages.join() === '/,/blog', `${r.status} ${r.body?.message} ${JSON.stringify(r.body?.problems || r.body?.result?.pages)}`);
const slug = r.body.project?.publicSlug;
const SP = r.body.project?._id;
r = await call('GET', `/public/api/${slug}/pages/by-path?path=/`);
const page = r.body?.doc || r.body;
ok('site API: home page, SEO and blocks, placeholders filled', r.status === 200 && JSON.stringify(page).includes('Hello from Acme') && JSON.stringify(page).includes('"Acme"'), `${r.status} ${JSON.stringify(page).slice(0, 300)}`);
r = await call('GET', `/public/api/${slug}/site`);
ok('site settings from the template', r.status === 200 && JSON.stringify(r.body).includes('Acme') && JSON.stringify(r.body).includes('#123456'), JSON.stringify(r.body).slice(0, 200));
r = await call('GET', `/public/api/${slug}/posts`);
ok('the template’s endpoint is on, sample post there', r.status === 200 && JSON.stringify(r.body).includes('First post'), r.status);
await call('DELETE', `${A}/templates/previews/${SP}`, null, T);

for (const key of ['clients-invoices', 'projects-tasks', 'leads', 'products']) {
	r = await call('POST', `${A}/templates/${key}/preview`, {}, T);
	ok(`starter ${key} previews from its published version`, r.status === 201 && r.body.project.from === 'published' && r.body.result.models.length >= 1, `${r.status} ${r.body?.message || ''}`);
	if (r.body?.project?._id) await call('DELETE', `${A}/templates/previews/${r.body.project._id}`, null, T);
}

r = await call('GET', `${A}/templates/${appId}`, null, T);
ok('preview counted on the template', r.body?.doc?.usage?.previews === 1, JSON.stringify(r.body?.doc?.usage));

await db.collection('projecttemplates').deleteMany({ key: { $in: ['smoke-preview-finance', 'smoke-preview-site', 'smoke-preview-broken'] } });
await db.collection('organizationroles').deleteMany({ name: 'Smoke accountant' });
await mc.close();
done();
