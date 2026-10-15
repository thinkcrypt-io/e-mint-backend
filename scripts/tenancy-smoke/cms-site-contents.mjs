// CMS-06 (docs/cms D1): the website's contents, typed and by page — the content types (components under content.*),
// the Contents model holding one typed item per record (`block`, `type`, `order`), the Contents screen's API
// (types, by page, create with the type first, edit, reorder, archive), each type checked as its component, the List
// type (a model's records with conditions, order and how many — through the public API's rules) on the site, and a
// typed Cards record's items in a list of cards. Stands alone.
import { call, ok, done } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Cora Contents', email: `cora${stamp}@example.com`, password: 'tenant-pass-123', organization: `Cora ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('signed up', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: `Bakery ${stamp}`, type: 'website' }, T);
const site = r.body;
ok('a website project', r.status === 200 && site?.publicSlug, `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;
const C = path => P(`/site-contents${path}`);

/* ---- the types */
r = await call('GET', C('/types'), null, T);
const types = r.body?.types || [];
const uids = types.map(t => t.uid);
ok('the built-in content types, as components', r.status === 200 && ['content.hero', 'content.cards', 'content.faq', 'content.list', 'content.header', 'content.footer'].every(u => uids.includes(u)), `${r.status} ${uids.join(' ')} ${r.body?.message || ''}`);
const cardsType = types.find(t => t.uid === 'content.cards');
ok('…each with its form, lists of rows included', cardsType?.dataModel?.some(f => f.name === 'items' && f.type === 'section-data-array' && f.section?.dataModel?.some(x => x.name === 'title')), JSON.stringify(cardsType?.dataModel).slice(0, 300));
r = await call('GET', P('/builder/components'), null, T);
ok('…listed under Build → Components (category content)', (r.body?.doc || []).filter(c => c.category === 'content').length >= 14, (r.body?.doc || []).map(c => c.uid).join(' '));
r = await call('GET', P('/builder/models'), null, T);
const contentsDef = (r.body?.doc || r.body || []).find(m => m.route === 'web-contents');
const blockField = contentsDef?.fields?.find(f => f.key === 'block');
ok('Contents holds a typed item: type, order and a one-item Content field', blockField?.kind === 'blocks' && blockField.max === 1 && blockField.components?.includes('content.hero') && contentsDef.fields.some(f => f.key === 'order'), JSON.stringify(blockField));

/* ---- a page and its contents */
const home = (await call('POST', P('/pages'), { name: 'Home', path: '/', status: 'published' }, T)).body?.doc;
const about = (await call('POST', P('/pages'), { name: 'About', path: '/about', status: 'published' }, T)).body?.doc;
ok('pages made', !!home?._id && !!about?._id);
r = await call('POST', C('/'), { page: home._id, type: 'content.hero', data: { heading: 'Bread worth waking up for', text: '<p>Baked daily.</p>', buttonLabel: 'Order now', buttonUrl: '/shop', extra: 'dropped' } }, T);
const hero = r.body;
ok('a Hero on Home: named, its slug and first place made for it', r.status === 201 && hero?.type === 'content.hero' && hero.order === 0 && /^home-hero-/.test(hero.slug) && hero.name === 'Home — Hero' && hero.data?.heading === 'Bread worth waking up for' && !('extra' in hero.data), JSON.stringify(r.body));
r = await call('POST', C('/'), { page: home._id, type: 'content.hero', data: { text: 'no heading' } }, T);
ok('its required heading is checked', r.status === 400 && /heading/i.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', C('/'), { page: home._id, type: 'content.nope', data: {} }, T);
ok('a type it doesn’t know is refused', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('POST', C('/'), { page: home._id, type: 'content.cards', name: 'What we bake', data: { heading: 'What we bake', items: [{ title: 'Sourdough', description: 'Slow and tangy' }, { title: 'Croissants', description: 'Butter, layers' }] } }, T);
const cards = r.body;
ok('Cards next, with its rows', r.status === 201 && cards.order === 1 && cards.data?.items?.length === 2 && cards.name === 'What we bake', JSON.stringify(r.body));
r = await call('POST', C('/'), { type: 'content.footer', data: { text: 'Open every day', subheading: '© Bakery' } }, T);
const footer = r.body;
ok('a Footer for the whole site', r.status === 201 && footer.page === null && /^site-footer-/.test(footer.slug), JSON.stringify(r.body));

r = await call('GET', C(`/?page=${home._id}`), null, T);
ok('Home’s contents, in order', r.body?.doc?.map(d => d.type).join() === 'content.hero,content.cards', JSON.stringify(r.body?.doc?.map(d => d.type)));
ok('…the pages with how many each', r.body?.pages?.find(p => p._id === home._id)?.count === 2 && r.body?.pages?.find(p => p._id === about._id)?.count === 0 && r.body?.site === 1, JSON.stringify({ pages: r.body?.pages, site: r.body?.site }));
r = await call('GET', C('/?page=site'), null, T);
ok('Whole site: the footer', r.body?.doc?.length === 1 && r.body.doc[0].type === 'content.footer', JSON.stringify(r.body?.doc));

r = await call('POST', C('/order'), { ids: [cards._id, hero._id] }, T);
r = await call('GET', C(`/?page=${home._id}`), null, T);
ok('reordered', r.body?.doc?.map(d => d.type).join() === 'content.cards,content.hero', JSON.stringify(r.body?.doc?.map(d => d.type)));

r = await call('PUT', C(`/${hero._id}`), { data: { ...hero.data, heading: 'Fresh every morning' } }, T);
ok('edited: the type’s fields', r.status === 200 && r.body?.data?.heading === 'Fresh every morning' && r.body.data.buttonLabel === 'Order now', JSON.stringify(r.body));
r = await call('GET', P(`/web-contents/${hero._id}`), null, T);
const raw = r.body?.doc || r.body;
ok('…stored as one item of its type, its key kept', raw?.block?.length === 1 && raw.block[0].__component === 'content.hero' && raw.block[0]._key && raw.type === 'content.hero', JSON.stringify(raw?.block));
r = await call('PUT', C(`/${hero._id}`), { page: about._id }, T);
ok('moved to About', r.status === 200 && r.body?.page === about._id, JSON.stringify(r.body));
r = await call('GET', P('/history?route=web-contents'), null, T);

/* ---- the List type */
r = await call('POST', P('/builder/models'), { name: 'Project', title: 'Projects', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'slug', label: 'Slug', kind: 'uid', from: 'name' },
	{ key: 'cover', label: 'Cover', kind: 'image' },
	{ key: 'summary', label: 'Summary', kind: 'textarea' },
	{ key: 'featured', label: 'Featured', kind: 'boolean' },
	{ key: 'year', label: 'Year', kind: 'number' },
] }, T);
const projects = r.body?.doc;
ok('a Projects model', r.status === 201, JSON.stringify(r.body?.problems || r.body?.message));
for (const [name, featured, year] of [['Ridge house', true, 2025], ['Library', true, 2024], ['Barn', false, 2023], ['Courtyard', true, 2022]])
	await call('POST', P(`/${projects.route}`), { name, featured, year, summary: `${name} summary`, cover: `${name}.jpg` }, T);
r = await call('GET', C('/types'), null, T);
const listModel = r.body?.models?.find(m => m.model === projects.route);
ok('a List offers it, saying its API is off', listModel && listModel.list === false && /public API/.test(listModel.problem), JSON.stringify(listModel));
const listData = { heading: 'Recent work', source: projects.route, limit: 2, sort: '-year', match: 'all', when: [{ field: 'featured', op: 'is', value: 'true' }], cardTitle: 'name', cardText: 'summary', cardImage: 'cover', link: '/projects/{slug}' };
r = await call('POST', C('/list-preview'), { data: listData }, T);
ok('a private model’s list says why it shows nothing', r.body?.items?.length === 0 && /public API/.test(r.body?.problem), JSON.stringify(r.body));
await call('PUT', P(`/builder/models/${projects._id}/public-api`), { enabled: true, actions: ['list', 'get'], auth: 'none' }, T);
r = await call('POST', C('/list-preview'), { data: listData }, T);
ok('the List: featured only, newest first, two of them, as cards', r.body?.items?.map(x => x.title).join() === 'Ridge house,Library' && r.body.items[0].description === 'Ridge house summary' && r.body.items[0].image === 'Ridge house.jpg' && r.body.items[0].url === '/projects/ridge-house', JSON.stringify(r.body));
r = await call('POST', C('/list-preview'), { data: { ...listData, limit: 10, match: 'any', when: [{ field: 'year', op: 'lt', value: '2023' }, { field: 'name', op: 'is', value: 'Barn' }] } }, T);
ok('…any condition', r.body?.items?.map(x => x.title).join() === 'Barn,Courtyard', JSON.stringify(r.body?.items?.map(x => x.title)));
r = await call('POST', C('/list-preview'), { data: { ...listData, when: [{ field: 'nope', op: 'is', value: 'x' }] } }, T);
ok('…a condition on a field it doesn’t have says so', /Condition/.test(r.body?.problem || ''), JSON.stringify(r.body));
r = await call('POST', C('/'), { page: home._id, type: 'content.list', data: listData }, T);
const list = r.body;
ok('a List record on Home', r.status === 201 && list.type === 'content.list', JSON.stringify(r.body));

/* ---- on the site: a list of cards from a typed record */
const tree = [
	{ id: 'colList1', type: 'collection', props: { source: { content: list.slug }, layout: 'grid', columns: 3 }, children: [{ id: 'cardHd1', type: 'heading', props: { text: '' }, bind: { text: { from: 'item', field: 'title' } } }] },
	{ id: 'colCard1', type: 'collection', props: { source: { content: cards.slug }, layout: 'grid', columns: 3 }, children: [{ id: 'cardHd2', type: 'heading', props: { text: '' }, bind: { text: { from: 'item', field: 'title' } } }] },
];
r = await call('POST', P('/site-builder/resolve'), { tree }, T);
ok('a collection showing a List record: the model’s records', r.body?.nodes?.colList1?.items?.map(x => x.title).join() === 'Ridge house,Library', JSON.stringify(r.body?.nodes?.colList1));
ok('…and one showing a Cards record: its rows', r.body?.nodes?.colCard1?.items?.map(x => x.title).join() === 'Sourdough,Croissants', JSON.stringify(r.body?.nodes?.colCard1));

/* ---- archive */
r = await call('DELETE', C(`/${cards._id}`), null, T);
r = await call('GET', C(`/?page=${home._id}`), null, T);
ok('removed: off the page', r.body?.doc?.every(d => d._id !== cards._id), JSON.stringify(r.body?.doc?.map(d => d.name)));

/* ---- an app project has none */
r = await call('POST', '/tenant/api/projects', { name: `App ${stamp}`, type: 'app' }, T);
r = await call('GET', `/tenant/api/p/${r.body?._id}/site-contents/types`, null, T);
ok('an app project has no site contents', r.status === 404, r.status);

done();
