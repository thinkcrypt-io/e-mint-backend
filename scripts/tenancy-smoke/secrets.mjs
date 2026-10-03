// Password fields (kind `password`): encrypted, never in a response, revealed only with the person's own password.
import fs from 'node:fs';
import mongoose from 'mongoose';
import { call, ok, done, load } from './lib.mjs';
const s = load(); // from projects.mjs: pat (Initech, crm)
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
// pat's sign-in password, as projects.mjs set it.
const PASS = fs.readFileSync(new URL('./projects.mjs', import.meta.url), 'utf8').match(/const PASS = '([^']+)'/)[1];
const t = Date.now().toString(36);

let r = await call('POST', P(s.crm, '/builder/models'), { name: `Vault${t}`, title: `Vaults ${t}`, fields: [{ key: 'site', label: 'Site', kind: 'text' }, { key: 'password', label: 'Password', kind: 'text' }] }, s.pat);
ok('a secret-named key needs the Password kind', r.status === 400 && /Password kind/.test(JSON.stringify(r.body)), `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);

r = await call('POST', P(s.crm, '/builder/models'), { name: `Vault${t}`, title: `Vaults ${t}`, fields: [{ key: 'site', label: 'Site', kind: 'text' }, { key: 'password', label: 'Password', kind: 'password', unique: true, default: 'x' }] }, s.pat);
ok('create a model with a Password field', r.status === 201, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
const def = r.body?.doc;
const route = def?.route;
ok('…not unique, no default', def?.fields?.[1]?.kind === 'password' && !def.fields[1].unique && def.fields[1].default === undefined, JSON.stringify(def?.fields?.[1]));

r = await call('POST', P(s.crm, `/${route}`), { site: 'portal', password: 'hunter2-secret' }, s.pat);
const id = r.body?.doc?._id;
ok('create a record — the password is not in the response', r.status === 201 && !!id && !('password' in (r.body?.doc || {})), `${r.status} ${JSON.stringify(r.body)}`);

await mongoose.connect(process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev');
const raw = async () => (await mongoose.connection.db.collection(`t_${s.crm}_${route}`).findOne({ _id: new mongoose.Types.ObjectId(id) }))?.password;
const stored = await raw();
ok('stored encrypted', typeof stored === 'string' && stored.startsWith('v1:') && !stored.includes('hunter2'), stored);

r = await call('GET', P(s.crm, `/${route}?limit=5`), null, s.pat);
ok('not in the list', r.status === 200 && r.body?.doc?.length === 1 && !('password' in r.body.doc[0]), JSON.stringify(r.body?.doc?.[0]));
r = await call('GET', P(s.crm, `/${route}?limit=5&fields=site,password`), null, s.pat);
ok('not in the list even when asked for by name', r.status === 200 && !JSON.stringify(r.body).includes('v1:') && !('password' in (r.body?.doc?.[0] || {})), JSON.stringify(r.body?.doc?.[0]));
r = await call('GET', P(s.crm, `/${route}/${id}`), null, s.pat);
ok('not in the record', r.status === 200 && !JSON.stringify(r.body).includes('v1:') && !JSON.stringify(r.body).includes('hunter2'), JSON.stringify(r.body).slice(0, 200));

r = await call('PUT', P(s.crm, `/${route}/${id}`), { site: 'portal 2', password: '' }, s.pat);
ok('saving the form with it empty keeps it', r.status === 200 && (await raw()) === stored, `${r.status} ${r.body?.message || ''}`);

r = await call('POST', P(s.crm, `/${route}/${id}/reveal`), { field: 'password', password: 'not-my-password' }, s.pat);
ok('reveal with the wrong password: 400, not 401', r.status === 400 && r.body?.code === 'wrong_password', `${r.status} ${JSON.stringify(r.body)}`);
r = await call('POST', P(s.crm, `/${route}/${id}/reveal`), { field: 'site', password: PASS }, s.pat);
ok('reveal only opens Password fields', r.status === 400, r.status);
r = await call('POST', P(s.crm, `/${route}/${id}/reveal`), { field: 'password', password: PASS }, s.pat);
ok('reveal with your own password', r.status === 200 && r.body?.value === 'hunter2-secret', `${r.status} ${JSON.stringify(r.body)}`);

r = await call('PUT', P(s.crm, `/${route}/${id}`), { password: 'n3w-one' }, s.pat);
const changed = await raw();
ok('a new value replaces it, encrypted', r.status === 200 && changed !== stored && changed.startsWith('v1:'), `${r.status} ${r.body?.message || ''}`);
r = await call('POST', P(s.crm, `/${route}/${id}/reveal`), { field: 'password', password: PASS }, s.pat);
ok('…and reveals as the new value', r.body?.value === 'n3w-one', JSON.stringify(r.body));

r = await call('GET', P(s.crm, `/history/g/document/${id}`), null, s.pat);
const hist = JSON.stringify(r.body || {});
ok('history says it changed, never the value', r.status === 200 && /a new one/.test(hist) && !hist.includes('v1:') && !hist.includes('n3w-one') && !hist.includes('hunter2'), hist.slice(0, 300));

r = await call('POST', P(s.crm, `/${route}/bulk/import`), { format: 'json', content: JSON.stringify([{ site: 'imported', password: 'imp0rted' }]), dryRun: false }, s.pat);
const imported = await mongoose.connection.db.collection(`t_${s.crm}_${route}`).findOne({ site: 'imported' });
ok('bulk import stores it encrypted', r.status === 201 && imported?.password?.startsWith('v1:'), `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)} ${imported?.password}`);
await mongoose.disconnect();

await call('DELETE', P(s.crm, `/builder/models/${def?._id}?dropData=true`), null, s.pat);
done();
