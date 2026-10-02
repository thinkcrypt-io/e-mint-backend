// WO-36 History in every project, WO-37 notifications for tenant users.
// Stands alone (its own accounts). Local scratch server only.
import mongoose from 'mongoose';
import { call, ok, done, ROOT } from './lib.mjs';
const stamp = Date.now();
const PASS = 'activity-pass-123';
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const MONGO = process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
const settle = () => new Promise(r => setTimeout(r, 400));
const idOf = r => r.body?._id || r.body?.doc?._id;

// Owen owns the organization; Mia has her own account.
let r = await call('POST', '/tenant/api/auth/register', { name: 'Owen Owner', email: `owen${stamp}@example.com`, password: PASS, organization: `Oak ${stamp}` });
const owen = r.body.token;
r = await call('POST', '/tenant/api/projects', { name: 'Desk', type: 'app' }, owen);
const desk = r.body;
r = await call('POST', '/tenant/api/projects', { name: 'Other', type: 'app' }, owen);
const other = r.body;
r = await call('POST', '/tenant/api/auth/register', { name: 'Mia Member', email: `mia${stamp}@example.com`, password: PASS, organization: `Mia Co ${stamp}` });
let mia = r.body.token;

/* ------------------------------------------------------------- WO-36 */
r = await call('POST', P(desk._id, '/builder/models'), { name: 'Client', title: 'Clients', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'city', label: 'City', kind: 'text' }] }, owen);
ok('a model', r.status === 201, r.body?.message);
const acme = idOf(await call('POST', P(desk._id, '/clients'), { name: 'Acme', city: 'Dhaka' }, owen));
await call('PUT', P(desk._id, `/clients/${acme}`), { city: 'Chittagong' }, owen);
const gone = idOf(await call('POST', P(desk._id, '/clients'), { name: 'Gone Ltd' }, owen));
await call('DELETE', P(desk._id, `/clients/${gone}`), null, owen);
await call('POST', P(other._id, '/builder/models'), { name: 'Note', title: 'Notes', fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }] }, owen);
await settle();

r = await call('GET', P(desk._id, '/history'), null, owen);
const texts = (r.body?.doc || []).map(h => h.text);
ok('History lists what happened, newest first', r.status === 200 && r.body?.totalDocs >= 5, `${r.status} ${r.body?.totalDocs}`);
ok('…records by their plain model name', (r.body?.doc || []).filter(h => h.model === 'Client').length === 4 && !(r.body?.doc || []).some(h => /^T[0-9a-f]{24}_/.test(h.model)), JSON.stringify((r.body?.doc || []).map(h => h.model)));
ok('…readable sentences', texts.some(t => /Owen Owner created client Acme/.test(t)) && texts.some(t => /updated City from Dhaka to Chittagong/.test(t)) && texts.some(t => /deleted client Gone Ltd/.test(t)), texts.join(' | '));
ok('…and the model being built', texts.some(t => /Owen Owner built the model Clients/.test(t)), texts.join(' | '));
ok("…only this project's (not Other's Notes)", !texts.some(t => /Notes/.test(t)));
r = await call('GET', P(desk._id, '/history?action=update'), null, owen);
ok('filter by action', r.body?.doc?.length >= 1 && r.body.doc.every(h => h.action === 'update') && r.body.doc.some(h => h.changes?.[0]?.label === 'City'), r.body?.doc?.length);
r = await call('GET', P(desk._id, '/history?search=gone'), null, owen);
ok('search', r.body?.doc?.length === 2 && r.body.doc.every(h => /Gone Ltd/.test(h.text)), r.body?.doc?.length);
r = await call('GET', P(desk._id, '/history/facets'), null, owen);
ok('facets: kinds and people', r.body?.models?.includes('Client') && r.body?.models?.includes('Model') && r.body?.people?.[0]?.name === 'Owen Owner', JSON.stringify(r.body));
r = await call('GET', P(desk._id, `/history/g/document/${acme}`), null, owen);
ok("a record's own timeline", r.status === 200 && r.body?.doc?.length === 2 && r.body.doc[0].action === 'update', r.body?.doc?.length);
r = await call('GET', P(other._id, '/history?search=Acme'), null, owen);
ok("another project's History doesn't have it", r.status === 200 && r.body?.doc?.length === 0);

/* ------------------------------------------------------------- WO-37 */
const roles = (await call('GET', '/tenant/api/org/roles', null, owen)).body.doc;
const member = roles.find(x => x.system === 'member')._id;
r = await call('POST', '/tenant/api/org/invitations', { email: `mia${stamp}@example.com`, role: member, allProjects: false, projects: [desk._id] }, owen);
ok('invite an existing account', r.status === 200, r.body?.message);
await settle();
r = await call('GET', '/tenant/api/notifications', null, mia);
ok('she is told in the app', r.status === 200 && r.body?.unread === 1 && r.body.doc[0].type === 'invitation' && /Owen Owner invited you to join Oak/.test(r.body.doc[0].title) && r.body.doc[0].organizationName === `Oak ${stamp}`, JSON.stringify(r.body?.doc?.[0]));

await mongoose.connect(MONGO);
await mongoose.connection.db.collection('tenantusers').updateOne({ email: `mia${stamp}@example.com` }, { $set: { emailVerified: true } });
r = await call('GET', '/tenant/api/invitations/for-me', null, mia);
r = await call('POST', `/tenant/api/invitations/for-me/${r.body?.doc?.[0]?._id}/accept`, null, mia);
ok('she joins', r.status === 200 && !!r.body?.token, r.body?.message);
mia = r.body.token;
await settle();
r = await call('GET', '/tenant/api/notifications', null, owen);
ok('Owen hears she joined', r.body?.doc?.some(n => n.type === 'member-joined' && /Mia Member joined Oak/.test(n.title) && n.href === '/org/members'), JSON.stringify(r.body?.doc?.map(n => n.title)));

const miaMember = (await call('GET', '/tenant/api/org/members', null, owen)).body.doc.find(m => m.user?.email === `mia${stamp}@example.com`);
r = await call('PUT', `/tenant/api/org/members/${miaMember._id}`, { allProjects: false, projects: [desk._id, other._id] }, owen);
await settle();
r = await call('GET', '/tenant/api/notifications', null, mia);
ok('her projects changed: she is told which', r.body?.doc?.[0]?.type === 'member-changed' && /Desk/.test(r.body.doc[0].message) && /Other/.test(r.body.doc[0].message), JSON.stringify(r.body?.doc?.[0]));

// A record shared with her (D19)
r = await call('POST', P(desk._id, '/builder/models'), { name: 'Memo', title: 'Memos', access: { enabled: true }, fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }] }, owen);
ok('a model with per-record access', r.status === 201, r.body?.message);
const miaUser = miaMember.user._id;
const memo = idOf(await call('POST', P(desk._id, '/memos'), { title: 'Q3 plan', privacy: 'private', access: [miaUser] }, owen));
await settle();
r = await call('GET', '/tenant/api/notifications', null, mia);
const shared = r.body?.doc?.find(n => n.type === 'access-granted');
ok('a record shared with her', !!shared && /Owen Owner shared memo “Q3 plan” with you/i.test(shared.title) && shared.href === `/${desk.publicSlug}/memos/${memo}`, JSON.stringify(shared));

// Something sent in by the site
r = await call('POST', P(desk._id, '/builder/models'), { name: 'Enquiry', title: 'Enquiries', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'message', label: 'Message', kind: 'textarea' }] }, owen);
const enquiryDef = r.body?.doc?._id;
await call('PUT', P(desk._id, `/builder/models/${enquiryDef}/public-api`), { enabled: true, actions: ['create'], auth: 'none' }, owen);
r = await fetch(`${ROOT}/public/api/${desk.publicSlug}/enquiries`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Zara', message: 'Do you deliver?' }) });
ok('the site sends an enquiry', r.status === 201, r.status);
await settle();
const [ow, mi] = await Promise.all([call('GET', '/tenant/api/notifications', null, owen), call('GET', '/tenant/api/notifications', null, mia)]);
const site = n => n.type === 'site-record' && /^New enquiry from Desk$/.test(n.title) && n.message === 'Zara';
ok('everyone who can see it is told', ow.body?.doc?.some(site) && mi.body?.doc?.some(site), JSON.stringify([ow.body?.doc?.[0]?.title, mi.body?.doc?.[0]?.title]));
r = await call('GET', P(desk._id, '/history?search=public API'), null, owen);
ok('History has the public API switched on', r.body?.doc?.some(h => h.model === 'Public API' && /turned on the public API of Enquiries/.test(h.text)), JSON.stringify(r.body?.doc?.map(h => h.text)));

// Reading them
r = await call('GET', '/tenant/api/notifications/count', null, mia);
const before = r.body?.unread;
ok('the unread count', before >= 3, before);
r = await call('PUT', `/tenant/api/notifications/${shared?._id}/read`, null, mia);
r = await call('GET', '/tenant/api/notifications/count', null, mia);
ok('mark one read', r.body?.unread === before - 1, r.body?.unread);
r = await call('PUT', `/tenant/api/notifications/${shared?._id}/read`, null, owen);
ok("someone else's can't be touched", r.status === 404, r.status);
r = await call('PUT', '/tenant/api/notifications/read-all', null, mia);
r = await call('GET', '/tenant/api/notifications/count', null, mia);
ok('mark all read', r.body?.unread === 0);
r = await call('DELETE', `/tenant/api/notifications/${shared?._id}`, null, mia);
ok('delete one', r.status === 200);
r = await call('GET', '/tenant/api/notifications', null);
ok('signed out: 401', r.status === 401, r.status);
await mongoose.disconnect();
done();
