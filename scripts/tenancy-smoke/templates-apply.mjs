// Template Studio T-14: a tenant starts a new app, API or website from a
// published template — the list matches the project's kind, questions are asked,
// the build runs in the background with the full engine, and it only goes into a
// new, empty project once.
import { call, ok, done } from './lib.mjs';

const A = '/admin/api';
const { MongoClient } = await import('../../node_modules/mongodb/lib/index.js');
const uri = process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
const mc = await new MongoClient(uri).connect();
const db = mc.db();
const KEY = 'smoke-apply-site';

let r = await call('POST', `${A}/auth/login`, { email: 'admin@example.com', password: 'tenancy-dev-pass-1' });
const AT = r.body.token;
await db.collection('projecttemplates').deleteMany({ key: { $in: [KEY, 'smoke-apply-hidden', 'smoke-apply-app'] } });
await db.collection('organizationroles').deleteMany({ name: 'Smoke apply clerk' });

r = await call('POST', `${A}/templates`, {
	type: 'website',
	key: KEY,
	blueprint: {
		overview: { name: 'Smoke apply site', summary: 'A small site.' },
		questions: [{ key: 'business', label: 'Business name?', required: true }],
		models: { steps: [{ action: 'create', name: 'Post', title: 'Posts', displayField: 'title', fields: [{ key: 'title', label: 'Title', kind: 'text' }] }] },
		endpoints: [{ model: 'Post', actions: ['list', 'get'] }],
		website: {
			pages: [{ path: '/', name: 'Home', seo: { title: '{{business}}', description: 'Welcome' }, contents: [{ slug: 'hero', category: 'content', content: 'Hello from {{business}}' }] }],
			settings: { identity: { siteName: '{{business}}', primaryColor: '#123456' } },
		},
		sampleData: { Post: [{ title: 'First post' }] },
	},
}, AT);
ok('a website template', r.status === 201, `${r.status} ${r.body?.message}`);
// Published straight in the database — the publish gate has its own suite (templates-manage).
const draft = (await db.collection('projecttemplates').findOne({ key: KEY })).draft;
await db.collection('projecttemplates').updateOne({ key: KEY }, { $set: { status: 'published', published: draft, version: 1, changed: false } });
await db.collection('projecttemplates').insertOne({ key: 'smoke-apply-hidden', name: 'Hidden', type: 'website', status: 'published', visibility: 'organizations', organizations: [], published: draft, version: 1 });

/* ------------------------------------------------------------- the tenant */
const stamp = Date.now();
r = await call('POST', '/tenant/api/auth/register', { name: 'Tess Templates', email: `tess${stamp}@example.com`, password: 'tenant-pass-123', organization: `Tess ${stamp}`, country: 'BD' });
const T = r.body.token;
r = await call('POST', '/tenant/api/projects', { name: 'Tess site', type: 'website' }, T);
const site = r.body;
r = await call('POST', '/tenant/api/projects', { name: 'Tess app', type: 'app' }, T);
const app = r.body;
const P = (pid, path = '') => `/tenant/api/p/${pid}/templates${path}`;

r = await call('GET', P(site._id), null, T);
const mine = r.body?.doc?.find(t => t.key === KEY);
ok('a website lists published website templates, with what’s inside and its questions', r.status === 200 && mine && mine.inside.pages.join() === 'Home' && mine.inside.models.join() === 'Posts' && mine.questions[0]?.key === 'business', JSON.stringify(mine || r.body));
ok('…only website ones, and not those kept for other organizations', r.body.doc.every(t => t.key !== 'smoke-apply-hidden'), r.body.doc.map(t => t.key).join());
r = await call('GET', P(app._id), null, T);
ok('an app doesn’t list website templates', r.status === 200 && !r.body.doc.some(t => t.key === KEY), r.body.doc.map(t => t.key).join());
r = await call('POST', P(app._id, `/${KEY}/apply`), {}, T);
ok('…nor apply one', r.status === 404, `${r.status} ${r.body?.message}`);

r = await call('GET', P(site._id, '/applying'), null, T);
ok('nothing applying yet', r.status === 200 && r.body.status === null, JSON.stringify(r.body));

const poll = async pid => {
	for (let i = 0; i < 60; i++) {
		const s = await call('GET', P(pid, '/applying'), null, T);
		if (s.body.status !== 'building') return s.body;
		await new Promise(res => setTimeout(res, 500));
	}
	return { status: 'timeout' };
};

r = await call('POST', P(site._id, `/${KEY}/apply`), {}, T);
ok('apply starts in the background (202)', r.status === 202 && r.body.status === 'building', `${r.status} ${JSON.stringify(r.body)}`);
let s = await poll(site._id);
ok('a required question unanswered → failed, saying which', s.status === 'failed' && /Business name/.test(JSON.stringify(s.problems)), JSON.stringify(s));

r = await call('POST', P(site._id, `/${KEY}/apply`), { answers: { business: 'Tess Bakes' } }, T);
ok('answered → building', r.status === 202, `${r.status} ${r.body?.message}`);
r = await call('POST', P(site._id, `/${KEY}/apply`), { answers: { business: 'Tess Bakes' } }, T);
ok('a second apply while one runs → 409 (or already done)', r.status === 409 || r.status === 400, `${r.status} ${r.body?.message}`);
s = await poll(site._id);
ok('built: models, pages and sample records', s.status === 'ready' && s.result.models.map(m => m.route).join() === 'posts' && s.result.pages.join() === '/' && s.result.records.posts === 1, JSON.stringify(s));

r = await call('GET', `/public/api/${site.publicSlug}/pages/by-path?path=/`);
const page = r.body?.doc || r.body;
ok('the home page answers on the public API, the answer filled in', r.status === 200 && JSON.stringify(page).includes('Tess Bakes'), `${r.status} ${JSON.stringify(page).slice(0, 200)}`);
r = await call('GET', `/public/api/${site.publicSlug}/posts`);
ok('…and the template’s public endpoint works', r.status === 200 && r.body.doc?.[0]?.title === 'First post', `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
const used = await db.collection('projecttemplates').findOne({ key: KEY });
ok('counted as a use', used.usage?.applied === 1, JSON.stringify(used.usage));

r = await call('POST', P(site._id, `/${KEY}/apply`), { answers: { business: 'Again' } }, T);
ok('only once per project', r.status === 400 && /already made from a template/.test(r.body?.message), `${r.status} ${r.body?.message}`);

r = await call('GET', P(site._id));
ok('needs a sign-in', r.status === 401, r.status);

/* ------------------------------------------- an app gets the whole build too */
r = await call('POST', `${A}/templates`, {
	type: 'app',
	key: 'smoke-apply-app',
	blueprint: {
		overview: { name: 'Smoke apply app', summary: 'Jobs and clients.' },
		models: {
			steps: [
				{ action: 'create', name: 'Client', title: 'Clients', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] },
				{ action: 'create', name: 'Job', title: 'Jobs', displayField: 'title', fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }, { key: 'client', label: 'Client', kind: 'reference', ref: 'Client' }, { key: 'fee', label: 'Fee', kind: 'number' }] },
			],
		},
		sidebar: [{ name: 'Work', icon: 'briefcase', items: ['Job', 'Client'] }],
		dashboard: [{ type: 'stat', route: 'Job', title: 'Fees', metric: 'sum', field: 'fee' }],
		roles: [{ name: 'Smoke apply clerk', description: 'Keeps the jobs.', permissions: ['records:view', 'records:edit'] }],
		sampleData: { Client: [{ name: 'Acme' }], Job: [{ title: 'Audit', client: 'Acme', fee: 500 }] },
	},
}, AT);
ok('an app template', r.status === 201, `${r.status} ${r.body?.message}`);
const appDraft = (await db.collection('projecttemplates').findOne({ key: 'smoke-apply-app' })).draft;
await db.collection('projecttemplates').updateOne({ key: 'smoke-apply-app' }, { $set: { status: 'published', published: appDraft, version: 1, changed: false } });
r = await call('GET', P(app._id), null, T);
ok('an app lists it', r.body.doc.some(t => t.key === 'smoke-apply-app'), r.body.doc.map(t => t.key).join());
r = await call('POST', P(app._id, '/smoke-apply-app/apply'), {}, T);
ok('…and applies it', r.status === 202, `${r.status} ${r.body?.message}`);
s = await poll(app._id);
ok('models, sidebar, dashboard, role and sample records — not just the models', s.status === 'ready' && s.result.models.length === 2 && s.result.categories.join() === 'Work' && s.result.widgets === 1 && s.result.roles.created.join() === 'Smoke apply clerk' && s.result.records.jobs === 1, JSON.stringify(s));

await db.collection('projecttemplates').deleteMany({ key: { $in: [KEY, 'smoke-apply-hidden', 'smoke-apply-app'] } });
await db.collection('organizationroles').deleteMany({ name: 'Smoke apply clerk' });
await mc.close();
done();
