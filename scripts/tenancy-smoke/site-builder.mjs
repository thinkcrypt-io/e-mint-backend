// The site builder's storage, checks, publish and render API (docs/site-builder
// SB-03), overlays (SB-06), themes, fonts, layouts and saved sections (SB-07),
// and the block catalogue, presets and accessibility hints (SB-08).
import { call, ok, done, ROOT } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Sid Builder', email: `sid${stamp}@example.com`, password: 'tenant-pass-123', organization: `Sid ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('signed up', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: `Acme ${stamp}`, type: 'website' }, T);
const site = r.body;
ok('a website project', r.status === 200 && site?.publicSlug, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: 'Internal app', type: 'app' }, T);
const app = r.body;
const SB = (path = '', pid = site._id) => `/tenant/api/p/${pid}/site-builder${path}`;
const render = async (path, slug = site.publicSlug) => call('GET', `/public/api/${slug}/render?path=${encodeURIComponent(path)}`);

/* ------------------------------------------------------------ a new site */
r = await call('GET', SB('/manifest'), null, T);
const manifest = r.body;
ok('the manifest: blocks, presets, themes, style schema', r.status === 200 && manifest.blocks?.length >= 14 && manifest.presets.some(p => p.key === 'hero-centered') && manifest.themes.some(t => t.key === 'studio') && manifest.style?.paddingTop, `${r.status}`);
const res = await fetch(ROOT + SB('/manifest'), { headers: { authorization: T, 'if-none-match': `"${manifest.version}"` } });
ok('…with an ETag (304 when unchanged)', res.status === 304, res.status);

r = await call('GET', SB('/pages'), null, T);
const home = r.body?.pages?.[0];
ok('a new website starts with a home page at /', r.status === 200 && r.body.pages.length === 1 && home.isHome && home.path === '/' && home.status === 'draft', JSON.stringify(r.body).slice(0, 200));
r = await call('GET', SB('/design'), null, T);
let design = r.body;
ok('…and a design: Studio, a default layout with a header and a footer', design.draft?.theme === 'studio' && design.draft.layouts.default.header.length && design.draft.layouts.default.footer.length && design.published === null, JSON.stringify(design).slice(0, 200));
r = await render('/');
ok('nothing is live before the first Publish', r.status === 404 && r.body?.error === 'not-found', `${r.status}`);

r = await call('GET', SB('/pages'), null, T).then(() => call('GET', SB('/pages', app._id), null, T));
ok('an app project has no site builder', r.status === 404, r.status);
r = await call('GET', SB('/pages'));
ok('it needs a sign-in', r.status === 401, r.status);

/* ------------------------------------------------------------- checks */
const v = async tree => (await call('POST', SB('/validate'), { tree }, T)).body;
let deep = { id: 'leaf0000', type: 'text', props: {} };
for (let i = 0; i < 31; i++) deep = { id: `deep${String(i).padStart(4, '0')}`, type: 'stack', props: {}, children: [deep] };
const checks = [
	['an unknown block type', [{ id: 'aaaa0001', type: 'flux-capacitor', props: {} }], /no block type “flux-capacitor”/],
	['a javascript: link', [{ id: 'aaaa0001', type: 'button', props: {}, action: { type: 'link', href: 'javascript:alert(1)' } }], /never javascript/],
	['a duplicate id', [{ id: 'aaaa0001', type: 'heading', props: {} }, { id: 'aaaa0001', type: 'text', props: {} }], /Two blocks have the id/],
	['nesting too deep', [deep], /nested too deep/],
	['a style value outside the list', [{ id: 'aaaa0001', type: 'section', props: {}, style: { base: { paddingTop: 7 } } }], /isn’t an allowed paddingTop/],
	['a drawer inside a section (SB-06)', [{ id: 'aaaa0001', type: 'section', props: {}, children: [{ id: 'aaaa0002', type: 'drawer', props: {}, children: [] }] }], /goes at the top level/],
	['opening a block that isn’t an overlay', [{ id: 'aaaa0001', type: 'button', props: {}, action: { type: 'open', target: 'aaaa0002' } }, { id: 'aaaa0002', type: 'heading', props: {} }], /Only a pop-up, drawer or popover/],
];
for (const [what, tree, re] of checks) {
	const out = await v(tree);
	ok(`validate finds ${what}`, out.ok === false && out.problems.some(p => re.test(p.message)), JSON.stringify(out.problems?.[0]));
}
ok('validate passes a good tree', (await v([{ id: 'good0001', type: 'heading', props: { text: 'Hi', level: 2 } }])).ok === true);

/* ------------------------------------------------------- pages and drafts */
r = await call('GET', SB(`/pages/${home.id}`), null, T);
const homeTree = r.body.draft.tree;
// Opening a page connects its words to Contents (SB-29) — a new rev the first time.
const homeRev = r.body.draft.rev;
ok('the home page draft has the hero preset with fresh ids', homeTree.length === 1 && homeTree[0].type === 'section' && homeTree[0].id !== 'hrC0sect', JSON.stringify(homeTree).slice(0, 120));

const aboutTree = [
	{
		id: 'abtSect1',
		type: 'section',
		props: { width: 'narrow' },
		children: [
			{ id: 'abtHead1', type: 'heading', props: { text: 'About Acme', level: 1 } },
			{ id: 'abtText1', type: 'text', props: { html: '<p>Since 1949.</p>' } },
		],
	},
];
r = await call('POST', SB('/pages'), { name: 'About', path: '/about', tree: aboutTree, showInMenu: true, seo: { title: 'About us', description: 'Who we are' } }, T);
const about = r.body;
ok('a page is added', r.status === 201 && about.id && about.path === '/about' && about.draft.rev === 1, `${r.status} ${r.body?.message}`);
r = await call('POST', SB('/pages'), { name: 'Bad', path: '/bad', tree: [{ id: 'x1234567', type: 'nope', props: {} }] }, T);
ok('a page with a broken tree is refused, with the problems', r.status === 400 && r.body.problems?.[0]?.message.includes('no block type'), `${r.status} ${JSON.stringify(r.body)}`);
r = await call('POST', SB('/pages'), { name: 'Again', path: '/about' }, T);
ok('two pages can’t share a path', r.status === 409, `${r.status} ${r.body?.message}`);
r = await call('POST', SB('/pages'), { name: 'Weird', path: '/About Us' }, T);
ok('a bad path is refused', r.status === 400 && /lowercase/.test(r.body.message), `${r.status} ${r.body?.message}`);
r = await call('POST', SB('/pages'), { name: 'Contact' }, T);
const contact = r.body;
ok('a path is made from the name when none is given', r.status === 201 && contact.path === '/contact', `${r.status} ${contact?.path}`);

const edited = [{ ...homeTree[0], children: [{ id: 'homeHd01', type: 'heading', props: { text: 'Version one', level: 1 } }] }];
r = await call('PUT', SB(`/pages/${home.id}`), { rev: homeRev, tree: edited }, T);
ok('a draft saves with the current rev (rev goes up)', r.status === 200 && r.body.draft.rev === homeRev + 1 && r.body.changed, `${r.status} ${r.body?.message}`);
r = await call('PUT', SB(`/pages/${home.id}`), { rev: 1, tree: [] }, T);
ok('a save with a stale rev gets 409 with the current page', r.status === 409 && r.body.rev === homeRev + 1 && r.body.page?.draft?.tree?.length === 1, `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
r = await call('PUT', SB(`/pages/${home.id}`), { rev: homeRev + 1, path: '/home' }, T);
ok('the home page stays at /', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('PUT', SB(`/pages/${about.id}`), { rev: 1, tree: [...aboutTree, { id: 'abtBtn01', type: 'button', props: { label: 'Open' }, action: { type: 'open', target: 'gone0001' } }] }, T);
ok('a missing action target saves as a draft, listed as a problem', r.status === 200 && r.body.problems.some(p => p.level === 'publish'), `${r.status} ${JSON.stringify(r.body.problems)}`);

/* -------------------------------------------------------------- publish */
r = await call('GET', SB('/changes'), null, T);
ok('changes: three new pages, the design, and the problem that stops Publish', r.body.pages.added.length === 3 && r.body.design === true && r.body.canPublish === false && r.body.problems.some(p => p.page === about.id), JSON.stringify(r.body).slice(0, 300));
r = await call('POST', SB('/publish'), { note: 'first' }, T);
ok('Publish with a problem: 400, nothing published', r.status === 400 && r.body.problems?.length, `${r.status} ${r.body?.message}`);
ok('…and the site is still not live', (await render('/')).status === 404);

r = await call('PUT', SB(`/pages/${about.id}`), { rev: 2, tree: aboutTree }, T);
ok('the problem fixed', r.status === 200 && r.body.problems.length === 0, `${r.status}`);
r = await call('POST', SB('/publish'), { note: 'First version' }, T);
ok('Publish: version 1, the address, the renderer told (or not, logged)', r.status === 200 && r.body.version === 1 && r.body.pages === 3 && typeof r.body.revalidated === 'boolean', `${r.status} ${JSON.stringify(r.body)}`);

r = await render('/');
const live1 = r.body;
ok('/render: the published home tree', r.status === 200 && live1.page.tree[0].children[0].props.text === 'Version one' && live1.page.id === home.id, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
ok('…with the layout, the design and the menu', live1.layout.header.length && live1.layout.footer.length && live1.design.theme === 'studio' && live1.menu.length === 1 && live1.menu[0].path === '/about', JSON.stringify({ menu: live1.menu, d: live1.design }));
ok('…tags (the tracker), widgets, links, site, version', live1.tags.head.includes('/public/track.js') && live1.tags.head.includes(`data-project="${site.publicSlug}"`) && live1.tags.tracker?.project === site.publicSlug && live1.tags.verification?.google === '' && Array.isArray(live1.widgets.enabled) && live1.links[about.id] === '/about' && live1.site.name && live1.version === 1, JSON.stringify({ t: live1.tags, w: live1.widgets, s: live1.site }));
ok('…SEO resolved', live1.page.seo.title && 'canonical' in live1.page.seo && live1.page.seo.noIndex === false, JSON.stringify(live1.page.seo));
r = await render('/about/');
ok('/render of /about/ (trailing slash): its SEO', r.status === 200 && r.body.page.seo.title === 'About us' && r.body.page.seo.description === 'Who we are', `${r.status} ${JSON.stringify(r.body?.page?.seo)}`);
r = await render('/nowhere');
ok('an unknown path is 404 { error: not-found }', r.status === 404 && r.body.error === 'not-found', `${r.status}`);
r = await call('POST', SB('/publish'), {}, T);
ok('Publish with nothing changed is refused', r.status === 400 && /Nothing has changed/.test(r.body.message), `${r.status} ${r.body?.message}`);

r = await call('PUT', SB(`/pages/${home.id}`), { rev: homeRev + 1, tree: [{ ...edited[0], children: [{ id: 'homeHd01', type: 'heading', props: { text: 'Version two', level: 1 } }] }] }, T);
ok('the home draft changed again', r.status === 200, `${r.status} ${r.body?.message}`);
r = await render('/');
ok('…the live site still shows version one', r.body.page.tree[0].children[0].props.text === 'Version one');
r = await call('GET', SB('/pages'), null, T);
ok('…and the page list says it changed', r.body.pages.find(p => p.id === home.id).changed === true && r.body.pages.find(p => p.id === about.id).changed === false);
r = await call('POST', SB('/publish'), { note: 'Second' }, T);
ok('Publish again: version 2', r.status === 200 && r.body.version === 2, `${r.status} ${r.body?.message}`);
r = await render('/');
ok('…now live', r.body.page.tree[0].children[0].props.text === 'Version two' && r.body.version === 2);

/* ------------------------------------------------- delete, unpublish, home */
r = await call('DELETE', SB(`/pages/${contact.id}`), null, T);
ok('a page is deleted (it was live)', r.status === 200 && r.body.live === true, `${r.status}`);
r = await render('/contact');
ok('…still on the live site until the next Publish', r.status === 200);
r = await call('GET', SB('/changes'), null, T);
ok('…changes list it as removed', r.body.pages.removed.some(p => p.id === contact.id), JSON.stringify(r.body.pages));
r = await call('DELETE', SB(`/pages/${home.id}`), null, T);
ok('the home page can’t be deleted', r.status === 400, `${r.status}`);
r = await call('POST', SB('/publish'), { note: 'No contact' }, T);
ok('Publish: version 3', r.status === 200 && r.body.version === 3, `${r.status} ${r.body?.message}`);
r = await render('/contact');
ok('…and the deleted page is gone', r.status === 404, `${r.status}`);
r = await call('POST', SB('/pages'), { name: 'Contact', path: '/contact' }, T);
ok('its path is free again', r.status === 201, `${r.status} ${r.body?.message}`);

r = await call('POST', SB(`/pages/${about.id}/unpublish`), null, T);
ok('unpublish takes a page off the live site at once', r.status === 200 && r.body.status === 'unpublished' && (await render('/about')).status === 404, `${r.status}`);
r = await render('/');
ok('…and out of the menu', r.body.menu.length === 0, JSON.stringify(r.body.menu));

r = await call('POST', SB(`/pages/${about.id}/duplicate`), {}, T);
const copy = r.body;
ok('duplicate: a new page at /about-copy with fresh ids', r.status === 201 && copy.path === '/about-copy' && copy.draft.tree[0].id !== 'abtSect1' && copy.status === 'draft', `${r.status} ${copy?.path}`);
r = await call('POST', SB(`/pages/${copy.id}/home`), null, T);
ok('make it the home page: it moves to /', r.status === 200 && r.body.isHome && r.body.path === '/', `${r.status} ${r.body?.message}`);
r = await call('GET', SB(`/pages/${home.id}`), null, T);
ok('…the old home moves to /home', r.body.isHome === false && r.body.path === '/home', `${r.body.path}`);

/* ---------------------------------------------------------- the design */
r = await call('GET', SB('/design'), null, T);
design = r.body;
r = await call('PUT', SB('/design'), { rev: design.draft.rev, tokens: { colors: { primary: { light: '#ff0066' } } }, colorScheme: 'system' }, T);
ok('the design saves (rev up)', r.status === 200 && r.body.draft.tokens.colors.primary.light === '#ff0066' && r.body.draft.rev === design.draft.rev + 1, `${r.status} ${r.body?.message}`);
r = await call('PUT', SB('/design'), { rev: design.draft.rev, theme: 'studio' }, T);
ok('…a stale rev gets 409', r.status === 409, `${r.status}`);
r = await call('PUT', SB('/design'), { rev: design.draft.rev + 1, theme: 'neon', tokens: { colors: { primary: { light: 'red;}body{' } } } }, T);
ok('…a bad theme and an unsafe colour are refused', r.status === 400 && r.body.problems.length === 2, `${r.status} ${JSON.stringify(r.body.problems)}`);

/* ------------------------------------------------------------- releases */
r = await call('GET', SB('/releases'), null, T);
ok('releases: 3, newest first, with notes and who', r.body.releases.length === 3 && r.body.releases[0].version === 3 && r.body.releases[2].note === 'First version' && r.body.releases[0].publishedBy?.name === 'Sid Builder', JSON.stringify(r.body.releases[0]));
r = await call('POST', SB('/releases/1/restore'), null, T);
ok('restore version 1 → version 4', r.status === 200 && r.body.version === 4 && r.body.restoredFrom === 1, `${r.status} ${r.body?.message}`);
r = await render('/');
ok('…the live home is version one again', r.status === 200 && r.body.page.id === home.id && r.body.page.tree[0].children[0].props.text === 'Version one' && r.body.version === 4, `${r.status} ${JSON.stringify(r.body?.page).slice(0, 160)}`);
r = await render('/about');
ok('…About is back', r.status === 200);
r = await render('/contact');
ok('…the first Contact page is back too (recreated)', r.status === 200 && r.body.page.id === contact.id, `${r.status}`);
r = await call('GET', SB('/pages'), null, T);
const paths = Object.fromEntries(r.body.pages.map(p => [p.id, p.path]));
ok('…drafts too: home at / again, pages made since kept as drafts out of the way', paths[home.id] === '/' && r.body.pages.find(p => p.id === home.id).isHome && paths[copy.id] === '/about-copy' && r.body.pages.filter(p => p.isHome).length === 1, JSON.stringify(r.body.pages.map(p => [p.name, p.path, p.status, p.isHome])));
r = await call('GET', SB('/design'), null, T);
ok('…and the design as it was', !r.body.draft.tokens?.colors && r.body.draft.colorScheme === 'light', JSON.stringify(r.body.draft.tokens));
r = await call('POST', SB('/releases/99/restore'), null, T);
ok('an unknown version is 404', r.status === 404, `${r.status}`);

/* ------------------------------------------------------- other places */
r = await call('POST', '/tenant/api/projects', { name: `Other ${stamp}`, type: 'website' }, T);
const other = r.body;
r = await call('GET', SB(`/pages/${home.id}`, other._id), null, T);
ok('another project can’t reach this one’s pages', r.status === 404, `${r.status}`);
r = await call('PUT', SB(`/pages/${home.id}`, other._id), { rev: 1, tree: [] }, T);
ok('…or change them', r.status === 404, `${r.status}`);
r = await render('/', other.publicSlug);
ok('…and its own site is not live', r.status === 404);

/* ------------------------------------------------ overlays (SB-06) */
r = await call('POST', SB('/pages'), {
	name: 'Menu test',
	path: '/menu-test',
	tree: [
		{ id: 'ovlBtn01', type: 'button', props: { label: 'Menu' }, action: { type: 'open', target: 'ovlDrw01' } },
		{ id: 'ovlDrw01', type: 'drawer', props: { side: 'left' }, children: [{ id: 'ovlTxt01', type: 'text', props: { html: '<p>Links</p>' } }] },
		{ id: 'ovlPop01', type: 'popover', props: {}, children: [] },
	],
}, T);
ok('a page with a button that opens a drawer is saved', r.status === 201, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
r = await call('POST', SB('/publish'), { note: 'overlays' }, T);
ok('…and publishes', r.status === 200, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
r = await render('/menu-test');
ok('…and /render returns the drawer at the top level with the opener', r.status === 200 && r.body.page.tree[1]?.type === 'drawer' && r.body.page.tree[0]?.action?.target === 'ovlDrw01', `${r.status}`);

r = await call('GET', `/public/sites/resolve?host=${site.publicSlug}.localhost:3300`);
ok('/sites/resolve maps <slug>.localhost (development)', r.status === 200 && r.body.slug === site.publicSlug && r.body.projectId === site._id, `${r.status} ${JSON.stringify(r.body)}`);
r = await call('GET', `/public/sites/resolve?host=nobody-${stamp}.localhost`);
ok('…an unknown host is 404', r.status === 404, `${r.status}`);
r = await call('GET', `/public/sites/resolve?host=${encodeURIComponent('<script>')}`);
ok('…a junk host is 404', r.status === 404, `${r.status}`);

let xml = await (await fetch(`${ROOT}/public/api/${site.publicSlug}/site/sitemap.xml?origin=https://acme.test`)).text();
ok('the sitemap lists the builder’s live pages', xml.includes('<loc>https://acme.test/</loc>') && xml.includes('<loc>https://acme.test/about</loc>'), xml.slice(0, 400));

r = await call('PUT', `/tenant/api/p/${site._id}/site-config`, { redirects: [{ from: '/old-about', to: '/about', permanent: true }] }, T);
r = await render('/old-about');
ok('a redirect from Site setup answers { redirect }', r.status === 200 && r.body.redirect?.to === '/about' && r.body.redirect.status === 308, `${r.status} ${JSON.stringify(r.body)}`);

/* ------------------------------- themes, fonts, layouts, sections (SB-07) */
ok('the manifest has three themes and the font list', ['bright', 'editorial', 'studio'].every(k => manifest.themes.some(t => t.key === k)) && manifest.fonts?.google?.length >= 40 && manifest.blocks.some(b => b.type === 'section-ref'), JSON.stringify(manifest.themes.map(t => t.key)));
r = await call('GET', SB('/design'), null, T);
design = r.body;
r = await call('PUT', SB('/design'), { rev: design.draft.rev, tokens: { fonts: { heading: { family: 'Comic Sans MS' } } } }, T);
ok('a font that isn’t on the list is refused', r.status === 400 && /isn’t one of the fonts/.test(r.body.problems?.[0]?.message), `${r.status} ${JSON.stringify(r.body.problems)}`);
const sections = {
	ctaSect1: { name: 'Call to action', tree: [{ id: 'ctaHead1', type: 'heading', props: { text: 'Book a table', level: 2 }, style: { md: { color: 'primary' } } }] },
	unusedS1: { name: 'Not used', tree: [{ id: 'unusedH1', type: 'heading', props: { text: 'Never sent' } }] },
};
const landing = { header: [{ id: 'lndHead1', type: 'heading', props: { text: 'Landing header', level: 2 } }], footer: [] };
r = await call('PUT', SB('/design'), { rev: design.draft.rev, theme: 'editorial', tokens: { fonts: { heading: { family: 'Playfair Display', weights: [700] } } }, sections, layouts: { ...design.draft.layouts, landing } }, T);
ok('the design saves a theme, a listed font, saved sections and a second layout', r.status === 200 && r.body.draft.theme === 'editorial' && r.body.draft.sections.ctaSect1 && r.body.draft.layouts.landing, `${r.status} ${JSON.stringify(r.body.problems || r.body.message)}`);
design = r.body;
r = await call('PUT', SB('/design'), { rev: design.draft.rev, sections: { bad00001: { name: 'Nested', tree: [{ id: 'nestRef1', type: 'section-ref', props: { section: 'ctaSect1' } }] } } }, T);
ok('a saved section can’t hold another', r.status === 400 && /can’t hold another saved section/.test(JSON.stringify(r.body.problems)), `${r.status}`);
const refTree = [{ id: 'refBlk01', type: 'section-ref', props: { section: 'ctaSect1' } }];
r = await call('POST', SB('/pages'), { name: 'Offer', path: '/offer', layout: 'landing', tree: refTree }, T);
const offer = r.body;
ok('a page on the landing layout places the saved section', r.status === 201 && offer.layout === 'landing', `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
r = await call('POST', SB('/pages'), { name: 'Offer two', path: '/offer-two', tree: [{ id: 'refBlk02', type: 'section-ref', props: { section: 'ctaSect1' } }] }, T);
r = await call('GET', SB('/design'), null, T);
ok('/design says where each saved section is used', r.body.usage?.ctaSect1?.pages.map(p => p.name).sort().join() === 'Offer,Offer two' && !r.body.usage.unusedS1, JSON.stringify(r.body.usage));
r = await call('POST', SB('/publish'), { note: 'sections' }, T);
ok('…publishes', r.status === 200, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
r = await render('/offer');
ok('/render: the landing layout, the theme, and only the saved sections the page uses', r.status === 200 && r.body.layout.header[0].id === 'lndHead1' && r.body.design.theme === 'editorial' && Object.keys(r.body.design.sections).join() === 'ctaSect1' && r.body.design.sections.ctaSect1.tree[0].props.text === 'Book a table', JSON.stringify(r.body.design).slice(0, 300));
r = await render('/');
ok('…a page that uses none gets none', r.status === 200 && Object.keys(r.body.design.sections || {}).length === 0, JSON.stringify(r.body.design?.sections));

r = await call('GET', SB('/design'), null, T);
r = await call('PUT', SB('/design'), { rev: r.body.draft.rev, sections: { unusedS1: sections.unusedS1 } }, T);
ok('deleting a saved section that pages use saves (the editor stops you; the API lists it)', r.status === 200, `${r.status}`);
r = await call('GET', SB('/changes'), null, T);
ok('…and Publish is blocked: “This saved section was deleted” on both pages', r.body.canPublish === false && r.body.problems.filter(p => /saved section was deleted/.test(p.message)).length === 2, JSON.stringify(r.body.problems));
r = await call('PUT', SB('/design'), { rev: (await call('GET', SB('/design'), null, T)).body.draft.rev, sections: { ...sections } }, T);
ok('…put back, Publish is allowed again', r.status === 200 && (await call('GET', SB('/changes'), null, T)).body.canPublish === true, `${r.status}`);

/* ------------------------------------ catalogue, presets, a11y (SB-08) */
ok('the manifest has the SB-08 catalogue: ≥ 30 presets with thumbnails, 7 themes, the new blocks', manifest.presets.length >= 30 && manifest.presets.every(p => /^\/__mint\/presets\//.test(p.thumbnail)) && manifest.themes.length >= 6 && ['header', 'tabs', 'accordion', 'carousel', 'gallery', 'card', 'map', 'countdown', 'marquee', 'breadcrumbs', 'form-placeholder'].every(t => manifest.blocks.some(b => b.type === t)), `${manifest.presets.length} presets, ${manifest.themes.length} themes`);
r = await call('GET', SB('/pages'), null, T);
ok('GET /pages carries the site’s name and contact for the canvas', typeof r.body.site?.name === 'string' && r.body.site.name.length > 0 && 'contact' in r.body.site, JSON.stringify(r.body.site));
const presetOf = key => manifest.presets.find(p => p.key === key).tree;
const faqTree = [...presetOf('page-title'), ...presetOf('faq'), ...presetOf('pricing-three')];
r = await call('POST', SB('/pages'), { name: 'Help', path: '/offer/help', tree: faqTree }, T);
ok('a page built from presets saves', r.status === 201, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
r = await call('POST', SB('/pages'), { name: 'Bad tab', path: '/bad-tab', tree: [{ id: 'lonelyT1', type: 'tab', props: {} }] }, T);
ok('a tab outside tabs is refused', r.status === 400 && /can only go inside tabs/.test(JSON.stringify(r.body.problems)), `${r.status}`);
r = await call('POST', SB('/validate'), { tree: [{ id: 'noAlt001', type: 'image', props: { src: 'placeholder:10x10:x' } }] }, T);
ok('a picture without alt text is a warning, not an error', r.status === 200 && r.body.ok === true && r.body.problems.some(p => p.level === 'warning' && /alt text/.test(p.message)), JSON.stringify(r.body));
r = await call('POST', SB('/publish'), { note: 'presets' }, T);
r = await render('/offer/help');
ok('/render: breadcrumbs from the pages above (Home › Offer › Help)', r.status === 200 && r.body.crumbs?.map(c => c.label).join(' › ') === 'Home › Offer › Help', JSON.stringify(r.body.crumbs));

done();
