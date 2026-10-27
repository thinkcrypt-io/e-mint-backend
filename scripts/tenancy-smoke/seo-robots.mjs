// docs/seo SEO-09: robots.txt built for you (extra rules, a switch per crawler) or written in full, served by
// GET /public/api/site/robots.txt, and POST /site-config/robots-preview (the file the settings being edited make, and
// its mistakes). The file's text and the checks are unit-tested in library/siteBuilder/test/robots.test.ts. Stands alone.
import { call, ok, done, ROOT, projectKey } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Rob Robots', email: `rob${stamp}@example.com`, password: 'tenant-pass-123', organization: `Rob ${stamp}`, country: 'BD' });
const T = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Robots Shop', type: 'website', domains: ['www.robots-shop.invalid'] }, T);
const site = r.body;
ok('a tenant and a website project', !!(T && site?._id), `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;
const KEY = await projectKey(site.publicSlug);
const robots = async () => {
	const x = await fetch(`${ROOT}/public/api/site/robots.txt?apiKey=${KEY}`);
	return { status: x.status, mode: x.headers.get('x-mint-robots'), text: await x.text() };
};
const put = seo => call('PUT', P('/site-config'), { seo }, T);
const SITEMAP = 'Sitemap: https://www.robots-shop.invalid/sitemap.xml';

let x = await robots();
ok('built for you by default: allow all, the sitemap line', x.status === 200 && x.mode === 'built' && x.text === `User-agent: *\nAllow: /\n\n${SITEMAP}\n`, JSON.stringify(x.text));

/* ---- each switch changes the served file ---- */
r = await call('POST', P('/site-config/robots-preview'), {}, T);
const crawlers = r.body?.crawlers || [];
ok('the preview names ten crawlers', crawlers.length === 10, crawlers.length);
let each = 0;
for (const c of crawlers) {
	await put({ robotsBlock: [c.id] });
	x = await robots();
	if (x.text.includes(`\nUser-agent: ${c.agent}\nDisallow: /\n`) && x.text.startsWith('User-agent: *\nAllow: /')) each++;
	else console.log('   not blocked:', c.agent, JSON.stringify(x.text));
}
ok('each of the ten switches blocks its crawler in the served file', each === 10, each);
r = await put({ robotsBlock: ['gptbot', 'claudebot'], robots: 'Disallow: /private' });
x = await robots();
ok('two blocked, extra rules under * before them, the sitemap last', x.text === `User-agent: *\nAllow: /\n\nDisallow: /private\n\nUser-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\n${SITEMAP}\n`, JSON.stringify(x.text));
r = await call('GET', P('/site-config'), null, T);
ok('read back in the panel', r.body?.seo?.robotsMode === 'built' && r.body.seo.robotsBlock?.join() === 'gptbot,claudebot', JSON.stringify(r.body?.seo?.robotsBlock));
r = await put({ robotsBlock: ['nobot'] });
ok('an unknown crawler: refused', r.status === 400, `${r.status} ${r.body?.message}`);
await put({ robotsBlock: [] });
x = await robots();
ok('all switched back on: no crawler groups', !x.text.includes('GPTBot') && x.text.includes('Disallow: /private'), JSON.stringify(x.text));

/* ---- the preview: the draft, not what's saved ---- */
r = await call('POST', P('/site-config/robots-preview'), { robotsBlock: ['ccbot'] }, T);
ok('preview: the draft’s file, no problems', r.status === 200 && r.body.text.includes('User-agent: CCBot\nDisallow: /') && r.body.problems.length === 0, JSON.stringify(r.body?.problems));
x = await robots();
ok('…and nothing saved', !x.text.includes('CCBot'));
r = await call('POST', P('/site-config/robots-preview'), { robotsMode: 'custom', robotsFile: 'User-agent: *\nDisallow: /\nNoindex: /x' }, T);
ok('preview: a file that blocks everything, and a Noindex line', r.body?.problems?.some(p => p.level === 'error' && /whole site/.test(p.message)) && r.body.problems.some(p => p.line === 3) && r.body.problems.some(p => /Sitemap line/.test(p.message)), JSON.stringify(r.body?.problems));

/* ---- the whole file ---- */
const FILE = '# Robots Shop\nUser-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nDisallow: /\n\nSitemap: https://www.robots-shop.invalid/sitemap.xml';
r = await put({ robotsMode: 'custom', robotsFile: FILE, robotsBlock: ['bytespider'] });
ok('the whole file saved', r.status === 200, `${r.status} ${r.body?.message}`);
x = await robots();
ok('served exactly as written (a final newline added), marked custom', x.mode === 'custom' && x.text === `${FILE}\n`, JSON.stringify(x.text));
await put({ indexing: false });
x = await robots();
ok('…even with indexing off', x.text === `${FILE}\n`);
r = await call('POST', P('/site-config/robots-preview'), {}, T);
ok('…the preview says pages still say noindex', r.body?.notes?.some(n => /noindex/.test(n)), JSON.stringify(r.body?.notes));
await put({ indexing: true, robotsMode: 'built' });
x = await robots();
ok('back to built: the switches’ file again (Bytespider blocked)', x.mode === 'built' && x.text.includes('User-agent: Bytespider\nDisallow: /') && !x.text.includes('/admin'), JSON.stringify(x.text));
r = await put({ robotsFile: 'x'.repeat(20001) });
ok('a file over 20,000 characters: refused', r.status === 400, r.status);
r = await put({ robotsMode: 'other' });
ok('an unknown mode: refused', r.status === 400, r.status);

/* ---- who may ---- */
r = await call('POST', P('/site-config/robots-preview'), {}, null);
ok('signed out: refused', r.status === 401 || r.status === 403, r.status);
const app = (await call('POST', '/tenant/api/projects', { name: 'Robots app', type: 'app' }, T)).body;
r = await call('POST', `/tenant/api/p/${app?._id}/site-config/robots-preview`, {}, T);
ok('an app project: 404', r.status === 404, r.status);

done();
