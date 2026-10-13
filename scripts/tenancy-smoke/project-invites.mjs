// WO-47: inviting people into one project as Member or Developer — guests of
// the organization who open only their projects, a project's own role, the
// Invite to projects permission, and every organization's projects in
// auth/self. Stands alone (its own accounts). Local scratch server only.
import mongoose from 'mongoose';
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const PASS = 'invite-pass-123';
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const MONGO = process.env.MONGO_CONNECTION_URI || process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
await mongoose.connect(MONGO);
const verify = email => mongoose.connection.db.collection('tenantusers').updateOne({ email }, { $set: { emailVerified: true } });
const register = async (name, key) =>
	(await call('POST', '/tenant/api/auth/register', { name, email: `${key}${stamp}@example.com`, password: PASS, organization: `${name} Co ${stamp}`, country: 'BD' })).body.token;

// Alma owns Alpha, with two projects.
const alma = await register('Alma', 'alma');
const project = async name => (await call('POST', '/tenant/api/projects', { name, type: 'app' }, alma)).body;
const shop = await project('Shop');
const blog = await project('Blog');
let r = await call('POST', P(shop._id, '/builder/models'), { name: 'Item', title: 'Items', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] }, alma);
ok('a model in Shop', r.status === 200 || r.status === 201, r.body?.message);

/* ---- the new role and permission */
r = await call('GET', '/tenant/api/org/permissions', null, alma);
ok('Invite to projects is a permission', !!r.body?.organization?.find(p => p.key === 'invite-to-projects'));
r = await call('GET', '/tenant/api/org/roles', null, alma);
const developer = r.body?.doc?.find(x => x.system === 'developer');
ok('Developer role: records + build + AI keys', developer?.permissions?.join() === 'records:view,records:create,records:edit,records:delete,build,manage-api-keys', developer?.permissions?.join());

/* ---- Gina, from her own organization, invited to Shop as Developer */
const ginaEmail = `gina${stamp}@example.com`;
let gina = await register('Gina', 'gina');
r = await call('POST', P(shop._id, '/people/invitations'), { email: ginaEmail, role: 'admin' }, alma);
ok('only Member or Developer', r.status === 400, r.body?.message);
r = await call('POST', P(shop._id, '/people/invitations'), { email: ginaEmail, name: 'Gina', role: 'developer' }, alma);
ok('invited to Shop as Developer', r.status === 200 && r.body?.project?._id === shop._id && r.body?.role?.name === 'Developer', r.body?.message);
const ginaInvite = r.body?._id;
r = await call('POST', P(shop._id, `/people/invitations/${ginaInvite}/resend`), null, alma);
ok('resending at once is held back', r.status === 429, r.status);
r = await call('GET', '/tenant/api/org/invitations', null, alma);
ok("the organization's pending list shows it, with its project", r.body?.doc?.find(i => i._id === ginaInvite)?.project?.name === 'Shop');
r = await call('GET', P(shop._id, '/people'), null, alma);
ok("Shop's People: Alma (every project) and the pending invitation", r.body?.doc?.length === 1 && r.body.doc[0].access === 'organization' && r.body?.invitations?.length === 1, JSON.stringify(r.body?.doc?.map(p => p.access)));
ok('People offers Member and Developer', r.body?.roles?.map(x => x.system).join() === 'member,developer');

await verify(ginaEmail);
r = await call('GET', '/tenant/api/invitations/for-me', null, gina);
const mine = r.body?.doc?.[0];
ok('Gina sees it: a project, Shop, as Developer', mine?.project === true && mine?.projects?.join() === 'Shop' && mine?.role === 'Developer', JSON.stringify(r.body?.doc));
r = await call('POST', `/tenant/api/invitations/for-me/${mine?._id}/accept`, null, gina);
ok('accepted → a token in Alpha and Shop to open', r.status === 200 && !!r.body?.token && r.body?.project === shop.publicSlug, r.body?.message);
gina = r.body?.token || gina;

r = await call('GET', '/tenant/api/auth/self', null, gina);
const alpha = r.body?.organizations?.find(o => o._id === r.body?.organization?._id);
ok('self: both organizations, each with its projects', r.body?.organizations?.length === 2 && alpha?.projects?.map(p => p.name).join() === 'Shop', JSON.stringify(r.body?.organizations?.map(o => [o.name, o.projects?.length])));
ok('…Alpha marked as a guest', alpha?.guest === true && alpha?.role === 'Developer');
ok('…no organization-wide keys', !r.body?.permissions?.includes('create-projects') && !r.body?.permissions?.includes('manage-members'), r.body?.permissions?.join());
ok("…Shop carries Developer's keys", r.body?.projects?.[0]?.permissions?.includes('build'), JSON.stringify(r.body?.projects));

r = await call('GET', P(shop._id, '/builder/models'), null, gina);
ok('builds in Shop', r.status === 200, r.status);
r = await call('POST', P(shop._id, '/items'), { name: 'Lamp' }, gina);
ok('adds records in Shop', r.status === 200 || r.status === 201, r.body?.message);
r = await call('GET', P(blog._id, '/builder/models'), null, gina);
ok('Blog answers 404', r.status === 404, r.status);
r = await call('POST', '/tenant/api/projects', { name: 'Mine', type: 'app' }, gina);
ok("can't start projects in Alpha", r.status === 403, r.status);
r = await call('GET', '/tenant/api/org/members', null, gina);
ok("doesn't see Alpha's members", r.status === 403, r.status);
r = await call('GET', P(shop._id, '/people'), null, gina);
ok("can't invite people herself", r.status === 403, r.status);
r = await call('GET', '/tenant/api/sidebar/web/server', null, gina);
ok('no Members in her sidebar', !JSON.stringify(r.body).includes('/org/members'));

/* ---- someone already in the organization: Blog is added at once, as Member */
r = await call('POST', P(blog._id, '/people/invitations'), { email: ginaEmail, role: 'member' }, alma);
ok('already a guest: added to Blog at once', r.status === 200 && r.body?.added === true, r.body?.message);
r = await call('GET', '/tenant/api/auth/self', null, gina);
const blogHere = r.body?.projects?.find(p => p._id === blog._id);
ok('Blog in her list, with Member keys', !!blogHere && !blogHere.permissions?.includes('build') && blogHere.permissions?.includes('records:view'), JSON.stringify(blogHere?.permissions));
r = await call('GET', P(blog._id, '/builder/models'), null, gina);
ok("doesn't build in Blog", r.status === 403, r.status);
r = await call('GET', P(shop._id, '/builder/models'), null, gina);
ok('still builds in Shop', r.status === 200, r.status);
r = await call('POST', P(shop._id, '/people/invitations'), { email: ginaEmail, role: 'member' }, alma);
ok('inviting her to Shop again: change her role instead', r.status === 400, r.body?.message);
r = await call('POST', P(shop._id, '/people/invitations'), { email: `alma${stamp}@example.com`, role: 'member' }, alma);
ok('the owner opens every project already', r.status === 400, r.body?.message);

/* ---- her role in one project */
r = await call('GET', P(shop._id, '/people'), null, alma);
const ginaHere = r.body?.doc?.find(p => p.user?.email === ginaEmail);
ok('People: Gina, given Shop, as Developer', ginaHere?.access === 'project' && ginaHere?.role?.name === 'Developer' && ginaHere?.guest === true, JSON.stringify(ginaHere));
r = await call('PUT', P(shop._id, `/people/${ginaHere?._id}`), { role: 'member' }, alma);
ok('made Member in Shop', r.status === 200, r.body?.message);
r = await call('GET', P(shop._id, '/builder/models'), null, gina);
ok('…builds no more there', r.status === 403, r.status);
const almaHere = (await call('GET', P(shop._id, '/people'), null, alma)).body?.doc?.find(p => p.user?.email === `alma${stamp}@example.com`);
r = await call('PUT', P(shop._id, `/people/${almaHere?._id}`), { role: 'member' }, alma);
ok("the owner's role isn't changed here", r.status === 400, r.body?.message);

/* ---- a role with Invite to projects */
r = await call('POST', '/tenant/api/org/roles', { name: 'Lead', permissions: ['records:view', 'invite-to-projects'] }, alma);
const lead = r.body?._id;
ok('a role with Invite to projects', r.status === 200 && r.body?.permissions?.includes('invite-to-projects'), r.body?.message);
const ruthEmail = `ruth${stamp}@example.com`;
let ruth = await register('Ruth', 'ruth');
await verify(ruthEmail);
await call('POST', '/tenant/api/org/invitations', { email: ruthEmail, role: lead, allProjects: false, projects: [shop._id] }, alma);
r = await call('GET', '/tenant/api/invitations/for-me', null, ruth);
r = await call('POST', `/tenant/api/invitations/for-me/${r.body?.doc?.[0]?._id}/accept`, null, ruth);
ruth = r.body?.token || ruth;
ok('Ruth joined Alpha for Shop', r.status === 200 && r.body?.project === null, r.body?.message);
r = await call('GET', P(shop._id, '/people'), null, ruth);
ok("Ruth sees Shop's People", r.status === 200 && r.body?.doc?.length === 3, r.body?.doc?.length);
r = await call('POST', P(shop._id, '/people/invitations'), { email: `nia${stamp}@example.com`, role: 'developer' }, ruth);
ok('…and invites to Shop', r.status === 200, r.body?.message);
const niaInvite = r.body?._id;
r = await call('POST', P(blog._id, '/people/invitations'), { email: `nia${stamp}@example.com`, role: 'developer' }, ruth);
ok("…but not to Blog, which she can't open", r.status === 404, r.status);
r = await call('GET', '/tenant/api/sidebar/web/server', null, ruth);
r = await call('GET', P(shop._id, '/sidebar/web/server'), null, ruth);
ok('People in her project sidebar', JSON.stringify(r.body).includes('/project-people'));
r = await call('DELETE', P(shop._id, `/people/invitations/${niaInvite}`), null, ruth);
ok('cancels it', r.status === 200, r.body?.message);
r = await call('GET', P(shop._id, '/people'), null, ruth);
ok('…gone from pending', !r.body?.invitations?.some(i => i._id === niaInvite));
r = await call('DELETE', '/tenant/api/org/roles/' + developer._id, null, alma);
ok("Developer (a system role) can't be deleted", r.status === 400, r.body?.message);
r = await call('POST', '/tenant/api/org/roles', { name: 'Temp', permissions: ['records:view'] }, alma);
ok('a role can be made', r.status === 200);

/* ---- promoting a guest on Members makes her a full member */
r = await call('GET', '/tenant/api/org/members', null, alma);
const ginaMember = r.body?.doc?.find(m => m.user?.email === ginaEmail);
ok('Members lists Gina as a guest with her projects', ginaMember?.guest === true && ginaMember?.projects?.length === 2 && ginaMember?.projectRoles?.length === 2, JSON.stringify(ginaMember));

/* ---- taking projects away */
r = await call('DELETE', P(shop._id, `/people/${ginaMember?._id}`), null, alma);
ok('removed from Shop', r.status === 200, r.body?.message);
r = await call('GET', P(shop._id, '/items'), null, gina);
ok('Shop is closed to her', r.status === 404, r.status);
r = await call('GET', P(blog._id, '/'), null, gina);
ok('Blog still open', r.status === 200, r.status);
r = await call('DELETE', P(blog._id, `/people/${ginaMember?._id}`), null, alma);
ok('removed from Blog, her last project', r.status === 200, r.body?.message);
r = await call('GET', '/tenant/api/auth/self', null, gina);
ok('…so she has left Alpha', r.status === 401 && r.body?.code === 'ORG_ACCESS_REVOKED', JSON.stringify(r.body));

/* ---- a deleted project's invitations can't be accepted */
const omarEmail = `omar${stamp}@example.com`;
const omar = await register('Omar', 'omar');
await verify(omarEmail);
const temp = await project('Temp');
r = await call('POST', P(temp._id, '/people/invitations'), { email: omarEmail, role: 'member' }, alma);
ok('invited to Temp', r.status === 200, r.body?.message);
await call('DELETE', `/tenant/api/projects/${temp._id}`, null, alma);
r = await call('GET', '/tenant/api/invitations/for-me', null, omar);
ok("Temp's invitation is gone with it", r.status === 200 && r.body?.doc?.length === 0, JSON.stringify(r.body?.doc));

await mongoose.disconnect();
done();
