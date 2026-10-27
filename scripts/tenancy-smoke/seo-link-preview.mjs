// docs/seo SEO-14: the link preview checker. A local server plays the websites: a page with every share tag, a bare
// page, a JavaScript app's empty shell, a tiny share image with a long title, a redirect, and a connected site's
// page whose SEO set here is only added in the browser by the snippet — beside one whose server prints it (the
// /site/head HTML). POST /site-config/link-preview reads each the way the share apps do. Stands alone.
import http from 'http';
import sharp from '../../node_modules/sharp/lib/index.js';
import { call, ok, done, ROOT, projectKey } from './lib.mjs';

const png = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: '#2f855a' } }).png().toBuffer();
const images = { '/img/big.png': await png(1200, 630), '/img/tiny.png': await png(150, 150), '/img/square.png': await png(800, 800) };

let KEY = '';
const page = (head, body = '<main><h1>Hello</h1><p>Words a person reads on this page, enough of them to count as a page.</p></main>') =>
	`<!doctype html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;
const server = http.createServer(async (req, res) => {
	const base = `http://localhost:${server.address().port}`;
	const url = new URL(req.url, base);
	if (images[url.pathname]) return res.writeHead(200, { 'content-type': 'image/png' }).end(images[url.pathname]);
	const html = (s, status = 200) => res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }).end(s);
	switch (url.pathname) {
		case '/good':
			return html(
				page(`<title>Hand-made shoes | Sky Shoes</title><meta name="description" content="Oxfords and loafers, made by hand in Dhaka.">
<meta property="og:title" content="Hand-made shoes &amp; boots"><meta property="og:description" content="Oxfords and loafers, made by hand in Dhaka.">
<meta property="og:image" content="${base}/img/big.png"><meta property="og:url" content="${base}/good"><meta property="og:site_name" content="Sky Shoes">
<meta name="twitter:card" content="summary_large_image">`)
			);
		case '/bare':
			return html(page('<title>Bare page</title>'));
		case '/shell':
			return html(`<!doctype html><html><head><title>App</title><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>`);
		case '/tiny':
			return html(
				page(`<title>x</title><meta property="og:title" content="${'A title far too long for any share card to show in full, '.repeat(2)}">
<meta property="og:description" content="Short."><meta property="og:image" content="/img/tiny.png"><meta property="og:site_name" content="Sky">`)
			);
		case '/square':
			return html(page(`<title>Square</title><meta property="og:image" content="${base}/img/square.png"><meta name="twitter:card" content="summary">`));
		case '/old':
			return res.writeHead(301, { location: '/good' }).end();
		case '/about':
			// A connected site: the snippet with data-seo — the SEO set in Mint goes on in the browser only.
			return html(page(`<title>About (old)</title><script src="${ROOT}/public/track.js" data-key="${KEY}" data-seo></script>`));
		case '/team': {
			// A connected site that prints the SEO on its server (the /site/head HTML).
			const r = await fetch(`${ROOT}/public/api/site/head?apiKey=${KEY}&path=/team&format=html`);
			return html(page(await r.text()));
		}
		default:
			return html(page('<title>Not found</title>'), 404);
	}
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const SITE = `http://localhost:${server.address().port}`;

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Sky Preview', email: `skyp${stamp}@example.com`, password: 'tenant-pass-123', organization: `Sky P ${stamp}`, country: 'BD' });
const T = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Preview Shoes', type: 'website' }, T);
const site = r.body;
ok('a tenant and a website project', !!(T && site?._id), `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;
KEY = await projectKey(site.publicSlug);
const check = url => call('POST', P('/site-config/link-preview'), { url }, T);
const keys = b => (b?.problems || []).map(p => p.key);

/* ---- a page with every tag ---- */
r = await check(`${SITE}/good`);
let b = r.body;
ok('a correct page: read', r.status === 200 && b?.ok && b.status === 200, `${r.status} ${JSON.stringify(b).slice(0, 200)}`);
ok('…its tags, entities decoded', b?.tags?.ogTitle === 'Hand-made shoes & boots' && b.tags.ogSiteName === 'Sky Shoes' && b.tags.twitterCard === 'summary_large_image', JSON.stringify(b?.tags));
ok('…the image measured', b?.image?.ok && b.image.width === 1200 && b.image.height === 630 && b.image.type === 'image/png', JSON.stringify(b?.image));
ok('…a card for each app, all big', b?.cards?.map(c => c.app).join() === 'facebook,linkedin,whatsapp,x,slack' && b.cards.every(c => c.layout === 'large' && c.image && c.title), JSON.stringify(b?.cards?.map(c => [c.app, c.layout])));
ok('…LinkedIn without the description, the rest with it', b?.cards?.[1].description === '' && b.cards[0].description.startsWith('Oxfords'), '');
ok('…no errors or warnings', b?.counts?.error === 0 && b.counts.warning === 0, JSON.stringify(b?.problems));
ok('…not a page of this project’s SEO', b?.mint === null, JSON.stringify(b?.mint));

/* ---- a bare page ---- */
r = await check(`${SITE}/bare`);
b = r.body;
ok('a bare page: no image is an error', keys(b).includes('no-image') && b.problems.find(p => p.key === 'no-image').level === 'error', JSON.stringify(keys(b)));
ok('…no description, no twitter:card, no site name', ['no-description', 'no-twitter-card', 'no-site-name', 'no-og-title'].every(k => keys(b).includes(k)), JSON.stringify(keys(b)));
ok('…text-only cards with the <title>', b?.cards?.every(c => c.layout === 'text' && c.title === 'Bare page'), JSON.stringify(b?.cards?.[0]));

/* ---- a JavaScript app's shell ---- */
r = await check(`${SITE}/shell`);
b = r.body;
ok('a JavaScript-only page: flagged first', b?.problems?.[0]?.key === 'app-shell' && b.problems[0].level === 'error', JSON.stringify(b?.problems?.slice(0, 2)));

/* ---- a tiny image, a relative address, a long title ---- */
r = await check(`${SITE}/tiny`);
b = r.body;
ok('a tiny image: measured from a relative og:image', b?.image?.width === 150 && b.image.url === `${SITE}/img/tiny.png`, JSON.stringify(b?.image));
ok('…too small, relative, long title', ['image-tiny', 'relative-image', 'long-title'].every(k => keys(b).includes(k)), JSON.stringify(keys(b)));
ok('…no picture on the cards', b?.cards?.every(c => c.layout === 'text' && !c.image), JSON.stringify(b?.cards?.map(c => c.layout)));

/* ---- a square image: thumbnails ---- */
r = await check(`${SITE}/square`);
b = r.body;
ok('a square image: small cards and a ratio notice', b?.cards?.[0].layout === 'small' && b.cards[3].layout === 'small' && keys(b).includes('image-ratio'), JSON.stringify(b?.cards?.map(c => c.layout)));

/* ---- a redirect, a 404, nothing typed ---- */
r = await check(`${SITE}/old`);
b = r.body;
ok('a redirect: followed and said', b?.finalUrl === `${SITE}/good` && keys(b).includes('redirected'), `${b?.finalUrl} ${JSON.stringify(keys(b))}`);
r = await check(`${SITE}/nowhere`);
ok('a 404: no card', r.status === 200 && r.body?.ok === false && /404/.test(r.body.message), JSON.stringify(r.body));
r = await check('');
ok('no address and no domain: asks for one', r.body?.ok === false && /Type an address/.test(r.body.message), JSON.stringify(r.body));
r = await check('ftp://example.com/x');
ok('not a web address: refused', r.body?.ok === false && r.body.url === '', JSON.stringify(r.body));

/* ---- a connected site: SEO set here, only added in the browser ---- */
await call('PUT', P('/site-config'), { identity: { siteName: 'Preview Shoes' } }, T);
const pageRec = async (path, name) => {
	const x = (await call('POST', P('/pages'), { name, path, status: 'published' }, T)).body;
	return x?.doc || x;
};
const about = await pageRec('/about', 'About');
const team = await pageRec('/team', 'Team');
r = await call('POST', P('/seo'), { page: about?._id, seo: { metaTitle: 'About Preview Shoes', metaDescription: 'Who makes the shoes.', ogImage: `${SITE}/img/big.png` } }, T);
const aboutSeo = r.body?.doc || r.body;
await call('POST', P('/seo'), { page: team?._id, seo: { metaTitle: 'The team at Preview Shoes', metaDescription: 'The people.', ogImage: `${SITE}/img/big.png` } }, T);
ok('two connected pages added to SEO', !!(about?._id && team?._id && aboutSeo?._id), JSON.stringify(aboutSeo).slice(0, 200));
r = await check(`${SITE}/about`);
b = r.body;
ok('SEO only in the browser: flagged first, the snippet named', b?.problems?.[0]?.key === 'browser-only' && /snippet/.test(b.problems[0].message), JSON.stringify(b?.problems?.[0]));
ok('…Edit SEO names its record', b?.mint?.seo === String(aboutSeo?._id) && b.mint.page.path === '/about' && b.mint.browserOnly === true, JSON.stringify(b?.mint));
ok('…the cards show the page’s own tags', b?.cards?.[0].title === 'About (old)', b?.cards?.[0].title);
r = await check(`${SITE}/team`);
b = r.body;
ok('SEO printed on the server: not flagged, its record named', !keys(b).includes('browser-only') && b?.mint?.seo && b.mint.browserOnly === false, JSON.stringify({ keys: keys(b), mint: b?.mint }));
ok('…the cards show it', b?.cards?.[0].title?.startsWith('The team at Preview Shoes') && b.cards[0].layout === 'large', JSON.stringify(b?.cards?.[0]));

server.close();
done();
