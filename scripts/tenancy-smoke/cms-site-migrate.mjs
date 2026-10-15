// CMS-06c (docs/cms §6): a site from before content types — one Contents record per word, a list of cards in an old
// record's `card` — is moved over when its builder opens: each section's words become one typed record bound by path,
// the cards a typed Cards record, the new records published (the old words were live); the live site keeps reading the
// old records until the next Publish, which then shows the same words from the typed ones and archives the old.
// Stands alone.
import { call, ok, done } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Mia Migrate', email: `mia${stamp}@example.com`, password: 'tenant-pass-123', organization: `Mia ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('signed up', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: `Old site ${stamp}`, type: 'website' }, T);
const site = r.body;
const P = path => `/tenant/api/p/${site._id}${path}`;
const SB = path => P(`/site-builder${path}`);
const render = path => call('GET', `/public/api/${site.publicSlug}/render?path=${encodeURIComponent(path)}`);

/* ---- an old-style site: one record per word, cards in `card` */
const old = [
	{ slug: 'home-hero-heading-aa1111', name: 'Home — hero heading', category: 'content', content: 'Bread worth waking up for' },
	{ slug: 'home-hero-text-bb2222', name: 'Home — hero text', category: 'rich-content', richContent: '<p>Baked every morning.</p>' },
	{ slug: 'home-hero-button-cc3333', name: 'Home — hero button', category: 'content', btnText: 'See the menu', url: '/menu' },
	{ slug: 'home-team-cards-dd4444', name: 'Home — team cards', category: 'card', card: [{ title: 'Ana', subTitle: 'Baker' }, { title: 'Bo', subTitle: 'Pastry' }] },
];
const oldIds = [];
for (const o of old) {
	r = await call('POST', P('/web-contents'), o, T);
	oldIds.push(r.body?.doc?._id || r.body?._id);
}
r = await call('POST', P('/web-contents/bulk/publish'), { ids: oldIds }, T);
ok('old one-word records, live', r.status === 200 && r.body?.published === 4, JSON.stringify(r.body));

const bind = (slug, field) => ({ from: 'content', slug, field });
const tree = [
	{
		id: 'secHero1',
		type: 'section',
		name: 'Hero',
		props: {},
		children: [
			{ id: 'hdHero01', type: 'heading', props: { text: 'Bread worth waking up for', level: 1 }, bind: { text: bind('home-hero-heading-aa1111', 'content') } },
			{ id: 'txHero01', type: 'text', props: { html: '<p>Baked every morning.</p>' }, bind: { html: bind('home-hero-text-bb2222', 'richContent') } },
			{ id: 'btHero01', type: 'button', props: { label: 'See the menu' }, action: { type: 'link', href: '/menu' }, bind: { label: bind('home-hero-button-cc3333', 'btnText') } },
		],
	},
	{
		id: 'secTeam1',
		type: 'section',
		name: 'Team',
		props: {},
		children: [
			{
				id: 'colTeam1',
				type: 'collection',
				props: { source: { content: 'home-team-cards-dd4444' }, layout: 'grid', columns: 3 },
				children: [{ id: 'crdTeam1', type: 'card', props: {}, children: [{ id: 'hdTeam01', type: 'heading', props: { text: 'Name', level: 3 }, bind: { text: { from: 'item', field: 'title' } } }] }],
			},
		],
	},
];
r = await call('GET', SB('/pages'), null, T);
let home = (r.body?.pages || []).find(p => p.path === '/');
r = await call('GET', SB(`/pages/${home.id}`), null, T);
r = await call('PUT', SB(`/pages/${home.id}`), { rev: r.body.draft.rev, tree }, T);
ok('a page bound the old way', r.status === 200, `${r.status} ${r.body?.message} ${JSON.stringify(r.body?.problems || '').slice(0, 200)}`);
r = await call('POST', SB('/publish'), { note: 'old' }, T);
ok('published the old way', r.status === 200, `${r.status} ${r.body?.message}`);
r = await render('/');
ok('the live site reads the old records', r.body?.data?.contents?.['home-hero-heading-aa1111']?.content === 'Bread worth waking up for' && r.body?.data?.nodes?.colTeam1?.items?.length === 2, JSON.stringify(r.body?.data?.contents).slice(0, 200));

/* ---- the builder opens: moved over */
r = await call('GET', SB('/design'), null, T);
ok('the builder opens', r.status === 200, r.status);
r = await call('GET', SB(`/pages/${home.id}`), null, T);
const moved = r.body?.draft?.tree || [];
const slugs = [];
const walk = (nodes, fn) => (nodes || []).forEach(n => (fn(n), walk(n.children, fn)));
walk(moved, n => Object.values(n.bind || {}).forEach(b => b.from === 'content' && slugs.push(`${b.slug}:${b.field}`)));
let listSrc;
walk(moved, n => n.type === 'collection' && (listSrc = n.props.source.content));
ok('the page’s draft binds to new records, by path', slugs.length >= 3 && slugs.every(s => !s.startsWith('home-hero-heading-aa1111')) && slugs.some(s => s.endsWith(':heading')) && slugs.some(s => s.endsWith(':buttonLabel')), slugs.join(' '));
ok('…the list of cards to a new typed record', listSrc && listSrc !== 'home-team-cards-dd4444', listSrc);

r = await call('GET', P('/web-contents?limit=100'), null, T);
const all = r.body?.doc || [];
const heroRec = all.find(c => c.slug === slugs.find(s => s.endsWith(':heading'))?.split(':')[0]);
ok('one Hero record holds the hero’s words', heroRec?.type === 'content.hero' && heroRec.block?.[0]?.heading === 'Bread worth waking up for' && heroRec.block[0].buttonLabel === 'See the menu' && heroRec.block[0].buttonUrl === '/menu' && /Baked every morning/.test(heroRec.block[0].text), JSON.stringify(heroRec?.block));
const cardsRec = all.find(c => c.slug === listSrc);
ok('…a Cards record the old cards', cardsRec?.type === 'content.cards' && cardsRec.block?.[0]?.items?.map(x => x.title).join() === 'Ana,Bo', JSON.stringify(cardsRec?.block));
const homeRec = (await call('GET', P('/site-contents?page=site'), null, T)).body?.pages?.find(p => p.path === '/');
r = await call('GET', P(`/site-contents?page=${homeRec?._id}`), null, T);
const listed = r.body?.doc || [];
ok('Contents lists the moved records, published, and not the old ones', [heroRec?._id, cardsRec?._id].every(id => listed.find(c => c._id === id)?.status === 'published') && !listed.some(c => c.legacy), JSON.stringify(listed.map(c => `${c.name}:${c.status}:${c.legacy}`)));

r = await render('/');
ok('the live site still reads the old records until Publish', r.body?.data?.contents?.['home-hero-heading-aa1111']?.content === 'Bread worth waking up for', JSON.stringify(r.body?.data?.contents).slice(0, 160));

/* ---- Publish: the same words from the typed records; the old archived */
r = await call('POST', SB('/publish'), { note: 'moved' }, T);
ok('published', r.status === 200, `${r.status} ${r.body?.message}`);
r = await render('/');
const live = r.body?.data || {};
ok('the live site shows the same words, from the typed records', live.contents?.[heroRec?.slug]?.heading === 'Bread worth waking up for' && live.contents?.[heroRec?.slug]?.buttonLabel === 'See the menu' && live.nodes?.colTeam1?.items?.map(x => x.title).join() === 'Ana,Bo', JSON.stringify(live.contents).slice(0, 300));
r = await call('GET', P('/web-contents?limit=100'), null, T);
ok('the old records are archived', !(r.body?.doc || []).some(c => old.some(o => o.slug === c.slug)), (r.body?.doc || []).map(c => c.slug).join());

/* ---- once only */
const before = (await call('GET', P('/web-contents?limit=100'), null, T)).body?.doc?.length;
r = await call('GET', SB('/design'), null, T);
r = await call('GET', P('/web-contents?limit=100'), null, T);
ok('opening again makes nothing new', (r.body?.doc || []).length === before, `${(r.body?.doc || []).length} vs ${before}`);
done();
