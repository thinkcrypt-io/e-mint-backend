// Couriers CR-02 (docs/couriers): the Delivery model — every store gets Deliveries (linked to its orders, the
// engine's fields locked, made only by Send to courier), the order's courier summary names its delivery, and a
// store built before gets Deliveries from scripts/upgradeStores.js. The older store is made by editing the
// scratch DB (SMOKE_MONGO, local only).
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let r = await call('POST', '/tenant/api/auth/register', { name: 'Dina Delivery', email: `dina${stamp}@example.com`, password: 'tenant-pass-123', organization: `Parcels ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Parcel shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
r = await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: 'PS' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast'] } } }, t);
ok('settings saved (delivery on, Steadfast)', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('GET', `${C}/settings`, null, t);
const inst = r.body?.installed || {};
ok('store built with 19 models, Deliveries among them', r.body?.status === 'ready' && Object.keys(inst).length === 19 && inst.delivery?.route === 'deliveries', JSON.stringify({ s: r.body?.status, e: r.body?.error, keys: Object.keys(inst).length, d: inst.delivery }));

const modelOf = async id => {
	const x = await call('GET', `${P}/builder/models/${id}`, null, t);
	return x.body?.doc || x.body;
};
const dlv = await modelOf(inst.delivery.id);
const fields = Object.fromEntries((dlv?.fields || []).map(f => [f.key, f]));
ok('Deliveries: the store’s, code DLV-', dlv?.system === 'commerce' && dlv?.code?.prefix === 'DLV', JSON.stringify({ sys: dlv?.system, code: dlv?.code }));
ok('linked to its order, the outlet and the COD payment', fields.order?.ref === 'Order' && fields.order?.required && fields.outlet?.ref === 'Outlet' && fields.payment?.ref === 'OrderPayment', JSON.stringify([fields.order, fields.payment]));
ok('the normalised statuses and the couriers', fields.status?.options?.length === 16 && ['steadfast', 'pathao', 'redx', 'manual'].every(v => fields.courier?.options?.some(o => o.value === v)), JSON.stringify(fields.courier?.options));
ok('recipient, courier’s choices and the timeline', fields.recipient?.kind === 'section' && fields.options?.kind === 'section' && fields.events?.kind === 'sectionlist', '');
ok('core fields locked', ['order', 'status', 'events', 'settled', 'weight', 'note'].every(k => dlv.systemFields?.includes(k)), JSON.stringify(dlv.systemFields));

const order = await modelOf(inst.order.id);
const courier = (order?.fields || []).find(f => f.key === 'courier');
ok('the order’s courier summary names its delivery and tracking link', courier?.fields?.some(f => f.key === 'delivery') && courier.fields.some(f => f.key === 'trackingUrl' && f.kind === 'url'), JSON.stringify(courier?.fields?.map(f => f.key)));

r = await call('GET', `${P}/sidebar/admin/server`, null, t);
ok('sidebar: Deliveries shown while delivery is on', JSON.stringify(r.body || []).includes('"/t/deliveries"'), '');

r = await call('POST', `${P}/deliveries`, { status: 'delivered' }, t);
ok('a delivery can’t be made from the plain table', r.status === 403 && r.body?.code === 'commerce_field', `${r.status} ${r.body?.message}`);
r = await call('GET', `${P}/deliveries`, null, t);
ok('the table reads (empty)', r.status === 200 && (r.body?.doc || []).length === 0, `${r.status}`);

// A store from before CR-02: no Deliveries model, the order's courier section without delivery / trackingUrl.
const uri = process.env.SMOKE_MONGO;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri)) console.log('SKIP  upgrading an older store — set a local SMOKE_MONGO');
else {
	const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
	const mc = await new MongoClient(uri).connect();
	const db = mc.db();
	const project = new ObjectId(shopId);
	const defs = db.collection('modeldefinitions');
	const d = await defs.findOne({ _id: new ObjectId(inst.delivery.id) });
	await defs.deleteOne({ _id: d._id });
	if (d.sidebarItem) await db.collection('sidebaritems').deleteOne({ _id: d.sidebarItem });
	for (const c of ['routesettings', 'routeconfigs', 'routeversions']) await db.collection(c).deleteMany({ project, route: 'deliveries' });
	await db.collection('apiendpoints').deleteMany({ project, model: 'deliveries' });
	// The order page's Deliveries tab came with the link; an older store had none.
	const orderPage = await db.collection('routeconfigs').findOne({ project, route: inst.order.route });
	const tabs = JSON.stringify(orderPage?.data || {}).match(/deliveries/g)?.length || 0;
	ok('a new store’s order page lists its deliveries', tabs > 0, `${tabs} mention(s)`);
	const strip = x => (x && typeof x === 'object' ? (Array.isArray(x) ? x.filter(y => !JSON.stringify(y).includes('"deliveries"')).map(strip) : Object.fromEntries(Object.entries(x).map(([k, v]) => [k, strip(v)]))) : x);
	if (orderPage) await db.collection('routeconfigs').updateOne({ _id: orderPage._id }, { $set: { data: strip(orderPage.data), draft: strip(orderPage.draft) } });
	const o = await defs.findOne({ _id: new ObjectId(inst.order.id) });
	await defs.updateOne({ _id: o._id }, { $set: { fields: o.fields.map(f => (f.key === 'courier' ? { ...f, fields: f.fields.filter(x => !['delivery', 'trackingUrl'].includes(x.key)) } : f)) } });
	await db.collection('commercesettings').updateOne({ project }, { $unset: { 'installed.delivery': 1 } });

	const backend = process.env.SMOKE_BACKEND || fileURLToPath(new URL('../..', import.meta.url));
	const run = (...args) => execFileSync('node', ['scripts/upgradeStores.js', ...args], { cwd: backend, env: { ...process.env, MONGO_CONNECTION_URI: uri }, encoding: 'utf8' });
	const mine = out => out.split('\n').filter(l => /Parcel shop|^\s+\S.* — /.test(l)).join(' | ');
	let out = run();
	ok('dry run: Deliveries would be built, the courier summary gains its fields', /Parcel shop:/.test(out) && /Deliveries — built for this store/.test(out) && /Orders — renews courier/.test(out) && !(await defs.findOne({ project, route: 'deliveries' })), mine(out));
	out = run('--apply');
	ok('applied', /Parcel shop:/.test(out) && !/FAILED/.test(out), mine(out) || out.slice(-400));
	const s = await db.collection('commercesettings').findOne({ project });
	const nd = s?.installed?.delivery && (await defs.findOne({ _id: new ObjectId(s.installed.delivery.id) }));
	ok('Deliveries built, recorded, the store’s, locked', nd?.route === 'deliveries' && nd.system === 'commerce' && nd.systemFields?.includes('events'), JSON.stringify(s?.installed?.delivery));
	const rs = await db.collection('routesettings').findOne({ project, route: 'deliveries' });
	const ro = (rs?.data?.fields || []).filter(f => ['status', 'events', 'order'].includes(f.key));
	ok('its engine fields read-only in the form', ro.length === 3 && ro.every(f => f.edit === false), JSON.stringify(ro.map(f => [f.key, f.edit])));
	const no = await defs.findOne({ _id: o._id });
	ok('the order’s courier summary has delivery and tracking link again', no.fields.find(f => f.key === 'courier')?.fields?.some(f => f.key === 'delivery'), '');
	const sb = nd?.sidebarItem && (await db.collection('sidebaritems').findOne({ _id: nd.sidebarItem }));
	const orderItem = o.sidebarItem && (await db.collection('sidebaritems').findOne({ _id: o.sidebarItem }));
	ok('in the store’s sidebar category, shown', sb?.isActive === true && String(sb.category) === String(orderItem?.category), JSON.stringify({ sb: sb && [sb.isActive, String(sb.category)], cat: String(orderItem?.category) }));
	out = run('--apply');
	ok('again: up to date', /Parcel shop: up to date/.test(out), mine(out));
	await mc.close();
	await sleep(11000);
	r = await call('POST', `${P}/deliveries`, { status: 'delivered' }, t);
	ok('after the upgrade: still made only by the store', r.status === 403 && r.body?.code === 'commerce_field', `${r.status} ${r.body?.message}`);
	r = await call('GET', `${P}/deliveries`, null, t);
	ok('after the upgrade: the table reads', r.status === 200, `${r.status} ${r.body?.message || ''}`);
}

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
done();
