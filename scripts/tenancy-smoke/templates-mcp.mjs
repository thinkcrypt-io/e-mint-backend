// Template Studio (docs/templates) T-06: the Templates MCP at /templates/mcp — emt_ keys
// (create, list, revoke), scopes, and a whole session: create an app template, two linked
// models, dashboard, questions, guide, validate, preview (the link opens it), publish.
import { call, ok, done, ROOT } from './lib.mjs';

const A = '/admin/api';
const PASS = 'tenancy-dev-pass-1';
const { MongoClient } = await import('../../node_modules/mongodb/lib/index.js');
const uri = process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
const mc = await new MongoClient(uri).connect();
const db = mc.db();
const KEYS = /^smoke-mcp/;
await db.collection('projecttemplates').deleteMany({ key: KEYS });
await db.collection('templatekeys').deleteMany({ name: /^smoke/ });

let r = await call('POST', `${A}/auth/login`, { email: 'admin@example.com', password: PASS });
const T = r.body.token;

const rpc = async (key, method, params, { path = '/templates/mcp', id = 1, bearer = true } = {}) => {
	const res = await fetch(ROOT + path, {
		method: 'POST',
		headers: { 'content-type': 'application/json', ...(bearer && key && { authorization: `Bearer ${key}` }) },
		body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
	});
	let j; try { j = await res.json(); } catch { j = null; }
	return { status: res.status, body: j };
};
const tool = async (key, name, args) => {
	const res = (await rpc(key, 'tools/call', { name, arguments: args })).body?.result;
	return { ...res, text: res?.content?.[0]?.text || '' };
};

/* ------------------------------------------------------------------ keys */
r = await call('POST', `${A}/templates/keys`, { name: '' }, T);
ok('a key needs a name', r.status === 400, r.status);
r = await call('POST', `${A}/templates/keys`, { name: 'smoke all', scopes: ['read', 'write', 'preview', 'publish'] }, T);
const full = r.body?.secret;
ok('create a key: emt_ secret shown once', r.status === 201 && /^emt_/.test(full) && !r.body.doc.hash, `${r.status} ${r.body?.message || ''}`);
r = await call('POST', `${A}/templates/keys`, { name: 'smoke write', scopes: ['read', 'write'] }, T);
const writer = r.body?.secret;
const writerId = r.body?.doc?._id;
r = await call('GET', `${A}/templates/keys`, null, T);
ok('listed, never with the secret or hash', r.status === 200 && r.body.doc.some(k => k.name === 'smoke all') && !JSON.stringify(r.body).includes(full) && !r.body.doc.some(k => k.hash), r.status);

/* ------------------------------------------------------ protocol + auth */
r = await rpc(full, 'initialize', { protocolVersion: '2025-06-18' });
ok('initialize: its own server and instructions', r.status === 200 && r.body.result.serverInfo.name === 'e-mint-templates' && /TEMPLATES/.test(r.body.result.instructions) && r.body.result.protocolVersion === '2025-06-18', JSON.stringify(r.body?.result?.serverInfo));
r = await rpc(full, 'tools/list', {}, { path: `/templates/mcp/${full}`, bearer: false });
const allTools = r.body?.result?.tools?.map(t => t.name) || [];
ok('key in the path works; every tool listed', r.status === 200 && ['describe_template_format', 'create_template', 'upsert_model', 'preview_template', 'publish_template', 'import_template'].every(n => allTools.includes(n)), allTools.length);
r = await rpc(writer, 'tools/list', {});
const writerTools = r.body?.result?.tools?.map(t => t.name) || [];
ok('a read+write key isn’t offered preview or publish', writerTools.includes('upsert_model') && !writerTools.includes('publish_template') && !writerTools.includes('preview_template'), writerTools.join(','));
r = await rpc('', 'tools/list', {});
ok('no key → 401', r.status === 401, r.status);
r = await rpc('emt_nope', 'tools/list', {});
ok('unknown key → 401', r.status === 401 && /revoked|exist/.test(r.body?.error?.message), r.body?.error?.message);
const ak = await call('POST', `${A}/builder/api-keys`, { name: 'smoke builder key', scopes: ['read'] }, T);
const builderKey = ak.body?.secret || ak.body?.doc?.secret;
r = await rpc(builderKey, 'tools/list', {});
ok('a builder (emk_) key is refused here', /^emk_/.test(builderKey) && r.status === 401 && /emt_/.test(r.body?.error?.message), `${r.status} ${r.body?.error?.message}`);
r = await rpc(full, 'tools/list', {}, { path: '/mcp' });
ok('a template (emt_) key is refused at /mcp', r.status === 401, r.status);
r = await fetch(`${ROOT}/templates/mcp`);
ok('GET → 405 (no event stream)', r.status === 405, r.status);

/* --------------------------------------------------------------- session */
let t = await tool(full, 'describe_template_format', {});
ok('format guide: types, kinds, rules', /## Types and their parts/.test(t.text) && /Kinds:/.test(t.text) && /Rules for publishing/.test(t.text), t.text.slice(0, 80));
t = await tool(full, 'create_template', { type: 'app', name: 'Smoke MCP finance', summary: 'Accounts and transactions for a small team.', category: 'Finance' });
ok('create_template → a draft, with what’s still to explain', !t.isError && t.structuredContent?.template?.key === 'smoke-mcp-finance' && t.structuredContent.validation.explain.length > 0, t.text.slice(0, 200));
const key = 'smoke-mcp-finance';

t = await tool(full, 'set_questions', { template: key, value: [{ key: 'currency', label: 'Which currency do you work in?', help: 'A 3-letter code', kind: 'text', default: 'USD', required: true }] });
ok('set_questions', !t.isError && t.structuredContent.template.key === key, t.text.slice(0, 300));
t = await tool(full, 'upsert_model', { template: key, model: { name: 'Account', title: 'Accounts', description: 'Bank accounts and cash you track.', rationale: 'Transactions belong to one.', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true, helper: 'What you call it' }, { key: 'currency', label: 'Currency', kind: 'text', default: '{{currency}}', helper: 'e.g. USD' }] } });
ok('upsert_model: Account saved, {{currency}} answered, models part clean', !t.isError && /the new model Account \(1 model/.test(t.text) && !t.structuredContent.validation.errors.length, t.text.slice(0, 300));
t = await tool(full, 'upsert_model', { template: key, model: { name: 'Transaction', title: 'Transactions', description: 'Money in and out.', rationale: 'The ledger.', displayField: 'note', fields: [{ key: 'note', label: 'Note', kind: 'text', required: true, helper: 'What it was for' }, { key: 'amount', label: 'Amount', kind: 'number', required: true, helper: 'Positive in, negative out' }, { key: 'account', label: 'Account', kind: 'reference', ref: 'Account', required: true, helper: 'Where the money moved' }] } });
ok('upsert_model: Transaction links to Account', !t.isError && /2 model/.test(t.text) && !t.structuredContent.validation.errors.length, t.text.slice(0, 300));
t = await tool(full, 'upsert_model', { template: key, model: { name: 'Transaction', title: 'Transactions', description: 'Money in and out.', rationale: 'The ledger.', displayField: 'note', fields: [{ key: 'note', label: 'Note', kind: 'text', required: true, helper: 'x' }, { key: 'amount', label: 'Amount', kind: 'number', required: true, helper: 'x' }, { key: 'account', label: 'Account', kind: 'reference', ref: 'Account', required: true, helper: 'x' }] } });
ok('same name → replaced, not added', /the changed model Transaction \(2 model/.test(t.text), t.text.slice(0, 120));
t = await tool(full, 'upsert_model', { template: key, model: { name: 'Budget', title: 'Budgets', description: 'Limits.', rationale: 'x', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'category', label: 'Category', kind: 'reference', ref: 'Category' }] } });
ok('a link to a missing model is reported with a fix', t.structuredContent?.validation?.errors?.some(i => i.part === 'models' && i.fix), t.text.slice(0, 400));
t = await tool(full, 'remove_model', { template: key, name: 'Budget' });
ok('remove_model', !t.isError && !t.structuredContent.validation.errors.length, t.text.slice(0, 200));
t = await tool(full, 'remove_model', { template: key, name: 'Budget' });
ok('removing a model that isn’t there is refused', t.isError, t.text);

t = await tool(full, 'set_dashboard', { template: key, value: [{ type: 'stat', route: 'Transaction', title: 'Money moved', metric: 'sum', field: 'amount' }, { type: 'stat', route: 'Nope', title: 'x' }] });
ok('set_dashboard: an unknown model is reported', t.structuredContent?.validation?.errors?.some(i => i.part === 'dashboard'), t.text.slice(0, 300));
t = await tool(full, 'set_dashboard', { template: key, value: [{ type: 'stat', route: 'Transaction', title: 'Money moved', metric: 'sum', field: 'amount' }] });
ok('set_dashboard: clean', !t.isError && !t.structuredContent.validation.errors.length, t.text.slice(0, 200));
t = await tool(full, 'set_sidebar', { template: key, value: [{ name: 'Money', icon: 'wallet', description: 'Your accounts and ledger', items: [{ model: 'Account' }, { model: 'Transaction' }] }] });
ok('set_sidebar', !t.isError && !t.structuredContent.validation.errors.length, t.text.slice(0, 200));
t = await tool(full, 'set_sample_data', { template: key, value: { Account: [{ name: 'Main account' }], Transaction: [{ note: 'Opening balance', amount: 1000, account: 'Main account' }] } });
ok('set_sample_data', !t.isError && !t.structuredContent.validation.errors.length, t.text.slice(0, 300));
t = await tool(full, 'set_setup_guide', { template: key, value: { steps: [{ title: 'Add your accounts', body: 'Every bank account and card you track.', page: 'Account' }], faq: [{ q: 'Can I add more currencies?', a: 'Yes, per account.' }] } });
ok('set_setup_guide', !t.isError && !t.structuredContent.validation.explain.some(i => i.part === 'guide'), t.text.slice(0, 300));
t = await tool(full, 'upsert_page', { template: key, page: { path: '/' } });
ok('pages only on website templates', t.isError && /website templates/.test(t.text), t.text);
t = await tool(full, 'set_webhooks', { template: key, value: [] });
ok('a part the type doesn’t have is refused with the list', t.isError && /don’t have a webhooks part/.test(t.text), t.text);

t = await tool(full, 'validate_template', { template: key });
ok('validate: still to explain (description, audience)', !t.structuredContent.validation.canPublish && t.structuredContent.validation.explain.some(i => i.part === 'overview'), t.text.slice(0, 400));
t = await tool(full, 'update_overview', { template: key, description: 'Track accounts and every transaction.\n\nA dashboard sums the money moved.', audience: 'Small teams and freelancers.' });
ok('update_overview keeps the rest, now ready to publish', !t.isError && t.structuredContent.validation.canPublish && /ready to publish/.test(t.text), t.text.slice(0, 400));
t = await tool(full, 'get_template', { template: key });
ok('get_template: the draft and what’s inside', t.structuredContent?.draft?.overview?.summary === 'Accounts and transactions for a small team.' && t.structuredContent.whatsInside.counts.models === 2, JSON.stringify(t.structuredContent?.whatsInside?.counts));

/* --------------------------------------------------------------- preview */
t = await tool(writer, 'preview_template', { template: key });
ok('preview refused for a key without the preview scope', t.isError && /“preview” scope/.test(t.text), t.text);
t = await tool(full, 'preview_template', { template: key, answers: { currency: 'EUR' } });
const url = t.structuredContent?.url || '';
ok('preview_template: built, with a link', !t.isError && /\/preview\?ticket=[a-f0-9]{48}$/.test(url) && /2 model/.test(t.text), t.text.slice(0, 300));
const ticket = url.split('ticket=')[1];
r = await call('POST', '/tenant/api/auth/preview', { ticket });
ok('the link opens the preview', r.status === 200 && r.body.token && r.body.project?._id === t.structuredContent?.project?._id, r.status);
const PT = r.body?.token;
const PP = `/tenant/api/p/${r.body?.project?._id}`;
r = await call('GET', `${PP}/accounts`, null, PT);
ok('…with the sample data and the answer filled in', r.status === 200 && r.body.doc?.[0]?.name === 'Main account', JSON.stringify(r.body?.doc?.[0]));
const pvId = t.structuredContent?.project?._id;
ok('preview_template says ready', t.structuredContent?.status === 'ready' && t.structuredContent?.project?.status === 'ready', JSON.stringify(t.structuredContent?.project));
t = await tool(full, 'preview_status', { preview: pvId });
ok('preview_status by id: ready, with a fresh link', !t.isError && t.structuredContent?.status === 'ready' && /\/preview\?ticket=[a-f0-9]{48}$/.test(t.structuredContent?.url || '') && /2 model/.test(t.text), t.text.slice(0, 300));
t = await tool(full, 'preview_status', { template: key });
ok('preview_status by template: its newest preview', !t.isError && t.structuredContent?.project?._id === pvId, t.text.slice(0, 200));
t = await tool(full, 'preview_status', { preview: 'nope' });
ok('preview_status: a bad id is a readable error', t.isError && /isn’t a preview id/.test(t.text), t.text);
await call('DELETE', `${A}/templates/previews/${pvId}`, null, T);

/* --------------------------------------------------------------- publish */
t = await tool(writer, 'publish_template', { template: key, notes: 'First.', confirm: true });
ok('publish refused for a write-only key', t.isError && /“publish” scope/.test(t.text), t.text);
t = await tool(full, 'publish_template', { template: key, notes: 'First.' });
ok('publish needs confirm: true', t.isError && /confirm/.test(t.text), t.text);
t = await tool(full, 'publish_template', { template: key, notes: 'First version.', confirm: true });
ok('published v1', !t.isError && /version 1/.test(t.text) && t.structuredContent.template.version === 1, t.text.slice(0, 200));
t = await tool(full, 'list_templates', { search: 'smoke-mcp' });
ok('list_templates shows it published', t.structuredContent?.templates?.some(d => d.key === key && d.status === 'published' && d.version === 1), t.text);

/* ----------------------------------------------------- export / import */
t = await tool(full, 'export_template', { template: key });
const file = t.structuredContent;
ok('export_template', file?.format === 'emint-template@1' && file.blueprint?.models?.steps?.length === 2);
t = await tool(writer, 'import_template', { data: file });
ok('import_template → a new draft, key suffixed', !t.isError && t.structuredContent?.template?.key === 'smoke-mcp-finance-2', t.text.slice(0, 200));

/* ---------------------------------------------------------- website bits */
t = await tool(full, 'create_template', { type: 'website', name: 'Smoke MCP site', summary: 'A small site.' });
t = await tool(full, 'upsert_page', { template: 'smoke-mcp-site', page: { path: '/', name: 'Home', seo: { title: 'Home' }, contents: [{ slug: 'hero', category: 'section', content: 'Welcome to {{project}}' }] } });
ok('upsert_page: half an SEO entry is reported', t.structuredContent?.validation?.errors?.some(i => i.part === 'website'), t.text.slice(0, 300));
t = await tool(full, 'upsert_page', { template: 'smoke-mcp-site', page: { path: '/', name: 'Home', seo: { title: 'Home', description: 'The home page.' }, contents: [{ slug: 'hero', category: 'section', content: 'Welcome to {{project}}' }] } });
ok('upsert_page: replaced by path', !t.isError && /1 page/.test(t.text) && !t.structuredContent.validation.errors.length, t.text.slice(0, 300));
t = await tool(full, 'set_site_defaults', { template: 'smoke-mcp-site', settings: { identity: { siteName: '{{project}}' }, seo: { titleTemplate: '%s · {{project}}' } } });
ok('set_site_defaults keeps the pages', !t.isError, t.text.slice(0, 200));
t = await tool(full, 'get_template', { template: 'smoke-mcp-site' });
ok('…pages and settings both there', t.structuredContent?.draft?.website?.pages?.length === 1 && t.structuredContent.draft.website.settings.identity.siteName === '{{project}}');

/* ---------------------------------------------------------------- revoke */
r = await call('DELETE', `${A}/templates/keys/${writerId}`, null, T);
ok('revoke', r.status === 200, r.status);
r = await rpc(writer, 'tools/list', {});
ok('a revoked key is refused at once', r.status === 401 && /revoked/.test(r.body?.error?.message), r.body?.error?.message);
r = await call('GET', `${A}/templates/keys`, null, T);
ok('…and still listed, as revoked', r.body.doc.some(k => String(k._id) === String(writerId) && k.revokedAt));

await db.collection('projecttemplates').deleteMany({ key: KEYS });
await db.collection('templatekeys').deleteMany({ name: /^smoke/ });
await db.collection('apikeys').deleteMany({ name: 'smoke builder key' });
await mc.close();
done();
