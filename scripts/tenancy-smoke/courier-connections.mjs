// Couriers CR-03 (docs/couriers): a store connecting its own courier accounts — only couriers Delivery turned on,
// keys sealed and never sent back, Test with each courier (against courier-stub.mjs), a refused key never retried,
// blank keys kept, a changed key re-tested, the webhook address and secret (Steadfast's own token pasted, renewed),
// Pathao's sandbox account, its stores / cities / zones / areas kept a day, RedX's areas by post code, the same
// account in two stores flagged, disconnect refused while a delivery is on its way, removed with the project.
//
// The backend must run with COURIER_STUB_URL=http://127.0.0.1:4599 (or COURIER_STUB); the stub is started here when
// it isn't running. SMOKE_MONGO (local) for the sealed-keys and open-delivery checks.
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { call, ok, done } from './lib.mjs';

const STUB = process.env.COURIER_STUB || 'http://127.0.0.1:4599';
const stubCalls = async () => (await fetch(`${STUB}/__calls`)).json();
let stub = null;
try {
	await stubCalls();
} catch {
	stub = spawn('node', [fileURLToPath(new URL('./courier-stub.mjs', import.meta.url)), new URL(STUB).port], { stdio: 'ignore' });
	await new Promise(r => setTimeout(r, 600));
}
const resetStub = () => fetch(`${STUB}/__reset`, { method: 'POST' });

const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A built store with delivery on and these couriers turned on. */
const makeStore = async (who, couriers) => {
	let r = await call('POST', '/tenant/api/auth/register', { name: who, email: `${who.toLowerCase().replace(/\W/g, '')}${stamp}@example.com`, password: 'tenant-pass-123', organization: `${who} ${stamp}`, country: 'BD' });
	const t = r.body?.token;
	r = await call('POST', '/tenant/api/projects', { name: `${who}’s shop`, type: 'ecommerce' }, t);
	const id = r.body?._id;
	const C = `/tenant/api/p/${id}/commerce`;
	await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: 'CC' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers } } }, t);
	await call('POST', `${C}/setup`, {}, t);
	for (let i = 0; i < 240; i++) {
		await sleep(1000);
		if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
	}
	r = await call('GET', `${C}/settings`, null, t);
	return { t, id, C, ready: r.body?.status === 'ready', installed: r.body?.installed };
};

const A = await makeStore('Cora', ['steadfast', 'pathao']);
ok('store built, Steadfast and Pathao on', A.ready);
const { t, C } = A;

let r = await call('GET', `${C}/couriers`, null, t);
const byId = id => r.body?.couriers?.find(c => c.id === id);
ok('the country’s couriers (and the manual one), Steadfast and Pathao on, RedX off, none connected', r.status === 200 && r.body.couriers.map(c => c.id).join() === 'steadfast,pathao,redx,manual' && byId('steadfast')?.on && byId('pathao')?.on && !byId('redx')?.on && r.body.couriers.every(c => !c.connection), JSON.stringify(r.body?.couriers?.map(c => [c.id, c.on, !!c.connection]) || r.body));
ok('each says what to paste and where the owner signs up', byId('steadfast')?.fields?.credentials?.map(f => f.key).join() === 'apiKey,secretKey' && /steadfast\.com\.bd/.test(byId('steadfast')?.links?.signUp) && byId('pathao')?.sandbox === true && byId('steadfast')?.sandbox === false, '');

r = await call('PUT', `${C}/couriers/redx`, { keys: { token: 'rx-token' } }, t);
ok('a courier Delivery didn’t turn on can’t be connected', r.status === 409 && r.body?.code === 'courier_off', `${r.status} ${r.body?.message}`);
r = await call('PUT', `${C}/couriers/dhl`, { keys: {} }, t);
ok('an unknown courier: 404', r.status === 404, `${r.status}`);

// Steadfast: a wrong key is refused once, never retried.
await resetStub();
r = await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: 'sf-wrong', secretKey: 'sf-secret' } }, t);
const balanceCalls = (await stubCalls()).filter(c => c.courier === 'steadfast' && c.path === '/get_balance').length;
ok('wrong keys: saved, the test says Steadfast refused them', r.status === 200 && r.body?.connection?.test?.ok === false && r.body.connection.test.rejected && /refused these keys/.test(r.body.connection.test.message) && !r.body.connection.tested, JSON.stringify(r.body?.connection?.test));
ok('a refused key is asked once, never again', balanceCalls === 1, `${balanceCalls} call(s)`);

r = await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: 'sf-api', secretKey: 'sf-secret' }, settings: { deliveryType: '0' } }, t);
const sf = r.body?.connection;
ok('the right keys: connected, the balance in taka', sf?.tested && sf.test.ok && sf.test.message === 'Connected — balance ৳1,240', JSON.stringify(sf?.test));
ok('keys never come back — only that they’re set', JSON.stringify(r.body).includes('sf-api') === false && sf?.keys?.apiKey?.set === true && sf.keys.apiKey.value === undefined, JSON.stringify(sf?.keys));
const hook = sf?.webhook;
ok('a webhook address of its own and a secret Mint made', /\/public\/couriers\/steadfast\/[a-f0-9]{24}$/.test(hook?.url || '') && /^[A-Za-z0-9_-]{30,}$/.test(hook?.secret || '') && !hook.pasted, JSON.stringify(hook));

r = await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: '', secretKey: '' }, settings: { deliveryType: '1' } }, t);
ok('blank keys keep the ones stored; settings change; still connected', r.body?.connection?.tested && r.body.connection.settings.deliveryType === '1', JSON.stringify(r.body?.connection?.settings));
r = await call('PUT', `${C}/couriers/steadfast`, { settings: { deliveryType: '7' } }, t);
ok('a setting outside its choices: 400', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('PUT', `${C}/couriers/steadfast`, { keys: { apiKey: 'sf-api-2' } }, t);
ok('a new key is tested again', r.body?.connection?.tested && r.body.connection.test.ok, JSON.stringify(r.body?.connection?.test));

r = await call('PUT', `${C}/couriers/steadfast`, { webhookSecret: 'short' }, t);
ok('a pasted webhook token too short: 400', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('PUT', `${C}/couriers/steadfast`, { webhookSecret: 'Steadfast_generated.token=12345' }, t);
ok('Steadfast’s own token pasted', r.body?.connection?.webhook?.secret === 'Steadfast_generated.token=12345' && r.body.connection.webhook.pasted, JSON.stringify(r.body?.connection?.webhook));
r = await call('POST', `${C}/couriers/steadfast/webhook-secret`, {}, t);
ok('renewed: Mint’s again, a new one', r.body?.connection?.webhook?.secret && r.body.connection.webhook.secret !== 'Steadfast_generated.token=12345' && r.body.connection.webhook.secret !== hook.secret && !r.body.connection.webhook.pasted, '');
r = await call('POST', `${C}/couriers/steadfast/test`, {}, t);
ok('Test again', r.status === 200 && r.body?.connection?.test?.ok, `${r.status}`);

// Pathao with its published sandbox account.
r = await call('PUT', `${C}/couriers/pathao`, { sandbox: true }, t);
const pa = r.body?.connection;
ok('Pathao’s sandbox: test mode, connected, its active stores', pa?.mode === 'test' && pa.tested && pa.test.message === 'Connected — 2 stores', JSON.stringify(pa?.test));
ok('the default store picked, the defaults set', pa?.settings?.store === '102' && pa.settings.deliveryType === '48' && pa.settings.itemType === '2' && pa.settings.defaultWeight === 0.5, JSON.stringify(pa?.settings));
ok('the client id and email shown back, the secret and password not', pa?.keys?.clientId?.value === '7N1aMJQbWm' && pa.keys.username.value === 'test@pathao.com' && pa.keys.password.set && pa.keys.password.value === undefined && !JSON.stringify(r.body).includes('lovePathao'), JSON.stringify(pa?.keys));

await resetStub();
r = await call('GET', `${C}/couriers/pathao/options/stores`, null, t);
ok('stores come from the test’s list (no call)', r.body?.choices?.length === 2 && (await stubCalls()).length === 0, JSON.stringify(r.body));
r = await call('GET', `${C}/couriers/pathao/options/cities`, null, t);
ok('cities', r.body?.choices?.map(c => c.label).join() === 'Dhaka,Chattogram', JSON.stringify(r.body));
r = await call('GET', `${C}/couriers/pathao/options/zones?parent=1`, null, t);
ok('a city’s zones', r.body?.choices?.map(c => c.label).join() === 'Gulshan,Mirpur', JSON.stringify(r.body));
r = await call('GET', `${C}/couriers/pathao/options/areas?parent=11`, null, t);
ok('a zone’s areas', r.body?.choices?.[0]?.label === 'Mirpur 10' && r.body.choices[0].details.homeDelivery === true, JSON.stringify(r.body));
const before = (await stubCalls()).length;
r = await call('GET', `${C}/couriers/pathao/options/zones?parent=1`, null, t);
ok('asked again: kept for the day', r.body?.choices?.length === 2 && (await stubCalls()).length === before, `${(await stubCalls()).length - before} new call(s)`);
r = await call('GET', `${C}/couriers/pathao/options/zones`, null, t);
ok('zones without a city: 400', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('GET', `${C}/couriers/pathao/options/planets`, null, t);
ok('a list the courier hasn’t: 404', r.status === 404, `${r.status}`);
r = await call('GET', `${C}/couriers/steadfast/options/stores`, null, t);
ok('Steadfast has no lists: 404', r.status === 404, `${r.status}`);

r = await call('PUT', `${C}/couriers/pathao`, { mode: 'live', keys: { clientId: 'pa-client', clientSecret: 'nope', username: 'owner@example.com', password: 'pa-pass' } }, t);
ok('Pathao live with a wrong secret: not connected, says why', r.body?.connection?.mode === 'live' && !r.body.connection.tested && /Pathao refused the sign-in/.test(r.body.connection.test?.message || ''), JSON.stringify(r.body?.connection?.test));
r = await call('PUT', `${C}/couriers/pathao`, { keys: { clientSecret: 'pa-secret' } }, t);
ok('the right secret: connected live', r.body?.connection?.tested && r.body.connection.mode === 'live', JSON.stringify(r.body?.connection?.test));

// RedX, turned on now: its areas by post code or district.
await call('PUT', `${C}/settings`, { answers: { delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['steadfast', 'pathao', 'redx'] } } }, t);
r = await call('PUT', `${C}/couriers/redx`, { mode: 'test', keys: { token: 'rx-token' } }, t);
ok('RedX: connected, its pickup store chosen', r.body?.connection?.tested && r.body.connection.test.message === 'Connected — 1 pickup store' && r.body.connection.settings.store === '7001', JSON.stringify(r.body?.connection));
ok('RedX’s secret rides in its webhook address', /\/public\/couriers\/redx\/[a-f0-9]{24}\?token=[A-Za-z0-9_-]{30,}$/.test(r.body?.connection?.webhook?.url || '') && r.body.connection.webhook.secret === undefined, r.body?.connection?.webhook?.url);
r = await call('GET', `${C}/couriers/redx/options/areas?parent=1216`, null, t);
ok('RedX areas by post code', r.body?.choices?.map(c => c.label).join() === 'Mirpur DOHS', JSON.stringify(r.body));
r = await call('GET', `${C}/couriers/redx/options/areas?parent=chattogram`, null, t);
ok('…and by district', r.body?.choices?.map(c => c.label).join() === 'Agrabad', JSON.stringify(r.body));
r = await call('PUT', `${C}/couriers/redx`, { webhookSecret: 'my-own-token-1234567' }, t);
ok('RedX takes only Mint’s secret', r.status === 400, `${r.status} ${r.body?.message}`);

// The same Pathao account in a second store.
const B = await makeStore('Bina', ['pathao']);
r = await call('PUT', `${B.C}/couriers/pathao`, { mode: 'live', keys: { clientId: 'pa-client', clientSecret: 'pa-secret', username: 'owner@example.com', password: 'pa-pass' } }, B.t);
ok('a second store, the same Pathao account: connected, and warned', r.body?.connection?.tested && r.body.connection.sharedAccount && /also connected to another Mint store/.test(r.body.warnings?.join(' ') || ''), JSON.stringify(r.body?.warnings));
r = await call('GET', `${C}/couriers`, null, t);
ok('…the first store is warned too, Steadfast isn’t', byId('pathao')?.connection?.sharedAccount && !byId('steadfast')?.connection?.sharedAccount, '');
r = await call('GET', `${B.C}/couriers`, null, B.t);
ok('one store never sees another’s keys or settings', !JSON.stringify(r.body).includes('sf-api') && !r.body?.couriers?.find(c => c.id === 'steadfast')?.connection, '');

const uri = process.env.SMOKE_MONGO;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri)) console.log('SKIP  sealed keys, open deliveries, project delete — set a local SMOKE_MONGO');
else {
	const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
	const mc = await new MongoClient(uri).connect();
	const db = mc.db();
	const conns = db.collection('courierconnections');
	const s = await conns.findOne({ project: new ObjectId(A.id), courier: 'steadfast' });
	ok('stored sealed: keys, webhook secret', Object.values(s?.credentials || {}).every(v => String(v).startsWith('v1:')) && s.webhookSecret.startsWith('v1:') && !JSON.stringify(s).includes('sf-api'), Object.keys(s?.credentials || {}).join());
	const p = await conns.findOne({ project: new ObjectId(A.id), courier: 'pathao' });
	ok('Pathao’s token kept sealed', p?.token?.access?.startsWith('v1:') && p.token.refresh.startsWith('v1:') && p.token.expiresAt, '');

	// A delivery on its way with Pathao.
	const d = A.installed.delivery;
	const def = await db.collection('modeldefinitions').findOne({ _id: new ObjectId(d.id) });
	await db.collection(def.collectionName).insertOne({ _model: def.name, organization: s.organization, project: s.project, courier: 'pathao', status: 'in-transit', code: 'DLV-000001' });
	r = await call('DELETE', `${C}/couriers/pathao`, null, t);
	ok('disconnecting while a parcel is on its way: refused', r.status === 409 && r.body?.code === 'courier_in_use' && /1 delivery is still with Pathao/.test(r.body.message), `${r.status} ${r.body?.message}`);
	r = await call('DELETE', `${C}/couriers/steadfast`, null, t);
	ok('Steadfast disconnected', r.status === 200 && r.body?.removed, `${r.status}`);
	r = await call('GET', `${C}/couriers`, null, t);
	ok('…and its keys gone', !byId('steadfast')?.connection, '');

	await call('DELETE', `/tenant/api/projects/${A.id}?force=1`, null, t);
	await call('DELETE', `/tenant/api/projects/${B.id}?force=1`, null, B.t);
	const left = await conns.countDocuments({ project: { $in: [new ObjectId(A.id), new ObjectId(B.id)] } });
	ok('connections removed with their projects', left === 0, `${left} left`);
	await mc.close();
}
if (!uri) {
	await call('DELETE', `/tenant/api/projects/${A.id}?force=1`, null, t);
	await call('DELETE', `/tenant/api/projects/${B.id}?force=1`, null, B.t);
}
stub?.kill();
done();
