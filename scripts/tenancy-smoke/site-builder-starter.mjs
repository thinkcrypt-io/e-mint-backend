// Theme demo sites (docs/site-builder SB-28): each theme's demo loads into a blank
// website — pages, a list model with its public API and records, Contents bound to
// the blocks, SEO records — passes Publish's checks and renders with its data.
// A site with pages needs replace: true. The MCP's start_from_theme. Stands alone.
import { call, ok, done, ROOT } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Theo Themes', email: `theo${stamp}@example.com`, password: 'tenant-pass-123', organization: `Theo ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('signed up', r.status === 200 && T, `${r.status} ${r.body?.message}`);

const project = async name => (await call('POST', '/tenant/api/projects', { name, type: 'website' }, T)).body;
let first = await project(`Starters ${stamp}`);
const SB = (pid, path) => `/tenant/api/p/${pid}/site-builder${path}`;
r = await call('GET', SB(first._id, '/starters'), null, T);
const themes = Object.keys(r.body?.starters || {});
ok('GET /starters: a demo per theme, and the site is blank', themes.length === 7 && r.body.blank === true, JSON.stringify(r.body).slice(0, 160));

for (const theme of themes) {
	const site = theme === themes[0] ? first : await project(`${theme} ${stamp}`);
	r = await call('POST', SB(site._id, '/starter'), { theme }, T);
	const out = r.body;
	ok(`${theme}: the demo loads`, r.status === 200 && out.pages?.length >= 4 && out.contents > 5, `${r.status} ${r.body?.message}`);
	r = await call('GET', SB(site._id, '/changes'), null, T);
	const blocking = (r.body?.problems || []).filter(p => p.level !== 'warning');
	ok(`${theme}: nothing stops Publish`, r.body?.canPublish === true, JSON.stringify(blocking.slice(0, 3)));
	r = await call('POST', SB(site._id, '/publish'), { note: 'Demo' }, T);
	ok(`${theme}: published`, r.status === 200 && r.body?.version === 1, `${r.status} ${r.body?.message}`);
	r = await call('GET', `/public/api/${site.publicSlug}/render?path=/`);
	const nodes = Object.values(r.body?.data?.nodes || {});
	ok(`${theme}: home renders its list and its contents`, r.status === 200 && nodes.some(n => n.items?.length === 3) && Object.keys(r.body?.data?.contents || {}).length > 3 && r.body?.design?.theme === theme, `${r.status} ${nodes.map(n => n.items?.length + (n.problem || '')).join()}`);
	const item = nodes[0]?.items?.[0];
	r = await call('GET', `/public/api/${site.publicSlug}/render?path=${encodeURIComponent(`/${out.list.model}/${item?.slug}`)}`);
	ok(`${theme}: a record's own page`, r.status === 200 && r.body?.data?.record?.title === item?.title && r.body.page.seo.title.startsWith(item?.title), `${r.status} ${r.body?.page?.seo?.title}`);
	r = await call("GET", `/tenant/api/p/${site._id}/web-contents?limit=200`, null, T);
	ok(`${theme}: the texts are Contents records`, (r.body?.doc || []).length >= out.contents, (r.body?.doc || []).length);
}

r = await call('POST', SB(first._id, '/starter'), { theme: 'bistro' }, T);
ok('a site with pages needs replace: true', r.status === 409, `${r.status} ${r.body?.message}`);
r = await call('POST', SB(first._id, '/starter'), { theme: 'bistro', replace: true }, T);
ok('…then the demo takes their place', r.status === 200 && r.body?.pages?.some(p => p.path === '/menu'), `${r.status} ${r.body?.message}`);
r = await call('GET', SB(first._id, '/pages'), null, T);
ok('…the home page keeps its id, the old pages are gone', r.body?.pages?.find(p => p.isHome)?.name === 'Home' && !r.body.pages.some(p => p.path === '/services'), JSON.stringify(r.body?.pages?.map(p => p.path)));
r = await call('GET', SB(first._id, '/changes'), null, T);
ok('…and come off the site at the next Publish', r.body?.pages?.removed?.some(p => p.path === '/services'), JSON.stringify(r.body?.pages?.removed));
r = await call('POST', SB(first._id, '/starter'), { theme: 'nope', replace: true }, T);
ok('an unknown theme is refused', r.status === 400, r.status);

// The MCP
const site = await project(`MCP ${stamp}`);
r = await call('POST', `/tenant/api/p/${site._id}/builder/api-keys`, { name: 'AI', scopes: ['read', 'build'] }, T);
const key = r.body?.secret;
const res = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'start_from_theme', arguments: { theme: 'calm' } } }) }).then(x => x.json());
ok('MCP start_from_theme', !res?.result?.isError && /Loaded the calm demo site/.test(res?.result?.content?.[0]?.text || ''), res?.result?.content?.[0]?.text?.slice(0, 160));

done();
