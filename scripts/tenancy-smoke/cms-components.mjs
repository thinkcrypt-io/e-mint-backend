// CMS-03 (docs/cms D3): components — made once, used by models once or as a list (min/max), compiled
// as sections so records, forms and the public API take them; a change reaches every model using it;
// in-use ones can't be deleted; MCP list_components / save_component; a project's go with it.
// Uses projects.mjs's state (pat); makes its own project.
import mongoose from 'mongoose';
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
const stamp = Date.now();
const MONGO = process.env.MONGO_CONNECTION_URI || process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';

let r = await call('POST', '/tenant/api/projects', { name: `CMS components ${stamp}`, type: 'app' }, s.pat);
const pid = r.body?._id;
const slug = r.body?.publicSlug;
ok('project made', !!pid, r.body?.message);
const P = path => `/tenant/api/p/${pid}${path}`;
const B = path => P(`/builder${path}`);

/* ---- making components */
r = await call('POST', B('/components'), { category: 'shared', name: 'button', title: 'Button', fields: [] }, s.pat);
ok('a component needs fields', r.status === 400 && /at least one field/i.test(JSON.stringify(r.body)), JSON.stringify(r.body));
r = await call('POST', B('/components'), { category: 'shared', name: 'link', title: 'Link', fields: [{ key: 'to', label: 'To', kind: 'reference', ref: 'TenantUser' }] }, s.pat);
ok('no links inside a component', r.status === 400 && /can't be of the kind “reference”|isn't a model/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
r = await call('POST', B('/components'), { category: 'Shared', name: 'Button', title: 'Button', icon: 'mouse-pointer-click', fields: [
	{ key: 'label', label: 'Label', kind: 'text', required: true },
	{ key: 'url', label: 'Link', kind: 'url' },
	{ key: 'style', label: 'Style', kind: 'select', default: 'primary', options: [{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }] },
] }, s.pat);
const button = r.body;
ok('shared.button made', r.status === 201 && button?.uid === 'shared.button' && button.fields.length === 3, JSON.stringify(r.body));
r = await call('POST', B('/components'), { category: 'shared', name: 'button', title: 'Again', fields: [{ key: 'a', label: 'A', kind: 'text' }] }, s.pat);
ok('the same uid twice is refused', r.status === 400 && /already a component “shared.button”/.test(r.body?.message), r.body?.message);
r = await call('POST', B('/components'), { category: 'content', name: 'hero', title: 'Hero', fields: [
	{ key: 'heading', label: 'Heading', kind: 'text', required: true },
	{ key: 'text', label: 'Text', kind: 'editor' },
	{ key: 'gallery', label: 'Pictures', kind: 'images' },
] }, s.pat);
ok('rich text and galleries fit in a component', r.status === 201 && r.body?.uid === 'content.hero', JSON.stringify(r.body));

/* ---- using them */
r = await call('POST', B('/models'), { name: 'Promo', title: 'Promos', fields: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'cta', label: 'Button', kind: 'component', component: 'shared.nope' }] }, s.pat);
ok('an unknown component is refused', r.status === 400 && /no component “shared.nope”/.test(JSON.stringify(r.body)), JSON.stringify(r.body));
r = await call('POST', B('/models'), { name: 'Landing', title: 'Landings', fields: [
	{ key: 'title', label: 'Title', kind: 'text', required: true },
	{ key: 'cta', label: 'Main button', kind: 'component', component: 'shared.button' },
	{ key: 'buttons', label: 'More buttons', kind: 'component', component: 'shared.button', repeatable: true, min: 1, max: 3 },
	{ key: 'hero', label: 'Hero', kind: 'component', component: 'content.hero' },
] }, s.pat);
const landing = r.body?.doc;
ok('a model using components', r.status === 201 && landing?.fields?.find(f => f.key === 'buttons')?.repeatable === true, JSON.stringify(r.body?.problems || r.body?.message));
const route = landing?.route;
const add = body => call('POST', P(`/${route}`), body, s.pat);
r = await add({ title: 'Spring', cta: { label: 'Order', url: 'https://example.com/order' }, buttons: [{ label: 'Menu' }, { label: 'Visit', style: 'secondary' }], hero: { heading: 'Fresh bread', text: '<p>Daily</p>', gallery: ['a.jpg', 'b.jpg'] } });
const rec = r.body?.doc;
ok('a record with them', r.status === 201 && rec?.cta?.label === 'Order' && rec.buttons.length === 2 && rec.buttons[0].style === 'primary' && rec.hero.gallery.length === 2, JSON.stringify(r.body).slice(0, 300));
r = await add({ title: 'No label', cta: { url: 'https://example.com' } });
ok('a component’s own required field is checked', r.status === 400 && /Label/i.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await add({ title: 'Left blank', cta: { label: '', url: '' }, hero: {} });
ok('a component left blank in the form is simply not set', r.status === 201 && r.body?.doc?.cta === undefined && r.body?.doc?.hero === undefined, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
r = await add({ title: 'Too many', buttons: [{ label: '1' }, { label: '2' }, { label: '3' }, { label: '4' }] });
ok('a list’s most is checked', r.status === 400 && /between 1 and 3|less than or equal to 3/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await add({ title: 'Wrong style', cta: { label: 'X', style: 'loud' } });
ok('a component’s options are checked', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('GET', P(`/${route}/get/schema`), null, s.pat);
const schema = JSON.stringify(r.body);
ok('the form draws them as sections', r.status === 200 && /section-object/.test(schema) && /section-data-array/.test(schema) && /"name":"style"/.test(schema), schema.slice(0, 300));

/* ---- changing a component reaches its models */
r = await call('PUT', B(`/components/${button._id}`), { title: 'Button', fields: [...button.fields, { key: 'newTab', label: 'Open in a new tab', kind: 'boolean' }] }, s.pat);
ok('changed: its models are refreshed', r.status === 200 && r.body?.refreshed?.some(m => m.route === route) && r.body.version === 2, JSON.stringify(r.body).slice(0, 300));
r = await add({ title: 'Autumn', cta: { label: 'Book', newTab: true } });
ok('…records take the new field', r.status === 201 && r.body?.doc?.cta?.newTab === true, JSON.stringify(r.body).slice(0, 200));
r = await call('GET', P(`/${route}/get/schema`), null, s.pat);
ok('…and so does the form', /"name":"newTab"/.test(JSON.stringify(r.body)));

/* ---- the public API */
r = await call('PUT', B(`/models/${landing._id}/public-api`), { enabled: true, actions: ['list'], auth: 'none' }, s.pat);
const pub = await fetch(`${ROOT}/public/api/${slug}/${route}?sort=createdAt`).then(x => x.json());
const spring = (pub.doc || []).find(d => d.title === 'Spring');
ok('the API sends them as objects and lists', spring?.cta?.label === 'Order' && Array.isArray(spring.buttons) && spring.hero?.heading === 'Fresh bread', JSON.stringify(pub).slice(0, 300));

/* ---- deleting */
r = await call('DELETE', B(`/components/${button._id}`), null, s.pat);
ok('in use: can’t be deleted, naming where', r.status === 400 && /used by Landings \(Main button\), Landings \(More buttons\)/.test(r.body?.message), r.body?.message);
r = await call('GET', B('/components'), null, s.pat);
ok('the list says who uses each', r.body?.doc?.find(c => c.uid === 'shared.button')?.usedBy?.length === 2 && r.body.doc.find(c => c.uid === 'content.hero')?.usedBy?.length === 1);

/* ---- MCP */
r = await call('POST', B('/api-keys'), { name: 'AI', scopes: ['read', 'build'] }, s.pat);
const mk = r.body?.secret || r.body?.key || r.body?.doc?.secret;
const rpc = async (method, params) =>
	(await fetch(`${ROOT}/tenant/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${mk}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then(x => x.json())).result;
let t = await rpc('tools/call', { name: 'list_components', arguments: {} });
ok('list_components', /shared\.button — Button/.test(t?.content?.[0]?.text || '') && /used by: Landings\.Main button/.test(t?.content?.[0]?.text || ''), t?.content?.[0]?.text);
t = await rpc('tools/call', { name: 'save_component', arguments: { category: 'seo', name: 'meta', title: 'SEO', fields: [{ key: 'title', label: 'Title', kind: 'text', max: 70 }, { key: 'description', label: 'Description', kind: 'textarea' }] } });
ok('save_component makes one', !t?.isError && /Saved the component seo\.meta/.test(t?.content?.[0]?.text || ''), t?.content?.[0]?.text);
t = await rpc('tools/call', { name: 'plan_feature', arguments: { feature: { title: 'Articles', summary: 'Articles with SEO', steps: [{ action: 'create', rationale: 'Articles', name: 'Article', title: 'Articles', fields: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'seo', label: 'SEO', kind: 'component', component: 'seo.meta' }], table: ['title'], form: [], filters: [] }] } } });
ok('a plan can use a component', !t?.isError && !/no component/.test(t?.content?.[0]?.text || ''), (t?.content?.[0]?.text || '').slice(0, 400));

/* ---- a project's components go with it */
r = await call('DELETE', `/tenant/api/projects/${pid}?force=1`, null, s.pat);
ok('project deleted', r.status === 200, r.body?.message);
await mongoose.connect(MONGO);
const left = await mongoose.connection.db.collection('componentdefinitions').countDocuments({ project: new mongoose.Types.ObjectId(pid) });
ok('…with its components', left === 0, left);
await mongoose.disconnect();
done();
