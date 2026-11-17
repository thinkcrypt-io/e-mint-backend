// Form in pages (docs/multi-page-forms MF-01): a route config's `formSteps` and its form sections' `step` / `side`
// — the builder's checks (bad keys, duplicates, too many, an empty title), /get/config handing the panel the steps
// only when they're on, have steps and the form opens as its own page, and every form field carrying its
// section's page and column. MF-06: update_page over MCP sets, keeps and turns off the steps.
// Stands alone (its own account). Local scratch server only.
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const tok = (await call('POST', '/tenant/api/auth/register', { name: 'Steps', email: `steps${stamp}@example.com`, password: 'form-steps-pass-123', organization: `Steps Co ${stamp}`, country: 'BD' })).body.token;
const pid = (await call('POST', '/tenant/api/projects', { name: 'Shop', type: 'app' }, tok)).body?._id;
const P = p => `/tenant/api/p/${pid}${p}`;
const said = r => JSON.stringify(r.body?.problems || r.body?.message || r.body);

let r = await call('POST', P('/builder/models'), { name: 'Product', title: 'Products', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'sku', label: 'SKU', kind: 'text' },
	{ key: 'price', label: 'Price', kind: 'number', required: true },
	{ key: 'stock', label: 'Stock', kind: 'number' },
	{ key: 'status', label: 'Status', kind: 'select', options: [{ value: 'Active' }, { value: 'Draft' }] },
] }, tok);
ok('Product model', r.status === 201, r.status === 201 ? '' : said(r));

const route = 'products';
const current = async () => {
	const b = (await call('GET', P(`/builder/route?route=${route}`), null, tok)).body;
	return b?.config?.data || b?.code?.config || {};
};
const publish = async patch => {
	const config = { ...(await current()), ...patch };
	const d = await call('PUT', P('/builder/draft'), { route, kind: 'config', draft: config }, tok);
	if (d.status !== 200) return d;
	return call('POST', P('/builder/publish'), { route, kinds: ['config'] }, tok);
};
const steps = [
	{ key: 's1', title: 'Basic info', description: 'What customers see first' },
	{ key: 's2', title: 'Pricing' },
	{ key: 's3', title: 'Inventory' },
];
const form = [
	{ sectionTitle: 'Basics', fields: ['name', 'sku'], step: 's1' },
	{ sectionTitle: 'Status', fields: ['status'], step: 's1', side: true },
	{ sectionTitle: 'Price', fields: ['price'], step: 's2' },
	{ sectionTitle: 'Stock', fields: ['stock'] },
];
const base = await current();
const page = { ...(base.route || {}), button: { title: 'Add product', path: `/${route}/create` } };

/* ---- the builder's checks */
r = await publish({ form: [{ ...form[0], step: 'bad key!' }] });
ok('a section’s step must be a key', r.status === 400, said(r));
r = await publish({ formSteps: { enabled: true, steps: [{ key: 's1', title: 'A' }, { key: 's1', title: 'B' }] } });
ok('step keys are unique', r.status === 400, said(r));
r = await publish({ formSteps: { enabled: true, steps: [{ key: 's1', title: '' }] } });
ok('a step needs a title', r.status === 400, said(r));
r = await publish({ formSteps: { enabled: true, steps: Array.from({ length: 13 }, (_, i) => ({ key: `k${i}`, title: `P${i}` })) } });
ok('at most 12 steps', r.status === 400, said(r));
r = await publish({ formSteps: { enabled: true, steps, colour: 'red' } });
ok('nothing else in formSteps', r.status === 400, said(r));

/* ---- published and served */
r = await publish({ route: page, form, formSteps: { enabled: true, review: true, steps } });
ok('steps published', r.status === 200, said(r));
const config = async () => (await call('GET', P(`/${route}/get/config`), null, tok)).body;
let c = await config();
ok('/get/config hands over the steps', JSON.stringify(c?.formSteps) === JSON.stringify({ review: true, steps }), JSON.stringify(c?.formSteps));
const f = k => (c?.form || []).find(x => x.name === k);
ok('fields carry their section’s page', f('name')?.step === 's1' && f('sku')?.step === 's1' && f('price')?.step === 's2', JSON.stringify(c?.form?.map(x => [x.name, x.step])));
ok('…and its side column', f('status')?.side === true && f('status')?.step === 's1' && !f('name')?.side);
ok('a section on no page has no step (the panel puts it last)', f('stock') && !('step' in f('stock')));
ok('sections still split as before', f('sku')?.endOfSection === true && f('name')?.sectionTitle === 'Basics');

r = await call('GET', P(`/builder/route?route=${route}`), null, tok);
ok('the builder reads them back', r.body?.config?.data?.formSteps?.steps?.length === 3 && r.body?.config?.data?.form?.[1]?.side === true);

/* ---- only when on, with steps, and opening as a page */
r = await publish({ route: { ...page, button: { title: 'Add product', isModal: true } } });
c = await config();
ok('a pop-up form gets no steps (D2)', r.status === 200 && !c?.formSteps, JSON.stringify(c?.formSteps));
r = await publish({ route: page, formSteps: { enabled: false, review: true, steps } });
c = await config();
ok('switched off: no steps, the layout kept', r.status === 200 && !c?.formSteps && f('price')?.step === 's2');
r = await publish({ formSteps: { enabled: true, steps: [] } });
c = await config();
ok('on with no steps: one page', r.status === 200 && !c?.formSteps);
r = await publish({ formSteps: { enabled: true, steps } });
c = await config();
ok('back on (review off)', c?.formSteps?.review === false && c?.formSteps?.steps?.length === 3);
// MF-08: the Review summary on a page (Review & finalize) instead of a page of its own.
r = await publish({ formSteps: { enabled: true, review: true, reviewOn: steps[2].key, steps } });
c = await config();
ok('reviewOn: the summary on a later page', r.status === 200 && c?.formSteps?.reviewOn === steps[2].key, JSON.stringify(c?.formSteps));
r = await publish({ formSteps: { enabled: true, review: true, reviewOn: steps[0].key, steps } });
c = await config();
ok('reviewOn the first page is ignored (nothing before it)', r.status === 200 && !('reviewOn' in (c?.formSteps || {})), JSON.stringify(c?.formSteps));
r = await publish({ formSteps: { enabled: true, steps } });

/* ---- creating a record is unchanged: one call with everything */
r = await call('POST', P(`/${route}`), { name: 'Shirt', sku: 'SH-1', price: 500, stock: 3, status: 'Active' }, tok);
ok('a record saves in one call', r.status === 201, said(r));

/* ---- MF-06: update_page over MCP */
if (process.argv.includes('--mcp')) {
	const key = (await call('POST', P('/builder/api-keys'), { name: 'steps', scopes: ['read', 'build'] }, tok)).body?.secret;
	const mcp = async (name, args) => {
		const res = await fetch(`${(await import('./lib.mjs')).ROOT}/tenant/mcp`, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
		});
		return (await res.json().catch(() => null))?.result;
	};
	ok('an MCP key', !!key);
	let m = await mcp('get_model', { name: 'Product' });
	ok('get_model shows the form’s pages', /Form pages/.test(m?.content?.[0]?.text || '') && m?.structuredContent?.page?.formSteps?.steps?.length === 3, m?.content?.[0]?.text?.slice(-400));
	m = await mcp('update_page', { route, form: [{ sectionTitle: 'Everything', fields: ['name', 'price'] }, { sectionTitle: 'More', fields: ['stock'], step: 's3', side: true }] });
	c = await config();
	ok('update_page: a section’s step and side', !m?.isError && f('stock')?.step === 's3' && f('stock')?.side === true, m?.content?.[0]?.text);
	m = await mcp('update_page', { route, formSteps: { review: true, steps: [{ title: 'Basics' }, { key: 'p2', title: 'Money', description: 'Prices' }] }, form: [{ sectionTitle: 'A', fields: ['name'], step: 's1' }, { sectionTitle: 'B', fields: ['price'], step: 'p2' }] });
	c = await config();
	ok('update_page: steps set (keys made where missing), sections placed', !m?.isError && c?.formSteps?.steps?.length === 2 && c.formSteps.review === true && f('price')?.step === 'p2' && f('name')?.step === c.formSteps.steps[0].key, m?.content?.[0]?.text);
	m = await mcp('update_page', { route, formSteps: { steps: [{ key: 'x', title: 'X' }] }, form: [{ sectionTitle: 'A', fields: ['name'], step: 'nope' }] });
	ok('update_page: a section on an unknown page is refused', m?.isError && /nope/.test(m?.content?.[0]?.text || ''), m?.content?.[0]?.text);
	m = await mcp('update_page', { route, formSteps: false });
	c = await config();
	ok('update_page: formSteps false turns them off', !m?.isError && !c?.formSteps, m?.content?.[0]?.text);
}

done();
