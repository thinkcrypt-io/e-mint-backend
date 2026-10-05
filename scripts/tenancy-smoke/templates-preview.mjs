// Template Studio (docs/templates) T-03 + T-04: a template built into a sandbox preview
// (models, sidebar, dashboard, roles, public API, placeholders, sample data, website pages
// and settings, setup checklist), opened with a single-use ticket, kept out of the
// oversight tables, confined to the project, and removed completely; a failing build
// leaves nothing behind. T-08: a sidebar, 4 widgets and 2 roles shaped as the studio
// saves them land in the preview.
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
await db.collection('projecttemplates').deleteMany({ key: { $in: ['smoke-preview-finance', 'smoke-preview-site', 'smoke-preview-broken', 'smoke-preview-books'] } });
// Left behind if an earlier run stopped half-way (the sandbox organization outlives its previews).
await db.collection('organizationroles').deleteMany({ name: { $in: ['Smoke accountant', 'Smoke bookkeeper', 'Smoke auditor'] } });

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
		// Two records with one unique name: the checks before the build can't see it, so the build itself fails and is undone.
		models: { steps: [{ action: 'create', name: 'Gadget', title: 'Gadgets', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true, unique: true }, { key: 'size', label: 'Size', kind: 'select', options: [{ value: 's', label: 'S' }] }] }] },
		sampleData: { Gadget: [{ name: 'Twin', size: 's' }, { name: 'Twin', size: 's' }] },
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

/* ---------------------- T-10: a blog website, as the studio's website tabs save it */
await db.collection('projecttemplates').deleteMany({ key: 'smoke-preview-blog' });
r = await call('POST', `${A}/templates`, {
	type: 'website',
	key: 'smoke-preview-blog',
	blueprint: {
		overview: { name: 'Smoke preview blog' },
		questions: [{ key: 'blog', label: 'Blog name?', default: 'Field notes' }],
		models: { steps: [{ action: 'create', name: 'Post', title: 'Posts', displayField: 'title', fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }] }] },
		endpoints: [{ model: 'Post', actions: ['list', 'get'], note: 'The blog list' }],
		website: {
			pages: [
				{ path: '/', name: 'Home', template: 'home', priority: 0, seo: { title: '{{blog}}', description: 'Notes from the field.', keywords: ['notes', 'field'] }, contents: [
					{ slug: 'hero', category: 'content', name: 'Hero', content: 'Welcome to {{blog}}', subContent: 'Short reads', btnText: 'Read', url: '/blog' },
					{ slug: 'topics', category: 'list', name: 'Topics', list: ['Birds', 'Weather'] },
					{ slug: 'authors', category: 'card', name: 'Authors', card: [{ title: 'Ada', subTitle: 'Editor', description: 'Writes most of it' }] },
				] },
				{ path: '/blog', name: 'Blog', parent: '/', priority: 1, seo: { title: 'Blog — {{blog}}', description: 'Every post.' }, contents: [{ slug: 'intro', category: 'rich-content', name: 'Intro', richContent: '<p>All the posts</p>' }] },
				{ path: '/blog/archive', name: 'Archive', parent: '/blog', status: 'draft', showInMenu: false, priority: 2, seo: { title: 'Archive', description: 'Old posts.', noIndex: true }, contents: [] },
			],
			settings: {
				identity: { siteName: '{{blog}}', tagline: 'Short reads', primaryColor: '#0f766e' },
				contact: { email: 'hello@example.com' },
				social: { instagram: 'https://instagram.com/fieldnotes' },
				seo: { titleTemplate: '%s · {{blog}}', metaDescription: 'Notes from the field.' },
			},
			starter: { repoUrl: 'https://github.com/example/blog-starter', framework: 'Next.js', deployUrl: 'https://vercel.com/new/clone?repository-url=https://github.com/example/blog-starter', env: [{ key: 'NEXT_PUBLIC_API', value: '{{api}}' }, { key: 'NEXT_PUBLIC_SLUG', value: '{{slug}}' }] },
		},
	},
}, T);
ok('T-10 blog template: no errors', r.status === 201 && !r.body.doc.validation.errors.length, JSON.stringify(r.body?.doc?.validation?.errors));
const blogId = r.body.doc._id;
r = await call('PUT', `${A}/templates/${blogId}/draft`, { part: 'website', value: { ...r.body.doc.draft.website, starter: { repoUrl: 'https://github.com/x/y', env: [{ key: 'bad key', value: '' }, { key: 'A', value: 'x' }, { key: 'A', value: 'y' }] } } }, T);
ok('T-10 starter env: bad names and duplicates are errors, empty values warnings', ['website.starter.env[0].key', 'website.starter.env[2].key'].every(p => r.body.doc.validation.errors.some(e => e.path === p)) && r.body.doc.validation.warnings.some(w => w.path === 'website.starter.env[0].value'), JSON.stringify(r.body.doc.validation.errors.map(e => e.path)));
r = await call('GET', `${A}/templates/${blogId}`, null, T);
const draftSite = r.body.doc.draft.website;
await call('PUT', `${A}/templates/${blogId}/draft`, { part: 'website', value: { ...draftSite, starter: { repoUrl: 'https://github.com/example/blog-starter', framework: 'Next.js', deployUrl: 'https://vercel.com/new/clone?repository-url=https://github.com/example/blog-starter', env: [{ key: 'NEXT_PUBLIC_API', value: '{{api}}' }, { key: 'NEXT_PUBLIC_SLUG', value: '{{slug}}' }] } } }, T);
r = await call('POST', `${A}/templates/${blogId}/preview`, {}, T);
ok('T-10 blog previews: three pages, parents first', r.status === 201 && r.body.result.pages.join() === '/,/blog,/blog/archive', `${r.status} ${r.body?.message} ${JSON.stringify(r.body?.result?.pages)}`);
const bslug = r.body.project?.publicSlug;
const BPID = r.body.project?._id;
const BTOK = (await call('POST', '/tenant/api/auth/preview', { ticket: r.body.ticket })).body.token;
r = await call('GET', `/public/api/${bslug}/pages/by-path?path=/`);
const home = JSON.stringify(r.body);
ok('T-10 site API: home with its blocks — content, list, cards — filled', r.status === 200 && home.includes('Welcome to Field notes') && home.includes('Weather') && home.includes('Writes most of it') && home.includes('notes'), home.slice(0, 300));
r = await call('GET', `/public/api/${bslug}/pages/by-path?path=/blog`);
ok('T-10 site API: the blog page, rich content, its SEO', r.status === 200 && JSON.stringify(r.body).includes('All the posts') && JSON.stringify(r.body).includes('Blog — Field notes'), JSON.stringify(r.body).slice(0, 300));
r = await call('GET', `/public/api/${bslug}/pages/by-path?path=/blog/archive`);
ok('T-10 a draft page isn’t served', r.status === 404, r.status);
r = await call('GET', `/public/api/${bslug}/site`);
const site = JSON.stringify(r.body);
ok('T-10 site settings: name, colour, contact, social, SEO defaults', r.status === 200 && ['Field notes', '#0f766e', 'hello@example.com', 'instagram.com/fieldnotes', '%s · Field notes'].every(x => site.includes(x)), site.slice(0, 400));
r = await call('GET', `/tenant/api/p/${BPID}`, null, BTOK);
ok('T-10 starter code kept on the project, {{api}} and {{slug}} filled', r.body?.starter?.repoUrl === 'https://github.com/example/blog-starter' && r.body.starter.env[0].value.endsWith(`/public/api/${bslug}`) && r.body.starter.env[1].value === bslug, JSON.stringify(r.body?.starter));
await call('DELETE', `${A}/templates/previews/${BPID}`, null, T);
await db.collection('projecttemplates').deleteMany({ key: 'smoke-preview-blog' });

for (const key of ['clients-invoices', 'projects-tasks', 'leads', 'products']) {
	r = await call('POST', `${A}/templates/${key}/preview`, {}, T);
	ok(`starter ${key} previews from its published version`, r.status === 201 && r.body.project.from === 'published' && r.body.result.models.length >= 1, `${r.status} ${r.body?.message || ''}`);
	if (r.body?.project?._id) await call('DELETE', `${A}/templates/previews/${r.body.project._id}`, null, T);
}

r = await call('GET', `${A}/templates/${appId}`, null, T);
ok('preview counted on the template', r.body?.doc?.usage?.previews === 1, JSON.stringify(r.body?.doc?.usage));

/* ------------------------------- T-08: sidebar, dashboard and roles as the studio saves them */
r = await call('POST', `${A}/templates`, {
	type: 'app',
	key: 'smoke-preview-books',
	blueprint: {
		overview: { name: 'Smoke preview books' },
		models: {
			steps: [
				{ action: 'create', name: 'Account', title: 'Accounts', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] },
				{ action: 'create', name: 'Entry', title: 'Entries', displayField: 'note', fields: [{ key: 'note', label: 'Note', kind: 'text', required: true }, { key: 'amount', label: 'Amount', kind: 'number' }, { key: 'kind', label: 'Kind', kind: 'select', options: [{ value: 'in', label: 'In' }, { value: 'out', label: 'Out' }] }, { key: 'account', label: 'Account', kind: 'reference', ref: 'Account' }] },
				{ action: 'create', name: 'Budget', title: 'Budgets', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] },
			],
		},
		sidebar: [
			{ name: 'Books', icon: 'book-open', description: 'Day to day', items: [{ model: 'Entry', label: 'Ledger' }, { model: 'Account', label: '' }] },
			{ name: 'Planning', icon: 'target', description: '', items: [{ model: 'Budget', label: '' }] },
		],
		dashboard: [
			{ id: 'w1', type: 'stat', route: 'Entry', title: 'Money in', size: 'sm', metric: 'sum', field: 'amount', range: 'month', dateField: 'createdAt', prefix: '$', filters: [{ field: 'kind', op: 'eq', value: 'in' }] },
			{ id: 'w2', type: 'chart', route: 'Entry', title: 'By kind', size: 'md', metric: 'sum', field: 'amount', range: '30d', dateField: 'createdAt', group: 'field', by: 'kind', chart: 'bar', limit: 6 },
			{ id: 'w3', type: 'chart', route: 'Entry', title: 'Per week', size: 'lg', metric: 'count', range: '90d', dateField: 'createdAt', group: 'time', interval: 'week', chart: 'line' },
			{ id: 'w4', type: 'recent', route: 'Account', title: 'New accounts', size: 'full', columns: ['name'], limit: 5, sort: '-createdAt' },
		],
		roles: [
			{ name: 'Smoke bookkeeper', description: 'Records entries.', permissions: ['records:view', 'records:create', 'records:edit'] },
			{ name: 'Smoke auditor', description: 'Reads everything.', permissions: ['records:view'] },
		],
	},
}, T);
ok('T-08 books template created, no errors', r.status === 201 && !r.body.doc.validation.errors.length, `${r.status} ${JSON.stringify(r.body?.doc?.validation?.errors)}`);
const booksId = r.body.doc._id;
r = await call('POST', `${A}/templates/${booksId}/preview`, {}, T);
ok('T-08 books preview built', r.status === 201 && r.body.result.widgets === 4 && r.body.result.categories.join() === 'Books,Planning' && r.body.result.roles.created.join() === 'Smoke bookkeeper,Smoke auditor', `${r.status} ${r.body?.message} ${JSON.stringify(r.body?.result)}`);
const BP = `/tenant/api/p/${r.body.project?._id}`;
const BT = (await call('POST', '/tenant/api/auth/preview', { ticket: r.body.ticket })).body.token;
r = await call('GET', `${BP}/sidebar/admin/server`, null, BT);
const nav = JSON.stringify(r.body || []);
ok('T-08 sidebar: both sections, label kept, pages in order', ['Books', 'Planning', 'Ledger'].every(s => nav.includes(s)) && nav.indexOf('Ledger') < nav.indexOf('Accounts') && nav.indexOf('Books') < nav.indexOf('Planning'), nav.slice(0, 400));
r = await call('GET', `${BP}/dashboard`, null, BT);
const ws = r.body?.widgets || [];
ok('T-08 dashboard: 4 widgets on the built routes, in order, with their settings', ws.map(w => `${w.type}:${w.route}:${w.size}`).join() === 'stat:entries:sm,chart:entries:md,chart:entries:lg,recent:accounts:full' && ws[0].prefix === '$' && ws[0].filters?.[0]?.value === 'in' && ws[1].by === 'kind' && ws[2].interval === 'week' && ws[3].columns?.join() === 'name', JSON.stringify(ws));
const roles = await db.collection('organizationroles').find({ name: { $in: ['Smoke bookkeeper', 'Smoke auditor'] } }).toArray();
ok('T-08 roles: both in the organization with their permissions', roles.length === 2 && roles.find(x => x.name === 'Smoke bookkeeper')?.permissions?.join() === 'records:view,records:create,records:edit' && roles.find(x => x.name === 'Smoke auditor')?.description === 'Reads everything.', JSON.stringify(roles.map(x => [x.name, x.permissions])));
await call('DELETE', `${A}/templates/previews/${BP.split('/').pop()}`, null, T);

/* --------------------- read-only fields: endpoints[].readOnly, never written by the public API */
await db.collection('projecttemplates').deleteMany({ key: 'smoke-preview-shop' });
const shopEndpoint = { model: 'Order', actions: ['create', 'get', 'update'], auth: 'customer', ownerOnly: true, note: 'Checkout' };
r = await call('POST', `${A}/templates`, {
	type: 'api',
	key: 'smoke-preview-shop',
	blueprint: {
		overview: { name: 'Smoke preview shop' },
		models: {
			steps: [
				{ action: 'create', name: 'Order', title: 'Orders', displayField: 'item', fields: [
					{ key: 'item', label: 'Item', kind: 'text', required: true },
					{ key: 'status', label: 'Status', kind: 'select', required: true, default: 'pending', options: [{ value: 'pending', label: 'Pending' }, { value: 'paid', label: 'Paid' }] },
					{ key: 'paymentReference', label: 'Payment reference', kind: 'text' },
				] },
			],
		},
		endpoints: [{ ...shopEndpoint, readOnly: ['status', 'nope', 'item'] }],
	},
}, T);
const shopId = r.body?.doc?._id;
const roErrors = (r.body?.doc?.validation?.errors || []).filter(i => i.path === 'endpoints[0].readOnly').map(i => i.message);
ok('readOnly: unknown field is an error', r.status === 201 && roErrors.some(m => /“nope” isn’t a field/.test(m)), `${r.status} ${JSON.stringify(roErrors)}`);
r = await call('PUT', `${A}/templates/${shopId}/draft`, { part: 'endpoints', value: [{ ...shopEndpoint, readOnly: ['item'] }] }, T);
const roErrors2 = (r.body?.doc?.validation?.errors || []).filter(i => i.path === 'endpoints[0].readOnly').map(i => i.message);
ok('readOnly: required field with no default is an error when create is open', roErrors2.some(m => /no default/.test(m)), `${r.status} ${JSON.stringify(roErrors2)}`);
r = await call('PUT', `${A}/templates/${shopId}/draft`, { part: 'endpoints', value: [{ ...shopEndpoint, readOnly: ['status', 'paymentReference', 'status'] }] }, T);
ok('readOnly: status + payment reference, no errors (duplicates dropped)', r.status === 200 && !(r.body?.doc?.validation?.errors || []).some(i => i.part === 'endpoints') && r.body?.doc?.draft?.endpoints?.[0]?.readOnly?.join() === 'status,paymentReference', `${r.status} ${JSON.stringify(r.body?.doc?.validation?.errors)} ${JSON.stringify(r.body?.doc?.draft?.endpoints)}`);
r = await call('POST', `${A}/templates/${shopId}/preview`, {}, T);
ok('shop preview built', r.status === 201 && r.body.result.endpoints.join() === 'orders', `${r.status} ${r.body?.message} ${JSON.stringify(r.body?.result)}`);
const SHOP = r.body?.project;
const def = await db.collection('modeldefinitions').findOne({ project: new (await import('../../node_modules/mongodb/lib/index.js')).ObjectId(SHOP?._id), route: 'orders' });
ok('the built model’s public API has the read-only fields', def?.publicApi?.readOnlyFields?.join() === 'status,paymentReference', JSON.stringify(def?.publicApi));
const spub = (path, init = {}) => call(init.method || 'GET', `/public/api/${SHOP?.publicSlug}/${path}`, init.body, init.token);
r = await spub('auth/register', { method: 'POST', body: { name: 'Shopper', email: `shopper${Date.now()}@example.com`, password: 'customer-pass-1' } });
const shopper = `Bearer ${r.body?.token}`;
r = await spub('orders', { method: 'POST', body: { item: 'Mug', status: 'paid', paymentReference: 'FAKE' }, token: shopper });
ok('customer creating an order with status "paid" gets the default status', r.status === 201 && r.body?.status === 'pending' && !r.body?.paymentReference, `${r.status} ${JSON.stringify(r.body)}`);
r = await spub(`orders/${r.body?._id}`, { method: 'PUT', body: { status: 'paid', item: 'Big mug' }, token: shopper });
ok('…and can’t update it to "paid" either', r.status === 200 && r.body?.status === 'pending' && r.body?.item === 'Big mug', `${r.status} ${JSON.stringify(r.body)}`);
if (SHOP?._id) await call('DELETE', `${A}/templates/previews/${SHOP._id}`, null, T);

await db.collection('projecttemplates').deleteMany({ key: { $in: ['smoke-preview-finance', 'smoke-preview-site', 'smoke-preview-broken', 'smoke-preview-books', 'smoke-preview-shop'] } });
await db.collection('organizationroles').deleteMany({ name: { $in: ['Smoke accountant', 'Smoke bookkeeper', 'Smoke auditor'] } });
await mc.close();
done();
