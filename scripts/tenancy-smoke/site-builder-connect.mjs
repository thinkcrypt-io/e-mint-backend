// Every word in Contents (docs/site-builder SB-29): a new site's demo binds every
// text, picture and button to a Contents record and turns grids of look-alike
// cards into lists of cards; blocks added later (POST /connect) get records of
// their own with demo words; a copy gets new records; an edit in the builder
// reaches the record, an edit in the panel reaches the page; a list switches
// between cards and a model; a website template's build makes the builder's
// pages. Stands alone; needs the seeded super admin and SMOKE_MONGO.
import { MongoClient } from 'mongodb';
import { call, ok, done } from './lib.mjs';

const uri = process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
const mc = await new MongoClient(uri).connect();
const db = mc.db();
const stamp = Date.now();

let r = await call('POST', '/tenant/api/auth/register', { name: 'Cora Connect', email: `cora${stamp}@example.com`, password: 'tenant-pass-123', organization: `Cora ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('signed up', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: `Connect ${stamp}`, type: 'website' }, T);
const site = r.body;
const SB = path => `/tenant/api/p/${site._id}/site-builder${path}`;
const P = path => `/tenant/api/p/${site._id}${path}`;

const walk = (nodes, fn, inList = false) =>
	(nodes || []).forEach(n => {
		fn(n, inList);
		walk(n.children, fn, inList || n.type === 'collection');
		Object.values(n.slots || {}).forEach(s => walk(s, fn, inList || n.type === 'collection'));
	});
const WORDS = { heading: ['text'], text: ['html'], button: ['label'], link: ['text'], badge: ['text'], stat: ['value', 'label'], quote: ['text', 'author', 'role'], 'accordion-item': ['title'] };
/** Words outside lists that aren't bound to Contents (or a record / the site). */
const loose = tree => {
	const out = [];
	walk(tree, (n, inList) => {
		if (inList) return;
		for (const k of WORDS[n.type] || []) if (typeof n.props?.[k] === 'string' && n.props[k] && !n.props[k].includes('{{') && !n.bind?.[k]) out.push(`${n.type}.${k}`);
	});
	return out;
};

/* ------------------------------------------------- the new site's demo */
r = await call('GET', SB('/starters'), null, T);
ok('a new site is untouched (the builder loads the demo by itself)', r.status === 200 && r.body.untouched === true && r.body.blank === true, JSON.stringify(r.body).slice(0, 160));
r = await call('POST', SB('/starter'), { theme: 'studio' }, T);
ok('the demo loads', r.status === 200 && r.body.pages.length === 5, `${r.status} ${r.body?.message}`);
const pages = r.body.pages;
r = await call('GET', SB('/starters'), null, T);
ok('…after that the site isn’t untouched', r.body.untouched === false);

r = await call('GET', SB(`/pages/${pages.find(p => p.path === '/').id}`), null, T);
const home = r.body;
ok('home: every word outside a list is bound to Contents', r.status === 200 && loose(home.draft.tree).length === 0, loose(home.draft.tree).join());
const cardLists = [];
walk(home.draft.tree, n => n.type === 'collection' && n.props.source?.content && cardLists.push(n));
ok('home: the numbers and the reviews are lists of cards in Contents', cardLists.length >= 2, String(cardLists.length));
ok('…their card is bound to the item', cardLists.every(l => JSON.stringify(l.children).includes('"from":"item"')), JSON.stringify(cardLists[0]?.children).slice(0, 200));

r = await call('GET', P('/web-contents?limit=500'), null, T);
const contents = r.body?.doc || [];
const cardsRec = contents.find(c => c.slug === cardLists[0]?.props.source.content);
ok('…each list is one Contents record of category card, with its cards', cardsRec?.category === 'card' && cardsRec.card?.length >= 3 && cardsRec.card[0].title, JSON.stringify(cardsRec).slice(0, 200));
ok('the header and footer words are in Contents too', contents.some(c => c.slug.startsWith('header-')) && contents.some(c => c.slug.startsWith('footer-')), contents.map(c => c.slug).slice(0, 12).join());

r = await call('GET', SB(`/pages/${pages.find(p => p.path === '/services').id}`), null, T);
const svcList = [];
walk(r.body.draft.tree, n => n.type === 'collection' && n.props.source?.model && svcList.push(n));
ok('the Services page lists the Services model', svcList.length === 1 && svcList[0].props.source.model === 'services', JSON.stringify(svcList.map(n => n.props.source)));

r = await call('GET', P('/seo'), null, T);
ok('every page has its SEO record', (r.body?.doc || []).length >= 5 && r.body.doc.every(s => s.title), (r.body?.doc || []).map(s => s.title).join(' | '));

r = await call('POST', SB('/publish'), { note: 'demo' }, T);
ok('published', r.status === 200, `${r.status} ${r.body?.message}`);
const render = async path => call('GET', `/public/api/${site.publicSlug}/render?path=${encodeURIComponent(path)}`);
r = await render('/');
const live = r.body?.data || {};
ok('render: the cards come from Contents', live.nodes?.[cardLists[0].id]?.items?.length === cardsRec.card.length, JSON.stringify(live.nodes?.[cardLists[0].id]).slice(0, 160));

/* ------------------------------------------- builder edit ⇄ the panel */
let heading;
walk(home.draft.tree, n => !heading && n.type === 'heading' && n.bind?.text?.from === 'content' && (heading = n));
const tree = JSON.parse(JSON.stringify(home.draft.tree));
walk(tree, n => n.id === heading.id && (n.props.text = 'Typed in the builder'));
r = await call('PUT', SB(`/pages/${home.id}`), { rev: home.draft.rev, tree }, T);
ok('a bound heading edited in the builder saves', r.status === 200, `${r.status} ${r.body?.message}`);
let rec = (await call('GET', P('/web-contents?limit=500'), null, T)).body.doc.find(c => c.slug === heading.bind.text.slug);
ok('…its Contents record has the new words', rec?.content === 'Typed in the builder', JSON.stringify(rec).slice(0, 160));
r = await render('/');
ok('…and the live site shows them without a Publish', r.body?.data?.contents?.[heading.bind.text.slug]?.content === 'Typed in the builder');

r = await call('PUT', P(`/web-contents/${rec._id}`), { content: 'Changed in the panel' }, T);
ok('the record is changed in the panel', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('GET', SB(`/pages/${home.id}`), null, T);
let back;
walk(r.body.draft.tree, n => n.id === heading.id && (back = n));
ok('…the builder opens the page with the panel’s words', back?.props.text === 'Changed in the panel', back?.props.text);

/* --------------------------------------------- blocks added later */
r = await call('POST', SB('/connect'), { pageId: home.id, nodes: [{ id: 'newHead1', type: 'heading', props: { text: 'Heading', level: 2 } }, { id: 'newText1', type: 'text', props: { html: '<p>Write something here.</p>' } }] }, T);
const [h1, t1] = r.body?.nodes || [];
ok('connect: a new heading and text get Contents records', r.status === 200 && h1?.bind?.text?.from === 'content' && t1?.bind?.html?.field === 'richContent' && r.body.records === 2, JSON.stringify(r.body).slice(0, 240));
ok('…with demo words, rich text as lorem ipsum', h1.props.text.startsWith('Lorem') && t1.props.html.includes('Lorem ipsum'), `${h1.props.text} / ${t1.props.html}`);
rec = (await call('GET', P('/web-contents?limit=500'), null, T)).body.doc.find(c => c.slug === t1.bind.html.slug);
ok('…the record holds them, slug made from the page', rec?.richContent?.includes('Lorem ipsum') && /^home-/.test(rec.slug), JSON.stringify(rec).slice(0, 160));

const grid = {
	id: 'newGrid1',
	type: 'section',
	name: 'Perks',
	props: {},
	children: [
		{
			id: 'newGrd01',
			type: 'grid',
			props: { columns: 3, gap: 6 },
			children: ['Fast', 'Kind', 'Clear'].map((t, i) => ({ id: `newCrd0${i}`, type: 'card', props: {}, children: [{ id: `newCh0${i}`, type: 'heading', props: { text: t, level: 3 } }, { id: `newCt0${i}`, type: 'text', props: { html: `<p>${t} help.</p>` } }] })),
		},
	],
};
r = await call('POST', SB('/connect'), { pageId: home.id, nodes: [grid] }, T);
const list = r.body?.nodes?.[0]?.children?.[0];
ok('connect: a grid of look-alike cards becomes a list of cards', list?.type === 'collection' && list.props.source.content && list.children.length === 1, JSON.stringify(r.body?.nodes).slice(0, 200));
rec = (await call('GET', P('/web-contents?limit=500'), null, T)).body.doc.find(c => c.slug === list?.props.source.content);
ok('…its cards in one Contents record', rec?.card?.map(c => c.title).join() === 'Fast,Kind,Clear' && rec.card[1].description === 'Kind help.', JSON.stringify(rec?.card));

r = await call('POST', SB('/connect'), { pageId: home.id, nodes: [{ id: 'newList1', type: 'collection', props: { source: { model: '' }, layout: 'grid', columns: 3 }, children: [{ id: 'newLc001', type: 'card', props: {}, children: [{ id: 'newLh001', type: 'heading', props: { text: '{{item.title}}', level: 3 } }] }] }] }, T);
const empty = r.body?.nodes?.[0];
rec = (await call('GET', P('/web-contents?limit=500'), null, T)).body.doc.find(c => c.slug === empty?.props.source.content);
ok('connect: a new empty list gets three demo cards', !!empty?.props.source.content && rec?.card?.length === 3, JSON.stringify(empty?.props));

r = await call('POST', SB('/connect'), { pageId: home.id, fresh: true, nodes: [h1, list] }, T);
const [h2, list2] = r.body?.nodes || [];
ok('connect fresh (a copy): new records of its own', h2?.bind?.text?.slug && h2.bind.text.slug !== h1.bind.text.slug && list2?.props.source.content !== list.props.source.content, JSON.stringify(r.body?.nodes).slice(0, 200));
rec = (await call('GET', P('/web-contents?limit=500'), null, T)).body.doc.find(c => c.slug === list2?.props.source.content);
ok('…the copied list has the same cards', rec?.card?.map(c => c.title).join() === 'Fast,Kind,Clear');

const now = (await call('GET', SB(`/pages/${home.id}`), null, T)).body;
r = await call('PUT', SB(`/pages/${home.id}`), { rev: now.draft.rev, tree: [...now.draft.tree, grid] }, T);
ok('a page saved with an unconnected section…', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('GET', SB(`/pages/${home.id}`), null, T);
ok('…is connected when the builder opens it', loose(r.body.draft.tree).length === 0, loose(r.body.draft.tree).join());

/* --------------------------------- a list: cards ⇄ a model (the validator) */
r = await call('POST', SB('/validate'), { tree: [{ id: 'valList1', type: 'collection', props: { source: { content: 'home-perks-abc123' } }, children: [] }] }, T);
ok('a list of cards in Contents is a valid source', r.status === 200 && !r.body.problems.some(p => p.level === 'error'), JSON.stringify(r.body.problems));

/* ------------------------------------------- a website template's build */
let a = await call('POST', '/admin/api/auth/login', { email: 'admin@example.com', password: 'tenancy-dev-pass-1' });
const AT = a.body.token;
const KEY = 'smoke-connect-site';
await db.collection('projecttemplates').deleteMany({ key: KEY });
r = await call('POST', '/admin/api/templates', {
	type: 'website',
	key: KEY,
	blueprint: {
		overview: { name: 'Smoke connect site', summary: 'A business site.' },
		questions: [{ key: 'business', label: 'Business name?', required: true }],
		models: { steps: [{ action: 'create', name: 'Service', title: 'Services', route: 'services', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'description', label: 'Description', kind: 'textarea' }] }] },
		endpoints: [{ model: 'Service', actions: ['list', 'get'] }],
		website: {
			pages: [{ path: '/', name: 'Home', seo: { title: '{{business}}', description: 'Welcome' } }],
			settings: { identity: { siteName: '{{business}}' } },
		},
		sampleData: { Service: [{ name: 'Repairs', description: 'We fix things.' }, { name: 'Installs', description: 'We put things in.' }] },
	},
}, AT);
ok('a website template', r.status === 201, `${r.status} ${r.body?.message}`);
const draft = (await db.collection('projecttemplates').findOne({ key: KEY })).draft;
await db.collection('projecttemplates').updateOne({ key: KEY }, { $set: { status: 'published', published: draft, version: 1, changed: false } });

r = await call('POST', '/tenant/api/projects', { name: `Templated ${stamp}`, type: 'website' }, T);
const tsite = r.body;
r = await call('POST', `/tenant/api/p/${tsite._id}/templates/${KEY}/apply`, { answers: { business: 'Ratan Repairs' } }, T);
let s;
for (let i = 0; i < 80; i++) {
	s = await call('GET', `/tenant/api/p/${tsite._id}/templates/applying`, null, T);
	if (s.body.status !== 'building') break;
	await new Promise(res => setTimeout(res, 500));
}
ok('the template is built', s.body.status === 'ready', JSON.stringify(s.body).slice(0, 300));
r = await call('GET', `/tenant/api/p/${tsite._id}/site-builder/pages`, null, T);
const tp = r.body?.pages || [];
ok('…and the builder has every page of the site', tp.length >= 5 && ['/', '/services', '/about', '/contact'].every(p => tp.some(x => x.path === p)), tp.map(p => p.path).join());
r = await call('GET', `/tenant/api/p/${tsite._id}/site-builder/pages/${tp.find(p => p.path === '/services').id}`, null, T);
const tl = [];
walk(r.body.draft.tree, n => n.type === 'collection' && n.props.source?.model && tl.push(n));
ok('…its Services page lists the template’s own Services, by their fields', tl[0]?.props.source.model === 'services' && JSON.stringify(tl[0].children).includes('item.name') && JSON.stringify(tl[0].children).includes('item.description'), JSON.stringify(tl[0]?.children).slice(0, 300));
r = await call('GET', `/tenant/api/p/${tsite._id}/site-builder/pages/${tp.find(p => p.path === '/').id}`, null, T);
ok('…dressed as the business', JSON.stringify(r.body.draft.seo).includes('Ratan Repairs') || JSON.stringify(r.body.draft.tree).includes('Ratan Repairs'), JSON.stringify(r.body.draft.seo));
r = await call('GET', `/tenant/api/p/${tsite._id}/site-builder/starters`, null, T);
ok('…so the builder won’t load a demo over it', r.body.untouched === false);

await db.collection('projecttemplates').deleteMany({ key: KEY });
await mc.close();
done();
