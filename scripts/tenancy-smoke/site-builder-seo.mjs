// Site setup → Add script (docs/site-builder SB-30) and page SEO like the AGS
// VSeo (SB-31): every SEO field saves, survives a panel edit of the page's SEO
// record, reaches the render answer and the sitemap; scripts come in the render
// answer for the renderer to print, and track.js is told to leave them.
// With SMOKE_SITES (a mint-sites on this backend) it also reads the live HTML.
import http from 'http';
import { call, ok, done, ROOT, projectKey } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Ada Seo', email: `seo${stamp}@example.com`, password: 'tenant-pass-123', organization: `Seo ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('signed up', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: `Global ${stamp}`, type: 'website' }, T);
const site = r.body;
ok('a website project', r.status === 200 && site?.publicSlug, `${r.status} ${r.body?.message}`);
const SB = path => `/tenant/api/p/${site._id}/site-builder${path}`;
const P = path => `/tenant/api/p/${site._id}${path}`;
const render = path => call('GET', `/public/api/${site.publicSlug}/render?path=${encodeURIComponent(path)}`);

/* ------------------------------------------------------------- page SEO */
r = await call('GET', SB('/pages'), null, T);
const home = r.body.pages.find(p => p.isHome);
r = await call('GET', SB(`/pages/${home.id}`), null, T);
let rev = r.body.draft.rev;
ok('a page’s SEO has the VSeo fields with their defaults', r.body.draft.seo.schemaType === 'auto' && r.body.draft.seo.sitemapInclude === true && r.body.draft.seo.maxSnippet === -1, JSON.stringify(r.body.draft.seo));

const seo = {
	title: 'Study abroad from Bangladesh | Global',
	description: 'Free counselling, university applications and visa support for the UK, Canada and Australia — from Dhaka and Sylhet.',
	image: 'https://cdn.example.com/og.jpg',
	keywords: ['study abroad', 'uk universities'],
	focusKeyword: 'study abroad',
	ogTitle: 'Study abroad with Global',
	ogDescription: 'Your path to a university abroad.',
	ogType: 'website',
	ogImageAlt: 'Students on a campus',
	twitterCard: 'summary_large_image',
	twitterTitle: 'Global on X',
	twitterDescription: 'Free counselling.',
	twitterImage: 'https://cdn.example.com/tw.jpg',
	noFollow: false,
	noArchive: true,
	noImageIndex: false,
	maxSnippet: 160,
	maxImagePreview: 'large',
	schemaType: 'LocalBusiness',
	schemaJson: '{ "areaServed": "BD", "telephone": "+8801700000000" }',
	breadcrumbTitle: 'Home',
	sitemapInclude: true,
	sitemapPriority: 1,
	sitemapChangeFrequency: 'daily',
};
r = await call('PUT', SB(`/pages/${home.id}`), { rev, seo }, T);
ok('saving every SEO field', r.status === 200, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
rev = r.body?.draft?.rev ?? rev + 1;
r = await call('GET', SB(`/pages/${home.id}`), null, T);
const back = r.body.draft.seo;
ok('…they all come back', Object.entries(seo).every(([k, v]) => JSON.stringify(back[k]) === JSON.stringify(v)), JSON.stringify(Object.entries(seo).filter(([k, v]) => JSON.stringify(back[k]) !== JSON.stringify(v))));

r = await call('PUT', SB(`/pages/${home.id}`), { rev: r.body.draft.rev, seo: { ...seo, ogType: 'video', sitemapPriority: 3, schemaJson: '{nope' } }, T);
ok('bad values are refused, each named', r.status === 400 && ['seo.ogType', 'seo.sitemapPriority', 'seo.schemaJson'].every(p => (r.body?.problems || []).some(x => x.path === p)), JSON.stringify(r.body).slice(0, 300));

// The page's SEO record (panel → SEO) holds the first six; editing it keeps the rest.
r = await call('GET', P('/seo'), null, T);
const rec = (r.body?.doc || [])[0];
ok('the page has its SEO record', rec?.title === seo.title, JSON.stringify(rec).slice(0, 200));
r = await call('PUT', P(`/seo/${rec._id}`), { description: 'Edited in the panel: counselling, applications and visas for students in Bangladesh who want to study abroad.' }, T);
ok('…edited in the panel', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('GET', SB(`/pages/${home.id}`), null, T);
ok('…the page takes the new description and keeps its other SEO', r.body.draft.seo.description.startsWith('Edited in the panel') && r.body.draft.seo.schemaType === 'LocalBusiness' && r.body.draft.seo.ogImageAlt === seo.ogImageAlt, JSON.stringify(r.body.draft.seo).slice(0, 300));

// A second page, out of the sitemap.
r = await call('POST', SB('/pages'), { name: 'Our services in Dhaka and Sylhet', path: '/services', seo: { breadcrumbTitle: 'Services', sitemapPriority: 0.8, sitemapChangeFrequency: 'monthly' } }, T);
const services = r.body;
ok('a page with a breadcrumb label', [200, 201].includes(r.status) && services?.id, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
r = await call('POST', SB('/pages'), { name: 'Thank you', path: '/thanks', seo: { sitemapInclude: false } }, T);
ok('a page left out of the sitemap', [200, 201].includes(r.status), `${r.status}`);

/* ---------------------------------------------------------- Add script */
const scripts = [
	{ name: 'Verification', location: 'head', content: '<meta name="facebook-domain-verification" content="fb-123">', enabled: true },
	{ name: 'Head script', location: 'head', content: '<script>window.__sb30 = (window.__sb30 || 0) + 1;</script>', enabled: true },
	{ name: 'Chat widget', location: 'bodyEnd', content: '<div id="sb30-chat"></div><script src="https://chat.example.com/w.js" async></script>', enabled: true },
	{ name: 'Paused', location: 'bodyStart', content: '<script>window.__paused = 1</script>', enabled: false },
];
r = await call('PUT', P('/site-config'), { headTags: scripts }, T);
ok('scripts saved in Site setup', r.status === 200 && r.body?.headTags?.length === 4, `${r.status} ${r.body?.message}`);

r = await call('POST', SB('/publish'), { note: 'seo + scripts' }, T);
ok('published', r.status === 200, `${r.status} ${r.body?.message}`);

/* -------------------------------------------------------------- render */
r = await render('/');
const data = r.body || {};
const live = data.page?.seo || {};
ok('the render answer has every SEO field', live.schemaType === 'LocalBusiness' && live.ogImageAlt === seo.ogImageAlt && live.maxSnippet === 160 && live.noArchive === true && live.twitterImage === seo.twitterImage, JSON.stringify(live).slice(0, 300));
const code = data.tags?.code || {};
ok('…the enabled scripts, by place, for the renderer to print', code.head?.includes('fb-123') && code.head.includes('__sb30') && code.bodyEnd?.includes('sb30-chat') && !code.bodyStart?.includes('__paused'), JSON.stringify(code));
ok('…and the tracker told to leave them', data.tags?.tracker?.noCode === true && data.tags.head.includes('data-no-code'), JSON.stringify(data.tags?.tracker));
r = await render('/services');
const crumbs = r.body?.crumbs || [];
ok('breadcrumbs use the breadcrumb label', crumbs.at(-1)?.label === 'Services', JSON.stringify(crumbs));

const js = await (await fetch(`${ROOT}/public/track.js`)).text();
ok('track.js skips the code tags when told to (data-no-code)', js.includes("hasAttribute('data-no-code')"));

/* -------------------------------------------------------------- sitemap */
const key = await projectKey(site.publicSlug);
const xml = await (await fetch(`${ROOT}/public/api/site/sitemap.xml?apiKey=${key}&origin=https://global.test`)).text();
ok('sitemap: priority and change frequency', xml.includes('<loc>https://global.test/</loc>') && xml.includes('<changefreq>daily</changefreq><priority>1.0</priority>') && xml.includes('<changefreq>monthly</changefreq><priority>0.8</priority>'), xml);
ok('…and the page taken out is not in it', !xml.includes('/thanks'), xml);

/* ------------------------------------------------- the live page's HTML */
const SITES = process.env.SMOKE_SITES;
if (SITES) {
	const url = new URL(SITES);
	// Node can't resolve <slug>.localhost, so ask localhost with the site's Host.
	const page = path =>
		new Promise((res, rej) =>
			http
				.get({ host: url.hostname, port: url.port, path, headers: { host: `${site.publicSlug}.localhost:${url.port}` } }, rs => {
					let b = '';
					rs.on('data', c => (b += c));
					rs.on('end', () => res(b));
				})
				.on('error', rej)
		);
	const html = await page('/');
	const head = html.slice(0, html.indexOf('</head>'));
	ok('live: the verification meta is in <head>', /<meta name="facebook-domain-verification" content="fb-123"\/?>/.test(head), head.slice(0, 300));
	// Next also carries the page's HTML as escaped text in its RSC data — that copy never runs; count real tags.
	ok('live: the head script is printed once', (html.match(/<script>window\.__sb30 = /g) || []).length === 1, String((html.match(/<script>window\.__sb30 = /g) || []).length));
	ok('live: the chat widget is at the end of <body>', html.indexOf('sb30-chat') > html.indexOf('</main>') || html.lastIndexOf('sb30-chat') > html.length / 2, `${html.indexOf('sb30-chat')} / ${html.length}`);
	ok('live: a paused script is not there', !html.includes('__paused'));
	ok('live: the tracker has data-no-code', /track\.js"[^>]*data-no-code/.test(html) || /data-no-code[^>]*track\.js/.test(html), (html.match(/<script[^>]*track\.js[^>]*>/) || [''])[0]);
	ok('live: Open Graph and Twitter from the page’s SEO', head.includes('property="og:title" content="Study abroad with Global"') && head.includes('property="og:image:alt" content="Students on a campus"') && head.includes('name="twitter:title" content="Global on X"'), '');
	ok('live: robots with noarchive and max-snippet', /name="robots" content="[^"]*noarchive/.test(head) && /name="googlebot" content="[^"]*max-snippet:160/.test(head), (head.match(/<meta name="(robots|googlebot)"[^>]*>/g) || []).join(' '));
	const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
	ok('live: JSON-LD — the page as LocalBusiness with its custom fields, WebSite, Organization', ld.some(b => b['@type'] === 'LocalBusiness' && b.areaServed === 'BD') && ld.some(b => b['@type'] === 'WebSite') && ld.some(b => b['@type'] === 'Organization'), JSON.stringify(ld).slice(0, 300));
	const svc = await page('/services');
	const svcLd = [...svc.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
	ok('live: a BreadcrumbList on a page below home', svcLd.some(b => b['@type'] === 'BreadcrumbList' && b.itemListElement.at(-1).name === 'Services'), JSON.stringify(svcLd).slice(0, 300));

	// Switching a script off reaches the live site at once (the save revalidates the renderer).
	r = await call('PUT', P('/site-config'), { headTags: scripts.map(s => (s.name === 'Head script' ? { ...s, enabled: false } : s)) }, T);
	await new Promise(res => setTimeout(res, 1500));
	const after = await page('/');
	ok('live: a script switched off is gone without a Publish', r.status === 200 && !after.includes('<script>window.__sb30 = '), '');
}
done();
