// CMS-05 (docs/cms D5): drafts and publishing — records of a drafts model stay off the API until published;
// edits after that are a draft (the API keeps the published values, filters and sort run on them, links filled
// in); discard goes back; unpublish takes it off; bulk publish; turning it on publishes what's there; a model
// without it refuses publish; the page says draftAndPublish and gets a Published column. D11: Publish is a right
// of its own — records:publish on standard roles, publish-<route> on a project's own role (only for drafts models).
// Uses projects.mjs's state (pat); makes its own project.
import mongoose from 'mongoose';
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
await mongoose.connect(process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev');
const stamp = Date.now();

let r = await call('POST', '/tenant/api/projects', { name: `CMS drafts ${stamp}`, type: 'app' }, s.pat);
const pid = r.body?._id;
const slug = r.body?.publicSlug;
ok('project made', !!pid, r.body?.message);
const P = path => `/tenant/api/p/${pid}${path}`;
const B = path => P(`/builder${path}`);
const pub = path => fetch(`${ROOT}/public/api/${slug}${path}`).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));

const author = (await call('POST', B('/models'), { name: 'Author', title: 'Authors', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] }, s.pat)).body?.doc;
await call('PUT', B(`/models/${author._id}/public-api`), { enabled: true, actions: ['list', 'get'], auth: 'none' }, s.pat);
const ana = (await call('POST', P(`/${author.route}`), { name: 'Ana' }, s.pat)).body?.doc;

r = await call('POST', B('/models'), { name: 'Article', title: 'Articles', displayField: 'title', draftAndPublish: true, fields: [
	{ key: 'title', label: 'Title', kind: 'text', required: true },
	{ key: 'rank', label: 'Rank', kind: 'number' },
	{ key: 'author', label: 'Author', kind: 'reference', ref: 'Author' },
] }, s.pat);
const art = r.body?.doc;
ok('a drafts model', r.status === 201 && art?.draftAndPublish === true, JSON.stringify(r.body?.problems || r.body?.message));
const route = art.route;
await call('PUT', B(`/models/${art._id}/public-api`), { enabled: true, actions: ['list', 'get'], auth: 'none' }, s.pat);
r = await call('GET', P(`/${route}/get/route`), null, s.pat);
ok('its page says drafts', r.body?.draftAndPublish === true, JSON.stringify(r.body));
r = await call('GET', P(`/${route}/get/schema`), null, s.pat);
ok('…with a Published column', /"_publishedAt"/.test(JSON.stringify(r.body)) || r.body?._publishedAt, JSON.stringify(r.body).slice(0, 200));

const add = body => call('POST', P(`/${route}`), body, s.pat);
const a1 = (await add({ title: 'First draft', rank: 2, author: ana._id })).body?.doc;
const a2 = (await add({ title: 'Second', rank: 1 })).body?.doc;
ok('records made', !!a1?._id && !!a2?._id && !a1._publishedAt);
r = await pub(`/${route}`);
ok('drafts aren’t on the API', r.status === 200 && r.body?.total === 0, JSON.stringify(r.body));
r = await pub(`/${route}/${a1._id}`);
ok('…not even by id', r.status === 404, r.status);

/* ---- publish */
r = await call('POST', P(`/${route}/${a1._id}/publish`), {}, s.pat);
ok('published', r.status === 200 && r.body?.status === 'published' && !!r.body?.doc, JSON.stringify(r.body).slice(0, 200));
r = await pub(`/${route}`);
ok('now on the API, its link filled in', r.body?.total === 1 && r.body.doc[0].title === 'First draft' && r.body.doc[0].author?.name === 'Ana', JSON.stringify(r.body));
r = await call('GET', P(`/${route}/${a1._id}`), null, s.pat);
const one = r.body?.doc || r.body;
ok('the panel sees when, and no snapshot', !!one?._publishedAt && !('_published' in one), JSON.stringify(one).slice(0, 200));

/* ---- a draft on top */
r = await call('PUT', P(`/${route}/${a1._id}`), { title: 'Better title', rank: 9 }, s.pat);
r = await pub(`/${route}/${a1._id}`);
ok('an edit is a draft: the API keeps what’s published', r.status === 200 && r.body?.title === 'First draft' && r.body.rank === 2, JSON.stringify(r.body));
r = await call('GET', P(`/${route}/${a1._id}`), null, s.pat);
const edited = r.body?.doc || r.body;
ok('…the panel has the draft, newer than what’s published', edited?.title === 'Better title' && new Date(edited.updatedAt) > new Date(edited._publishedFrom), JSON.stringify(edited).slice(0, 250));
r = await pub(`/${route}?title=Better%20title`);
ok('filters run on published values (the draft’s title finds nothing)', r.body?.total === 0, JSON.stringify(r.body));
r = await pub(`/${route}?title=First%20draft`);
ok('…the published one finds it', r.body?.total === 1);
r = await pub(`/${route}?search=better`);
ok('…search too', r.body?.total === 0);

/* ---- discard, unpublish, bulk */
r = await call('POST', P(`/${route}/${a1._id}/discard`), {}, s.pat);
r = await call('GET', P(`/${route}/${a1._id}`), null, s.pat);
const back = r.body?.doc || r.body;
ok('discard: the draft is what’s published again', back?.title === 'First draft' && back.rank === 2 && new Date(back.updatedAt).getTime() <= new Date(back._publishedFrom).getTime(), JSON.stringify(back).slice(0, 250));
r = await call('POST', P(`/${route}/${a2._id}/discard`), {}, s.pat);
ok('discard on a never-published record says why', r.status === 400 && /never been published/.test(r.body?.message), r.body?.message);
r = await call('POST', P(`/${route}/bulk/publish`), { ids: [a1._id, a2._id] }, s.pat);
ok('bulk publish', r.status === 200 && r.body?.published === 2, JSON.stringify(r.body));
r = await pub(`/${route}?sort=rank`);
ok('both live, sorted by published values', r.body?.total === 2 && r.body.doc.map(d => d.title).join() === 'Second,First draft', JSON.stringify(r.body?.doc?.map(d => d.title)));
r = await call('POST', P(`/${route}/${a2._id}/unpublish`), {}, s.pat);
r = await pub(`/${route}`);
ok('unpublished: off the API, the draft stays', r.body?.total === 1 && (await call('GET', P(`/${route}/${a2._id}`), null, s.pat)).status === 200, JSON.stringify(r.body));

/* ---- a model without it; switching it on */
r = await call('POST', P(`/${author.route}/${ana._id}/publish`), {}, s.pat);
ok('a model without drafts refuses publish', r.status === 400 && /off for this page/.test(r.body?.message), r.body?.message);
await call('POST', P(`/${author.route}`), { name: 'Bo' }, s.pat);
r = await call('PUT', B(`/models/${author._id}`), { title: 'Authors', displayField: 'name', draftAndPublish: true, fields: author.fields }, s.pat);
ok('switched on: what’s there is published', r.status === 200 && r.body?.publishedNow === 2, JSON.stringify({ s: r.status, n: r.body?.publishedNow, m: r.body?.message }));
r = await pub(`/${author.route}`);
ok('…so nothing left the API', r.body?.total === 2, JSON.stringify(r.body));
await call('PUT', P(`/${author.route}/${ana._id}`), { name: 'Ana Maria' }, s.pat);
r = await pub(`/${author.route}/${ana._id}`);
ok('…and edits are drafts from then on', r.body?.name === 'Ana', JSON.stringify(r.body));

/* ---- CMS-07: the content manager */
r = await call('GET', P(`/${route}?limit=50`), null, s.pat);
ok('the list says where each record stands', (r.body?.doc || []).every(d => ['Draft', 'Published', 'Changes not published'].includes(d._status)), JSON.stringify((r.body?.doc || []).map(d => d._status)));
await call('PUT', P(`/${route}/${a1._id}`), { title: 'Edited again' }, s.pat);
r = await call('GET', P(`/${route}?publishStatus=modified`), null, s.pat);
ok('…filtered to the changed ones', r.body?.doc?.length === 1 && r.body.doc[0]._id === a1._id && r.body.doc[0]._status === 'Changes not published', JSON.stringify(r.body?.doc?.map(d => d.title)));
r = await call('GET', P(`/${route}?publishStatus=draft`), null, s.pat);
ok('…to the never published', r.body?.doc?.length === 1 && r.body.doc[0]._id === a2._id, JSON.stringify(r.body?.doc?.map(d => d.title)));
r = await call('GET', P(`/${route}?publishStatus=published`), null, s.pat);
ok('…to the live and unchanged', r.body?.doc?.length === 0, JSON.stringify(r.body?.doc?.map(d => d.title)));
r = await call('GET', P(`/${route}/get/schema`), null, s.pat);
ok('…a Status column', r.body?._status?.tableType === 'tag', JSON.stringify(r.body?._status));
r = await call('GET', P(`/${route}/get/filters`), null, s.pat);
ok('…and its filter', JSON.stringify(r.body).includes('publishStatus'), JSON.stringify(r.body).slice(0, 300));
r = await call('GET', P('/content'), null, s.pat);
const art2 = r.body?.collections?.find(c => c.route === route);
ok('All content: the collections with how many aren’t live', r.status === 200 && art2?.total === 2 && art2.modified === 1 && art2.draft === 1 && art2.waiting === 2 && art2.last?.name === 'Edited again', JSON.stringify(r.body).slice(0, 300));
r = await call('GET', P('/sidebar/web/server'), null, s.pat);
ok('…in the sidebar, after the Dashboard', JSON.stringify(r.body).includes('"href":"/content"'), JSON.stringify(r.body).slice(0, 200));

/* ---- D11: Publish is a right of its own */
r = await call('GET', '/tenant/api/org/permissions', null, s.pat);
ok('Publish is a standard permission', r.body?.organization?.some(p => p.key === 'records:publish'), JSON.stringify(r.body?.organization?.map(p => p.key)));
r = await call('GET', P('/people'), null, s.pat);
const targets = r.body?.models || [];
ok('a project role can name Publish on a drafts model only', targets.find(t => t.route === route)?.actions?.includes('publish') && targets.find(t => t.route === author.route)?.actions?.includes('publish') && !targets.find(t => t.route === 'image')?.actions?.includes('publish'), JSON.stringify(targets));
r = await call('POST', P('/people/roles'), { name: `Writer ${stamp}`, permissions: [`edit-${route}`, 'publish-image'] }, s.pat);
const writer = r.body;
ok('a Writer: edits, doesn’t publish', r.status === 201 && writer?.permissions?.join() === `view-${route},edit-${route}`, JSON.stringify(r.body));
const email = `rae${stamp}@example.com`;
let rae = (await call('POST', '/tenant/api/auth/register', { name: 'Rae', email, password: 'drafts-pass-123', organization: `Rae Co ${stamp}`, country: 'BD' })).body?.token;
await mongoose.connection.db.collection('tenantusers').updateOne({ email }, { $set: { emailVerified: true } });
await call('POST', P('/people/invitations'), { email, role: writer?._id }, s.pat);
const inv = (await call('GET', '/tenant/api/invitations/for-me', null, rae)).body?.doc?.[0];
rae = (await call('POST', `/tenant/api/invitations/for-me/${inv?._id}/accept`, null, rae)).body?.token || rae;
r = await call('PUT', P(`/${route}/${a2._id}`), { title: 'Second, by Rae' }, rae);
ok('…Rae edits the draft', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('POST', P(`/${route}/${a2._id}/publish`), {}, rae);
ok('…but can’t publish it', r.status === 403, r.status);
r = await call('POST', P(`/${route}/bulk/publish`), { ids: [a2._id] }, rae);
ok('…nor in bulk', r.status === 403, r.status);
r = await call('PUT', P(`/people/roles/${writer?._id}`), { name: `Writer ${stamp}`, permissions: [`edit-${route}`, `publish-${route}`] }, s.pat);
ok('the role gains Publish', r.status === 200 && r.body?.permissions?.includes(`publish-${route}`), JSON.stringify(r.body));
r = await call('POST', P(`/${route}/${a2._id}/publish`), {}, rae);
ok('…now Rae publishes', r.status === 200 && r.body?.status === 'published', `${r.status} ${r.body?.message}`);
r = await call('POST', B('/models'), { name: 'Note', title: 'Notes', fields: [{ key: 'text', label: 'Text', kind: 'text' }] }, s.pat);
const note = r.body?.doc;
await call('PUT', P(`/people/roles/${writer?._id}`), { name: `Writer ${stamp}`, permissions: [`edit-${route}`, `publish-${route}`, `edit-${note.route}`] }, s.pat);
r = await call('PUT', B(`/models/${note._id}`), { title: 'Notes', displayField: 'text', draftAndPublish: true, fields: note.fields }, s.pat);
r = await call('GET', P('/people'), null, s.pat);
ok('drafts switched on: roles that edited it can publish it', r.body?.roles?.find(x => x._id === writer?._id)?.permissions?.includes(`publish-${note.route}`), JSON.stringify(r.body?.roles?.find(x => x._id === writer?._id)));

r = await call('DELETE', `/tenant/api/projects/${pid}?force=1`, null, s.pat);
ok('project deleted', r.status === 200, r.body?.message);
await mongoose.disconnect();
done();
