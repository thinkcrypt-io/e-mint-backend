// CMS-04 (docs/cms D4): content blocks — a field holding components in any order, each item checked as its
// own component (required, options, defaults, unknown fields dropped), only the allowed kinds, a count limit,
// a stable _key; the form gets the blocks editor's settings; the API sends __component + _key; a component's
// change reaches block items; one in use by blocks can't be deleted; plans can use blocks.
// Uses projects.mjs's state (pat); makes its own project.
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
const stamp = Date.now();

let r = await call('POST', '/tenant/api/projects', { name: `CMS blocks ${stamp}`, type: 'app' }, s.pat);
const pid = r.body?._id;
const slug = r.body?.publicSlug;
ok('project made', !!pid, r.body?.message);
const P = path => `/tenant/api/p/${pid}${path}`;
const B = path => P(`/builder${path}`);
const comp = body => call('POST', B('/components'), body, s.pat);

const hero = (await comp({ category: 'content', name: 'hero', title: 'Hero', fields: [
	{ key: 'heading', label: 'Heading', kind: 'text', required: true },
	{ key: 'text', label: 'Text', kind: 'editor' },
	{ key: 'align', label: 'Align', kind: 'select', default: 'left', options: [{ value: 'left' }, { value: 'center' }] },
] })).body;
await comp({ category: 'content', name: 'faq', title: 'Question', fields: [{ key: 'question', label: 'Question', kind: 'text', required: true }, { key: 'answer', label: 'Answer', kind: 'textarea' }] });
await comp({ category: 'shared', name: 'button', title: 'Button', fields: [{ key: 'label', label: 'Label', kind: 'text' }] });
ok('components made', !!hero?._id);

/* ---- the field */
r = await call('POST', B('/models'), { name: 'Page', title: 'Pages', fields: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'body', label: 'Body', kind: 'blocks' }] }, s.pat);
ok('blocks need their components', r.status === 400 && /pick the components it takes/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
r = await call('POST', B('/models'), { name: 'Page', title: 'Pages', fields: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'body', label: 'Body', kind: 'blocks', components: ['content.hero', 'content.nope'] }] }, s.pat);
ok('…that exist', r.status === 400 && /no component “content.nope”/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
r = await call('POST', B('/models'), { name: 'Page', title: 'Pages', fields: [
	{ key: 'title', label: 'Title', kind: 'text', required: true },
	{ key: 'body', label: 'Body', kind: 'blocks', components: ['content.hero', 'content.faq'], max: 4 },
] }, s.pat);
const page = r.body?.doc;
ok('a model with content blocks', r.status === 201 && page?.fields?.find(f => f.key === 'body')?.components?.length === 2, JSON.stringify(r.body?.problems || r.body?.message));
const route = page?.route;
const add = body => call('POST', P(`/${route}`), body, s.pat);

/* ---- items */
r = await add({ title: 'Home', body: [
	{ __component: 'content.hero', heading: 'Fresh bread', text: '<p>Daily</p>', extra: 'dropped' },
	{ __component: 'content.faq', question: 'Open Sundays?', answer: 'Yes, 8–2' },
	{ __component: 'content.faq', question: 'Gluten free?' },
] });
const home = r.body?.doc;
const b = home?.body || [];
ok('a record with mixed blocks, in order', r.status === 201 && b.map(x => x.__component).join() === 'content.hero,content.faq,content.faq', JSON.stringify(r.body).slice(0, 300));
ok('each item is its component: default filled, unknown field dropped, a _key given', b[0]?.align === 'left' && !('extra' in b[0]) && b.every(x => typeof x._key === 'string' && x._key.length >= 6), JSON.stringify(b));
r = await add({ title: 'Bad', body: [{ __component: 'content.hero' }] });
ok('an item’s own required field is checked', r.status === 400 && /heading/i.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await add({ title: 'Bad', body: [{ __component: 'content.hero', heading: 'x', align: 'right' }] });
ok('…and its options', r.status === 400 && /align/i.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await add({ title: 'Bad', body: [{ __component: 'shared.button', label: 'Go' }] });
ok('a component the field doesn’t take is refused', r.status === 400 && /must be one of content\.hero, content\.faq/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await add({ title: 'Bad', body: Array.from({ length: 5 }, (_, i) => ({ __component: 'content.faq', question: `Q${i}` })) });
ok('the most is checked', r.status === 400 && /at most 4 items|less than or equal to 4/.test(r.body?.message), `${r.status} ${r.body?.message}`);
const keys = b.map(x => x._key);
r = await call('PUT', P(`/${route}/${home._id}`), { body: [b[2], b[0], b[1]] }, s.pat);
r = await call('GET', P(`/${route}/${home._id}`), null, s.pat);
const after = (r.body?.doc || r.body)?.body || [];
ok('reordered, the items keep their keys', after.map(x => x._key).join() === [keys[2], keys[0], keys[1]].join(), JSON.stringify(after.map(x => x._key)));

/* ---- the form and the API */
r = await call('GET', P(`/${route}/get/schema`), null, s.pat);
const sch = JSON.stringify(r.body);
ok('the form gets the blocks editor with each component’s fields', /"type":"blocks"/.test(sch) && /"uid":"content.hero"/.test(sch) && /"name":"question"/.test(sch), sch.slice(0, 300));
await call('PUT', B(`/models/${page._id}/public-api`), { enabled: true, actions: ['list'], auth: 'none' }, s.pat);
const pub = await fetch(`${ROOT}/public/api/${slug}/${route}`).then(x => x.json());
const first = pub.doc?.[0]?.body?.[0];
ok('the API sends each item with __component and _key', first?.__component === 'content.faq' && first._key === keys[2], JSON.stringify(pub).slice(0, 300));

/* ---- a component's change reaches block items */
r = await call('PUT', B(`/components/${hero._id}`), { title: 'Hero', fields: [...hero.fields, { key: 'image', label: 'Image', kind: 'image' }] }, s.pat);
ok('changed: the model using it in blocks is refreshed', r.status === 200 && r.body?.refreshed?.some(m => m.route === route), JSON.stringify(r.body?.refreshed));
r = await add({ title: 'With image', body: [{ __component: 'content.hero', heading: 'Hi', image: 'hero.jpg' }] });
ok('…its items take the new field', r.status === 201 && r.body?.doc?.body?.[0]?.image === 'hero.jpg', JSON.stringify(r.body).slice(0, 200));
r = await call('DELETE', B(`/components/${hero._id}`), null, s.pat);
ok('in use by blocks: can’t be deleted', r.status === 400 && /Pages \(Body\)/.test(r.body?.message), r.body?.message);

/* ---- plans */
r = await call('POST', B('/api-keys'), { name: 'AI', scopes: ['read', 'build'] }, s.pat);
const mk = r.body?.secret || r.body?.key || r.body?.doc?.secret;
const t = await fetch(`${ROOT}/tenant/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${mk}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'plan_feature', arguments: { feature: { title: 'Landing pages', summary: 'Pages of blocks', steps: [{ action: 'create', rationale: 'Pages', name: 'Landing', title: 'Landings', fields: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'body', label: 'Body', kind: 'blocks', components: ['content.hero', 'content.faq'] }], table: ['title'], form: [], filters: [] }] } } } }) }).then(x => x.json());
ok('a plan can use content blocks', !t.result?.isError, (t.result?.content?.[0]?.text || '').slice(0, 300));

r = await call('DELETE', `/tenant/api/projects/${pid}?force=1`, null, s.pat);
ok('project deleted', r.status === 200, r.body?.message);
done();
