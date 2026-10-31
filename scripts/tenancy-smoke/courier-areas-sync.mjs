// Couriers CR-10 + CR-11 (docs/couriers): the Send dialog's area picks — matched from Pathao's cities / zones / areas
// and RedX's areas, remembered after a send and used for the next order from the same place, Steadfast none — and
// the regular check: a quiet parcel asked about by the scheduler, not one that just heard; the "no webhook for 2
// days" warning in Store settings. Backend with COURIER_STUB_URL, COURIER_SYNC_MS=3000 and COURIER_QUIET_MS=1500;
// SMOKE_MONGO (local) for the warning.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { call, ok, done } from './lib.mjs';

const STUB = process.env.COURIER_STUB || 'http://127.0.0.1:4599';
let stub = null;
try {
	await fetch(`${STUB}/__calls`);
} catch {
	stub = spawn('node', [fileURLToPath(new URL('./courier-stub.mjs', import.meta.url)), new URL(STUB).port], { stdio: 'ignore' });
	await new Promise(r => setTimeout(r, 600));
}
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));

let r = await call('POST', '/tenant/api/auth/register', { name: 'Ara Areas', email: `ara${stamp}@example.com`, password: 'tenant-pass-123', organization: `Ar ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Area shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `AR${String(stamp).slice(-4)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast', 'pathao', 'redx'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: 'sf-api', secretKey: 'sf-secret' } }, t);
await call('PUT', `${C}/couriers/pathao`, { sandbox: true }, t);
r = await call('PUT', `${C}/couriers/redx`, { mode: 'test', keys: { token: 'rx-token' } }, t);
ok('three couriers connected', r.body?.connection?.tested, '');

r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const pid = (await call('POST', `${P}/products`, { name: 'Dal', price: 400, status: 'active', sku: 'DAL' }, t)).body?.doc?._id;
let v;
for (let i = 0; i < 20 && !v; i++) {
	v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
	if (!v) await sleep(300);
}
await call('POST', `${C}/stock/set`, { variant: v, outlet: GUL, onHand: 50, reason: 'opening' }, t);
const addOrder = async (area, city = 'Dhaka') => (await call('POST', `${C}/orders`, { outlet: GUL, lines: [{ variant: v, quantity: 1 }], delivery: { name: 'Rina Akter', phone: '01711000000', address: 'House 5, Road 3', area, city, rate: 'Inside Dhaka' } }, t)).body?.order;
const prefill = async id => Object.fromEntries(((await call('GET', `${C}/orders/${id}/send`, null, t)).body?.couriers || []).map(c => [c.id, c.areas]));

const o1 = await addOrder('Mirpur');
let a = await prefill(o1._id);
ok('Pathao: Dhaka → Mirpur → Mirpur 10 matched from its lists', a.pathao?.from === 'matched' && a.pathao.picks.cityName === 'Dhaka' && a.pathao.picks.zoneName === 'Mirpur' && a.pathao.picks.areaName === 'Mirpur 10', JSON.stringify(a.pathao));
ok('RedX: Mirpur DOHS matched among Dhaka’s areas', a.redx?.from === 'matched' && a.redx.picks.areaName === 'Mirpur DOHS', JSON.stringify(a.redx));
ok('Steadfast: needs none', a.steadfast?.from === 'none' && !a.steadfast.picks.area, JSON.stringify(a.steadfast));
const o0 = await addOrder('Banani');
a = await prefill(o0._id);
ok('an area Pathao’s list hasn’t: the city only, nothing guessed', a.pathao?.picks?.city === '1' && !a.pathao.picks.zone && !a.redx.picks.area, JSON.stringify(a));

// Someone picks Gulshan for "Mirpur" (a different zone): remembered for the next order from there.
r = await call('POST', `${C}/orders/${o1._id}/deliveries`, { courier: 'pathao', options: { city: '1', cityName: 'Dhaka', zone: '10', zoneName: 'Gulshan', area: '1101', areaName: 'Mirpur 10' } }, t);
ok('sent to Pathao with the picks', r.status === 201 && r.body?.delivery?.options?.zone === '10', `${r.status} ${r.body?.message}`);
const d1 = r.body.delivery;
const o2 = await addOrder('mirpur ', 'DHAKA');
a = await prefill(o2._id);
ok('the next order from “mirpur, DHAKA”: the picks remembered', a.pathao?.from === 'remembered' && a.pathao.picks.zone === '10' && a.pathao.picks.zoneName === 'Gulshan', JSON.stringify(a.pathao));

// The regular check: the parcel has been quiet, Pathao moved it on, nobody pressed Refresh.
await fetch(`${STUB}/__status`, { method: 'POST', body: JSON.stringify({ courier: 'pathao', consignment: d1.consignment, status: 'Picked' }) });
let x;
for (let i = 0; i < 20; i++) {
	await sleep(1000);
	x = (await call('GET', `${C}/deliveries/${d1._id}`, null, t)).body?.delivery;
	if (x?.status === 'picked-up') break;
}
ok('asked about by the regular check: picked up, from the check', x?.status === 'picked-up' && x.events.slice(-1)[0].source === 'sync' && /check/.test(x.events.slice(-1)[0].by), JSON.stringify({ s: x?.status, e: x?.events?.slice(-1) }));
ok('…and the order shipped', (await call('GET', `${C}/orders/${o1._id}`, null, t)).body?.order?.fulfilment === 'shipped');

const uri = process.env.SMOKE_MONGO;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri)) console.log('SKIP  the quiet-webhook warning — set a local SMOKE_MONGO');
else {
	const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
	const mc = await new MongoClient(uri).connect();
	await mc.db().collection('courierconnections').updateOne({ project: new ObjectId(shopId), courier: 'pathao' }, { $set: { createdAt: new Date(Date.now() - 3 * 86400000) }, $unset: { lastWebhookAt: 1 } });
	r = await call('GET', `${C}/couriers`, null, t);
	const w = r.body?.couriers?.find(c => c.id === 'pathao')?.warnings || [];
	ok('Store settings: Pathao quiet for 2 days with a parcel out — check the webhook', w.some(x => /hasn’t sent an update for 2 days while 1 parcel is out/.test(x)), JSON.stringify(w));
	ok('…not for RedX (nothing out)', !(r.body?.couriers?.find(c => c.id === 'redx')?.warnings || []).some(x => /2 days/.test(x)));
	await mc.close();
}

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
stub?.kill();
done();
