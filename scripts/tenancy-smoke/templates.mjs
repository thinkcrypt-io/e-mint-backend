// Template Studio (docs/templates): T-02 — templates are blueprints only. Saving and
// validating builds nothing; the 4 code starters exist as published templates.
// Needs the admin account from seedTenancyDev.js and Mongo (SMOKE_MONGO) to count what exists.
import { call, ok, done, ROOT } from './lib.mjs';

const A = '/admin/api';
const PASS = 'tenancy-dev-pass-1';
const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
const uri = process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
const mc = await new MongoClient(uri).connect();
const db = mc.db();
const snapshot = async () => ({
	defs: await db.collection('modeldefinitions').countDocuments({}),
	collections: (await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name).sort().join(','),
	categories: await db.collection('sidebarcategories').countDocuments({}),
});
const before = await snapshot();

let r = await call('POST', `${A}/auth/login`, { email: 'admin@example.com', password: PASS });
ok('admin login', r.status === 200 && r.body?.token, r.status);
const T = r.body.token;

r = await call('GET', `${A}/templates`);
ok('no token → 401', r.status === 401, r.status);

/* ------------------------------------------------------------- starters */
r = await call('GET', `${A}/templates?type=app`, null, T);
const starters = (r.body?.doc || []).filter(d => d.source === 'starter');
ok('4 starters are published app templates', r.status === 200 && starters.length === 4 && starters.every(s => s.status === 'published' && s.version === 1), starters.map(s => s.key).join(','));
ok('lists carry no blueprints', (r.body?.doc || []).every(d => d.draft === undefined && d.published === undefined));
r = await call('GET', `${A}/templates/clients-invoices`, null, T);
ok('starter by key: models, sidebar, guide', r.status === 200 && r.body.doc.whatsInside.counts.models === 2 && r.body.doc.draft.sidebar.length === 1 && r.body.doc.draft.guide.steps.length === 3);
ok('starter passes the explanation gate', r.body?.doc?.validation?.canPublish === true, JSON.stringify([...(r.body?.doc?.validation?.errors || []), ...(r.body?.doc?.validation?.explain || [])].map(i => i.message)));
r = await call('GET', `${A}/builder/starters`, null, T);
ok('Get started reads the templates', r.status === 200 && r.body.doc.length === 4 && r.body.doc.find(s => s.key === 'clients-invoices')?.models?.join() === 'Clients,Invoices', JSON.stringify(r.body?.doc?.[0]));

r = await call('GET', `${A}/templates/meta`, null, T);
ok('meta: types and parts per type', r.status === 200 && r.body.types.join() === 'app,api,website' && r.body.partsByType.website.includes('website') && !r.body.partsByType.app.includes('webhooks'));

/* ------------------------------------------------------- an app template */
r = await call('POST', `${A}/templates`, { type: 'nope', name: 'X' }, T);
ok('unknown type refused', r.status === 400 && /app, api, website/.test(r.body?.message), r.body?.message);
r = await call('POST', `${A}/templates`, { type: 'app', name: 'Smoke finance', category: 'Finance' }, T);
ok('create a draft', r.status === 201 && r.body.doc.status === 'draft' && r.body.doc.key === 'smoke-finance' && r.body.doc.version === 0, r.status);
const id = r.body.doc._id;
let v = r.body.doc.validation;
ok('empty template: “no models” error with a fix', !v.ok && v.errors.some(i => i.part === 'models' && i.fix));
ok('empty template: summary, description, audience, guide to explain', ['overview.summary', 'overview.description', 'overview.audience', 'guide.steps'].every(p => v.explain.some(i => i.path === p)));

const account = { action: 'create', name: 'Account', title: 'Accounts', rationale: 'Where money sits.', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'currency', label: 'Currency', kind: 'text', default: '{{currency}}' }] };
const txn = { action: 'create', name: 'Transaction', title: 'Transactions', rationale: 'Money in and out.', displayField: 'title', fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }, { key: 'account', label: 'Account', kind: 'reference', ref: 'Nope' }, { key: 'amount', label: 'Amount', kind: 'number' }] };
const draft = (part, value) => call('PUT', `${A}/templates/${id}/draft`, { part, value }, T);

r = await draft('models', { steps: [account, txn] });
v = r.body?.doc?.validation;
ok('save models (draft)', r.status === 200 && r.body.doc.whatsInside.counts.models === 2, r.status);
ok('broken link → error naming the model, with a fix', v && v.errors.some(i => i.part === 'models' && /Nope/.test(i.message) && i.fix), JSON.stringify(v?.errors?.map(i => i.message)));
ok('{{currency}} without a question → error', v.errors.some(i => /\{\{currency\}\}/.test(i.message)));
ok('models without descriptions → explain', v.explain.filter(i => i.part === 'models').length === 2);
ok('fields without help text → warning', v.warnings.some(i => /help text/.test(i.message)));

txn.fields[1].ref = 'Account';
account.description = 'The bank accounts and wallets you track.';
txn.description = 'Every payment in or out of an account.';
await draft('models', { steps: [account, txn] });
await draft('questions', [{ key: 'currency', label: 'Which currency do you work in?', kind: 'currency', default: 'USD', required: true }]);
await draft('overview', { name: 'Smoke finance', summary: 'Accounts and transactions.', description: 'Track money in and out.', audience: 'Small teams.', category: 'Finance' });
await draft('sidebar', [{ name: 'Money', items: ['Account', 'transactions', 'Ghost'] }]);
r = await draft('dashboard', [{ type: 'stat', route: 'Transaction', title: 'Total in', metric: 'sum', field: 'amount' }, { type: 'chart', route: 'Account', group: 'field' }]);
v = r.body.doc.validation;
ok('sidebar item to an unknown model → error', v.errors.some(i => i.part === 'sidebar' && /Ghost/.test(i.message)));
ok('dashboard: model by name, widget checked like the builder', v.errors.some(i => i.part === 'dashboard' && /break it down/.test(i.message)) && !v.errors.some(i => i.path === 'dashboard[0]'));
await draft('sidebar', [{ name: 'Money', items: ['Account', 'transactions'] }]);
await draft('dashboard', [{ type: 'stat', route: 'Transaction', title: 'Total in', metric: 'sum', field: 'amount' }]);
r = await draft('roles', [{ name: 'Accountant', description: 'Keeps the books.', permissions: ['records:view', 'records:edit', 'fly'] }]);
ok('role with an unknown permission → error listing the real ones', r.body.doc.validation.errors.some(i => i.part === 'roles' && /fly/.test(i.message) && /records:view/.test(i.fix)));
await draft('roles', [{ name: 'Accountant', description: 'Keeps the books.', permissions: ['records:view', 'records:edit'] }]);
r = await draft('guide', { steps: [{ title: 'Add your accounts', body: 'One per bank account or wallet.', page: 'Account' }] });
v = r.body.doc.validation;
ok('fixed: no errors, nothing to explain → can publish', v.ok && v.canPublish, JSON.stringify([...v.errors, ...v.explain].map(i => i.message)));
ok('models planned as they will be built', v.models.map(m => `${m.name}/${m.route}`).join() === 'Account/accounts,Transaction/transactions', v.models.map(m => m.name).join());

r = await draft('models', { steps: [account, txn, { action: 'update', model: 'Account', addFields: [{ key: 'iban', label: 'IBAN', kind: 'text' }] }] });
ok('update step → error (templates start empty)', r.body.doc.validation.errors.some(i => /empty project/.test(i.message)));
r = await draft('webhooks', [{ model: 'Account', events: ['create'] }]);
ok('a part the type lacks → 400', r.status === 400 && /webhooks part/.test(r.body?.message), r.body?.message);

// More models than one feature may have: a template checks them as one plan.
const many = Array.from({ length: 14 }, (_, i) => ({ action: 'create', name: `Thing${String.fromCharCode(65 + i)}`, title: `Things ${String.fromCharCode(65 + i)}`, description: 'x', rationale: 'x', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', helper: 'x' }] }));
r = await draft('models', { steps: many });
ok('14 models validate as one plan (over the feature limit of 12)', r.body.doc.validation.models.length === 14 && !r.body.doc.validation.errors.some(i => i.part === 'models'), JSON.stringify(r.body.doc.validation.errors.map(i => i.message)));

/* --------------------------------------------------- a website template */
r = await call('POST', `${A}/templates`, { type: 'website', name: 'Smoke blog', summary: 'A blog.' }, T);
const wid = r.body.doc._id;
const wdraft = (part, value) => call('PUT', `${A}/templates/${wid}/draft`, { part, value }, T);
r = await wdraft('models', { steps: [{ action: 'create', name: 'Post', title: 'Posts', description: 'Articles.', rationale: 'The blog.', displayField: 'title', fields: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'page', label: 'Page', kind: 'reference', ref: 'WebPage' }] }] });
v = r.body.doc.validation;
ok('website: models may link to the kit', !v.errors.some(i => i.part === 'models') && v.models.some(m => m.kit && m.route === 'pages'), JSON.stringify(v.errors.map(i => i.message)));
r = await wdraft('website', { pages: [{ path: '/', name: 'Home', contents: [{ slug: 'hero', category: 'content' }, { slug: 'hero' }] }, { path: '/', name: 'Again' }, { path: 'blog', name: 'Blog', parent: '/nowhere' }], starter: { repoUrl: 'git@github.com:x/y' } });
v = r.body.doc.validation;
ok('website: duplicate path, bad path, duplicate block, missing parent, repo link', ['Two pages', 'isn’t a path', 'Two blocks', 'isn’t a page here', 'https'].every(t => v.errors.some(i => i.part === 'website' && i.message.includes(t))), JSON.stringify(v.errors.map(i => i.message)));
r = await wdraft('endpoints', [{ model: 'Post', actions: ['list', 'get'], note: 'The blog list.' }, { model: 'pages', actions: ['delete'], auth: 'none', ownerOnly: true }]);
v = r.body.doc.validation;
ok('endpoints: owner-only needs customers; kit models allowed', v.errors.some(i => i.part === 'endpoints' && /signed-in customers/.test(i.message)) && !v.errors.some(i => i.path === 'endpoints[0]'));
r = await wdraft('endpoints', [{ model: 'Post', actions: ['create'], note: 'A contact form.' }, { model: 'pages', actions: ['list', 'create'], note: 'Open guestbook.' }]);
v = r.body.doc.validation;
ok('endpoints: create-only (a form) is no warning; open create + list is', !v.warnings.some(i => i.path === 'endpoints[0]') && v.warnings.some(i => i.path === 'endpoints[1]'), JSON.stringify(v.warnings.map(i => i.path)));

r = await wdraft('models', { steps: [{ action: 'create', name: 'Project', title: 'Projects', description: 'x', rationale: 'x', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', helper: 'x' }] }] });
ok('a model whose route is taken (projects) warns where it will really be', r.body.doc.validation.warnings.some(i => /will be at \/projects\d/.test(i.message)), JSON.stringify(r.body.doc.validation.warnings.map(i => i.message)));
r = await wdraft('models', { steps: [{ action: 'create', name: 'Project', route: 'work', title: 'Projects', description: 'x', rationale: 'x', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', helper: 'x' }] }] });
ok('…and a route of its own clears it', !r.body.doc.validation.warnings.some(i => /will be at/.test(i.message)) && r.body.doc.validation.models.some(m => m.route === 'work'));

/* ------------------------------------- sample data checked like the build */
r = await wdraft('models', {
	steps: [
		{ action: 'create', name: 'Topic', title: 'Topics', description: 'x', rationale: 'x', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true, helper: 'x' }] },
		{
			action: 'create', name: 'Post', title: 'Posts', description: 'x', rationale: 'x', displayField: 'title',
			fields: [
				{ key: 'title', label: 'Title', kind: 'text', required: true, helper: 'x' },
				{ key: 'status', label: 'Status', kind: 'select', helper: 'x', options: [{ value: 'draft', label: 'Draft' }, { value: 'live', label: 'Live' }] },
				{ key: 'words', label: 'Words', kind: 'number', helper: 'x' },
				{ key: 'on', label: 'On', kind: 'date', helper: 'x' },
				{ key: 'topic', label: 'Topic', kind: 'reference', ref: 'Topic', helper: 'x' },
			],
		},
	],
});
r = await wdraft('sampleData', {
	Topic: [{ name: 'Guides' }],
	Post: [
		{ title: 'Fine', status: 'live', words: 900, on: 'now-12d', topic: 'guides' },
		{ status: 'published', words: 'many', on: 'last week', topic: 'News' },
	],
});
v = r.body.doc.validation;
const sampleErr = v.errors.find(i => i.path === 'sampleData.Post')?.message || '';
ok(
	'sample data: missing required, unknown choice, not a number, not a date, link to nothing — caught; relative dates and case-insensitive links pass',
	['has no Title', '“published” isn’t one of', '“many” isn’t a number', '“last week” isn’t a date', '“News”'].every(t => sampleErr.includes(t)) && !sampleErr.includes('record 1') && !v.errors.some(i => i.path === 'sampleData.Topic'),
	sampleErr
);
r = await call('POST', `${A}/templates`, { type: 'api', name: 'Smoke hooks', summary: 'An API.' }, T);
const hid = r.body.doc._id;
const hdraft = (part, value) => call('PUT', `${A}/templates/${hid}/draft`, { part, value }, T);
await hdraft('models', { steps: [{ action: 'create', name: 'Order', title: 'Orders', description: 'x', rationale: 'x', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', helper: 'x' }] }] });
await hdraft('webhooks', [{ model: 'Order', events: ['create'], url: '{{hookUrl}}', note: 'x' }]);
r = await hdraft('questions', [{ key: 'hookUrl', label: 'Where should orders be sent?', kind: 'url', required: false }]);
ok('an optional address used only by a webhook is no warning (skipping it switches the webhook off)', !r.body.doc.validation.warnings.some(i => i.part === 'questions'), JSON.stringify(r.body.doc.validation.warnings.map(i => i.message)));

/* --------------------------------------------------------- nothing built */
const after = await snapshot();
ok('no model definitions created', after.defs === before.defs, `${before.defs} → ${after.defs}`);
ok('no collections created', after.collections === before.collections);
ok('no sidebar categories created', after.categories === before.categories);
ok('dry scope never written', (await db.collection('modeldefinitions').countDocuments({ project: new ObjectId('00000000000000000000d0a2') })) === 0);

await db.collection('projecttemplates').deleteMany({ key: { $in: ['smoke-finance', 'smoke-blog', 'smoke-hooks'] } });
await mc.close();
done();
