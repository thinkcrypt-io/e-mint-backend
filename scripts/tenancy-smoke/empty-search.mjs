// A list with an empty search box shows every record — also those whose searchable field is
// missing or blank (`$regex: ''` never matches a missing field); a real search still filters.
import { call, ok, done, load } from './lib.mjs';
const s = load(); // from projects.mjs: pat (Initech, crm)
const P = (pid, path) => `/tenant/api/p/${pid}${path}`;
const t = Date.now().toString(36);

let r = await call('POST', P(s.crm, '/builder/models'), { name: `Bill${t}`, title: `Bills ${t}`, fields: [
	{ key: 'name', label: 'Name', kind: 'text' },
	{ key: 'price', label: 'Price', kind: 'number' },
] }, s.pat);
ok('a model with an optional text and a number', r.status === 201, `${r.status} ${JSON.stringify(r.body?.problems || r.body?.message)}`);
const def = r.body?.doc;
const route = def?.route;
const make = body => call('POST', P(s.crm, `/${route}`), body, s.pat);
const list = q => call('GET', P(s.crm, `/${route}${q}`), null, s.pat);

r = await make({ name: 'Widget', price: 5 });
ok('create with a name', r.status === 201, `${r.status} ${r.body?.message || ''}`);
r = await make({ price: 7 });
ok('create without a name', r.status === 201, `${r.status} ${r.body?.message || ''}`);
r = await make({ name: '', price: 9 });
ok('create with a blank name', r.status === 201, `${r.status} ${r.body?.message || ''}`);

r = await call('GET', P(s.crm, `/${route}/get/count`), null, s.pat);
ok('count: 3', r.body === 3, `${r.status} ${JSON.stringify(r.body)}`);

r = await list('');
ok('list with no search: all 3', r.body?.totalDocs === 3 && r.body?.doc?.length === 3, `${r.status} totalDocs ${r.body?.totalDocs}`);
r = await list('?search=');
ok('list with an empty search: all 3', r.body?.totalDocs === 3, `${r.status} totalDocs ${r.body?.totalDocs}`);
r = await list('?search=%20%20');
ok('list with a blank (spaces) search: all 3', r.body?.totalDocs === 3, `${r.status} totalDocs ${r.body?.totalDocs}`);
r = await list('?search=widg');
ok('a real search still filters', r.body?.totalDocs === 1 && r.body?.doc?.[0]?.name === 'Widget', `${r.status} totalDocs ${r.body?.totalDocs}`);
r = await list('?search=nothing-like-this');
ok('…and finds nothing when nothing matches', r.body?.totalDocs === 0, `${r.status} totalDocs ${r.body?.totalDocs}`);
r = await list('?search=&price_gte=7');
ok('an empty search beside a filter: the filter alone (2)', r.body?.totalDocs === 2, `${r.status} totalDocs ${r.body?.totalDocs}`);

await call('DELETE', P(s.crm, `/builder/models/${def?._id}?dropData=true`), null, s.pat);
done();
