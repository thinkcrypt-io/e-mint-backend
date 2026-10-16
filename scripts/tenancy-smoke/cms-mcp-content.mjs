// CMS-14 (docs/cms D-AI): MCP content tools — list_content_types, get_entry, save_entry_draft (drafts, never
// live), publish_entry (only with the publish scope; publishes / takes off), get_page_contents + fill_page (a
// website page's typed contents as drafts, checked all-or-nothing), suggest_seo (the page's words and SEO), and
// the server's "drafts first" instructions. Stands alone.
import { call, ok, done, ROOT } from './lib.mjs';

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Cy Content', email: `cy${stamp}@example.com`, password: 'tenant-pass-123', organization: `Cy ${stamp}`, country: 'BD' });
const T = r.body?.token;
ok('signed up', r.status === 200 && T, `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/projects', { name: `Cafe ${stamp}`, type: 'website' }, T);
const site = r.body;
ok('a website project', r.status === 200 && site?.publicSlug, `${r.status} ${r.body?.message}`);
const P = path => `/tenant/api/p/${site._id}${path}`;
const B = path => P(`/builder${path}`);
const pub = path => fetch(`${ROOT}/public/api/${site.publicSlug}${path}`).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));

r = await call('POST', B('/models'), { name: 'Post', title: 'Posts', displayField: 'title', draftAndPublish: true, fields: [
	{ key: 'title', label: 'Title', kind: 'text', required: true },
	{ key: 'body', label: 'Body', kind: 'textarea' },
] }, T);
const post = r.body?.doc;
ok('a drafts model', r.status === 201, JSON.stringify(r.body?.problems || r.body?.message));
await call('PUT', B(`/models/${post._id}/public-api`), { enabled: true, actions: ['list', 'get'], auth: 'none' }, T);
r = await call('POST', B('/models'), { name: 'Banner', title: 'Banner', kind: 'single', draftAndPublish: true, fields: [{ key: 'message', label: 'Message', kind: 'text' }] }, T);
const banner = r.body?.doc;
ok('a single type with drafts', r.status === 201 && banner?.kind === 'single', JSON.stringify(r.body?.problems || r.body?.message));
await call('PUT', B(`/models/${banner._id}/public-api`), { enabled: true, actions: ['list', 'get'], auth: 'none' }, T);

const mkKey = async (name, scopes) => (await call('POST', P('/builder/api-keys'), { name, scopes }, T)).body?.secret;
const writer = await mkKey('Writer', ['read', 'build', 'data']);
const publisher = await mkKey('Publisher', ['read', 'build', 'data', 'publish']);
const rpc = async (k, method, params) => {
	const x = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${k}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
	return x.json().catch(() => null);
};
const tool = async (k, name, args = {}) => (await rpc(k, 'tools/call', { name, arguments: args }))?.result;
const text = res => res?.content?.[0]?.text || '';

const init = await rpc(writer, 'initialize', { protocolVersion: '2025-06-18' });
ok('instructions: drafts first, publish only when asked', /CONTENT \(drafts first\)/.test(init?.result?.instructions || '') && /only when the user has asked/.test(init?.result?.instructions || ''), (init?.result?.instructions || '').slice(-300));
const names = (await rpc(writer, 'tools/list', {}))?.result?.tools?.map(t => t.name) || [];
ok('content tools listed', ['list_content_types', 'get_entry', 'save_entry_draft', 'get_page_contents', 'fill_page', 'suggest_seo'].every(n => names.includes(n)), names.join(' '));
ok('…publish_entry only for a key with the publish scope', !names.includes('publish_entry') && (await rpc(publisher, 'tools/list', {}))?.result?.tools?.some(t => t.name === 'publish_entry'));

/* ---- entries */
let res = await tool(writer, 'save_entry_draft', { route: post.route, data: { title: 'Spring menu', body: 'Wild garlic and new potatoes.' } });
const id = res?.structuredContent?._id || (text(res).match(/\[([a-f0-9]{24})\]/) || [])[1];
ok('save_entry_draft makes a draft', !res?.isError && !!id && /Saved as a draft/.test(text(res)), text(res));
r = await pub(`/${post.route}`);
ok('…not on the API', r.body?.total === 0, JSON.stringify(r.body));
res = await tool(writer, 'save_entry_draft', { route: post.route, data: { body: 'x' } });
ok('a new record still needs its required fields', res?.isError && /title/.test(text(res)), text(res));
res = await tool(writer, 'save_entry_draft', { route: post.route, id, data: { title: 'Spring menu' } });
ok('no change says so', !res?.isError && /Nothing changed/.test(text(res)), text(res));
res = await tool(writer, 'list_content_types');
ok('list_content_types: counts what isn’t live', /Posts \/posts/.test(text(res)) && /1 never published/.test(text(res)) && /Banner \/banners/.test(text(res)) && !/web-contents/.test(text(res)) && /Page content types: hero/.test(text(res)), text(res).slice(0, 600));
res = await tool(writer, 'get_entry', { route: post.route, match: { title: 'Spring menu' } });
ok('get_entry by a field: the draft and its status', !res?.isError && /Draft — never published/.test(text(res)) && /Wild garlic/.test(text(res)), text(res));
res = await tool(writer, 'publish_entry', { route: post.route, ids: [id] });
ok('publish_entry refused without the publish scope', res?.isError, text(res));

res = await tool(publisher, 'publish_entry', { route: post.route, ids: [id] });
ok('publish_entry with the publish scope', !res?.isError && /1 published/.test(text(res)), text(res));
r = await pub(`/${post.route}`);
ok('…now on the API', r.body?.total === 1 && r.body.doc[0].title === 'Spring menu', JSON.stringify(r.body));
res = await tool(writer, 'save_entry_draft', { route: post.route, id, data: { title: 'Spring menu, updated' } });
ok('a change after that is a draft', !res?.isError && /keep what was published/.test(text(res)), text(res));
r = await pub(`/${post.route}/${id}`);
ok('…the API keeps what’s published', r.body?.title === 'Spring menu', r.body?.title);
res = await tool(writer, 'get_entry', { route: post.route, id });
ok('get_entry: what’s live, and what changed', /Changes not published/.test(text(res)) && /Published \(what the site and API show\)/.test(text(res)) && /Changed since: title/.test(text(res)), text(res));
res = await tool(publisher, 'publish_entry', { route: post.route, ids: [id], action: 'unpublish' });
ok('unpublish takes it off', !res?.isError && /taken off/.test(text(res)) && (await pub(`/${post.route}`)).body?.total === 0, text(res));

res = await tool(writer, 'save_entry_draft', { route: banner.route, data: { message: 'Open on Sundays' } });
ok('a single type: made by its route', !res?.isError && /made/.test(text(res)), text(res));
res = await tool(writer, 'save_entry_draft', { route: banner.route, data: { message: 'Open on Sundays, 8–2' } });
ok('…and the same record changed next time', !res?.isError && /changed/.test(text(res)), text(res));
res = await tool(publisher, 'publish_entry', { route: banner.route });
r = await pub(`/${banner.route}`);
ok('…published without an id, the API answers with it', !res?.isError && r.body?.message === 'Open on Sundays, 8–2', JSON.stringify(r.body));

/* ---- a website page */
res = await tool(writer, 'fill_page', { page: '/', sections: [{ type: 'hero', name: 'Home hero', data: { heading: 'Coffee worth the walk', text: 'Roasted here every Tuesday.', nonsense: 1 } }, { type: 'faq', data: { heading: 'Questions', items: [{ question: 'Do you do oat milk?', answer: 'Yes, always.' }] } }] });
ok('fill_page adds contents as drafts', !res?.isError && /added Hero “Home hero”/.test(text(res)) && /Saved as drafts/.test(text(res)) && /place them on the page/.test(text(res)), text(res));
res = await tool(writer, 'get_page_contents', { page: '/' });
const hero = res?.structuredContent?.items?.find?.(x => x.type === 'hero') || null;
const heroId = hero?._id || (text(res).match(/\[([a-f0-9]{24})\] hero/) || [])[1];
ok('get_page_contents: in order, with fields and words', !res?.isError && /hero “Home hero” — Draft/.test(text(res)) && /Coffee worth the walk/.test(text(res)) && /fields: .*heading/.test(text(res)) && !!heroId, text(res).slice(0, 500));
res = await tool(writer, 'fill_page', { page: '/', sections: [{ id: heroId, data: { heading: 'Coffee worth the detour' } }] });
ok('fill_page changes one by id', !res?.isError && /changed Hero/.test(text(res)), text(res));
res = await tool(writer, 'get_page_contents', { page: '/' });
ok('…only the fields sent', /Coffee worth the detour/.test(text(res)) && /Roasted here every Tuesday/.test(text(res)), text(res).slice(0, 500));
res = await tool(writer, 'fill_page', { page: '/', sections: [{ id: heroId, data: { heading: 'Ok' } }, { type: 'carousel3d', data: {} }] });
ok('a wrong section: nothing saved', res?.isError && /Nothing saved/.test(text(res)) && /carousel3d|a type to add/.test(text(res)), text(res));
ok('…the first one unchanged too', /Coffee worth the detour/.test(text(await tool(writer, 'get_page_contents', { page: '/' }))));
res = await tool(writer, 'fill_page', { page: '/nowhere', sections: [{ type: 'hero', data: {} }] });
ok('a page that isn’t there', res?.isError && /No page/.test(text(res)), text(res));

res = await tool(writer, 'suggest_seo', { page: '/' });
ok('suggest_seo: the page’s words, its SEO now, how to save', !res?.isError && /Coffee worth the detour/.test(text(res)) && /characters/.test(text(res)) && /save_site_page/.test(text(res)), text(res).slice(0, 500));

r = await call('DELETE', `/tenant/api/projects/${site._id}?force=1`, null, T);
ok('project deleted', r.status === 200, r.body?.message);
done();
