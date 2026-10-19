// Site widgets W-24: the Widgets screen starts empty, widgets are added (and
// removed) one by one through the setup wizard, and Login & account's
// customer model — each account gets a record in the project's own Customers
// model, linked by email, while passwords stay in MINT's ProjectCustomer.
import { call, ok, done } from './lib.mjs';

const stamp = Date.now();
const P = (pid, path = '') => `/tenant/api/p/${pid}${path}`;
const idOf = r => r.body?._id || r.body?.doc?._id;
let r = await call('POST', '/tenant/api/auth/register', { name: 'Ada Added', email: `ada${stamp}@example.com`, password: 'tenant-pass-123', organization: `Ada ${stamp}`, country: 'BD' });
const T = r.body.token;
r = await call('POST', '/tenant/api/projects', { name: 'Club site', type: 'website' }, T);
const site = r.body;
const W = (path = '') => P(site._id, `/widgets${path}`);
const pub = path => `/public/api/${site.publicSlug}${path}`;
ok('a website project', r.status === 200 && site?.publicSlug, `${r.status} ${r.body?.message}`);

/* ------------------------------------------------------- empty, then added */
r = await call('GET', W(), null, T);
ok('a new project has no widgets added — the screen starts empty', r.status === 200 && Object.values(r.body.widgets).every(w => w.added === false && w.enabled === false) && r.body.catalog.length >= 5, JSON.stringify(r.body.widgets).slice(0, 200));
ok('login offers “Ask for a phone number on sign-up”, off by default', r.body.catalog.find(t => t.name === 'login')?.options.some(o => o.key === 'askPhone') && r.body.widgets.login.options.askPhone === false);

r = await call('PUT', W(), { widgets: { cart: { added: true, enabled: false } } }, T);
ok('a selling widget can be added switched off before the shop is set up', r.status === 200 && r.body.widgets.cart.added && !r.body.widgets.cart.enabled && r.body.widgets.cart.addedAt, `${r.status} ${r.body?.message}`);
r = await call('PUT', W(), { widgets: { cart: { enabled: true } } }, T);
ok('…but still can’t go on without the shop', r.status === 400 && r.body?.code === 'shop_not_set_up', `${r.status} ${r.body?.code}`);

r = await call('PUT', W(), { widgets: { login: { added: true, enabled: true, options: { layout: 'button', askPhone: true }, texts: { signInTitle: 'Members' } } } }, T);
ok('login added and on, with its options and texts', r.status === 200 && r.body.widgets.login.added && r.body.widgets.login.enabled && r.body.widgets.login.options.askPhone === true && r.body.widgets.login.texts.signInTitle === 'Members', JSON.stringify(r.body.widgets?.login));
r = await call('GET', pub('/widgets'));
ok('the site gets login (askPhone included), not the cart that’s added but off', r.body.widgets.login?.options.askPhone === true && !r.body.widgets.cart, JSON.stringify(r.body.widgets));

r = await call('PUT', W(), { widgets: { orders: { enabled: true } } }, T);
ok('switching on a widget that isn’t added adds it (MCP and templates still send enabled only)', r.status === 400 && r.body?.code === 'shop_not_set_up', `${r.status} ${r.body?.code}`);
r = await call('PUT', W(), { widgets: { thanks: { added: true }, cart: { added: false } } }, T);
ok('removing one: back to its defaults, off, not added', r.status === 200 && !r.body.widgets.cart.added && !r.body.widgets.cart.enabled && r.body.widgets.cart.addedAt === null && r.body.widgets.thanks.added, JSON.stringify(r.body.widgets?.cart));
r = await call('PUT', W(), { widgets: { thanks: { added: false } } }, T);

r = await call('GET', P(site._id, '/history?limit=5'), null, T);
const texts = (r.body?.doc || r.body?.docs || []).map(h => h.text || h.description || '').join(' | ');
ok('history says what was added and removed', /added the Login & account widget|added the Thank-you page widget/.test(texts) && /removed the/.test(texts), texts.slice(0, 300));

/* ------------------------------------------------------ the customer model */
r = await call('POST', P(site._id, '/builder/models'), {
	name: 'Customer',
	title: 'Members',
	displayField: 'fullName',
	fields: [
		{ key: 'fullName', label: 'Full name', kind: 'text' },
		{ key: 'email', label: 'Email', kind: 'email', required: true },
		{ key: 'mobile', label: 'Mobile', kind: 'text' },
		{ key: 'tier', label: 'Tier', kind: 'select', default: 'basic', options: [{ value: 'basic', label: 'Basic' }, { value: 'gold', label: 'Gold' }] },
		{ key: 'joined', label: 'Joined', kind: 'number' },
	],
}, T);
const customerDef = idOf(r);
ok('the project’s own customers model', r.status === 201, `${r.status} ${r.body?.message}`);
r = await call('POST', P(site._id, '/builder/models'), { name: 'Club', title: 'Clubs', kind: 'single', fields: [{ key: 'name', label: 'Name', kind: 'text' }] }, T);
r = await call('POST', P(site._id, '/builder/models'), { name: 'Strict', title: 'Strict list', fields: [{ key: 'email', label: 'Email', kind: 'email' }, { key: 'memberNo', label: 'Member number', kind: 'text', required: true }] }, T);

r = await call('GET', W('/auth'), null, T);
const route = r.body?.models?.find(m => m.name === 'Customer')?.route;
ok('a suggestion: Customer, its email, name and phone fields', r.status === 200 && !r.body.auth && r.body.guess?.model === 'Customer' && r.body.guess.fields.email === 'email' && r.body.guess.fields.name === 'fullName' && r.body.guess.fields.phone === 'mobile', JSON.stringify(r.body?.guess));
ok('…single-record models aren’t offered', r.body.models.every(m => m.name !== 'Club') && route, route);

for (const [label, auth, re] of [
	['no model', { fields: { email: 'email' } }, /Pick the model/],
	['an unknown model', { model: 'Nope', fields: { email: 'email' } }, /no “Nope” model/],
	['no email field', { model: 'Customer', fields: { name: 'fullName' } }, /email field/],
	['a field that isn’t there', { model: 'Customer', fields: { email: 'mail' } }, /no “mail” field/],
	['a field of the wrong kind', { model: 'Customer', fields: { email: 'email', phone: 'joined' } }, /phone needs a text field/],
	['a required field sign-up can’t fill', { model: 'Strict', fields: { email: 'email' } }, /required fields sign-up can’t fill \(Member number\)/],
]) {
	r = await call('PUT', W('/auth'), { auth }, T);
	ok(`refused: ${label}`, r.status === 400 && re.test(r.body?.message), `${r.status} ${r.body?.message}`);
}

// Someone already in the model (added by the team) before the site went live.
const existing = idOf(await call('POST', P(site._id, `/${route}`), { fullName: 'Old Member', email: `old${stamp}@example.com`, tier: 'gold' }, T));
// An account made before any model was chosen.
r = await call('POST', pub('/auth/register'), { name: 'Early Bird', email: `early${stamp}@example.com`, password: 'customer-pass-1' });
ok('before a model is chosen: accounts have no record', r.status === 200 && r.body.customer.record === null, JSON.stringify(r.body?.customer));

r = await call('PUT', W('/auth'), { auth: { model: 'Customer', fields: { email: 'email', name: 'fullName', phone: 'mobile' } } }, T);
ok('the customer model saved', r.status === 200 && r.body.auth?.model === 'Customer' && r.body.auth.fields.phone === 'mobile', `${r.status} ${r.body?.message}`);

r = await call('POST', pub('/auth/register'), { name: 'New Member', email: `New${stamp}@Example.com`, password: 'customer-pass-1', phone: '+8801700000000' });
const newbie = r.body;
ok('sign-up makes a record in Members and says which', r.status === 200 && newbie.customer?.record, JSON.stringify(r.body).slice(0, 200));
r = await call('GET', P(site._id, `/${route}/${newbie.customer.record}`), null, T);
const rec = r.body?.doc || r.body;
ok('…with the email, name and phone mapped, and the model’s own defaults', rec?.email === `new${stamp}@example.com` && rec.fullName === 'New Member' && rec.mobile === '+8801700000000' && rec.tier === 'basic', JSON.stringify(rec).slice(0, 300));
ok('…and no password or token anywhere in it', !JSON.stringify(rec).match(/password|tokenVersion|\$2[aby]\$/i));
r = await call('GET', pub('/auth/me'), null, `Bearer ${newbie.token}`);
ok('/auth/me carries the record', r.body?.record === newbie.customer.record, JSON.stringify(r.body));

r = await call('PUT', pub('/auth/me'), { name: 'Renamed Member', phone: '+8801711111111' }, `Bearer ${newbie.token}`);
r = await call('GET', P(site._id, `/${route}/${newbie.customer.record}`), null, T);
ok('a name or phone change on the site reaches the record', (r.body?.doc || r.body)?.fullName === 'Renamed Member' && (r.body?.doc || r.body)?.mobile === '+8801711111111', JSON.stringify(r.body).slice(0, 200));

r = await call('POST', pub('/auth/register'), { name: 'Old Member Again', email: `OLD${stamp}@example.com`, password: 'customer-pass-1' });
ok('signing up with an email already in Members links that record (any case), no duplicate', r.status === 200 && r.body.customer.record === existing, `${r.body?.customer?.record} vs ${existing}`);
r = await call('GET', P(site._id, `/${route}/${existing}`), null, T);
ok('…and leaves the team’s record as it was', (r.body?.doc || r.body)?.fullName === 'Old Member' && (r.body?.doc || r.body)?.tier === 'gold', JSON.stringify(r.body).slice(0, 200));

r = await call('POST', pub('/auth/login'), { email: `early${stamp}@example.com`, password: 'customer-pass-1' });
ok('an older account gets its record on its next sign-in', r.status === 200 && r.body.customer.record, JSON.stringify(r.body?.customer));
const earlyRecord = r.body.customer.record;
r = await call('POST', pub('/auth/login'), { email: `early${stamp}@example.com`, password: 'customer-pass-1' });
ok('…once (the same record next time)', r.body.customer.record === earlyRecord);
r = await call('GET', P(site._id, `/${route}?limit=50`), null, T);
const all = r.body?.doc || [];
ok('Members: one record per account, the team’s one among them', all.length === 3 && all.filter(x => x.email === `old${stamp}@example.com`).length === 1, all.map(x => x.email).join(', '));

r = await call('PUT', P(site._id, `/builder/models/${customerDef}/public-api`), { enabled: true, actions: ['get', 'update'], auth: 'customer', ownerOnly: true }, T);
r = await call('POST', pub('/auth/register'), { name: 'Owner Olly', email: `olly${stamp}@example.com`, password: 'customer-pass-1' });
const olly = r.body;
r = await call('GET', pub(`/${route}/${olly.customer.record}`), null, `Bearer ${olly.token}`);
ok('with an owner-only public API, a customer reads their own record', r.status === 200 && (r.body?.doc || r.body)?.fullName === 'Owner Olly', `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
r = await call('GET', pub(`/${route}/${olly.customer.record}`), null, `Bearer ${newbie.token}`);
ok('…and not someone else’s', r.status === 404 || r.status === 403, `${r.status}`);

/* ------------------------------------------------------- the model goes away */
r = await call('PUT', W('/auth'), { auth: null }, T);
ok('back to MINT’s Customers only', r.status === 200 && r.body.auth === null);
r = await call('POST', pub('/auth/register'), { name: 'No Record', email: `norec${stamp}@example.com`, password: 'customer-pass-1' });
ok('…new accounts get no record, sign-up still works', r.status === 200 && r.body.customer.record === null, JSON.stringify(r.body?.customer));
r = await call('PUT', W('/auth'), { auth: { model: 'Customer', fields: { email: 'email', name: 'fullName', phone: 'mobile' } } }, T);
r = await call('PUT', P(site._id, `/builder/models/${customerDef}`), { title: 'Members', displayField: 'fullName', fields: [{ key: 'fullName', label: 'Full name', kind: 'text' }, { key: 'mail', label: 'Mail', kind: 'email' }, { key: 'mobile', label: 'Mobile', kind: 'text' }] }, T);
ok('(the email field renamed in the builder)', r.status === 200, `${r.status} ${r.body?.message} ${JSON.stringify(r.body?.problems || '')}`);
r = await call('GET', W('/auth'), null, T);
ok('a mapped field removed from the model: the panel says what’s wrong', r.status === 200 && r.body.auth === null && /no “email” field/.test(r.body.problem || ''), JSON.stringify({ auth: r.body?.auth, problem: r.body?.problem }));
r = await call('POST', pub('/auth/register'), { name: 'Still Fine', email: `fine${stamp}@example.com`, password: 'customer-pass-1' });
ok('…and sign-up keeps working without a record', r.status === 200 && r.body.customer.record === null, JSON.stringify(r.body?.customer));

r = await call('GET', W('/auth'));
ok('the customer model needs a sign-in', r.status === 401, r.status);

done();
