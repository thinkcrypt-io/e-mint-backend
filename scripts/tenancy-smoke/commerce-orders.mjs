// E-commerce EC-06 (docs/ecommerce): pricing (line discount, coupon, tax added), POS sales on a shift with split
// tenders and cash change, refusals that leave nothing behind, held sales, orders by hand with delivery and part
// payment, paying the rest, fulfilment, cancel (stock and money back), and the shift's count.
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
let r = await call('POST', '/tenant/api/auth/register', { name: 'Oli Orders', email: `oli${stamp}@example.com`, password: 'tenant-pass-123', organization: `Orders ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Tee shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
r = await call(
	'PUT',
	`${C}/settings`,
	{
		answers: {
			store: { currency: 'BDT', orderPrefix: 'TS' },
			outlets: [{ name: 'Gulshan', code: 'GUL' }],
			payments: { tenders: ['cash', 'card', 'wallet:bkash'] },
			delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }] },
			pos: { tax: { mode: 'added', rates: [{ name: 'VAT', rate: 5, default: true }] } },
		},
	},
	t
);
ok('settings saved', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 180; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('GET', `${C}/pos/setup`, null, t);
const GUL = r.body?.outlets?.[0]?._id;
const REG = r.body?.registers?.[0]?._id;
ok('the POS setup: one outlet, its register, the ways to pay', GUL && REG && r.body.tenders.map(x => x.id).join() === 'cash,card,wallet:bkash,store-credit', JSON.stringify(r.body?.tenders));

const variantOf = async pid => {
	for (let i = 0; i < 20; i++) {
		const v = (await call('GET', `${P}/variants?product=${pid}`, null, t)).body?.doc?.[0]?._id;
		if (v) return v;
		await sleep(300);
	}
};
const tee = await variantOf((await call('POST', `${P}/products`, { name: 'Tee', price: 1000, status: 'active', sku: 'TEE' }, t)).body?.doc?._id);
const cap = await variantOf((await call('POST', `${P}/products`, { name: 'Cap', price: 500, status: 'active', sku: 'CAP' }, t)).body?.doc?._id);
await call('POST', `${C}/stock/set`, { variant: tee, outlet: GUL, onHand: 10, reason: 'opening' }, t);
await call('POST', `${C}/stock/set`, { variant: cap, outlet: GUL, onHand: 5, reason: 'opening' }, t);
const onHand = async v => (await call('GET', `${C}/lookup?code=${v === tee ? 'TEE' : 'CAP'}&outlet=${GUL}`, null, t)).body?.onHand;
await call('POST', `${P}/coupons`, { couponCode: 'SAVE100', type: 'fixed', value: 100, usageLimit: 1 }, t);
const cust = (await call('POST', `${P}/store-customers`, { name: 'Rina', phone: '01700000000', address: 'Road 5, Banani' }, t)).body?.doc?._id;
ok('two products with stock, a coupon and a customer', tee && cap && cust);

// Pricing.
const basket = { lines: [{ variant: tee, quantity: 2, discount: { type: 'percent', value: 10 } }, { variant: cap, quantity: 1 }], couponCode: 'save100' };
r = await call('POST', `${C}/quote`, { ...basket, outlet: GUL }, t);
ok('quote: 2300 less 10% on the tees and 100 off, VAT 5% added → 2310', r.body?.subtotal === 2500 && r.body?.discount === 300 && r.body?.tax === 110 && r.body?.total === 2310 && r.body?.coupon?.code === 'SAVE100', JSON.stringify([r.body?.subtotal, r.body?.discount, r.body?.tax, r.body?.total, r.body?.problems]));
ok('…the coupon shared over the lines it covers', r.body?.lines?.[0]?.couponDiscount + r.body?.lines?.[1]?.couponDiscount === 100);

// A sale needs an open shift.
const sale = body => call('POST', `${C}/sales`, { register: REG, ...body }, t);
r = await sale({ ...basket, payments: [{ method: 'cash', amount: 2310 }] });
ok('no shift open: the sale is refused', r.status === 409 && r.body?.code === 'no_shift', r.body?.message);
r = await call('POST', `${C}/shifts`, { register: REG, openingFloat: 500 }, t);
const shift = r.body?.doc?._id;
ok('a shift opens with 500 in the drawer', r.status === 201 && !!shift, r.body?.message);
r = await call('POST', `${C}/shifts`, { register: REG, openingFloat: 0 }, t);
ok('a second shift on the same register is refused', r.status === 409);

// Refusals leave nothing behind.
r = await sale({ ...basket, payments: [{ method: 'cash', amount: 2000 }] });
ok('short by 310: refused', r.status === 400 && r.body?.code === 'not_paid' && /310/.test(r.body?.message), r.body?.message);
r = await sale({ lines: [{ variant: cap, quantity: 6 }], payments: [{ method: 'cash', amount: 5000 }] });
ok('more caps than in stock: refused with the reason', r.status === 400 && /Only 5 of Cap/.test(r.body?.problems?.join()), JSON.stringify(r.body));
r = await sale({ ...basket, payments: [{ method: 'card', amount: 3000 }] });
ok('a card paying more than due is refused (only cash gives change)', r.status === 400);
r = await sale({ ...basket, customer: cust, payments: [{ method: 'store-credit', amount: 310 }, { method: 'cash', amount: 2000 }] });
ok('store credit the customer hasn’t got: refused…', r.status === 409 && r.body?.code === 'not_enough_credit', r.body?.message);
ok('…and the stock it took is back (10 tees, 5 caps)', (await onHand(tee)) === 10 && (await onHand(cap)) === 5);
r = await call('GET', `${P}/coupons?couponCode=SAVE100`, null, t);
ok('…and the coupon wasn’t used', (r.body?.doc?.[0]?.used || 0) === 0, JSON.stringify(r.body?.doc?.[0]?.used));
r = await call('GET', `${P}/orders`, null, t);
ok('…and no order was left', (r.body?.doc || []).length === 0);

// The sale: card + cash with change.
r = await sale({ ...basket, customer: cust, payments: [{ method: 'card', amount: 1000, reference: 'slip 22' }, { method: 'cash', amount: 1400 }] });
const o1 = r.body?.order;
ok('the sale goes through: completed, paid, numbered TS…', r.status === 201 && o1?.status === 'completed' && o1?.paymentStatus === 'paid' && o1?.paid === 2310 && o1?.balance === 0 && /^TS/.test(o1?.code), JSON.stringify(o1 && [o1.status, o1.paymentStatus, o1.paid, o1.balance, o1.code]) || r.body?.message);
const cash1 = r.body?.payments?.find(p => p.method === 'cash');
ok('cash took 1310 and gave 90 change', cash1?.amount === 1310 && cash1?.change === 90 && cash1?.tendered === 1400, JSON.stringify(cash1));
ok('stock moved out (8 tees, 4 caps), logged against the order', (await onHand(tee)) === 8 && (await onHand(cap)) === 4 && r.body?.movements?.length === 2 && r.body.movements.every(m => m.reason === 'sale' && m.reference === o1?.code));
r = await call('GET', `${P}/coupons?couponCode=SAVE100`, null, t);
ok('the coupon was used once', r.body?.doc?.[0]?.used === 1);
r = await call('POST', `${C}/quote`, { ...basket, outlet: GUL }, t);
ok('…so it’s used up now', r.body?.problems?.some(p => /used up/.test(p)), JSON.stringify(r.body?.problems));
r = await call('GET', `${P}/store-customers/${cust}`, null, t);
let c = r.body?.doc || r.body;
ok('the customer’s orders and spend follow', c?.ordersCount === 1 && c?.spent === 2310, JSON.stringify([c?.ordersCount, c?.spent]));
r = await call('POST', `${P}/orders`, { channel: 'pos', total: 1 }, t);
ok('orders can’t be written through the plain table', r.status === 403);

// Held sales.
r = await call('POST', `${C}/held`, { register: REG, lines: [{ variant: tee, quantity: 1 }], note: 'back in 5' }, t);
const held = r.body?.doc?._id;
ok('a basket is held, nothing moves', r.status === 201 && r.body?.doc?.status === 'held' && (await onHand(tee)) === 8);
r = await call('GET', `${C}/held?register=${REG}`, null, t);
ok('it’s listed at the register', r.body?.docs?.length === 1);
r = await sale({ lines: [{ variant: tee, quantity: 1 }], heldId: held, payments: [{ method: 'cash', amount: 1050 }] });
ok('resumed and paid: sold, and gone from the held list', r.status === 201 && (await call('GET', `${C}/held?register=${REG}`, null, t)).body?.docs?.length === 0);

// An order by phone, with delivery, paid in part.
r = await call('POST', `${C}/orders`, { outlet: GUL, customer: cust, lines: [{ variant: cap, quantity: 1 }], delivery: { rate: 'Inside Dhaka' }, payments: [{ method: 'wallet:bkash', amount: 200, reference: 'TX9' }] }, t);
const o2 = r.body?.order;
ok('a phone order: shipping from the rate, total 585, 200 paid, 385 due', r.status === 201 && o2?.channel === 'manual' && o2?.shipping === 60 && o2?.total === 585 && o2?.paid === 200 && o2?.balance === 385 && o2?.paymentStatus === 'partial', JSON.stringify(o2 && [o2.shipping, o2.total, o2.paid, o2.balance]) || r.body?.message);
ok('…addressed to the customer', o2?.delivery?.address === 'Road 5, Banani' && o2?.delivery?.name === 'Rina');
r = await call('POST', `${C}/orders/${o2?._id}/pay`, { payments: [{ method: 'cash', amount: 400 }] }, t);
ok('paying the rest in cash: 385 taken, 15 change', r.status === 200 && r.body?.order?.paymentStatus === 'paid' && r.body.payments.at(-1).amount === 385 && r.body.payments.at(-1).change === 15, r.body?.message);
r = await call('POST', `${C}/orders/${o2?._id}/pay`, { payments: [{ method: 'cash', amount: 1 }] }, t);
ok('nothing owed: paying again is refused', r.status === 409);
r = await call('POST', `${C}/orders/${o2?._id}/fulfil`, { to: 'shipped' }, t);
ok('shipped', r.body?.order?.fulfilment === 'shipped');
r = await call('POST', `${C}/orders/${o2?._id}/fulfil`, { to: 'fulfilled' }, t);
ok('can’t go back to packed', r.status === 409);
r = await call('POST', `${C}/orders/${o2?._id}/cancel`, {}, t);
ok('a shipped order can’t be cancelled (it’s a return)', r.status === 409 && /return/.test(r.body?.message));
r = await call('POST', `${C}/orders/${o2?._id}/fulfil`, { to: 'delivered' }, t);
ok('delivered completes it', r.body?.order?.status === 'completed' && !!r.body.order.completedAt);

// Cancel: stock and money back.
r = await call('POST', `${C}/orders`, { outlet: GUL, customer: cust, lines: [{ variant: tee, quantity: 2 }], payments: [{ method: 'cash', amount: 2100 }] }, t);
const o3 = r.body?.order;
ok('another order, paid in full (2100)', o3?.paymentStatus === 'paid' && (await onHand(tee)) === 5, r.body?.message);
r = await call('POST', `${C}/orders/${o3?._id}/cancel`, { reason: 'changed their mind', register: REG }, t);
const back = r.body;
ok('cancelled: status, refunded in cash, nothing owed', back?.order?.status === 'cancelled' && back.order.paymentStatus === 'refunded' && back.order.refunded === 2100 && back.order.balance === 0, JSON.stringify(back?.order && [back.order.status, back.order.paymentStatus, back.order.refunded, back.order.balance]) || back?.message);
ok('…the tees are back (7)', (await onHand(tee)) === 7 && back?.movements?.some(m => m.reason === 'cancel' && m.change === 2));
r = await call('POST', `${C}/orders/${o3?._id}/cancel`, {}, t);
ok('cancelling twice is refused', r.status === 409);
r = await call('GET', `${P}/store-customers/${cust}`, null, t);
c = r.body?.doc || r.body;
ok('the customer’s count drops back (2 orders, 2895 spent)', c?.ordersCount === 2 && c?.spent === 2895, JSON.stringify([c?.ordersCount, c?.spent]));

// The shift: cash in and out, the count.
r = await call('POST', `${C}/shifts/${shift}/cash`, { type: 'out', amount: 100, reason: 'tea' }, t);
ok('cash out 100', r.status === 200 && r.body?.cashOut === 100);
r = await call('GET', `${C}/shifts/current?register=${REG}`, null, t);
// 500 float + 1310 + 1050 cash sales − 2100 cash refund (cancel on this register) − 100 out; the phone order's cash wasn't on a shift.
ok('expected cash = 500 + 2360 taken − 2100 refunded − 100 out = 660', r.body?.expectedCash === 660, JSON.stringify([r.body?.expectedCash, r.body?.totals]));
r = await call('POST', `${C}/shifts/${shift}/close`, { countedCash: 650 }, t);
ok('closed with 650 counted: 10 short', r.status === 200 && r.body?.shift?.status === 'closed' && r.body.shift.difference === -10, JSON.stringify(r.body?.shift?.difference) || r.body?.message);
r = await sale({ lines: [{ variant: tee, quantity: 1 }], payments: [{ method: 'cash', amount: 1050 }] });
ok('no sales once the shift is closed', r.status === 409 && r.body?.code === 'no_shift');

r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('cleaned up', r.status === 200);
done();
