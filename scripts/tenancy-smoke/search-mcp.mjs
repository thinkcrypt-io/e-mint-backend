// Store search over MCP (docs/search SI-18): a store's key lists search_insights, try_search, save_search_suggestion
// and enrich_products (a website's doesn't); try_search explains every result; a search with no results shows in
// search_insights; save_search_suggestion checks its record, names rule products by name, and lands in Suggested
// fixes as From your AI without changing search; enrich_products lists products short of search words, dry-runs
// (nothing saved), then saves — and search finds the product by its new word.
//
// Needs the backend started with SEARCH_TICK_MS=1000 SEARCH_SWEEP_MS=3000 SEARCH_DAILY_MS=2000.
import { call, ok, done, ROOT, projectKey } from './lib.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 20000) => {
	const end = Date.now() + ms;
	for (;;) {
		const v = await fn();
		if (v || Date.now() > end) return v;
		await sleep(400);
	}
};
const rpc = async (key, method, params) => {
	const r = await fetch(ROOT + '/tenant/mcp', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
	return (await r.json().catch(() => null))?.result;
};
const tool = async (key, name, args) => {
	const r = await rpc(key, 'tools/call', { name, arguments: args });
	return { text: r?.content?.[0]?.text || '', data: r?.structuredContent, isError: !!r?.isError };
};
const SEARCH = ['search_insights', 'try_search', 'save_search_suggestion', 'enrich_products'];

const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Mo Mcp', email: `mo${stamp}@example.com`, password: 'tenant-pass-123', organization: `Mcp ${stamp}`, country: 'BD' });
const t = r.body?.token;

const site = (await call('POST', '/tenant/api/projects', { name: 'Plain site', type: 'website' }, t)).body;
r = await call('POST', `/tenant/api/p/${site._id}/builder/api-keys`, { name: 'AI', scopes: ['read', 'build', 'data'] }, t);
const siteKey = r.body?.secret || r.body?.key || r.body?.doc?.secret;
let list = await rpc(siteKey, 'tools/list', {});
ok('a website’s key has no search tools', Array.isArray(list?.tools) && !list.tools.some(x => SEARCH.includes(x.name)), (list?.tools || []).length);

const p = (await call('POST', '/tenant/api/projects', { name: 'Mcp shop', type: 'ecommerce' }, t)).body;
const P = `/tenant/api/p/${p._id}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
ok('store ready', await waitFor(async () => (await call('GET', `${C}/settings`, null, t)).body?.status === 'ready', 180000));
const inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || {};
const ids = {};
for (const [name, price] of [['Cotton dress', 900], ['Silk saree', 2400], ['Denim jacket', 3000]])
	ids[name] = String((await call('POST', `${P}/${inst.product.route}`, { name, sku: name.split(' ')[0].toUpperCase(), price, status: 'active', productType: 'simple', trackStock: false }, t)).body?.doc?._id);
ok('indexed', await waitFor(async () => (await call('GET', `${C}/search/status`, null, t)).body?.docs === 3, 30000));

r = await call('POST', `${P}/builder/api-keys`, { name: 'AI', scopes: ['read', 'build', 'data'] }, t);
const key = r.body?.secret || r.body?.key || r.body?.doc?.secret;
list = await rpc(key, 'tools/list', {});
ok('a store’s key has the four search tools', SEARCH.every(n => list?.tools?.some(x => x.name === n)), (list?.tools || []).map(x => x.name).filter(n => /search|enrich/.test(n)).join());
const init = await rpc(key, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
ok('…and the instructions say how to use them', /WEBSITE SEARCH/.test(init?.instructions || ''), (init?.instructions || '').slice(-200));

let o = await tool(key, 'try_search', { q: 'dress' });
ok('try_search explains each result', !o.isError && /1\. Cotton dress/.test(o.text) && /name exact “dress”/.test(o.text) && o.data?.total === 1, o.text.slice(0, 300));
o = await tool(key, 'try_search', { q: 'kurta' });
ok('…and says when nothing is found', !o.isError && /0 result/.test(o.text), o.text.slice(0, 200));

// Shoppers search "kurta" (nothing) a few times; the hourly totals pick it up.
const pk = await projectKey(p.publicSlug);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
for (let v = 0; v < 3; v++) await fetch(`${ROOT}/public/api/store/search?${new URLSearchParams({ apiKey: pk, q: 'kurta', visitor: `k${v}${stamp}` })}`, { headers: { 'user-agent': UA } });
const seen = await waitFor(async () => {
	const x = await tool(key, 'search_insights', { days: 7 });
	return /No results[\s\S]*“kurta”: 3 searches, 3 with no results/.test(x.text) && x;
}, 30000);
ok('search_insights lists the search with no results', !!seen, seen?.text?.slice(0, 400));
o = await tool(key, 'search_insights', { q: 'kurta', days: 7 });
ok('…and one search on its own', !o.isError && /kurta/.test(o.text));

o = await tool(key, 'save_search_suggestion', { kind: 'synonym', why: 'x', record: { words: ['kurta'] } });
ok('a synonym with one word is refused', o.isError && /two or more/.test(o.text), o.text);
o = await tool(key, 'save_search_suggestion', { kind: 'rule', why: 'Shoppers want it first', record: { when: 'exact', queries: ['dress'], action: 'pin', products: ['Nope gown'] } });
ok('a rule naming a product the store hasn’t got is refused', o.isError && /Nope gown/.test(o.text), o.text);
o = await tool(key, 'save_search_suggestion', { kind: 'rule', why: 'Shoppers searching saree want silk first', record: { when: 'exact', queries: ['saree'], action: 'pin', products: ['silk saree'] } });
ok('a pin rule by product name is saved for the owner', !o.isError && /Suggested fixes/.test(o.text), o.text);
o = await tool(key, 'save_search_suggestion', { kind: 'synonym', why: '3 shoppers searched kurta and found nothing; the cotton dress is the closest', record: { words: ['kurta'], to: ['dress'] } });
ok('a one-way synonym too', !o.isError, o.text);
r = await call('GET', `${C}/search/suggestions`, null, t);
const mine = (r.body?.doc || r.body || []).filter?.(s => s.source === 'your-ai') || [];
ok('both wait in Suggested fixes as From your AI', mine.length === 2 && mine.some(s => s.kind === 'rule' && String(s.record.products?.[0]) === ids['Silk saree']), JSON.stringify(r.body).slice(0, 300));
o = await tool(key, 'try_search', { q: 'kurta' });
ok('…and search hasn’t changed', /0 result/.test(o.text));
o = await tool(key, 'save_search_suggestion', { kind: 'synonym', why: 'again', record: { words: ['kurta'], to: ['dress'] } });
r = await call('GET', `${C}/search/suggestions`, null, t);
ok('the same draft again updates it, not a second one', ((r.body?.doc || r.body || []).filter?.(s => s.source === 'your-ai') || []).length === 2);

o = await tool(key, 'enrich_products', {});
ok('enrich_products lists products short of search words', !o.isError && /Cotton dress/.test(o.text) && o.data?.products?.length === 3, o.text.slice(0, 300));
o = await tool(key, 'enrich_products', { items: [{ product: 'COTTON', add: ['Kurta', 'eid', 'kurta', 'cotton dress'] }] });
ok('a dry run shows the change and saves nothing', !o.isError && o.data?.dryRun && /none → kurta, eid/.test(o.text), o.text);
let doc = (await call('GET', `${P}/${inst.product.route}/${ids['Cotton dress']}`, null, t)).body;
ok('…nothing saved', !(doc?.keywords || doc?.doc?.keywords || []).length, JSON.stringify(doc?.keywords || doc?.doc?.keywords));
o = await tool(key, 'enrich_products', { items: [{ product: 'Nope', add: ['x'] }], apply: true });
ok('an unknown product changes nothing', o.isError && /Nothing changed/.test(o.text), o.text);
o = await tool(key, 'enrich_products', { items: [{ product: 'COTTON', add: ['Kurta', 'eid'] }], apply: true });
ok('apply saves the words', !o.isError && /Saved search words on 1/.test(o.text), o.text);
doc = (await call('GET', `${P}/${inst.product.route}/${ids['Cotton dress']}`, null, t)).body;
ok('…on the product', JSON.stringify(doc?.keywords || doc?.doc?.keywords) === '["kurta","eid"]', JSON.stringify(doc?.keywords || doc?.doc?.keywords));
const found = await waitFor(async () => {
	const x = await tool(key, 'try_search', { q: 'kurta' });
	return /1\. Cotton dress/.test(x.text) && x;
}, 10000);
ok('…and search finds the product by it', !!found, found?.text?.slice(0, 200) || (await tool(key, 'try_search', { q: 'kurta' })).text.slice(0, 400));

await call('DELETE', `/tenant/api/projects/${p._id}?force=1`, null, t);
await call('DELETE', `/tenant/api/projects/${site._id}?force=1`, null, t);
done();
