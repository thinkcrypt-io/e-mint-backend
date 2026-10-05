// WO-43 migration (scripts/migrateProjectCollections.js): a project built the old way — one
// collection per model, t_<projectId>_<route> — moved into t_<projectId>: dry run, --apply, a
// re-run, --drop-old. Records keep their ids and contents, links and history still resolve, and
// every super-admin model (definition, collection, records, indexes) is byte-for-byte as before.
// Uses projects.mjs's state (pat); reads and writes the scratch DB directly (SMOKE_MONGO).
import { execFileSync } from 'child_process';
import { call, ok, done, load } from './lib.mjs';

const s = load();
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const { MongoClient, ObjectId, BSON } = await import('../../node_modules/mongodb/lib/index.js');
const { EJSON } = BSON;
const uri = process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri)) throw new Error(`Scratch databases only: ${uri}`);
const mc = await new MongoClient(uri).connect();
const db = mc.db();
const idOf = r => r.body?._id || r.body?.doc?._id;
const listOf = async (pid, path) => (await call('GET', P(pid, path), null, s.pat)).body?.doc || [];
const sleep = ms => new Promise(res => setTimeout(res, ms));
const dataCollections = async id => (await db.listCollections({ name: { $regex: `^t_${id}(_|$)` } }, { nameOnly: true }).toArray()).map(c => c.name).sort();
// Every server recompiles a changed model within 10 seconds.
const settle = () => sleep(11_000);

/** Runs the migration script against the scratch DB only; never the backend's .env. */
const migrate = (...args) => {
	try {
		return { code: 0, out: execFileSync('node', ['../migrateProjectCollections.js', ...args], { cwd: new URL('.', import.meta.url).pathname, env: { ...process.env, MONGO_CONNECTION_URI: uri }, encoding: 'utf8' }) };
	} catch (e) {
		return { code: e.status, out: `${e.stdout || ''}${e.stderr || ''}` };
	}
};

const docsOf = async (name, filter = {}) =>
	(await db.collection(name).find(filter).sort({ _id: 1 }).toArray()).map(d => {
		const { _model, ...rest } = d;
		return EJSON.stringify(rest, { relaxed: false });
	});

/** Everything about the super admin's built models. */
const platformSnapshot = async () => {
	const defs = await db.collection('modeldefinitions').find({ organization: null }).sort({ _id: 1 }).toArray();
	const out = {};
	for (const d of defs)
		out[d.collectionName] = {
			def: EJSON.stringify(d, { relaxed: false }),
			docs: (await db.collection(d.collectionName).find({}).sort({ _id: 1 }).toArray()).map(x => EJSON.stringify(x, { relaxed: false })),
			indexes: EJSON.stringify(await db.collection(d.collectionName).indexes().catch(() => [])),
		};
	return out;
};

/* ------------------------------------------- a super-admin model, with data */
const admin = (await call('POST', '/admin/api/auth/login', { email: 'admin@example.com', password: 'tenancy-dev-pass-1' })).body.token;
const tag = Date.now().toString(36);
let r = await call('POST', '/admin/api/builder/models', { name: `Migplat${tag}`, title: 'Migration platform', displayField: 'name', code: { enabled: true, prefix: 'MP' }, fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'email', label: 'Email', kind: 'email', unique: true },
] }, admin);
const plat = r.body?.doc;
await call('POST', `/admin/api/${plat?.route}`, { name: 'Platform one', email: 'p1@example.com' }, admin);
await call('POST', `/admin/api/${plat?.route}`, { name: 'Platform two' }, admin);
ok('a super-admin model with records', r.status === 201 && (await db.collection(plat.collectionName).countDocuments()) === 2, r.status);
const platformBefore = await platformSnapshot();

/* --------------------------------------------- a project, the old way */
r = await call('POST', '/tenant/api/projects', { name: 'Old layout' }, s.pat);
const pid = r.body?._id;
const client = { name: 'Client', title: 'Clients', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }, { key: 'email', label: 'Email', kind: 'email', unique: true }] };
const invoice = { name: 'Invoice', title: 'Invoices', displayField: 'title', code: { enabled: true, prefix: 'INV', padding: 4 }, fields: [
	{ key: 'title', label: 'Title', kind: 'text', required: true },
	{ key: 'amount', label: 'Amount', kind: 'number' },
	{ key: 'client', label: 'Client', kind: 'reference', ref: 'Client' },
] };
const clientDef = (await call('POST', P(pid, '/builder/models'), client, s.pat)).body?.doc;
const invoiceDef = (await call('POST', P(pid, '/builder/models'), invoice, s.pat)).body?.doc;
const acme = idOf(await call('POST', P(pid, '/clients'), { name: 'Acme', email: 'acme@example.com' }, s.pat));
const zen = idOf(await call('POST', P(pid, '/clients'), { name: 'Zen' }, s.pat));
for (const [title, amount, c] of [['First', 10, acme], ['Second', 20, zen], ['Third', 30, acme]]) await call('POST', P(pid, '/invoices'), { title, amount, client: c }, s.pat);
await call('PUT', P(pid, `/clients/${zen}`), { name: 'Zen Ltd' }, s.pat);

// Before WO-43 each model had its own collection, records without `_model`, Mongoose's own indexes.
for (const def of [clientDef, invoiceDef]) {
	const old = `t_${pid}_${def.route}`;
	const docs = (await db.collection(`t_${pid}`).find({ _model: def.name }).toArray()).map(({ _model, ...d }) => d);
	await db.collection(old).insertMany(docs);
	await db.collection(`t_${pid}`).deleteMany({ _model: def.name });
	await db.collection('modeldefinitions').updateOne({ _id: new ObjectId(def._id) }, { $set: { collectionName: old, updatedAt: new Date() }, $inc: { version: 1 } });
}
await db.collection(`t_${pid}_clients`).createIndex({ email: 1 }, { unique: true, sparse: true });
await db.collection(`t_${pid}_invoices`).createIndex({ code: 1 }, { unique: true, sparse: true });
await db.collection(`t_${pid}`).drop();
await settle();
ok('the old layout: one collection per model', String(await dataCollections(pid)) === `t_${pid}_clients,t_${pid}_invoices`, String(await dataCollections(pid)));
let invoices = await listOf(pid, '/invoices');
ok('…and it still works before the migration (lists, links)', (await listOf(pid, '/clients')).length === 2 && invoices.length === 3 && invoices.some(i => i.client?.name === 'Acme' || String(i.client) === acme));
r = await call('POST', P(pid, '/invoices'), { title: 'Fourth', amount: 40, client: zen }, s.pat);
ok('…a record added there goes to the old collection', r.status === 201 && (await db.collection(`t_${pid}_invoices`).countDocuments()) === 4, r.status);
const note = (await call('POST', P(pid, '/builder/models'), { name: 'Note', title: 'Notes', fields: [{ key: 'text', label: 'Text', kind: 'text' }] }, s.pat)).body?.doc;
await call('POST', P(pid, '/notes'), { text: 'new layout' }, s.pat);
ok('…a model added to it gets the project collection', note?.collectionName === `t_${pid}` && (await listOf(pid, '/notes')).length === 1, note?.collectionName);
const tenantBefore = { Client: await docsOf(`t_${pid}_clients`), Invoice: await docsOf(`t_${pid}_invoices`) };

/* --------------------------------------------------------------- dry run */
let m = migrate('--project', pid);
ok('dry run: lists what would move', m.code === 0 && /Client .*2 record\(s\)/.test(m.out) && /Invoice .*4 record\(s\)/.test(m.out) && /2 model\(s\) would move/.test(m.out), m.out);
ok('…lists no super-admin model', !m.out.includes(plat.name) && /Super-admin models: \d+ — not touched/.test(m.out));
ok('…and changes nothing', String(await dataCollections(pid)) === `t_${pid},t_${pid}_clients,t_${pid}_invoices` && (await db.collection('modeldefinitions').findOne({ _id: new ObjectId(clientDef._id) })).collectionName === `t_${pid}_clients`);

/* ----------------------------------------------------------------- apply */
m = migrate('--apply', '--project', pid);
ok('--apply: both moved', m.code === 0 && /Client .*moved 2 record/.test(m.out) && /Invoice .*moved 4 record/.test(m.out), m.out);
const defsNow = await db.collection('modeldefinitions').find({ project: new ObjectId(pid) }).toArray();
ok('…every model points at the project collection', defsNow.length === 3 && defsNow.every(d => d.collectionName === `t_${pid}`), defsNow.map(d => d.collectionName).join());
ok('…records identical, ids kept, marked with their model', JSON.stringify(await docsOf(`t_${pid}`, { _model: 'Client' })) === JSON.stringify(tenantBefore.Client) && JSON.stringify(await docsOf(`t_${pid}`, { _model: 'Invoice' })) === JSON.stringify(tenantBefore.Invoice));
ok('…the old collections kept until --drop-old', (await db.collection(`t_${pid}_clients`).countDocuments()) === 2);
const ix = (await db.collection(`t_${pid}`).indexes()).map(i => i.name);
ok('…the project’s indexes built', ['p_model_createdAt', 'p_model_code', 'm_Client_email'].every(n => ix.includes(n)), ix.join(', '));
await settle();
invoices = await listOf(pid, '/invoices?sort=createdAt');
ok('after: the same records through the panel', (await listOf(pid, '/clients')).length === 2 && invoices.length === 4 && invoices.map(i => i.code).join() === 'INV-0001,INV-0002,INV-0003,INV-0004', invoices.map(i => i.code).join());
r = await call('GET', P(pid, `/invoices/${invoices[0]._id}`), null, s.pat);
ok('…links still resolve', (r.body?.client?.name || r.body?.doc?.client?.name) === 'Acme', JSON.stringify(r.body?.client || r.body?.doc?.client));
r = await call('POST', P(pid, '/invoices'), { title: 'Fifth', client: acme }, s.pat);
ok('…numbering carries on', (await listOf(pid, '/invoices?sort=-createdAt'))[0]?.code === 'INV-0005', r.status);
r = await call('POST', P(pid, '/clients'), { name: 'Copy', email: 'acme@example.com' }, s.pat);
ok('…unique fields still refused', r.status >= 400 && r.status < 500, r.status);
r = await call('GET', P(pid, `/history/g/document/${zen}`), null, s.pat);
ok('…history still resolves', r.status === 200 && JSON.stringify(r.body).includes('Zen'), r.status);
ok('…the new-layout model untouched', (await listOf(pid, '/notes')).length === 1);

/* ---------------------------------------------------------------- re-run */
m = migrate('--apply', '--project', pid);
ok('a re-run moves nothing', m.code === 0 && /3 model\(s\), 0 to move/.test(m.out) && /0 model\(s\) moved/.test(m.out), m.out);

/* -------------------------------------------------------------- drop old */
m = migrate('--drop-old', '--project', pid);
ok('--drop-old: both old collections dropped', m.code === 0 && /2 old collection\(s\) dropped/.test(m.out), m.out);
ok('…one data collection left', String(await dataCollections(pid)) === `t_${pid}`, String(await dataCollections(pid)));
ok('…and the panel unchanged', (await listOf(pid, '/invoices')).length === 5 && (await listOf(pid, '/clients')).length === 2);

/* ------------------------------------------------ the super admin, unchanged */
const platformAfter = await platformSnapshot();
const same = JSON.stringify(platformAfter) === JSON.stringify(platformBefore);
ok('super-admin models: definitions, collections, records and indexes exactly as before', same && Object.keys(platformAfter).length >= 1, same ? Object.keys(platformAfter).join() : 'changed');
ok('…no `_model` on any of their records', (await Promise.all(Object.keys(platformAfter).map(n => db.collection(n).countDocuments({ _model: { $exists: true } })))).every(n => n === 0));

/* --------------------------------------------------- it refuses the unknown */
r = await call('POST', '/tenant/api/projects', { name: 'Odd' }, s.pat);
const odd = r.body?._id;
const oddDef = (await call('POST', P(odd, '/builder/models'), client, s.pat)).body?.doc;
await db.collection('modeldefinitions').updateOne({ _id: new ObjectId(oddDef._id) }, { $set: { collectionName: 'clients' } });
m = migrate('--apply', '--project', odd);
ok('a project model on any other collection: stopped, nothing done', m.code === 1 && /stopped/.test(m.out) && (await db.collection('modeldefinitions').findOne({ _id: new ObjectId(oddDef._id) })).collectionName === 'clients', m.out);
await db.collection('modeldefinitions').updateOne({ _id: new ObjectId(oddDef._id) }, { $set: { collectionName: `t_${odd}` } });

/* ---------------------------------------------------------------- cleanup */
await call('DELETE', `/tenant/api/projects/${pid}?force=1`, null, s.pat);
await call('DELETE', `/tenant/api/projects/${odd}?force=1`, null, s.pat);
r = await call('DELETE', `/admin/api/builder/models/${plat._id}?dropData=true`, null, admin);
ok('cleanup', r.status === 200 && (await dataCollections(pid)).length === 0, r.status);
await mc.close();
done();
