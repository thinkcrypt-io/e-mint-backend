// API builder AB-12 (D15): customer sign-in (/auth/*) is built into every project's
// API — there before any endpoint — and the Endpoints page says where
// customers are kept (`customerAuth`). Generate for signed-in customers can
// keep each to their own records (`own`: the owner condition), and on the
// sign-in model the records their sign-ups made before it had an API become
// theirs, so a customer's token reaches just their data.
import { call, ok, done } from './lib.mjs';

const stamp = Date.now();
const P = (pid, path = '') => `/tenant/api/p/${pid}${path}`;
const idOf = r => r.body?._id || r.body?.doc?._id;
let r = await call('POST', '/tenant/api/auth/register', { name: 'Cora Customers', email: `cora${stamp}@example.com`, password: 'tenant-pass-123', organization: `Cora ${stamp}`, country: 'BD' });
const T = r.body.token;
r = await call('POST', '/tenant/api/projects', { name: 'Customer API', type: 'app' }, T);
const app = r.body;
const W = (path = '') => P(app._id, `/widgets${path}`);
const AB = path => P(app._id, `/api-builder${path}`);
const pub = path => `/public/api/${app.publicSlug}${path}`;
ok('a tenant and an app project', !!(T && app?.publicSlug), `${r.status} ${r.body?.message}`);

r = await call('POST', P(app._id, '/builder/models'), {
	name: 'Member',
	title: 'Members',
	displayField: 'fullName',
	signIn: { enabled: true },
	fields: [
		{ key: 'fullName', label: 'Full name', kind: 'text' },
		{ key: 'email', label: 'Email', kind: 'email', required: true },
	],
}, T);
ok('a sign-in model, with no API', r.status === 201, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
r = await call('POST', P(app._id, '/builder/models'), { name: 'Booking', title: 'Bookings', displayField: 'title', fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }] }, T);
ok('a Bookings model', r.status === 201, `${r.status} ${r.body?.message}`);
r = await call('POST', P(app._id, '/builder/models'), { name: 'Notice', title: 'Notices', displayField: 'title', fields: [{ key: 'title', label: 'Title', kind: 'text' }] }, T);
const models = (await call('GET', W('/auth'), null, T)).body?.models || [];
const memberRoute = models.find(m => m.name === 'Member')?.route;
r = await call('GET', AB('/endpoints'), null, T);
const routes = Object.fromEntries((r.body?.models || []).map(m => [m.title, m.route]));

/* ------------------------------------------------------- built in, always */
ok('no endpoints yet, and the Endpoints page says customers are kept in MINT’s Customers', r.body?.total === 0 && r.body?.customerAuth?.model === null && r.body.customerAuth.customers === 0, JSON.stringify(r.body?.customerAuth));
r = await call('POST', pub('/auth/register'), { name: 'Ann Early', email: `ann${stamp}@example.com`, password: 'customer-pass-1' });
const annFirst = r.body;
ok('sign-up works before any endpoint exists — it’s built in', r.status === 200 && !!annFirst.token, `${r.status} ${r.body?.message}`);
r = await call('GET', pub('/auth/me'), null, `Bearer ${annFirst.token}`);
ok('…and /auth/me with the token', r.status === 200 && r.body?.email === `ann${stamp}@example.com`, `${r.status} ${r.body?.message}`);
r = await call('GET', pub('/auth/me'));
ok('…without it: 401 customer_required', r.status === 401 && r.body?.code === 'customer_required', `${r.status} ${r.body?.code}`);

/* -------------------------------------------- the model holding customers */
r = await call('PUT', W('/auth'), { auth: { model: 'Member', fields: { email: 'email', name: 'fullName' } } }, T);
ok('Login & account keeps customers in Members', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('POST', pub('/auth/login'), { email: `ann${stamp}@example.com`, password: 'customer-pass-1' });
const ann = r.body;
ok('Ann signs in: her record in Members is made', r.status === 200 && !!ann.customer?.record, JSON.stringify(r.body?.customer));
r = await call('POST', pub('/auth/register'), { name: 'Bob Later', email: `bob${stamp}@example.com`, password: 'customer-pass-1' });
const bob = r.body;
ok('Bob signs up: his record too', r.status === 200 && !!bob.customer?.record, JSON.stringify(r.body?.customer));
await call('POST', P(app._id, `/${memberRoute}`), { fullName: 'Desk Dora', email: `dora${stamp}@example.com` }, T);
r = await call('GET', AB('/endpoints'), null, T);
ok('the Endpoints page names the model and counts the customers', r.body?.customerAuth?.model?.title === 'Members' && r.body.customerAuth.model.route === memberRoute && r.body.customerAuth.model.accounts === 'mint' && r.body.customerAuth.customers === 2, JSON.stringify(r.body?.customerAuth));

/* ------------------------------------------------------- their own records */
r = await call('POST', AB('/endpoints/generate'), { model: memberRoute, actions: ['list', 'get', 'update'], who: 'customer', own: true }, T);
const owner = c => c.field === '_customer' && c.op === 'is' && c.value?.ref === 'customer';
ok('Generate for signed-in customers, only their own records: the owner condition on each', r.status === 201 && r.body.made.length === 3 && r.body.made.every(e => e.access.who === 'customer' && e.access.when.some(owner)), `${r.status} ${JSON.stringify(r.body?.made?.map(e => e.access))}`);
r = await call('GET', pub(`/${memberRoute}`), null, `Bearer ${ann.token}`);
ok('Ann’s token lists just her record — made before Members had an API', r.status === 200 && r.body.doc.length === 1 && r.body.doc[0].email === `ann${stamp}@example.com`, `${r.status} ${JSON.stringify(r.body?.doc?.map(d => d.email))}`);
r = await call('GET', pub(`/${memberRoute}`), null, `Bearer ${bob.token}`);
ok('Bob’s, just his', r.status === 200 && r.body.doc.length === 1 && r.body.doc[0].email === `bob${stamp}@example.com`, `${r.status} ${JSON.stringify(r.body?.doc?.map(d => d.email))}`);
r = await call('GET', pub(`/${memberRoute}/${bob.customer.record}`), null, `Bearer ${ann.token}`);
ok('Ann can’t read Bob’s (404)', r.status === 404, r.status);
r = await call('PUT', pub(`/${memberRoute}/${ann.customer.record}`), { fullName: 'Ann Changed' }, `Bearer ${ann.token}`);
ok('Ann changes her own', r.status === 200 && (r.body?.doc || r.body)?.fullName === 'Ann Changed', `${r.status} ${r.body?.message}`);
r = await call('GET', pub(`/${memberRoute}`));
ok('no token: 401', r.status === 401, r.status);
r = await call('GET', P(app._id, `/${memberRoute}?limit=50`), null, T);
const dora = (r.body?.doc || []).find(d => d.email === `dora${stamp}@example.com`);
ok('the team’s own record stays nobody’s', !!dora && !dora._customer, JSON.stringify(dora));

r = await call('POST', AB('/endpoints/generate'), { model: routes.Bookings, actions: ['list', 'create'], who: 'customer', own: true }, T);
ok('Bookings for customers, their own', r.status === 201 && r.body.made.every(e => e.access.when.some(owner)), `${r.status} ${r.body?.message}`);
r = await call('POST', pub(`/${routes.Bookings}`), { title: 'Ann’s table' }, `Bearer ${ann.token}`);
ok('Ann books — she’s the owner', r.status === 201, `${r.status} ${r.body?.message}`);
r = await call('GET', pub(`/${routes.Bookings}`), null, `Bearer ${ann.token}`);
ok('…her list has it', r.status === 200 && r.body.doc.length === 1, `${r.status} ${r.body?.doc?.length}`);
r = await call('GET', pub(`/${routes.Bookings}`), null, `Bearer ${bob.token}`);
ok('…Bob’s doesn’t', r.status === 200 && r.body.doc.length === 0, `${r.status} ${r.body?.doc?.length}`);

r = await call('POST', AB('/endpoints/generate'), { model: routes.Notices, actions: ['list'], who: 'customer', own: false }, T);
ok('own off: every signed-in customer reaches every record (no condition)', r.status === 201 && r.body.made[0].access.when.length === 0, JSON.stringify(r.body?.made?.[0]?.access));
r = await call('POST', AB('/endpoints/generate'), { model: routes.Notices, actions: ['get'], who: 'anyone', own: true }, T);
ok('own means nothing for anyone', r.status === 201 && r.body.made[0].access.who === 'anyone' && r.body.made[0].access.when.length === 0, JSON.stringify(r.body?.made?.[0]?.access));

await call('DELETE', `/tenant/api/projects/${app._id}?force=true`, null, T);
done();
