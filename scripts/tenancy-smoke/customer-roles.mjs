// Widgets W-26: one sign-in model per project plus a Role field. The role is
// mapped in Login & account (an options field; sign-ups get its default), read
// from the customer's own record on every call, never written by the public
// API, and endpoints for signed-in customers may admit only some roles
// (`access.roles`, 403 role_required) or compare with `customer.role`.
import { call, ok, done } from './lib.mjs';

const stamp = Date.now();
const P = (pid, path = '') => `/tenant/api/p/${pid}${path}`;
const idOf = r => r.body?._id || r.body?.doc?._id;
let r = await call('POST', '/tenant/api/auth/register', { name: 'Rhea Roles', email: `rhea${stamp}@example.com`, password: 'tenant-pass-123', organization: `Rhea ${stamp}`, country: 'BD' });
const T = r.body.token;
r = await call('POST', '/tenant/api/projects', { name: 'Roles site', type: 'website' }, T);
const site = r.body;
const W = (path = '') => P(site._id, `/widgets${path}`);
const AB = path => P(site._id, `/api-builder${path}`);
const pub = path => `/public/api/${site.publicSlug}${path}`;
ok('a tenant and a website project', !!(T && site?.publicSlug), `${r.status} ${r.body?.message}`);

const memberFields = (role = { default: 'customer' }) => [
	{ key: 'fullName', label: 'Full name', kind: 'text' },
	{ key: 'email', label: 'Email', kind: 'email', required: true },
	{ key: 'role', label: 'Role', kind: 'select', options: [{ value: 'customer', label: 'Customer' }, { value: 'staff', label: 'Staff' }, { value: 'vip', label: 'VIP' }], ...role },
	{ key: 'note', label: 'Note', kind: 'text' },
];
r = await call('POST', P(site._id, '/builder/models'), { name: 'Member', title: 'Members', displayField: 'fullName', signIn: { enabled: true }, fields: memberFields() }, T);
const memberDef = idOf(r);
ok('the sign-in model, with a Role field', r.status === 201, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
const route = (await call('GET', W('/auth'), null, T)).body?.models?.find(m => m.name === 'Member')?.route;

r = await call('POST', P(site._id, '/builder/models'), { name: 'Staffer', title: 'Staff', signIn: { enabled: true }, fields: [{ key: 'email', label: 'Email', kind: 'email' }] }, T);
ok('a second sign-in model is refused — one per project, roles tell people apart', r.status === 400 && /Members is already the sign-in model — a project has one/.test(JSON.stringify(r.body?.problems)), `${r.status} ${JSON.stringify(r.body?.problems)}`);

r = await call('GET', W('/auth'), null, T);
ok('the suggestion maps the Role field too', r.body.guess?.fields?.role === 'role', JSON.stringify(r.body.guess));

/* ------------------------------------------------------------ the mapping */
r = await call('PUT', W('/auth'), { auth: { model: 'Member', fields: { email: 'email', name: 'fullName', role: 'note' } } }, T);
ok('a role that isn’t an options field is refused', r.status === 400 && /role needs a select field/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, `/builder/models/${memberDef}`), { title: 'Members', displayField: 'fullName', fields: memberFields({ required: true }) }, T);
r = await call('PUT', W('/auth'), { auth: { model: 'Member', fields: { email: 'email', name: 'fullName', role: 'role' } } }, T);
ok('a required role with no default is refused — sign-ups get the default', r.status === 400 && /required fields sign-up can’t fill \(Role\)/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, `/builder/models/${memberDef}`), { title: 'Members', displayField: 'fullName', fields: memberFields({ required: true, default: 'customer' }) }, T);

r = await call('POST', AB('/endpoints'), { name: 'Staff list', model: route, action: 'list', path: '/staff/members', access: { who: 'customer', roles: ['staff'] } }, T);
ok('endpoint roles before a Role field is mapped are refused, saying where to map one', r.status === 400 && /Widgets → Login & account/.test(r.body?.message), `${r.status} ${r.body?.message}`);

r = await call('PUT', W('/auth'), { auth: { model: 'Member', fields: { email: 'email', name: 'fullName', role: 'role' } } }, T);
ok('Members with its Role field mapped', r.status === 200 && r.body.auth?.fields.role === 'role', `${r.status} ${r.body?.message}`);

/* --------------------------------------------------------------- sign-ups */
r = await call('PUT', P(site._id, `/builder/models/${memberDef}/public-api`), { enabled: true, actions: ['get', 'update'], auth: 'customer', ownerOnly: true }, T);
r = await call('POST', pub('/auth/register'), { name: 'Ann', email: `ann${stamp}@example.com`, password: 'customer-pass-1', role: 'staff' });
const ann = r.body;
ok('sign-up gets the Role field’s default — a role sent with it is ignored', r.status === 200 && ann.customer?.role === 'customer', JSON.stringify(r.body?.customer));
r = await call('GET', pub('/auth/me'), null, `Bearer ${ann.token}`);
ok('/auth/me says the role', r.body?.role === 'customer', JSON.stringify(r.body));

r = await call('PUT', pub(`/${route}/${ann.customer.record}`), { role: 'staff', note: 'hello' }, `Bearer ${ann.token}`);
const self = r.body?.doc || r.body;
ok('a customer can’t promote themselves through the public API (the rest of the update goes through)', r.status === 200 && self.note === 'hello' && (self.role === undefined || self.role === 'customer'), `${r.status} ${JSON.stringify(self).slice(0, 200)}`);
r = await call('GET', P(site._id, `/${route}/${ann.customer.record}`), null, T);
ok('…the record still says customer', (r.body?.doc || r.body)?.role === 'customer', JSON.stringify(r.body).slice(0, 160));

/* -------------------------------------------------------------- endpoints */
r = await call('GET', AB('/endpoints'), null, T);
ok('the API builder gets the roles to pick from', r.body?.signIn?.field === 'role' && r.body.signIn.roles.map(x => x.value).join() === 'customer,staff,vip', JSON.stringify(r.body?.signIn));

r = await call('POST', AB('/endpoints'), { name: 'Staff list', model: route, action: 'list', path: '/staff/members', access: { who: 'customer', roles: ['boss'] } }, T);
ok('a role that isn’t an option is refused', r.status === 400 && /“boss” isn’t one of Role’s options/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', AB('/endpoints'), { name: 'Staff list', model: route, action: 'list', path: '/staff/members', access: { who: 'customer', roles: ['staff', 'vip'] } }, T);
const staffEp = r.body;
ok('an endpoint for staff and VIPs only', r.status === 201 && staffEp.access?.roles?.join() === 'staff,vip', `${r.status} ${r.body?.message} ${JSON.stringify(r.body?.access)}`);
r = await call('POST', AB('/endpoints'), { name: 'Open list', model: route, action: 'list', path: '/open/members', access: { who: 'anyone', roles: ['staff'] } }, T);
ok('roles only apply to signed-in endpoints (dropped for anyone)', r.status === 201 && r.body.access?.roles?.length === 0, JSON.stringify(r.body?.access));

r = await call('GET', pub('/staff/members'));
ok('not signed in: 401', r.status === 401, r.status);
r = await call('GET', pub('/staff/members'), null, `Bearer ${ann.token}`);
ok('a customer without the role: 403 role_required', r.status === 403 && r.body?.code === 'role_required', `${r.status} ${r.body?.code}`);
r = await call('PUT', P(site._id, `/${route}/${ann.customer.record}`), { fullName: 'Ann', email: `ann${stamp}@example.com`, role: 'staff' }, T);
r = await call('GET', pub('/staff/members'), null, `Bearer ${ann.token}`);
ok('the team makes her staff: the same token gets in at once', r.status === 200 && Array.isArray(r.body?.doc), `${r.status} ${r.body?.message}`);
r = await call('GET', pub('/auth/me'), null, `Bearer ${ann.token}`);
ok('…and /auth/me says staff', r.body?.role === 'staff', JSON.stringify(r.body));
r = await call('GET', pub('/'));
ok('the API index lists the endpoint’s roles', r.body?.endpoints?.find(e => e.path === '/staff/members')?.roles?.join() === 'staff,vip', JSON.stringify(r.body?.endpoints?.find(e => e.path === '/staff/members')));

r = await call('POST', AB('/endpoints'), { name: 'Same role', model: route, action: 'list', path: '/same/members', access: { who: 'customer', when: [{ field: 'role', op: 'is', value: { ref: 'customer.role' } }] } }, T);
ok('a rule can compare with the customer’s role', r.status === 201, `${r.status} ${r.body?.message}`);
r = await call('GET', pub('/same/members'), null, `Bearer ${ann.token}`);
ok('…staff see staff records', r.status === 200 && r.body.doc.length >= 1 && r.body.doc.every(d => d.role === 'staff'), `${r.status} ${JSON.stringify(r.body?.doc?.map(d => d.role))}`);

// A record the team made earlier, linked by an unverified email, grants nothing.
await call('POST', P(site._id, `/${route}`), { fullName: 'Boss Record', email: `boss${stamp}@example.com`, role: 'staff' }, T);
r = await call('POST', pub('/auth/register'), { name: 'Not The Boss', email: `boss${stamp}@example.com`, password: 'customer-pass-1' });
const fake = r.body;
ok('signing up with the email of a staff record the team made: linked, but no role', r.status === 200 && fake.customer?.record && fake.customer.role === null, JSON.stringify(r.body?.customer));
r = await call('GET', pub('/staff/members'), null, `Bearer ${fake.token}`);
ok('…and the staff endpoint refuses them', r.status === 403, r.status);
r = await call('GET', pub('/same/members'), null, `Bearer ${fake.token}`);
ok('…a rule comparing with their (missing) role matches nothing', r.status === 200 && r.body.doc.length === 0, `${r.status} ${r.body?.message}`);

/* -------------------------------------------------- the model holds accounts */
r = await call('PUT', W('/auth'), { auth: { model: 'Member', accounts: 'model', fields: { email: 'email', name: 'fullName', role: 'role' } } }, T);
r = await call('POST', pub('/auth/register'), { name: 'Held Hugo', email: `hugo${stamp}@example.com`, password: 'customer-pass-1' });
const hugo = r.body;
ok('model-held accounts get the default role too', r.status === 200 && hugo.customer?.role === 'customer', JSON.stringify(r.body?.customer));
await call('PUT', P(site._id, `/${route}/${hugo.customer.record}`), { fullName: 'Held Hugo', email: `hugo${stamp}@example.com`, role: 'vip' }, T);
r = await call('GET', pub('/staff/members'), null, `Bearer ${hugo.token}`);
ok('…made VIP by the team, he gets in', r.status === 200, `${r.status} ${r.body?.code}`);

/* ----------------------------------------------------------- no Role field */
r = await call('PUT', W('/auth'), { auth: { model: 'Member', fields: { email: 'email', name: 'fullName' } } }, T);
r = await call('GET', pub('/staff/members'), null, `Bearer ${ann.token}`);
ok('with no Role field mapped, nobody has a role: role endpoints refuse', r.status === 403, r.status);
r = await call('GET', AB('/endpoints'), null, T);
ok('…and the API builder has no roles to offer', r.body?.signIn === null, JSON.stringify(r.body?.signIn));

await call('DELETE', `/tenant/api/projects/${site._id}?force=true`, null, T);
done();
