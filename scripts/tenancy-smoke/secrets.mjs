// Password fields (kind `password`): stored as text, shown as dots in the panel, never in history.
import { call, ok, done, load } from './lib.mjs';
const s = load(); // from projects.mjs: pat (Initech, crm)
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
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
ok('create a record', r.status === 201 && !!id, `${r.status} ${JSON.stringify(r.body)}`);
r = await call('GET', P(s.crm, `/${route}/${id}`), null, s.pat);
ok('read back as text (the panel masks it)', r.status === 200 && JSON.stringify(r.body).includes('hunter2-secret'), JSON.stringify(r.body).slice(0, 200));

r = await call('PUT', P(s.crm, `/${route}/${id}`), { password: 'n3w-one' }, s.pat);
ok('change it', r.status === 200, `${r.status} ${r.body?.message || ''}`);
r = await call('GET', P(s.crm, `/history/g/document/${id}`), null, s.pat);
const hist = JSON.stringify(r.body || {});
ok('history says it changed, never the value', r.status === 200 && /a new one/.test(hist) && !hist.includes('n3w-one') && !hist.includes('hunter2'), hist.slice(0, 300));

await call('DELETE', P(s.crm, `/builder/models/${def?._id}?dropData=true`), null, s.pat);
done();
