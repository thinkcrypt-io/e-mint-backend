// One collection per project (WO-43, D21): a project's models share t_<projectId>, each record marked
// `_model`; every list, count, unique field, bulk action, formula, access change and delete stays
// within its model. Super-admin models keep one collection each, exactly as before.
// Uses projects.mjs's state (pat); reads the scratch DB directly (SMOKE_MONGO).
import { call, ok, done, load } from './lib.mjs';

const s = load();
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
const uri = process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
const mc = await new MongoClient(uri).connect();
const db = mc.db();
const idOf = r => r.body?._id || r.body?.doc?._id;
const listOf = async (pid, path) => (await call('GET', P(pid, path), null, s.pat)).body?.doc || [];
const indexNames = async name => (await db.collection(name).indexes()).map(i => i.name).sort();

let r = await call('POST', '/tenant/api/projects', { name: 'Shared collection' }, s.pat);
const pid = r.body?._id;
ok('a project', r.status === 200 && !!pid, r.status);
const C = `t_${pid}`;
const dataCollections = async id => (await db.listCollections({ name: { $regex: `^t_${id}(_|$)` } }, { nameOnly: true }).toArray()).map(c => c.name);

/* -------------------------------------------------------------- models */
const email = { key: 'email', label: 'Email', kind: 'email', unique: true };
r = await call('POST', P(pid, '/builder/models'), { name: 'Lead', title: 'Leads', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	email,
	{ key: 'score', label: 'Score', kind: 'number', index: true },
] }, s.pat);
const leadDef = r.body?.doc;
ok('Lead: in the project collection', r.status === 201 && leadDef?.collectionName === C, `${r.status} ${leadDef?.collectionName} ${r.body?.message || ''}`);
r = await call('POST', P(pid, '/builder/models'), { name: 'Contact', title: 'Contacts', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	email,
	{ key: 'score', label: 'Score', kind: 'number' },
	{ key: 'lead', label: 'Lead', kind: 'reference', ref: 'Lead' },
] }, s.pat);
const contactDef = r.body?.doc;
ok('Contact: the same collection, the same field keys', r.status === 201 && contactDef?.collectionName === C, `${r.status} ${r.body?.message || ''}`);
r = await call('POST', P(pid, '/builder/models'), { name: 'Deal', title: 'Deals', displayField: 'title', fields: [
	{ key: 'title', label: 'Title', kind: 'text', required: true },
	{ key: 'lead', label: 'Lead', kind: 'reference', ref: 'Lead' },
	{ key: 'leads', label: 'Leads', kind: 'references', ref: 'Lead' },
] }, s.pat);
const dealDef = r.body?.doc;
ok('Deal: also links to Lead', r.status === 201, r.status);
ok('the project has exactly one data collection', String(await dataCollections(pid)) === C, String(await dataCollections(pid)));
let ix = await indexNames(C);
ok(
	'indexes: shared ones, and each model’s own by name',
	['p_model_createdAt', 'p_model_code', 'p_model_customer', 'p_model_addedBy', 'p_model_access', 'm_Lead_email', 'm_Lead_score', 'm_Contact_email'].every(n => ix.includes(n)) &&
		!ix.includes('email_1') && !ix.includes('m_Contact_score'),
	ix.join(', ')
);
const leadEmail = (await db.collection(C).indexes()).find(i => i.name === 'm_Lead_email');
ok('a unique field: unique within its model, records without it not counted', leadEmail?.unique && JSON.stringify(leadEmail.partialFilterExpression) === JSON.stringify({ _model: 'Lead', email: { $exists: true } }), JSON.stringify(leadEmail));

/* ------------------------------------------------------------- records */
r = await call('POST', P(pid, '/leads'), { name: 'Ann', email: 'same@example.com', score: 5 }, s.pat);
const ann = idOf(r);
ok('a lead', r.status === 201, r.status);
r = await call('POST', P(pid, '/contacts'), { name: 'Ann', email: 'same@example.com', score: 7, lead: ann }, s.pat);
const annContact = idOf(r);
ok('the same email in another model is allowed', r.status === 201, `${r.status} ${r.body?.message || ''}`);
r = await call('POST', P(pid, '/leads'), { name: 'Ann again', email: 'same@example.com' }, s.pat);
ok('…twice in one model is refused', r.status >= 400 && r.status < 500, `${r.status} ${r.body?.message || ''}`);
// Past the panel's own check, the index itself refuses it.
let dup = null;
try { await db.collection(C).insertOne({ _model: 'Lead', name: 'Raw', email: 'same@example.com' }); } catch (e) { dup = e.code; }
ok('…and by the index itself', dup === 11000, dup);
r = await call('POST', P(pid, '/leads'), { name: 'Bob', email: 'bob@example.com', score: 2 }, s.pat);
const bob = idOf(r);
await call('POST', P(pid, '/deals'), { title: 'Big deal', lead: bob, leads: [bob] }, s.pat);

let leads = await listOf(pid, '/leads');
let contacts = await listOf(pid, '/contacts');
ok('lists: each model its own records', leads.length === 2 && contacts.length === 1 && leads.every(d => d._model === 'Lead'), `${leads.length} ${contacts.length}`);
r = await call('GET', P(pid, '/leads'), null, s.pat);
ok('…and its own total', r.body?.totalDocs === 2, r.body?.totalDocs);
r = await call('GET', P(pid, `/leads/${annContact}`), null, s.pat);
ok("a contact's id isn't a lead", r.status === 404, r.status);
r = await call('GET', P(pid, `/contacts/${annContact}`), null, s.pat);
ok('…it is a contact, its lead linked', r.status === 200 && (r.body?.lead?.name || r.body?.doc?.lead?.name) === 'Ann', JSON.stringify(r.body?.lead || r.body?.doc?.lead));
ok('filters', (await listOf(pid, '/leads?score_gt=3')).length === 1 && (await listOf(pid, '/contacts?email=same@example.com')).length === 1 && (await listOf(pid, '/leads?email=same@example.com')).length === 1);
ok('a filter on `_model` reaches no other model', (await listOf(pid, '/leads?_model=Contact')).every(d => d._model === 'Lead'));
ok('search', (await listOf(pid, '/leads?search=Ann')).length === 1 && (await listOf(pid, '/contacts?search=Bob')).length === 0);
ok('sort', (await listOf(pid, '/leads?sort=-score')).map(d => d.name).join() === 'Ann,Bob');
ok('fields', (await listOf(pid, '/leads?fields=name')).every(d => !('email' in d)));
r = await call('GET', P(pid, '/leads/get/stats?range=all'), null, s.pat);
ok('dashboard stats count one model', r.body?.value === 2, JSON.stringify(r.body));
r = await call('GET', P(pid, '/contacts/get/stats?range=all&group=field&by=name'), null, s.pat);
ok('…breakdowns too', JSON.stringify(r.body).includes('Ann') && !JSON.stringify(r.body).includes('Bob'), JSON.stringify(r.body).slice(0, 160));
r = await call('GET', P(pid, '/builder/models'), null, s.pat);
const counts = Object.fromEntries((r.body?.doc || r.body || []).map(d => [d.name, d.records]));
ok('the builder counts each model’s records', counts.Lead === 2 && counts.Contact === 1 && counts.Deal === 1, JSON.stringify(counts));
r = await call('GET', P(pid, '/leads/get/filters'), null, s.pat);
ok('`_model` is not offered as a filter', !JSON.stringify(r.body || '').includes('_model'), r.status);

// Changing which model a record belongs to isn't possible from the panel.
r = await call('PUT', P(pid, `/leads/${bob}`), { name: 'Bob', _model: 'Contact' }, s.pat);
ok('an update naming another model leaves the record a lead', (await db.collection(C).findOne({ _id: new ObjectId(bob) }))?._model === 'Lead', r.status);
r = await call('POST', P(pid, '/leads'), { name: 'Sneaky', email: 'sneaky@example.com', _model: 'Contact' }, s.pat);
ok('…and a create naming one makes no contact', (await listOf(pid, '/contacts')).length === 1 && !(await db.collection(C).findOne({ name: 'Sneaky', _model: 'Contact' })), r.status);
await db.collection(C).deleteMany({ name: 'Sneaky' });

/* -------------------------------------------------------- bulk actions */
r = await call('POST', P(pid, '/leads/bulk/duplicate'), { ids: [bob] }, s.pat);
ok('duplicate: a lead copied, nothing else', r.status === 200 && (await listOf(pid, '/leads')).length === 3 && (await listOf(pid, '/contacts')).length === 1, `${r.status} ${r.body?.message || ''}`);
const copy = (await listOf(pid, '/leads')).find(d => d._id !== bob && d.name.startsWith('Bob'))?._id;
r = await call('POST', P(pid, '/leads/bulk/delete'), { ids: [copy] }, s.pat);
const batch = r.body?.batch;
ok('delete: one lead', r.status === 200 && r.body?.deleted === 1 && (await listOf(pid, '/leads')).length === 2 && (await listOf(pid, '/contacts')).length === 1, r.status);
r = await call('POST', P(pid, '/leads/bulk/restore'), { batch }, s.pat);
ok('undo: back as a lead', r.status === 200 && r.body?.restored === 1 && (await db.collection(C).findOne({ _id: new ObjectId(copy) }))?._model === 'Lead' && (await listOf(pid, '/leads')).length === 3, `${r.status} ${r.body?.message || ''}`);
// A delete snapshot from before WO-43 has no `_model`: it still goes back as the model's.
r = await call('POST', P(pid, '/leads/bulk/delete'), { ids: [copy] }, s.pat);
await db.collection('deletedrecords').updateMany({ batch: r.body?.batch }, { $unset: { 'doc._model': 1 } });
r = await call('POST', P(pid, '/leads/bulk/restore'), { batch: r.body?.batch }, s.pat);
ok('undo of an older snapshot: marked as a lead', r.status === 200 && (await db.collection(C).findOne({ _id: new ObjectId(copy) }))?._model === 'Lead', r.status);

// Merge: two models link to Lead with the same field key; each counts and moves its own links.
await call('PUT', P(pid, `/contacts/${annContact}`), { lead: copy }, s.pat);
await call('POST', P(pid, '/deals'), { title: 'Second deal', lead: copy, leads: [copy, ann] }, s.pat);
r = await call('POST', P(pid, '/leads/bulk/merge/preview'), { keep: bob, merge: [copy] }, s.pat);
const links = Object.fromEntries((r.body?.links || []).map(l => [`${l.model.split('_').pop()}.${l.path}`, l.count]));
ok('merge preview: links per model, not doubled', r.status === 200 && links['Contact.lead'] === 1 && links['Deal.lead'] === 1 && links['Deal.leads'] === 1 && r.body?.total === 3, JSON.stringify(links));
r = await call('POST', P(pid, '/leads/bulk/merge'), { keep: bob, merge: [copy] }, s.pat);
const deal2 = await db.collection(C).findOne({ _model: 'Deal', title: 'Second deal' });
ok('merge: links moved in each model', r.status === 200 && r.body?.linksMoved === 3 && String(deal2?.lead) === bob && (await db.collection(C).findOne({ _id: new ObjectId(annContact) }))?.lead?.toString() === bob, `${r.status} ${r.body?.linksMoved} ${r.body?.message || ''}`);
ok('…the merged lead gone, the others kept', (await listOf(pid, '/leads')).length === 2 && (await listOf(pid, '/contacts')).length === 1 && (await listOf(pid, '/deals')).length === 2);

r = await call('POST', P(pid, '/leads/bulk/import'), { format: 'json', content: JSON.stringify([{ name: 'Imported', email: 'imp@example.com' }]), dryRun: false }, s.pat);
ok('import: into Lead only', r.status === 201 && (await listOf(pid, '/leads')).length === 3 && (await listOf(pid, '/contacts')).length === 1, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message || '')}`);

/* ----------------------------------------------- formulas, access, indexes */
const fieldsOf = def => def.fields.map(({ _id, ...f }) => f);
r = await call('PUT', P(pid, `/builder/models/${leadDef._id}`), { ...leadDef, fields: [...fieldsOf(leadDef), { key: 'double', label: 'Double', kind: 'formula', formula: 'score * 2' }] }, s.pat);
ok('a formula: recalculated on the model’s records only', r.status === 200 && r.body?.recalculated === 3 && (await db.collection(C).countDocuments({ double: { $exists: true } })) === 3 && (await db.collection(C).countDocuments({ _model: { $ne: 'Lead' }, double: { $exists: true } })) === 0, `${r.status} ${r.body?.recalculated} ${r.body?.message || ''} ${JSON.stringify(r.body?.problems || '')}`);
const leadDef2 = r.body?.doc || leadDef;
r = await call('PUT', P(pid, `/builder/models/${contactDef._id}`), { ...contactDef, fields: fieldsOf(contactDef), access: { enabled: true, default: 'private' } }, s.pat);
ok('access on: only the model’s records made public', r.status === 200 && r.body?.madePublic === 1 && (await db.collection(C).countDocuments({ privacy: { $exists: true } })) === 1, `${r.status} ${r.body?.madePublic} ${r.body?.message || ''}`);
r = await call('PUT', P(pid, `/builder/models/${leadDef._id}`), { ...leadDef2, fields: [...fieldsOf(leadDef2), { key: 'phone', label: 'Phone', kind: 'text', unique: true }] }, s.pat);
ix = await indexNames(C);
ok('a unique field added: its index only', r.status === 200 && ix.includes('m_Lead_phone') && ix.includes('m_Contact_email'), ix.join(', '));
const leadDef3 = r.body?.doc || leadDef2;
r = await call('PUT', P(pid, `/builder/models/${leadDef._id}`), { ...leadDef3, fields: fieldsOf(leadDef3).map(f => (f.key === 'phone' ? { ...f, unique: false } : f)) }, s.pat);
ix = await indexNames(C);
ok('…and removed again: that index dropped, the rest kept', r.status === 200 && !ix.includes('m_Lead_phone') && ix.includes('m_Lead_email') && ix.includes('m_Contact_email') && ix.includes('p_model_createdAt'), ix.join(', '));
// A new unique field over values already shared: a warning, nothing else dropped.
await call('POST', P(pid, '/contacts'), { name: 'Ann', email: 'other@example.com' }, s.pat);
r = await call('PUT', P(pid, `/builder/models/${contactDef._id}`), { ...contactDef, access: { enabled: true, default: 'private' }, fields: fieldsOf(contactDef).map(f => (f.key === 'name' ? { ...f, unique: true } : f)) }, s.pat);
ix = await indexNames(C);
ok('a unique field over duplicates: warned, other indexes untouched', r.status === 200 && /unique field/i.test(String(r.body?.warnings)) && !ix.includes('m_Contact_name') && ix.includes('m_Contact_email'), `${r.status} ${JSON.stringify(r.body?.warnings)}`);

/* -------------------------------------------------------------- deletes */
r = await call('POST', P(pid, '/builder/models'), { name: 'Temp', title: 'Temps', fields: [{ key: 'name', label: 'Name', kind: 'text', unique: true }] }, s.pat);
const temp = r.body?.doc;
await call('POST', P(pid, '/temps'), { name: 'x' }, s.pat);
await call('POST', P(pid, '/temps'), { name: 'y' }, s.pat);
ok('Temp: two records, its index', (await db.collection(C).countDocuments({ _model: 'Temp' })) === 2 && (await indexNames(C)).includes('m_Temp_name'));
const before = { leads: (await listOf(pid, '/leads')).length, contacts: await db.collection(C).countDocuments({ _model: 'Contact' }) };
r = await call('DELETE', P(pid, `/builder/models/${temp._id}?dropData=true`), null, s.pat);
ix = await indexNames(C);
ok('a model deleted with its data: its records and index gone', r.status === 200 && (await db.collection(C).countDocuments({ _model: 'Temp' })) === 0 && !ix.includes('m_Temp_name'), r.status);
ok('…the other models’ records and indexes kept, the collection too', (await listOf(pid, '/leads')).length === before.leads && (await db.collection(C).countDocuments({ _model: 'Contact' })) === before.contacts && ix.includes('m_Lead_email') && ix.includes('p_model_createdAt') && String(await dataCollections(pid)) === C);
r = await call('POST', P(pid, '/builder/models'), { name: 'Keep', title: 'Keeps', fields: [{ key: 'name', label: 'Name', kind: 'text' }] }, s.pat);
await call('POST', P(pid, '/keeps'), { name: 'kept' }, s.pat);
r = await call('DELETE', P(pid, `/builder/models/${r.body?.doc?._id}`), null, s.pat);
ok('a model deleted without its data: records kept', r.status === 200 && (await db.collection(C).countDocuments({ _model: 'Keep' })) === 1);
r = await call('POST', P(pid, '/builder/models'), { name: 'Keep', title: 'Keeps', fields: [{ key: 'name', label: 'Name', kind: 'text' }] }, s.pat);
ok('…so its name stays taken', r.status === 201 && r.body?.doc?.name === 'Keep2' && (await listOf(pid, '/keeps')).length === 0, `${r.status} ${r.body?.doc?.name} ${r.body?.doc?.route}`);

/* ----------------------------------------------------------- public API */
await call('PUT', P(pid, `/builder/models/${leadDef._id}/public-api`), { enabled: true, actions: ['list', 'get', 'create'], auth: 'none', readOnlyFields: ['score'] }, s.pat);
const slug = (await call('GET', `/tenant/api/projects/${pid}`, null, s.pat)).body?.publicSlug;
r = await call('POST', `/public/api/${slug}/leads`, { name: 'Web lead', email: 'web@example.com', score: 99 }, null);
const web = await db.collection(C).findOne({ name: 'Web lead' });
ok('public create: a lead, read-only field ignored', r.status === 201 && web?._model === 'Lead' && web.score === undefined, `${r.status} ${r.body?.message || ''}`);
r = await call('GET', `/public/api/${slug}/leads?limit=50`, null, null);
ok('public list: leads only, no `_model`', r.status === 200 && r.body?.doc?.length === 4 && r.body.doc.every(d => !('_model' in d)), `${r.status} ${r.body?.doc?.length}`);
r = await call('GET', `/public/api/${slug}/leads/${annContact}`, null, null);
ok("public get: a contact's id isn't a lead", r.status === 404, r.status);
r = await call('GET', `/public/api/${slug}/`, null, null);
ok('public reference: no `_model` field', r.status === 200 && !JSON.stringify(r.body).includes('_model'), r.status);

/* -------------------------------------------------- the super admin's own */
const admin = (await call('POST', '/admin/api/auth/login', { email: 'admin@example.com', password: 'tenancy-dev-pass-1' })).body.token;
const tag = Date.now().toString(36);
r = await call('POST', '/admin/api/builder/models', { name: `Smokeplat${tag}`, title: 'Smoke platform', displayField: 'name', code: { enabled: true, prefix: 'SP' }, fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'email', label: 'Email', kind: 'email', unique: true },
	{ key: 'qty', label: 'Qty', kind: 'number' },
] }, admin);
const plat = r.body?.doc;
ok('super admin: a new model gets its own collection', r.status === 201 && plat?.collectionName === plat?.route && !plat.collectionName.startsWith('t_'), `${r.status} ${plat?.collectionName} ${r.body?.message || ''}`);
const PA = path => `/admin/api/${plat.route}${path}`;
await call('POST', PA(''), { name: 'One', email: 'one@example.com', qty: 2 }, admin);
r = await call('POST', PA(''), { name: 'Two', email: 'one@example.com' }, admin);
ok('…its unique field as before', r.status >= 400 && r.status < 500, r.status);
const pix = (await db.collection(plat.collectionName).indexes()).map(i => i.name);
ok('…its indexes made by Mongoose as before (email_1, code_1)', pix.includes('email_1') && pix.includes('code_1') && !pix.some(n => /^(m|p)_/.test(n)), pix.join(', '));
ok('…no `_model` on its records', (await db.collection(plat.collectionName).countDocuments({ _model: { $exists: true } })) === 0 && (await db.collection(plat.collectionName).countDocuments()) === 1);
r = await call('PUT', `/admin/api/builder/models/${plat._id}`, { ...plat, fields: [...fieldsOf(plat), { key: 'twice', label: 'Twice', kind: 'formula', formula: 'qty * 2' }] }, admin);
ok('…formula recalculation as before', r.status === 200 && r.body?.recalculated === 1 && (await db.collection(plat.collectionName).findOne({}))?.twice === 4, `${r.status} ${r.body?.recalculated} ${r.body?.message || ''}`);
r = await call('POST', '/admin/api/builder/models', { name: `Smokeplatb${tag}`, route: plat.route + 'b', title: 'Smoke platform B', fields: [{ key: 'name', label: 'Name', kind: 'text' }] }, admin);
const platB = r.body?.doc;
ok('…two super-admin models never share a collection', r.status === 201 && platB?.collectionName !== plat.collectionName, platB?.collectionName);
let clash = null;
try { await db.collection('modeldefinitions').updateOne({ _id: new ObjectId(platB._id) }, { $set: { collectionName: plat.collectionName } }); } catch (e) { clash = e.code; }
ok('…the database refuses it too', clash === 11000, clash);
r = await call('DELETE', `/admin/api/builder/models/${plat._id}?dropData=true`, null, admin);
await call('DELETE', `/admin/api/builder/models/${platB._id}?dropData=true`, null, admin);
ok('…deleted with its data: its collection dropped', r.status === 200 && !(await db.listCollections({ name: plat.collectionName }).toArray()).length, r.status);

/* ------------------------------------------------------- project delete */
r = await call('DELETE', `/tenant/api/projects/${pid}?force=1`, null, s.pat);
ok('deleting the project drops its collection', r.status === 200 && (await dataCollections(pid)).length === 0, `${r.status} ${await dataCollections(pid)}`);

await mc.close();
done();
