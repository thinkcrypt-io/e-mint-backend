// Public API lists: the admin lists' filter syntax (field_op=value), search, sort, fields, paging, archived rows (WO-40).
// Uses projects.mjs's state (pat's CRM project); run after public.mjs.
import { call, ok, done, load, ROOT } from './lib.mjs';
const s = load();
const P = path => `/tenant/api/p/${s.crm}${path}`;
const slug = (await call('GET', `/tenant/api/projects/${s.crm}`, null, s.pat)).body?.publicSlug;
const tag = Date.now().toString(36);
const route = `gear${tag}`;
const brand = (await call('POST', P('/builder/models'), { name: `Brand${tag}`, title: 'Brands', displayField: 'name', fields: [{ key: 'name', label: 'Name', kind: 'text', required: true }] }, s.pat)).body?.doc;
const gear = (await call('POST', P('/builder/models'), { name: `Gear${tag}`, route, title: 'Gear', displayField: 'name', fields: [
	{ key: 'name', label: 'Name', kind: 'text', required: true },
	{ key: 'contact_email', label: 'Contact email', kind: 'email' },
	{ key: 'price', label: 'Price', kind: 'number' },
	{ key: 'status', label: 'Status', kind: 'select', options: [{ label: 'Draft', value: 'draft' }, { label: 'Live', value: 'live' }, { label: 'Sold', value: 'sold' }] },
	{ key: 'featured', label: 'Featured', kind: 'boolean' },
	{ key: 'releasedOn', label: 'Released on', kind: 'date' },
	{ key: 'tags', label: 'Tags', kind: 'tags' },
	{ key: 'brand', label: 'Brand', kind: 'reference', ref: `Brand${tag}` },
	{ key: 'notes', label: 'Notes', kind: 'textarea' },
] }, s.pat)).body?.doc;
ok('models made', !!brand?._id && !!gear?._id, gear?.route);
const r0 = gear?.route || route;
await call('PUT', P(`/builder/models/${gear._id}/public-api`), { enabled: true, actions: ['list', 'get'], auth: 'none' }, s.pat);

const made = r => r.body?._id ? r.body : r.body?.doc;
const acme = made(await call('POST', P(`/${brand.route}`), { name: 'Acme' }, s.pat));
const zen = made(await call('POST', P(`/${brand.route}`), { name: 'Zen' }, s.pat));
const rows = [
	{ name: 'Trail Shoe', contact_email: 'Shop@Example.com', price: 89, status: 'live', featured: true, releasedOn: '2026-09-01', tags: ['run', 'outdoor'], brand: acme._id, notes: 'Grippy sole' },
	{ name: 'Road Shoe', price: 120, status: 'live', featured: false, releasedOn: '2026-09-15', tags: ['run'], brand: zen._id },
	{ name: 'Tent', price: 300, status: 'draft', featured: true, releasedOn: '2026-10-01', tags: ['outdoor', 'camp'], brand: acme._id },
	{ name: 'Lamp (50% off)', price: 25, status: 'sold', releasedOn: '2026-08-20', tags: ['camp'] },
];
const ids = [];
for (const b of rows) ids.push(made(await call('POST', P(`/${r0}`), b, s.pat))?._id);
ok('records made', ids.every(Boolean), ids.length);

const pub = q => fetch(`${ROOT}/public/api/${slug}/${r0}?${q}`).then(async x => ({ status: x.status, body: await x.json().catch(() => null) }));
const names = r => (r.body?.doc || []).map(d => d.name).sort().join('|');
const is = (label, r, want) => ok(label, r.status === 200 && names(r) === want.split('|').sort().join('|'), `${r.status} ${r.body?.message || names(r)}`);

is('equals (select)', await pub('status=live'), 'Trail Shoe|Road Shoe');
is('equals repeated = any of', await pub('status=live&status=sold'), 'Trail Shoe|Road Shoe|Lamp (50% off)');
is('_in', await pub('status_in=draft,sold'), 'Tent|Lamp (50% off)');
is('_nin', await pub('status_nin=draft,sold'), 'Trail Shoe|Road Shoe');
is('_ne', await pub('status_ne=live'), 'Tent|Lamp (50% off)');
is('number _gte/_lte together', await pub('price_gte=50&price_lte=150'), 'Trail Shoe|Road Shoe');
is('number _gt / _lt', await pub('price_gt=89&price_lt=300'), 'Road Shoe');
is('number _btwn', await pub('price_btwn=25_89'), 'Trail Shoe|Lamp (50% off)');
is('number _btwn open-ended', await pub('price_btwn=100_'), 'Road Shoe|Tent');
is('boolean', await pub('featured=true'), 'Trail Shoe|Tent');
is('boolean 0 (unset saves as false)', await pub('featured=0'), 'Road Shoe|Lamp (50% off)');
is('date = that whole day', await pub('releasedOn=2026-09-15'), 'Road Shoe');
is('date _lte takes the whole day', await pub('releasedOn_lte=2026-09-15'), 'Trail Shoe|Road Shoe|Lamp (50% off)');
is('date _lt is before the day', await pub('releasedOn_lt=2026-09-15'), 'Trail Shoe|Lamp (50% off)');
is('date _gt is after the day', await pub('releasedOn_gt=2026-09-15'), 'Tent');
is('date _btwn', await pub('releasedOn_btwn=2026-09-01_2026-09-30'), 'Trail Shoe|Road Shoe');
is('createdAt=today (admin shortcut)', await pub('createdAt=today'), 'Trail Shoe|Road Shoe|Tent|Lamp (50% off)');
is('createdAt=days_7', await pub('createdAt=days_7'), 'Trail Shoe|Road Shoe|Tent|Lamp (50% off)');
is('createdAt_lt=2020-01-01', await pub('createdAt_lt=2020-01-01'), '');
is('tags = has', await pub('tags=camp'), 'Tent|Lamp (50% off)');
is('tags _all', await pub('tags_all=outdoor,camp'), 'Tent');
is('tags _in', await pub('tags_in=run,camp'), 'Trail Shoe|Road Shoe|Tent|Lamp (50% off)');
is('reference by _id', await pub(`brand=${acme._id}`), 'Trail Shoe|Tent');
is('reference _in', await pub(`brand_in=${acme._id},${zen._id}`), 'Trail Shoe|Road Shoe|Tent');
is('text equals is exact', await pub('name=tent'), '');
is('text _contains, any case', await pub('name_contains=SHOE'), 'Trail Shoe|Road Shoe');
is('_contains is literal (no regex)', await pub(`name_contains=${encodeURIComponent('(50%')}`), 'Lamp (50% off)');
is('email equals ignores case', await pub('contact_email=shop@example.com'), 'Trail Shoe');
is('field key with an underscore + op', await pub('contact_email_contains=shop'), 'Trail Shoe');
is('search across text fields', await pub('search=grippy'), 'Trail Shoe');
is('search + filter (AND)', await pub('search=shoe&price_gt=100'), 'Road Shoe');
is('unknown params ignored', await pub('v=2&nonsense=1'), 'Trail Shoe|Road Shoe|Tent|Lamp (50% off)');

let r = await pub('sort=-price&limit=2');
ok('sort desc + limit', r.body?.doc?.map(d => d.name).join('|') === 'Tent|Road Shoe' && r.body.total === 4 && r.body.totalPages === 2, JSON.stringify(r.body?.doc?.map(d => d.name)));
r = await pub('sort=-price&limit=2&page=2');
ok('page 2', r.body?.doc?.map(d => d.name).join('|') === 'Trail Shoe|Lamp (50% off)' && r.body.page === 2, JSON.stringify(r.body?.doc?.map(d => d.name)));
r = await pub('sort=-featured,price');
ok('multi-field sort', r.body?.doc?.map(d => d.name).join('|') === 'Trail Shoe|Tent|Lamp (50% off)|Road Shoe', JSON.stringify(r.body?.doc?.map(d => d.name)));
r = await pub('sort=nope');
ok('unknown sort falls back to newest', r.status === 200 && r.body?.doc?.[0]?.name === 'Lamp (50% off)', r.body?.doc?.[0]?.name);
r = await pub('limit=500');
ok('limit capped at 100', r.body?.limit === 100);
r = await pub('page=9');
ok('past the last page: empty, total kept', r.status === 200 && r.body?.doc?.length === 0 && r.body.total === 4);
r = await pub('fields=name,brand&limit=1');
const one = r.body?.doc?.[0] || {};
ok('fields picks keys (+_id), refs still populated', Object.keys(one).sort().join(',') === '_id,brand,name' || Object.keys(one).sort().join(',') === '_id,name', JSON.stringify(one));
r = await pub(`fields=name,brand&brand=${acme._id}&limit=1`);
ok('populated ref with fields', r.body?.doc?.[0]?.brand?.name === 'Acme', JSON.stringify(r.body?.doc?.[0]));

// Errors
for (const [q, why] of [['price=abc', 'not a number'], ['featured=yes', 'not a boolean'], ['releasedOn=soon', 'not a date'], ['brand=123', 'not an id'], ['status_gte=a', 'op the kind doesn’t take'], ['price_foo=1', 'unknown op'], ['price[$gt]=1', 'bracket object'], ['price[gte]=1', 'bracket syntax']])
	{ r = await pub(q); ok(`400: ${why}`, r.status === 400 && !!r.body?.message, `${r.status} ${r.body?.message}`); }

// GET / tells the reference what each list takes
r = await fetch(`${ROOT}/public/api/${slug}/`).then(x => x.json());
const m = r.models?.find(x => x.route === r0);
ok('info: filters per field', m?.filters?.find(f => f.key === 'price')?.ops?.includes('btwn') && m.filters.some(f => f.key === 'createdAt'), JSON.stringify(m?.filters?.map(f => f.key)));
ok('info: search + sort keys', m?.search?.includes('name') && m?.search?.includes('notes') && m?.sort?.includes('price'), JSON.stringify({ s: m?.search, o: m?.sort }));

// Archived rows stay off the site, like the admin lists. Archiving is a route option (off for a new
// model), so the row is archived the way bulk Archive does it: archivedAt set in the scratch DB.
const { MongoClient } = await import('../../node_modules/mongodb/lib/index.js');
const uri = process.env.MONGO_CONNECTION_URI || process.env.SMOKE_MONGO || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
const mc = await new MongoClient(uri).connect();
// The model's records: in its project's one collection (WO-43), marked with its name.
const def = await mc.db().collection('modeldefinitions').findOne({ route: r0 });
await mc.db().collection(def.collectionName).updateOne({ _model: def.name, name: 'Trail Shoe' }, { $set: { archivedAt: new Date() } });
await mc.close();
is('archived row not listed', await pub(''), 'Road Shoe|Tent|Lamp (50% off)');
r = await fetch(`${ROOT}/public/api/${slug}/${r0}/${ids[0]}`);
ok('archived row: 404 by id', r.status === 404, r.status);
done();
