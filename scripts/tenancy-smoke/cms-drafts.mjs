// CMS-05 (docs/cms D5): drafts and publishing — records of a drafts model stay off the API until published;
// edits after that are a draft (the API keeps the published values, filters and sort run on them, links filled
// in); discard goes back; unpublish takes it off; bulk publish; turning it on publishes what's there; a model
// without it refuses publish; the page says draftAndPublish and gets a Published column.
// Uses projects.mjs's state (pat); makes its own project.
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
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

r = await call('DELETE', `/tenant/api/projects/${pid}?force=1`, null, s.pat);
ok('project deleted', r.status === 200, r.body?.message);
done();
