// Mint Accounting AC-01 (docs/accounting D1, D7): an `accounting` project type; its panel logins sign in at
// mint-accounting (`app: 'accounting'`) only, other projects' logins are sent elsewhere, the sidebar is DiziCashier's
// eleven groups, and the owner's builder tools are closed to accounting logins.
import { call, ok, done, claims } from './lib.mjs';
const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Ada Books', email: `ada${stamp}@example.com`, password: 'tenant-pass-123', organization: `Books ${stamp}`, country: 'BD' });
const t = r.body?.token;
ok('owner registers', !!t, JSON.stringify(r.body).slice(0, 200));

r = await call('POST', '/tenant/api/projects', { name: 'Acme Books', type: 'accounting' }, t);
const books = r.body;
ok('an accounting project is made', r.status === 200 && books?.type === 'accounting', JSON.stringify(r.body).slice(0, 200));
r = await call('POST', '/tenant/api/projects', { name: 'Plain app', type: 'app' }, t);
const app = r.body;
const P = `/tenant/api/p/${books._id}`;

r = await call('POST', `${P}/panel-users`, { name: 'Boss', username: `boss${stamp}`, password: 'books-pass-1234', superAdmin: true }, t);
ok('an accounting super admin login is made', r.status === 201, JSON.stringify(r.body));
r = await call('POST', `/tenant/api/p/${app._id}/panel-users`, { name: 'Pat', username: `pat${stamp}`, password: 'books-pass-1234', superAdmin: true }, t);
ok('a plain app login is made', r.status === 201, JSON.stringify(r.body));

// ---- which app
for (const app of ['panel', 'commerce', 'seo']) {
	r = await call('POST', '/tenant/api/panel/auth/login', { username: `boss${stamp}`, password: 'books-pass-1234', app });
	ok(`accounting login at the ${app} app: 400 use_accounting`, r.status === 400 && r.body?.code === 'use_accounting', JSON.stringify(r.body));
}
r = await call('POST', '/tenant/api/panel/auth/login', { username: `pat${stamp}`, password: 'books-pass-1234', app: 'accounting' });
ok('a plain app login at the accounting app: use_panel', r.status === 400 && r.body?.code === 'use_panel', JSON.stringify(r.body));
r = await call('POST', '/tenant/api/panel/auth/login', { username: `boss${stamp}`, password: 'books-pass-1234', app: 'accounting' });
const bt = r.body?.token;
ok('accounting login at the accounting app → token', r.status === 200 && !!bt && r.body?.project?.type === 'accounting', JSON.stringify(r.body).slice(0, 300));
ok('token: kind panel, its project', bt && claims(bt).kind === 'panel' && claims(bt).project === books._id);

// ---- the sidebar
r = await call('GET', `${P}/sidebar/web/server`, null, bt);
const titles = (r.body || []).filter(i => i.startOfSection).map(i => i.sectionTitle);
ok(
	'sidebar: DiziCashier groups in order',
	JSON.stringify(titles) === JSON.stringify(['Accounts', 'Products/ Services', 'Sales', 'Purchases', 'Payments', 'Traders', 'Stocks', 'Transactions', 'Tools', 'Reports']),
	JSON.stringify(titles)
);
const hrefs = (r.body || []).map(i => i.href);
ok('sidebar: Dashboard first, Make Sale, Balance Sheet, Users', hrefs[0] === '/' && ['/sales/new', '/reports/balance-sheet', '/panel-users'].every(h => hrefs.includes(h)));
r = await call('GET', `${P}/sidebar/web/server`, null, t);
ok('the owner still gets the tenant sidebar', r.status === 200 && !(r.body || []).some(i => i.href === '/sales/new'));

// ---- closed to accounting logins
for (const path of ['/builder/models', '/automations', '/people', '/api-builder/endpoints']) {
	r = await call('GET', `${P}${path}`, null, bt);
	ok(`accounting login: ${path} → 403`, r.status === 403, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
}
r = await call('GET', P, null, bt);
ok('accounting login opens its project', r.status === 200 && r.body?.type === 'accounting');
r = await call('GET', `${P}/builder/models`, null, t);
ok('the owner still opens the builder', r.status === 200, String(r.status));

done();
