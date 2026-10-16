// A required Yes/No (kind `boolean`): unticked is a No (false), a real answer — never "is required".
// Panel saves, edits and the public API all store false; a required text left empty is still refused.
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load(); // from projects.mjs: pat (Initech, crm)
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const t = Date.now().toString(36);

let r = await call('POST', P(s.crm, '/builder/models'), { name: `Check${t}`, title: `Checks ${t}`, fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'approved', label: 'Approved', kind: 'boolean', required: true },
	{ key: 'extras', label: 'Extras', kind: 'section', fields: [{ key: 'gift', label: 'Gift', kind: 'boolean', required: true }] },
] }, s.pat);
ok('a model with a required Yes/No', r.status === 201, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
const def = r.body?.doc;
const route = def?.route;
const make = body => call('POST', P(s.crm, `/${route}`), body, s.pat);

/* ---- the form doesn't mark it required */
r = await call('GET', P(s.crm, `/${route}/get/config`), null, s.pat);
const field = name => (r.body?.form || []).find(f => f?.name === name);
ok('the form: Yes/No not required, Name still required', field('approved') && field('approved').isRequired === false && field('name')?.isRequired === true, `${r.status} ${JSON.stringify(field('approved'))}`);
const gift = (field('extras')?.dataModel || []).find(f => f?.name === 'gift');
ok('…nor a Yes/No inside a group', gift && !gift.isRequired, JSON.stringify(gift));

/* ---- create */
r = await make({ name: 'Left out' });
const id = r.body?.doc?._id;
ok('create with the Yes/No left out → saved as false', r.status === 201 && r.body?.doc?.approved === false, `${r.status} ${JSON.stringify(r.body?.message || r.body?.doc)}`);
r = await make({ name: 'Blank', approved: '' });
ok('create with it blank ("") → false', r.status === 201 && r.body?.doc?.approved === false, `${r.status} ${r.body?.message || ''}`);
r = await make({ name: 'Null', approved: null });
ok('create with it null → false', r.status === 201 && r.body?.doc?.approved === false, `${r.status} ${r.body?.message || ''}`);
r = await make({ name: 'No', approved: false, extras: { gift: false } });
ok('create with false (and a false one inside a group)', r.status === 201 && r.body?.doc?.approved === false && r.body?.doc?.extras?.gift === false, `${r.status} ${r.body?.message || ''}`);
r = await make({ name: 'Group blank', extras: { gift: '' } });
ok('…a blank one inside a group → false', r.status === 201 && r.body?.doc?.extras?.gift === false, `${r.status} ${r.body?.message || JSON.stringify(r.body?.doc?.extras)}`);
r = await make({ name: 'Yes', approved: true });
ok('create with true', r.status === 201 && r.body?.doc?.approved === true, `${r.status} ${r.body?.message || ''}`);

/* ---- a truly empty value on another kind is still refused */
r = await make({ approved: true });
ok('a required text left out is refused', r.status === 400 && /Name/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await make({ name: '', approved: true });
ok('…and sent blank', r.status === 400 && /Name/.test(r.body?.message), `${r.status} ${r.body?.message}`);

/* ---- edit */
r = await call('PUT', P(s.crm, `/${route}/${id}`), { approved: true }, s.pat);
ok('edit: tick it', r.status === 200, `${r.status} ${r.body?.message || ''}`);
r = await call('PUT', P(s.crm, `/${route}/${id}`), { approved: false }, s.pat);
ok('edit: untick it (false)', r.status === 200, `${r.status} ${r.body?.message || ''}`);
r = await call('GET', P(s.crm, `/${route}/${id}`), null, s.pat);
ok('…saved as false', r.body?.approved === false, JSON.stringify(r.body?.approved));
await call('PUT', P(s.crm, `/${route}/${id}`), { approved: true }, s.pat);
r = await call('PUT', P(s.crm, `/${route}/${id}`), { name: 'Edited', approved: '' }, s.pat);
ok('edit: sent blank', r.status === 200, `${r.status} ${r.body?.message || ''}`);
r = await call('GET', P(s.crm, `/${route}/${id}`), null, s.pat);
ok('…saved as false', r.body?.approved === false && r.body?.name === 'Edited', JSON.stringify(r.body?.approved));
r = await call('PUT', P(s.crm, `/${route}/${id}`), { name: '' }, s.pat);
ok('edit: blanking the required text is still refused', r.status === 400, `${r.status} ${r.body?.message || ''}`);

/* ---- the public API */
r = await call('GET', `/tenant/api/projects/${s.crm}`, null, s.pat);
const slug = r.body?.publicSlug;
r = await call('PUT', P(s.crm, `/builder/models/${def?._id}/public-api`), { enabled: true, actions: ['create', 'get'], auth: 'none' }, s.pat);
ok('public API on (create, get)', r.status === 200, `${r.status} ${r.body?.message || ''}`);
const pub = (body) => fetch(`${ROOT}/public/api/${slug}/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
r = await pub({ name: 'From the site' });
ok('public create with the Yes/No left out → false', r.status === 201 && (r.body?.doc ?? r.body)?.approved === false, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
r = await pub({ name: 'From the site', approved: '' });
ok('public create with it blank → false', r.status === 201 && (r.body?.doc ?? r.body)?.approved === false, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
r = await pub({ approved: true });
ok('public create without the required text refused', r.status === 400, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

await call('DELETE', P(s.crm, `/builder/models/${def?._id}?dropData=true`), null, s.pat);
done();
