// Couriers CR-08 (docs/couriers): the Pathao adapter on its own — against courier-stub.mjs (booking as Pathao takes
// it, city / zone / area only when picked, refusals in Pathao's words, bulk without ids, the price, status, every
// event mapped, the webhook's secret, handshake and 202 reply), then with PATHAO_SANDBOX=1 against Pathao's real
// sandbox with its published test account (token, stores, a booking, its info). Sandbox parcels aren't real
// deliveries; Pathao has no cancel API. Imports the built adapter from SMOKE_BACKEND.
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { ok, done } from './lib.mjs';

const STUB = process.env.COURIER_STUB || 'http://127.0.0.1:4599';
process.env.COURIER_STUB_URL = STUB;
let stub = null;
try {
	await fetch(`${STUB}/__calls`);
} catch {
	stub = spawn('node', [fileURLToPath(new URL('./courier-stub.mjs', import.meta.url)), new URL(STUB).port], { stdio: 'ignore' });
	await new Promise(r => setTimeout(r, 600));
}
const backend = process.env.SMOKE_BACKEND || fileURLToPath(new URL('../..', import.meta.url));
const { pathao: pa, PATHAO_SANDBOX } = await import(pathToFileURL(`${backend}/dist/library/functions/commerce/couriers/pathao.js`).href);

const stamp = Date.now();
const conn = { mode: 'test', credentials: { ...PATHAO_SANDBOX }, settings: { store: '102', deliveryType: '48', itemType: '2', defaultWeight: 0.5 }, token: null };
const parcel = (n, extra = {}) => ({
	invoice: `P${stamp}-${n}`,
	recipient: { name: 'Rina Akter', phone: '01711000000', address: 'House 5, Road 3', area: 'Mirpur 10', city: 'Dhaka' },
	cod: 1260,
	value: 1260,
	weight: 0.2,
	items: 3,
	note: 'Call first',
	options: {},
	...extra,
});
const fails = async fn => {
	try {
		await fn();
		return null;
	} catch (e) {
		return e;
	}
};

const b = await pa.book(conn, parcel(1));
ok('booked: Pathao’s consignment, its fee', /^DT\d+/.test(b.consignment) && b.charge === 80 && b.courierStatus === 'pending', JSON.stringify(b));
let sent = (await (await fetch(`${STUB}/__parcel/pathao/${b.consignment}`)).json()).sent;
ok('sent as Pathao takes it: the store, 48 / parcel, weight raised to 0.5, our order no., no empty city / zone / area', sent.store_id === 102 && sent.delivery_type === 48 && sent.item_type === 2 && sent.item_weight === 0.5 && sent.merchant_order_id === `P${stamp}-1` && !('recipient_city' in sent) && sent.amount_to_collect === 1260 && sent.recipient_address === 'House 5, Road 3, Mirpur 10, Dhaka', JSON.stringify(sent));
const b2 = await pa.book(conn, parcel(2, { options: { city: '1', zone: '11', area: '1101' } }));
sent = (await (await fetch(`${STUB}/__parcel/pathao/${b2.consignment}`)).json()).sent;
ok('picked city / zone / area sent as numbers', sent.recipient_city === 1 && sent.recipient_zone === 11 && sent.recipient_area === 1101, JSON.stringify(sent));
let e = await fails(() => pa.book(conn, parcel(3, { recipient: { name: 'X', phone: '01711000000', address: 'short' } })));
ok('a short address: refused before calling', /10 characters/.test(e?.message || ''), e?.message);
e = await fails(() => pa.book({ ...conn, settings: { ...conn.settings, store: '' } }, parcel(4)));
ok('no pickup store: refused, says where to pick it', /pickup store/.test(e?.message || ''), e?.message);

const many = await pa.bookMany(conn, [parcel(10), parcel(11, { recipient: { name: 'Y', phone: 'bad', address: 'House 1, Road 1' } }), parcel(12)]);
ok('bulk: taken without ids (they come by webhook), a bad one refused', many[0].ok && many[0].booked.pending && !many[1].ok && many[2].ok, JSON.stringify(many));
const later = await (await fetch(`${STUB}/__pathao/by-invoice/P${stamp}-10`)).json();
ok('…Pathao booked it under our order no.', /^DT/.test(later.consignment_id || ''), JSON.stringify(later));

ok('the price for a city and zone', (await pa.quote(conn, parcel(20, { options: { city: '1', zone: '11' } }))).charge === 80);
e = await fails(() => pa.quote(conn, parcel(21)));
ok('no price without a zone', /city and zone/.test(e?.message || ''), e?.message);

let s = await pa.status(conn, b);
ok('status: Pending → booked', s.courierStatus === 'pending' && s.status === 'booked', JSON.stringify(s));
await fetch(`${STUB}/__status`, { method: 'POST', body: JSON.stringify({ courier: 'pathao', consignment: b.consignment, status: 'Assigned_for_Delivery' }) });
s = await pa.status(conn, b);
ok('status: Assigned for delivery → out for delivery', s.status === 'out-for-delivery', JSON.stringify(s));

const map = {
	'order.created': 'booked', 'order.updated': null, 'order.pickup-requested': 'pickup-pending', 'order.assigned-for-pickup': 'pickup-pending', 'order.picked': 'picked-up',
	'order.pickup-failed': 'on-hold', 'order.pickup-cancelled': 'cancelled', 'order.at-the-sorting-hub': 'in-transit', 'order.in-transit': 'in-transit',
	'order.received-at-last-mile-hub': 'in-transit', 'order.assigned-for-delivery': 'out-for-delivery', 'order.delivered': 'delivered', 'order.partial-delivery': 'partly-delivered',
	'order.delivery-failed': 'failed-attempt', 'order.on-hold': 'on-hold', 'order.returned': 'returning', 'order.return-id-created': 'returning', 'order.return-in-transit': 'returning',
	'order.returned-to-merchant': 'returned', 'order.paid-return': 'returned', 'order.exchanged': 'delivered', 'order.paid': null, 'order.something-new': null,
};
const wrong = Object.entries(map).filter(([k, v]) => pa.normalise(k) !== v);
ok('all 22 order events mapped', wrong.length === 0, JSON.stringify(wrong));

const secret = 'Mint-made-secret-abc123';
const req = (body, headers = {}) => ({ raw: JSON.stringify(body), body, headers, query: {} });
ok('X-PATHAO-Signature is the secret', pa.webhook.verify(req({}, { 'x-pathao-signature': secret }), secret) && !pa.webhook.verify(req({}, { 'x-pathao-signature': 'nope' }), secret) && !pa.webhook.verify(req({}), secret));
let ev = pa.webhook.parse(req({ event: 'webhook_integration' }));
ok('the integration call: a handshake, nothing to apply', ev[0].kind === 'handshake', JSON.stringify(ev));
const reply = pa.webhook.reply({});
ok('answered 202 with Pathao’s integration header', reply.status === 202 && reply.headers['X-Pathao-Merchant-Webhook-Integration-Secret'] === 'f3992ecc-59da-4cbe-a049-a13da2018d51', JSON.stringify(reply));
ok('…or the value the owner set', pa.webhook.reply({ hookReply: 'abc' }).headers['X-Pathao-Merchant-Webhook-Integration-Secret'] === 'abc');
ev = pa.webhook.parse(req({ event: 'order.delivered', consignment_id: b.consignment, merchant_order_id: `P${stamp}-1`, collected_amount: 1260, updated_at: '2026-10-31 15:00:00', timestamp: '2026-10-31T09:00:00Z', store_id: 102 }));
ok('order.delivered: delivered, the cash collected, Dhaka time', ev[0].status === 'delivered' && ev[0].collected === 1260 && ev[0].at.toISOString() === '2026-10-31T09:00:00.000Z' && ev[0].invoice === `P${stamp}-1`, JSON.stringify(ev));
ev = pa.webhook.parse(req({ event: 'order.paid', consignment_id: b.consignment, invoice_id: 'INV-55', updated_at: '2026-11-02 10:00:00' }));
ok('order.paid: a payout with Pathao’s invoice', ev[0].kind === 'payout' && ev[0].settled?.ref === 'INV-55', JSON.stringify(ev));

// Pathao's real sandbox, with the test account Pathao publishes.
if (process.env.PATHAO_SANDBOX !== '1') console.log('SKIP  Pathao’s real sandbox — set PATHAO_SANDBOX=1 (needs the internet)');
else {
	delete process.env.COURIER_STUB_URL;
	const live = { mode: 'test', credentials: { ...PATHAO_SANDBOX }, settings: { deliveryType: '48', itemType: '2' }, token: null };
	const t = await pa.test(live);
	ok('sandbox: signed in, its stores', t.ok && t.details?.stores?.length > 0, t.message);
	live.settings.store = t.details?.stores?.find(x => x.default)?.value || t.details?.stores?.[0]?.value;
	const cities = await pa.options(live, 'cities');
	ok('sandbox: cities', cities.length > 0, `${cities.length}`);
	try {
		const real = await pa.book(live, parcel(99, { invoice: `MINT-SMOKE-${stamp}` }));
		ok('sandbox: booked — a test parcel, not a real delivery', !!real.consignment, JSON.stringify(real));
		const info = await pa.status(live, real);
		ok('sandbox: its info', !!info.courierStatus, JSON.stringify(info));
	} catch (err) {
		ok('sandbox: booked', false, err.message);
	}
}

stub?.kill();
done();
