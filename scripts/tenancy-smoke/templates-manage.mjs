// Template Studio (docs/templates) T-05: publish with notes and the explanation gate,
// draft vs published, versions and restore, duplicate, export/import, settings
// (key, visibility, archive), delete vs archive, save a project as a template.
import { call, ok, done } from './lib.mjs';

const A = '/admin/api';
const PASS = 'tenancy-dev-pass-1';
const { MongoClient } = await import('../../node_modules/mongodb/lib/index.js');
const uri = process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
const mc = await new MongoClient(uri).connect();
const db = mc.db();
const KEYS = /^smoke-manage/;
await db.collection('projecttemplates').deleteMany({ key: KEYS });

let r = await call('POST', `${A}/auth/login`, { email: 'admin@example.com', password: PASS });
const T = r.body.token;
const t = (path, method = 'GET', body) => call(method, `${A}/templates${path}`, body, T);

const blueprint = {
	overview: { name: 'Smoke manage', summary: 'A test.', description: 'Things.', audience: 'Testers.', category: 'Test' },
	models: { steps: [{ action: 'create', name: 'Widget', title: 'Widgets', description: 'Widgets.', rationale: 'x', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true, helper: 'x' }] }] },
	guide: { steps: [{ title: 'Add a widget', body: 'x', page: 'Widget' }] },
	sampleData: { Widget: [{ name: 'First' }] },
};
r = await t('', 'POST', { type: 'app', key: 'smoke-manage', blueprint });
const id = r.body.doc._id;
ok('draft ready to publish', r.body.doc.validation.canPublish, JSON.stringify([...r.body.doc.validation.errors, ...r.body.doc.validation.explain].map(i => i.message)));

/* --------------------------------------------------------------- publish */
r = await t(`/${id}/publish`, 'POST', {});
ok('publish needs notes', r.status === 400 && /changed/.test(r.body?.message), r.body?.message);
r = await t(`/${id}/publish`, 'POST', { notes: 'First version.' });
ok('published v1', r.status === 200 && r.body.doc.version === 1 && r.body.doc.status === 'published' && !r.body.doc.changed && r.body.doc.versions.length === 1, r.status);
r = await t(`/${id}/publish`, 'POST', { notes: 'Again.' });
ok('nothing changed → refused', r.status === 400 && /Nothing changed/.test(r.body?.message), r.body?.message);

await t(`/${id}/draft`, 'PUT', { part: 'overview', value: { ...blueprint.overview, name: 'Smoke manage two' } });
r = await t(`/${id}/versions/1`);
ok('editing the draft leaves v1 alone', r.body?.doc?.blueprint?.overview?.name === 'Smoke manage' && r.body.doc.whatsInside.counts.models === 1);
r = await t(`/${id}`);
ok('draft marked changed, still published v1', r.body.doc.changed && r.body.doc.version === 1 && r.body.doc.name === 'Smoke manage two');
r = await t(`/${id}/publish`, 'POST', { notes: 'Renamed.' });
ok('published v2', r.body?.doc?.version === 2 && r.body.doc.versions.map(v => v.notes).join('|') === 'First version.|Renamed.');

await t(`/${id}/draft`, 'PUT', { part: 'guide', value: { steps: [] } });
r = await t(`/${id}/publish`, 'POST', { notes: 'No guide.' });
ok('missing explanation blocks publishing, with the fix', r.status === 400 && /Explain/.test(r.body?.message) && r.body.problems.some(p => /setup guide/.test(p)), JSON.stringify(r.body));

r = await t(`/${id}/versions/1/restore`, 'POST');
ok('restore v1 into the draft', r.status === 200 && r.body.doc.draft.overview.name === 'Smoke manage' && r.body.doc.draft.guide.steps.length === 1 && r.body.doc.version === 2 && r.body.doc.changed);
r = await t(`/${id}/versions/9`);
ok('unknown version → 404', r.status === 404);

/* --------------------------------------------- duplicate, export, import */
r = await t(`/${id}/duplicate`, 'POST', { name: 'Smoke manage fashion' });
const dupId = r.body?.doc?._id;
ok('duplicate → a new draft', r.status === 201 && r.body.doc.key === 'smoke-manage-fashion' && r.body.doc.version === 0 && r.body.doc.whatsInside.counts.models === 1, `${r.status} ${r.body?.doc?.key}`);
r = await t(`/${id}/export`);
const file = r.body;
ok('export: format, key, blueprint', r.status === 200 && file.format === 'emint-template@1' && file.key === 'smoke-manage' && file.blueprint?.models?.steps?.length === 1);
r = await t('/import', 'POST', { ...file, format: 'nope' });
ok('import checks the format', r.status === 400, r.status);
r = await t('/import', 'POST', file);
ok('import → a new draft, key suffixed', r.status === 201 && r.body.doc.key === 'smoke-manage-2' && r.body.doc.source === 'import', `${r.status} ${r.body?.doc?.key}`);
const importedId = r.body?.doc?._id;

/* -------------------------------------------------------------- settings */
r = await t(`/${id}/settings`, 'PUT', { key: 'smoke-manage-new' });
ok('a published template keeps its key', r.status === 400 && /key/.test(r.body?.message));
r = await t(`/${dupId}/settings`, 'PUT', { key: 'smoke-manage-dress' });
ok('a draft’s key can change', r.status === 200 && r.body.doc.key === 'smoke-manage-dress');
r = await t(`/${id}/settings`, 'PUT', { visibility: 'organizations' });
ok('organizations visibility needs organizations', r.status === 400);
r = await t(`/${id}/settings`, 'PUT', { archived: true });
ok('archive', r.status === 200 && r.body.doc.status === 'archived');
r = await t('?search=smoke-manage');
ok('archived hidden from the gallery', !(r.body.doc || []).some(d => d.key === 'smoke-manage'));
r = await t('?status=archived&search=smoke-manage');
ok('…and listed under Archived', (r.body.doc || []).some(d => d.key === 'smoke-manage'));
r = await t(`/${id}/draft`, 'PUT', { part: 'overview', value: blueprint.overview });
ok('an archived template can’t be edited', r.status === 400 && /archived/.test(r.body?.message));
r = await t(`/${id}/settings`, 'PUT', { archived: false });
ok('restore → published again', r.status === 200 && r.body.doc.status === 'published');

// Starters follow visibility: one limited to another organization leaves the super admin's list.
r = await t('/leads/settings', 'PUT', { visibility: 'organizations', organizations: ['00000000000000000000beef'] });
let s = await call('GET', `${A}/builder/starters`, null, T);
ok('a starter limited to other organizations isn’t offered', r.status === 200 && !s.body.doc.some(x => x.key === 'leads'), JSON.stringify(s.body.doc.map(x => x.key)));
await t('/leads/settings', 'PUT', { visibility: 'everyone' });
s = await call('GET', `${A}/builder/starters`, null, T);
ok('back for everyone', s.body.doc.some(x => x.key === 'leads'));

/* ----------------------------------------------------- delete vs archive */
r = await t(`/${dupId}`, 'DELETE');
ok('a never-published draft is deleted', r.status === 200 && r.body.archived === false && (await t(`/${dupId}`)).status === 404);
r = await t(`/${importedId}`, 'DELETE');
ok('imported draft deleted', r.status === 200);
r = await t(`/${id}`, 'DELETE');
ok('a published template is archived instead', r.status === 200 && r.body.archived === true);
await t(`/${id}/settings`, 'PUT', { archived: false });

/* --------------------------------------------------------------- capture */
r = await t(`/${id}/preview`, 'POST', {});
const pv = r.body?.project?._id;
ok('preview to capture from', r.status === 201, `${r.status} ${r.body?.message}`);
r = await t('/capture', 'POST', { project: pv, name: 'Smoke manage captured', sampleData: true });
const cap = r.body?.doc;
ok('capture a preview: models, sidebar, guide, sample data', r.status === 201 && cap.key === 'smoke-manage-captured' && cap.source === 'capture' && cap.whatsInside.counts.models === 1 && cap.draft.sampleData?.Widget?.[0]?.name === 'First' && cap.draft.guide.steps[0].page === 'Widget', `${r.status} ${r.body?.message} ${JSON.stringify(cap?.draft?.sampleData)}`);
ok('captured template checks clean', cap?.validation?.ok, JSON.stringify(cap?.validation?.errors?.map(i => i.message)));
const tenantProject = await db.collection('tenantprojects').findOne({ preview: { $exists: false } });
if (tenantProject) {
	r = await t('/capture', 'POST', { project: String(tenantProject._id), sampleData: true });
	ok('a tenant’s records are never captured', r.status === 400 && /never/.test(r.body?.message), r.body?.message);
	r = await t('/capture', 'POST', { project: String(tenantProject._id), name: 'Smoke manage tenant' });
	ok('a tenant project’s structure can be', r.status === 201 && Object.keys(r.body.doc.draft.sampleData).length === 0, `${r.status} ${r.body?.message}`);
} else ok('(no tenant project on this DB to capture — skipped)', true);
await t(`/previews/${pv}`, 'DELETE');

await db.collection('projecttemplates').deleteMany({ key: KEYS });
await mc.close();
done();
