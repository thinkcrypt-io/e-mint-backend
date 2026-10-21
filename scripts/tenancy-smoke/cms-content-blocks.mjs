// Contents with more blocks under their own (docs/cms D1, 2026-10-20): Text a plain text box outside Rich text; a Hero carousel; a Text with a Gallery and a Section added
// under it — made, listed, edited, reordered and removed through the Contents screen's `more`; each extra block checked
// as its type (unknown types and Lists refused, fields it doesn't have dropped, keys kept); the record's own block
// first; an edit of the words alone keeping the extras; the MCP's fill_page keeping them too; and the slug — made,
// chosen, changed, cleaned up and refused when another content has it; read on the public API by slug
// (/web-contents/by-slug/:slug) and by page, with its blocks; the site builder's saves keeping the blocks; a
// removed content gone from both. Stands alone.
import { ROOT, call, ok, done } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Bea Blocks', email: `bea${stamp}@example.com`, password: 'tenant-pass-123', organization: `Bea ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('signed up', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: `Studio ${stamp}`, type: 'website' }, T);
const site = r.body;
ok('a website project', r.status === 200 && site?._id, `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;
const C = path => P(`/site-contents${path}`);

r = await call('GET', C('/types'), null, T);
ok('the types', r.status === 200 && r.body?.types?.some(t => t.uid === 'content.gallery'), `${r.status} ${r.body?.message}`);
const kindOf = (uid, key) => r.body?.types?.find(t => t.uid === uid)?.dataModel?.find(f => f.name === key)?.type;
ok('Text is a plain text box in every type but Rich text', ['content.text', 'content.hero', 'content.cards', 'content.gallery', 'content.section'].every(u => kindOf(u, 'text') === 'textarea') && kindOf('content.rich-text', 'body') === 'editor', ['content.text', 'content.hero', 'content.rich-text'].map(u => `${u}:${kindOf(u, 'text') || kindOf(u, 'body')}`).join(' '));
const home = (await call('POST', P('/pages'), { name: 'Home', path: '/', status: 'published' }, T)).body?.doc;
ok('a page', !!home?._id);

/* ---- made with more blocks under it */
r = await call('POST', C('/'), {
	page: home._id,
	type: 'content.text',
	data: { heading: 'Our studio' },
	more: [
		{ __component: 'content.gallery', heading: 'Work', items: [{ image: 'https://example.com/a.jpg', title: 'Chair' }], nope: 'dropped' },
		{ __component: 'content.section', heading: 'Visit', buttonLabel: 'Directions' },
	],
}, T);
const text = r.body;
ok('a Text with a Gallery and a Section under it', r.status === 201 && text?.type === 'content.text' && text.data?.heading === 'Our studio' && text.more?.map(b => b.__component).join() === 'content.gallery,content.section', JSON.stringify(r.body));
ok('…each extra checked as its type, keys given', text?.more?.[0]?.items?.[0]?.title === 'Chair' && !('nope' in (text?.more?.[0] || {})) && text.more.every(b => b._key), JSON.stringify(text?.more));
r = await call('GET', P(`/web-contents/${text._id}`), null, T);
const raw = r.body?.doc || r.body;
ok('…stored in block: its own first, then the others', raw?.block?.map(b => b.__component).join() === 'content.text,content.gallery,content.section', JSON.stringify(raw?.block));

r = await call('POST', C('/'), { page: home._id, type: 'content.text', data: {}, more: [{ __component: 'content.list', source: 'x' }] }, T);
ok('a List can’t go under another', r.status === 400 && /content\.list/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', C('/'), { page: home._id, type: 'content.text', data: {}, more: [{ __component: 'content.nope' }] }, T);
ok('a type it doesn’t know is refused', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('POST', C('/'), { page: home._id, type: 'content.text', data: {}, more: [{ heading: 'x' }] }, T);
ok('a block without its type is refused', r.status === 400 && /type/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', C('/'), { page: home._id, type: 'content.text', data: {}, more: Array.from({ length: 20 }, () => ({ __component: 'content.text' })) }, T);
ok('at most 20 blocks in one content', r.status === 400 && /20/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', C('/'), { page: home._id, type: 'content.text', data: {}, more: 'gallery' }, T);
ok('more must be a list', r.status === 400, `${r.status} ${r.body?.message}`);

/* ---- listed */
r = await call('GET', C(`/?page=${home._id}`), null, T);
const listed = r.body?.doc?.find(d => d._id === text._id);
ok('listed with its blocks', listed?.more?.length === 2 && listed.preview === 'Our studio', JSON.stringify(listed));

/* ---- edited */
const [gallery, section] = text.more;
r = await call('PUT', C(`/${text._id}`), { data: { heading: 'The studio' } }, T);
ok('its own words changed, the blocks under it kept', r.status === 200 && r.body?.data?.heading === 'The studio' && r.body.more?.map(b => b._key).join() === `${gallery._key},${section._key}`, JSON.stringify(r.body));
r = await call('PUT', C(`/${text._id}`), { more: [{ ...section, heading: 'Come by' }, gallery] }, T);
ok('blocks reordered and changed, keys kept', r.status === 200 && r.body?.more?.map(b => b._key).join() === `${section._key},${gallery._key}` && r.body.more[0].heading === 'Come by' && r.body.data?.heading === 'The studio', JSON.stringify(r.body));
r = await call('GET', P('/history?route=web-contents'), null, T);
ok('…in its history', JSON.stringify(r.body).includes('Blocks under it'), JSON.stringify(r.body).slice(0, 300));
r = await call('PUT', C(`/${text._id}`), { more: [gallery] }, T);
ok('one removed', r.status === 200 && r.body?.more?.length === 1 && r.body.more[0]._key === gallery._key, JSON.stringify(r.body?.more));
r = await call('PUT', C(`/${text._id}`), { more: [] }, T);
ok('all removed: its own block stays', r.status === 200 && r.body?.more?.length === 0 && r.body.data?.heading === 'The studio', JSON.stringify(r.body));
r = await call('PUT', C(`/${text._id}`), { more: [{ __component: 'content.gallery', heading: 'Again' }] }, T);
ok('added back on an edit', r.status === 200 && r.body?.more?.[0]?.heading === 'Again' && r.body.more[0]._key, JSON.stringify(r.body?.more));

/* ---- a Hero carousel: slides of heading, subheading, two buttons and a background picture */
r = await call('GET', C('/types'), null, T);
const carousel = r.body?.types?.find(t => t.uid === 'content.hero-carousel');
const slideKeys = carousel?.fields?.find(f => f.key === 'items')?.fields?.map(f => f.key).join();
ok('a slide: heading, subheading, background picture, two buttons', slideKeys === 'title,subTitle,image,imageAlt,buttonLabel,buttonUrl,secondaryLabel,secondaryUrl', slideKeys);
r = await call('POST', C('/'), { page: home._id, type: 'content.hero-carousel', data: { interval: 5, items: [
	{ title: 'Fresh bread', subTitle: 'Every morning', image: 'https://example.com/1.jpg', buttonLabel: 'Order', buttonUrl: '/shop', secondaryLabel: 'Menu', secondaryUrl: '/menu', description: 'not a slide field' },
	{ title: 'Cakes', subTitle: 'For every day' },
] } }, T);
const slide = r.body?.data?.items?.[0];
ok('a Hero carousel with its slides', r.status === 201 && r.body?.typeTitle === 'Hero carousel' && r.body.data.items.length === 2 && slide?.subTitle === 'Every morning' && slide.buttonUrl === '/shop' && slide.secondaryLabel === 'Menu' && r.body.data.interval === 5 && /^home-hero-carousel-/.test(r.body.slug), JSON.stringify(r.body));
ok('…a field slides don’t have is dropped', slide && !('description' in slide), JSON.stringify(slide));
r = await call('POST', C('/'), { page: home._id, type: 'content.hero-carousel', data: {} }, T);
ok('…its slide time 6 seconds when not set', r.status === 201 && r.body?.data?.interval === 6, JSON.stringify(r.body?.data));

/* ---- no editor but in Rich text: a project's own type too; the first carousel shape brought up to date */
const B = path => P(`/builder${path}`);
r = await call('POST', B('/components'), { category: 'content', name: 'story', title: 'Story', fields: [
	{ key: 'heading', label: 'Heading', kind: 'text' },
	{ key: 'body', label: 'Body', kind: 'editor' },
	{ key: 'outro', label: 'Last words', kind: 'editor' },
] }, T);
const story = r.body?.doc || r.body;
ok('a project’s own content type with editors', (r.status === 200 || r.status === 201) && story?._id, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
r = await call('GET', B('/components'), null, T);
const old = (r.body?.doc || r.body || []).find(c => c.uid === 'content.hero-carousel');
r = await call('PUT', B(`/components/${old?._id}`), { title: 'Hero carousel', fields: [
	{ key: 'items', label: 'Slides', kind: 'sectionlist', fields: [
		{ key: 'subTitle', label: 'Small line above', kind: 'text' }, { key: 'title', label: 'Heading', kind: 'text' }, { key: 'description', label: 'Text', kind: 'textarea' },
		{ key: 'image', label: 'Picture', kind: 'image' }, { key: 'imageAlt', label: 'Picture description', kind: 'text' }, { key: 'buttonLabel', label: 'Button', kind: 'text' }, { key: 'url', label: 'Button link', kind: 'text' },
	] },
	{ key: 'interval', label: 'Seconds per slide', kind: 'number' },
] }, T);
ok('(the Hero carousel set back to its first shape)', r.status === 200, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
r = await call('GET', C('/types'), null, T);
const kinds = (uid, path) => { let f = { fields: r.body?.types?.find(t => t.uid === uid)?.fields }; for (const k of path) f = f?.fields?.find(x => x.key === k); return f?.kind; };
ok('its editors are text boxes now', kinds('content.story', ['body']) === 'textarea' && kinds('content.story', ['outro']) === 'textarea', `${kinds('content.story', ['body'])} ${kinds('content.story', ['outro'])}`);
ok('Rich text keeps the editor', kinds('content.rich-text', ['body']) === 'editor', kinds('content.rich-text', ['body']));
ok('a Hero carousel on its first shape gets today’s slides', r.body?.types?.find(t => t.uid === 'content.hero-carousel')?.fields?.find(f => f.key === 'items')?.fields?.map(f => f.key).join() === 'title,subTitle,image,imageAlt,buttonLabel,buttonUrl,secondaryLabel,secondaryUrl', JSON.stringify(r.body?.types?.find(t => t.uid === 'content.hero-carousel')?.fields));

/* ---- what to add: suggested types */
const suggestOf = uid => r.body?.types?.find(t => t.uid === uid)?.suggest || [];
ok('each type says what goes with it (a Text: a picture, a gallery…)', suggestOf('content.text').slice(0, 2).join() === 'content.image,content.gallery' && suggestOf('content.section').includes('content.cards'), JSON.stringify(suggestOf('content.text')));
ok('…a project’s own type gets the usual few', suggestOf('content.story').length > 0 && suggestOf('content.story').every(u => r.body.types.some(t => t.uid === u)), JSON.stringify(suggestOf('content.story')));
ok('…never a List under a piece', r.body?.types?.every(t => !(t.suggest || []).includes('content.list')), '');
ok('what starts a page, and the whole site', r.body?.start?.page?.[0] === 'content.hero' && r.body.start.site.join() === 'content.header,content.footer', JSON.stringify(r.body?.start));

/* ---- the slug */
ok('a slug made for it', /^home-text-/.test(text.slug), text.slug);
r = await call('POST', C('/'), { page: home._id, type: 'content.gallery', slug: 'Home Gallery!', data: {} }, T);
const g = r.body;
ok('a slug chosen when adding, cleaned up', r.status === 201 && g?.slug === 'home-gallery', JSON.stringify(r.body));
r = await call('POST', C('/'), { page: home._id, type: 'content.gallery', slug: 'home-gallery', data: {} }, T);
ok('…another content can’t have it', r.status === 400 && /home-gallery/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', C(`/${text._id}`), { slug: 'home-gallery' }, T);
ok('…nor take it on an edit', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('PUT', C(`/${text._id}`), { slug: 'studio-intro' }, T);
ok('changed', r.status === 200 && r.body?.slug === 'studio-intro', JSON.stringify(r.body));
r = await call('PUT', C(`/${g._id}`), { slug: 'home-gallery', data: { heading: 'Same slug, new words' } }, T);
ok('its own slug sent back is fine', r.status === 200 && r.body?.slug === 'home-gallery' && r.body.data?.heading === 'Same slug, new words', `${r.status} ${r.body?.message}`);
r = await call('PUT', C(`/${g._id}`), { slug: '!!!' }, T);
ok('a slug with no letters or numbers is refused', r.status === 400, `${r.status} ${r.body?.message}`);

/* ---- read by a site: the public API, by slug and by page */
r = await call('GET', P('/project-key'), null, T);
const key = r.body?.apiKey;
ok('the project key', /^mint_pk_/.test(key || ''), JSON.stringify(r.body));
const pub = path => fetch(`${ROOT}/public/api${path}${path.includes('?') ? '&' : '?'}apiKey=${key}`).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
r = await pub('/web-contents/by-slug/studio-intro');
ok('a draft isn’t on the API yet', r.status === 404, `${r.status} ${JSON.stringify(r.body)}`);
r = await call('POST', C('/publish'), { ids: [text._id, g._id] }, T);
ok('published', r.status === 200 && r.body?.published === 2, JSON.stringify(r.body));
r = await pub('/web-contents/by-slug/studio-intro');
ok('read by its slug: its type, its words, the blocks under it', r.status === 200 && r.body?.slug === 'studio-intro' && r.body.type === 'content.text' && r.body.block?.[0]?.heading === 'The studio' && r.body.block?.[1]?.__component === 'content.gallery' && r.body.block[1].heading === 'Again', JSON.stringify(r.body));
r = await pub('/web-contents/by-slug/STUDIO-INTRO');
ok('…in any case', r.status === 200, String(r.status));
r = await pub('/web-contents/by-slug/home-hero-carousel-nope');
ok('a slug nobody has: 404', r.status === 404, String(r.status));
r = await pub('/pages/by-path?path=/');
ok('its page’s contents carry it too, blocks and all', r.status === 200 && r.body?.contents?.find(c => c.slug === 'studio-intro')?.block?.length === 2, JSON.stringify(r.body?.contents?.map(c => [c.slug, c.block?.length])));

/* ---- the site builder saving its words keeps the blocks under them */
r = await call('POST', P('/site-builder/contents'), { records: [{ slug: 'studio-intro', content: 'From the builder' }] }, T);
ok('the site builder saves the heading', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('GET', C(`/?page=${home._id}`), null, T);
const after = r.body?.doc?.find(d => d._id === text._id);
ok('…the block under it stays', after?.data?.heading === 'From the builder' && after.more?.length === 1 && after.more[0].heading === 'Again', JSON.stringify(after));

/* ---- removed: off the API */
r = await call('DELETE', C(`/${g._id}`), null, T);
ok('a published one removed', r.status === 200, `${r.status} ${r.body?.message}`);
r = await pub('/web-contents/by-slug/home-gallery');
ok('…gone from its slug', r.status === 404, `${r.status} ${JSON.stringify(r.body)?.slice(0, 120)}`);
r = await pub('/pages/by-path?path=/');
ok('…and from its page', r.status === 200 && !r.body?.contents?.some(c => c.slug === 'home-gallery') && r.body.contents.some(c => c.slug === 'studio-intro'), JSON.stringify(r.body?.contents?.map(c => c.slug)));

done();
