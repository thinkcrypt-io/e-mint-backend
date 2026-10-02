// WO-21–24: standard role permissions, project access per member and invitation,
// the organization's shared media library, invitations in the app and several
// organizations. Stands alone (its own accounts). Local scratch server only.
import mongoose from 'mongoose';
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const PASS = 'access-pass-123';
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const MONGO = process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';

// The owner's organization and three projects: A and B share the organization's media, C keeps its own.
let r = await call('POST', '/tenant/api/auth/register', { name: 'Alma Owner', email: `alma${stamp}@example.com`, password: PASS, organization: `Alpha ${stamp}` });
const alma = r.body.token;
const project = async (name, mediaScope) => (await call('POST', '/tenant/api/projects', { name, type: 'app', mediaScope }, alma)).body;
const A = await project('Shop', 'organization');
const B = await project('Blog', 'organization');
const C = await project('Vault', 'project');
ok('projects made with a media library choice', A?.mediaScope === 'organization' && C?.mediaScope === 'project', `${A?.mediaScope} ${C?.mediaScope}`);

/* ---- WO-21: the standard keys */
r = await call('GET', '/tenant/api/org/permissions', null, alma);
ok('permissions: records first, grouped', r.body?.organization?.slice(0, 4).map(p => p.key).join() === 'records:view,records:create,records:edit,records:delete' && r.body.organization[0].group === 'Records');
r = await call('POST', '/tenant/api/org/roles', { name: 'Viewer', permissions: ['records:view'] }, alma);
const viewer = r.body?._id;
ok('a View-only role', r.status === 200 && r.body?.permissions?.join() === 'records:view', r.body?.message);
r = await call('GET', '/tenant/api/org/roles', null, alma);
ok('Member is the four record keys + create projects', r.body?.doc?.find(x => x.system === 'member')?.permissions?.join() === 'records:view,records:create,records:edit,records:delete,create-projects');

// A model with a record in Shop.
r = await call('POST', P(A._id, '/builder/models'), { name: 'Item', title: 'Items', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] }, alma);
ok('model in Shop', r.status === 201 || r.status === 200, r.body?.message);
await call('POST', P(A._id, '/items'), { name: 'Lamp' }, alma);

/* ---- WO-24 + WO-22: Vera has her own organization, is invited to Alpha for Shop only */
r = await call('POST', '/tenant/api/auth/register', { name: 'Vera Viewer', email: `vera${stamp}@example.com`, password: PASS, organization: `Vera Co ${stamp}` });
let vera = r.body.token;
r = await call('POST', '/tenant/api/org/invitations', { email: `vera${stamp}@example.com`, role: viewer, allProjects: false, projects: [A._id] }, alma);
ok('invite with a role and one project', r.status === 200 && r.body?.allProjects === false && r.body?.projects?.join() === A._id, r.body?.message);
r = await call('POST', '/tenant/api/org/invitations', { email: `x${stamp}@example.com`, role: viewer, allProjects: false, projects: ['000000000000000000000000'] }, alma);
ok("another organization's project refused", r.status === 400, r.body?.message);

r = await call('GET', '/tenant/api/invitations/for-me', null, vera);
ok('unverified email: no invitations shown', r.status === 200 && r.body?.verified === false && r.body?.doc?.length === 0);
r = await call('POST', `/tenant/api/invitations/for-me/${'0'.repeat(24)}/accept`, null, vera);
ok('unverified email: accepting refused', r.status === 403 && r.body?.code === 'email_unverified', r.status);
r = await call('POST', '/tenant/api/auth/verify-email/send', null, vera);
ok('verification code sent', r.status === 200, r.body?.message);
r = await call('POST', '/tenant/api/auth/verify-email', { code: '000000' }, vera);
ok('wrong code refused', r.status === 400 && r.body?.code === 'wrong_code', r.body?.message);
// The code itself only goes by email; the test marks the address verified directly.
await mongoose.connect(MONGO);
await mongoose.connection.db.collection('tenantusers').updateOne({ email: `vera${stamp}@example.com` }, { $set: { emailVerified: true } });

r = await call('GET', '/tenant/api/invitations/for-me', null, vera);
const inv = r.body?.doc?.[0];
ok('verified: the invitation shows, with its project', r.body?.verified === true && r.body?.doc?.length === 1 && inv?.projects?.join() === 'Shop' && inv?.role === 'Viewer', JSON.stringify(r.body?.doc));
r = await call('POST', `/tenant/api/invitations/for-me/${inv?._id}/accept`, null, vera);
ok('accepted in the app → a token in Alpha', r.status === 200 && !!r.body?.token, r.body?.message);
vera = r.body?.token || vera;

r = await call('GET', '/tenant/api/auth/self', null, vera);
ok('both organizations listed', r.body?.organizations?.length === 2, r.body?.organizations?.map(o => o.name).join(', '));
ok('only Shop among projects', r.body?.projects?.map(p => p.name).join() === 'Shop', r.body?.projects?.map(p => p.name).join());
r = await call('GET', '/tenant/api/projects', null, vera);
ok('projects list: Shop only', r.body?.doc?.map(p => p.name).join() === 'Shop');
r = await call('GET', `/tenant/api/projects/${B._id}`, null, vera);
ok('another project answers 404', r.status === 404, r.status);
r = await call('GET', P(B._id, '/builder/models'), null, vera);
ok("inside another project: 404", r.status === 404, r.status);
r = await call('GET', P(A._id, '/items'), null, vera);
ok('View role reads records', r.status === 200 && (r.body?.doc || []).length === 1, r.status);
r = await call('POST', P(A._id, '/items'), { name: 'Chair' }, vera);
ok("…but can't add", r.status === 403, r.status);
r = await call('GET', '/tenant/api/invitations/for-me', null, vera);
ok('the accepted invitation is gone', r.body?.doc?.length === 0);

// Changing her access.
r = await call('GET', '/tenant/api/org/members', null, alma);
const veraMember = r.body?.doc?.find(m => m.user?.email === `vera${stamp}@example.com`);
ok('members show project access', veraMember?.allProjects === false && veraMember?.projects?.join() === A._id);
r = await call('PUT', `/tenant/api/org/members/${veraMember._id}`, { allProjects: false, projects: [B._id] }, alma);
ok('access moved to Blog', r.status === 200 && r.body?.projects?.join() === B._id, r.body?.message);
r = await call('GET', P(A._id, '/items'), null, vera);
ok('Shop is closed to her now', r.status === 404, r.status);
r = await call('PUT', `/tenant/api/org/members/${veraMember._id}`, { allProjects: true }, alma);
r = await call('GET', '/tenant/api/projects', null, vera);
ok('all projects again', r.body?.doc?.length === 3, r.body?.doc?.length);

/* ---- WO-23: the shared library */
r = await call('POST', P(A._id, '/media/folders'), { name: 'Brand' }, alma);
ok('folder in the shared library (from Shop)', r.status === 201, r.body?.message);
r = await call('GET', P(B._id, '/media/browse'), null, alma);
ok('Blog sees it (shared)', JSON.stringify(r.body).includes('Brand'));
r = await call('GET', P(C._id, '/media/browse'), null, alma);
ok("Vault doesn't (its own)", r.status === 200 && !JSON.stringify(r.body).includes('Brand'));
r = await call('POST', P(B._id, '/media/folders'), { name: 'Brand' }, alma);
ok('one library: a second “Brand” is renamed', r.body?.doc?.name === 'Brand (2)', r.body?.doc?.name);
const stored = await mongoose.connection.db.collection('folders').findOne({ name: 'Brand (2)' });
ok('stored with the organization and no project', !!stored?.organization && !stored?.project, JSON.stringify({ org: !!stored?.organization, project: stored?.project ?? null }));
const admin = (await call('POST', '/admin/api/auth/login', { email: 'admin@example.com', password: 'tenancy-dev-pass-1' })).body.token;
r = await call('GET', '/admin/api/media/browse', null, admin);
ok("super admin doesn't see the shared library", r.status === 200 && !JSON.stringify(r.body).includes('Brand'));
r = await call('PUT', `/tenant/api/projects/${C._id}`, { mediaScope: 'organization' }, alma);
r = await call('GET', P(C._id, '/media/browse'), null, alma);
ok('Vault switched to shared: sees it', r.status === 200 && JSON.stringify(r.body).includes('Brand'));

/* ---- declining, and deleting a project pulls it from access lists */
r = await call('POST', '/tenant/api/auth/register', { name: 'Dan Decline', email: `dan${stamp}@example.com`, password: PASS, organization: `Dan Co ${stamp}` });
const dan = r.body.token;
await mongoose.connection.db.collection('tenantusers').updateOne({ email: `dan${stamp}@example.com` }, { $set: { emailVerified: true } });
await call('POST', '/tenant/api/org/invitations', { email: `dan${stamp}@example.com`, role: viewer, allProjects: false, projects: [B._id] }, alma);
r = await call('GET', '/tenant/api/invitations/for-me', null, dan);
r = await call('DELETE', `/tenant/api/invitations/for-me/${r.body?.doc?.[0]?._id}`, null, dan);
ok('declined', r.status === 200);
r = await call('GET', '/tenant/api/org/invitations', null, alma);
ok('…and gone from Pending', !JSON.stringify(r.body).includes(`dan${stamp}`));
r = await call('PUT', `/tenant/api/org/members/${veraMember._id}`, { allProjects: false, projects: [A._id, B._id] }, alma);
await call('DELETE', `/tenant/api/projects/${B._id}`, null, alma);
r = await call('GET', '/tenant/api/org/members', null, alma);
ok('deleted project pulled from access lists', r.body?.doc?.find(m => m._id === veraMember._id)?.projects?.join() === A._id);

/* ---- D19: per-record access in a project */
r = await call('POST', P(A._id, '/builder/models'), { name: 'Memo', title: 'Memos', access: { enabled: true }, fields: [{ key: 'title', label: 'Title', kind: 'text', required: true }] }, alma);
const memoDef = r.body?.doc?._id;
ok('a model with per-record access in a project', r.status === 201 && !!memoDef, r.body?.message || JSON.stringify(r.body?.problems));
r = await call('GET', P(A._id, '/access-users'), null, alma);
const people = r.body?.doc || [];
const veraId = people.find(p => p.email === `vera${stamp}@example.com`)?._id;
ok('access-users: the people who can open Shop', r.status === 200 && people.some(p => p.email === `alma${stamp}@example.com`) && !!veraId, JSON.stringify(people.map(p => p.email)));
r = await call('GET', P(C._id, '/access-users'), null, alma);
ok("…Vault's leaves out Vera, who can't open it", r.status === 200 && !(r.body?.doc || []).some(p => p.email === `vera${stamp}@example.com`), JSON.stringify((r.body?.doc || []).map(p => p.email)));
const memo = async body => { const b = (await call('POST', P(A._id, '/memos'), body, alma)).body; return b?._id || b?.doc?._id; };
const mineId = await memo({ title: 'Only Alma', privacy: 'only-me' });
await memo({ title: 'Shared with Vera', privacy: 'private', access: [veraId] });
await memo({ title: 'Everyone', privacy: 'public' });
r = await call('GET', P(A._id, '/memos?limit=50'), null, alma);
ok('the owner sees all three', (r.body?.doc || []).length === 3, (r.body?.doc || []).length);
r = await call('GET', P(A._id, '/memos?limit=50'), null, vera);
const seen = (r.body?.doc || []).map(d => d.title).sort().join();
ok('Vera sees the one shared with her and the public one', r.status === 200 && seen === 'Everyone,Shared with Vera', `${r.status} ${seen}`);
r = await call('GET', P(A._id, `/memos/${mineId}`), null, vera);
ok("…not Alma's own (404)", r.status === 404, r.status);
r = await call('GET', P(A._id, '/memos/get/filters'), null, alma);
const ownerFilter = (Array.isArray(r.body) ? r.body : []).find(f => f.name === 'addedBy');
ok("the Owner filter lists the project's people", ownerFilter?.options?.length >= 2 && ownerFilter.options.some(o => String(o.value) === String(veraId)), JSON.stringify(ownerFilter?.options?.map(o => o.label)));
r = await call('PUT', P(A._id, `/builder/models/${memoDef}/public-api`), { enabled: true, actions: ['list', 'create'], auth: 'none', ownerOnly: false }, alma);
ok('public API on', r.status === 200, r.body?.message);
r = await call('GET', `/public/api/${A.publicSlug}/memos`, null);
ok('the public API only reaches public records', r.status === 200 && r.body?.doc?.map(d => d.title).join() === 'Everyone', `${r.status} ${JSON.stringify(r.body?.doc?.map(d => d.title))}`);
r = await call('POST', `/public/api/${A.publicSlug}/memos`, { title: 'From the site', privacy: 'only-me' }, null);
r = await call('GET', P(A._id, '/memos?limit=50'), null, vera);
ok('what a site sends in is public: the team sees it', (r.body?.doc || []).some(d => d.title === 'From the site' && d.privacy === 'public'), JSON.stringify((r.body?.doc || []).map(d => `${d.title}:${d.privacy}`)));

await mongoose.disconnect();
done();
