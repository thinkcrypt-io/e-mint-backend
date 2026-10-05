// Site widgets W-06: payments. Checkout prices the cart on the server, writes
// the order as waiting for payment and opens a Stripe Checkout page; only a
// correctly signed Stripe webhook — confirmed by asking Stripe again — makes it
// paid, once. A stand-in Stripe runs in this test on 127.0.0.1:12111: start the
// backend with STRIPE_API_BASE=http://127.0.0.1:12111 (ignored in production).
import http from 'http';
import crypto from 'crypto';
import { call, ok, done, ROOT } from './lib.mjs';

/* ------------------------------------------------------- a stand-in Stripe */
const GOOD_KEY = 'sk_test_goodkey123';
const HOOK = 'whsec_testsigning123';
const sessions = new Map();
let n = 0;
const readBody = req => new Promise(r => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => r(b)); });
const fake = http.createServer(async (req, res) => {
	const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
	if (req.headers.authorization !== `Bearer ${GOOD_KEY}`) return send(401, { error: { message: 'Invalid API Key provided' } });
	if (req.method === 'GET' && req.url === '/v1/balance') return send(200, { object: 'balance' });
	if (req.method === 'POST' && req.url === '/v1/checkout/sessions') {
		const p = new URLSearchParams(await readBody(req));
		const id = `cs_test_${++n}`;
		const s = { id, url: `https://checkout.stripe.test/${id}`, amount_total: Number(p.get('line_items[0][price_data][unit_amount]')), currency: p.get('line_items[0][price_data][currency]'), client_reference_id: p.get('client_reference_id'), payment_status: 'unpaid', status: 'open', payment_intent: null, success_url: p.get('success_url'), customer_email: p.get('customer_email') };
		sessions.set(id, s);
		return send(200, s);
	}
	const m = req.url.match(/^\/v1\/checkout\/sessions\/([\w]+)$/);
	if (req.method === 'GET' && m && sessions.has(m[1])) return send(200, sessions.get(m[1]));
	send(404, { error: { message: 'No such thing' } });
});
await new Promise(r => fake.listen(12111, '127.0.0.1', r));
const sign = raw => { const t = Math.floor(Date.now() / 1000); return `t=${t},v1=${crypto.createHmac('sha256', HOOK).update(`${t}.${raw}`).digest('hex')}`; };
const hook = async (slug, event, signature) => {
	const raw = JSON.stringify(event);
	const r = await fetch(`${ROOT}/public/payments/stripe/${slug}`, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature ?? sign(raw) }, body: raw });
	return { status: r.status, body: await r.json().catch(() => null) };
};
const completed = id => ({ id: `evt_${id}`, type: 'checkout.session.completed', data: { object: { id, payment_status: 'paid' } } });

/* ------------------------------------------------------------- the shop */
const stamp = Date.now();
const P = (pid, path = '') => `/tenant/api/p/${pid}${path}`;
const idOf = r => r.body?._id || r.body?.doc?._id;
let r = await call('POST', '/tenant/api/auth/register', { name: 'Pia Pay', email: `pia${stamp}@example.com`, password: 'tenant-pass-123', organization: `Pia ${stamp}`, country: 'BD' });
const T = r.body.token;
r = await call('POST', '/tenant/api/projects', { name: 'Pia shop', type: 'website' }, T);
const site = r.body;
const pub = path => `/public/api/${site.publicSlug}${path}`;
await call('POST', P(site._id, '/builder/models'), {
	name: 'Product', title: 'Products', displayField: 'name',
	fields: [
		{ key: 'name', label: 'Name', kind: 'text', required: true },
		{ key: 'sku', label: 'SKU', kind: 'text' },
		{ key: 'price', label: 'Price', kind: 'number', required: true },
		{ key: 'stock', label: 'Stock', kind: 'number' },
		{ key: 'status', label: 'Status', kind: 'select', default: 'active', options: [{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }] },
		{ key: 'variants', label: 'Variants', kind: 'sectionlist', fields: [{ key: 'name', label: 'Variant', kind: 'text' }, { key: 'priceChange', label: 'Price +/-', kind: 'number' }, { key: 'stock', label: 'Stock', kind: 'number' }] },
	],
}, T);
r = await call('POST', P(site._id, '/builder/models'), {
	name: 'Order', title: 'Orders', code: { enabled: true, prefix: 'ORD' },
	fields: [
		{ key: 'status', label: 'Status', kind: 'select', required: true, default: 'pending_payment', options: [{ value: 'pending_payment', label: 'Awaiting payment' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }] },
		{ key: 'items', label: 'Items', kind: 'sectionlist', fields: [{ key: 'sku', label: 'SKU', kind: 'text' }, { key: 'name', label: 'Product', kind: 'text' }, { key: 'variant', label: 'Variant', kind: 'text' }, { key: 'quantity', label: 'Qty', kind: 'number' }, { key: 'unitPrice', label: 'Unit price', kind: 'number' }] },
		{ key: 'total', label: 'Total', kind: 'number' },
		{ key: 'contactEmail', label: 'Email', kind: 'email', required: true },
		{ key: 'shippingAddress', label: 'Ship to', kind: 'section', fields: [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'line1', label: 'Address', kind: 'text' }, { key: 'city', label: 'City', kind: 'text' }, { key: 'postcode', label: 'Postcode', kind: 'text' }] },
		{ key: 'paymentReference', label: 'Payment reference', kind: 'text' },
	],
}, T);
const orderDef = idOf(r);
ok('a products model and an orders model', r.status === 201, `${r.status} ${r.body?.message}`);
await call('PUT', P(site._id, `/builder/models/${orderDef}/public-api`), { enabled: true, actions: ['list', 'get', 'create'], auth: 'customer', ownerOnly: true }, T);
const candle = idOf(await call('POST', P(site._id, '/products'), { name: 'Fig candle', sku: 'CN-FIG', price: 28, stock: 5, status: 'active', variants: [{ name: 'Small', priceChange: -8, stock: 2 }, { name: 'Large', priceChange: 0, stock: 3 }] }, T));
const mug = idOf(await call('POST', P(site._id, '/products'), { name: 'Speckled mug', sku: 'CR-MUG', price: 22, stock: 3, status: 'active' }, T));

r = await call('GET', P(site._id, '/widgets/shop'), null, T);
const g = r.body.guess;
ok('the orders model is recognised: items, status values, email, address, total, payment reference', g?.order?.model === 'Order' && g.order.fields.items === 'items' && g.order.statuses.pending === 'pending_payment' && g.order.statuses.paid === 'paid' && g.order.statuses.cancelled === 'cancelled' && g.order.fields.email === 'contactEmail' && g.order.fields.address === 'shippingAddress' && g.order.fields.total === 'total' && g.order.fields.paymentReference === 'paymentReference' && g.order.item.unitPrice === 'unitPrice' && g.order.item.sku === 'sku', JSON.stringify(g?.order));
r = await call('PUT', P(site._id, '/widgets/shop'), { shop: { ...g, order: { ...g.order, statuses: { pending: 'paid', paid: 'paid' } } } }, T);
ok('waiting and paid can’t be the same status', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/widgets/shop'), { shop: { ...g, order: { ...g.order, statuses: { pending: 'pending_payment', paid: 'shipped' } } } }, T);
ok('…and must be the status’s own choices', r.status === 400 && /choices/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/widgets/shop'), { shop: g }, T);
ok('shop with orders saved', r.status === 200 && r.body.shop?.order?.model === 'Order', `${r.status} ${r.body?.message}`);
r = await call('GET', P(site._id, `/builder/models/${orderDef}`), null, T);
const ro = r.body?.publicApi?.readOnlyFields || r.body?.doc?.publicApi?.readOnlyFields || [];
ok('…and the order’s status and payment reference became read-only on the public API', ro.includes('status') && ro.includes('paymentReference'), JSON.stringify(ro));
await call('PUT', P(site._id, '/widgets'), { widgets: { cart: { enabled: true } } }, T);

/* ------------------------------------------------------- payment settings */
r = await call('GET', pub('/checkout/options'));
ok('no way to pay yet', r.status === 200 && r.body.methods.length === 0, JSON.stringify(r.body));
r = await call('POST', pub('/checkout'), { provider: 'stripe', email: 'x@example.com', lines: [{ product: mug, quantity: 1 }] });
ok('checkout refuses a provider that isn’t on', r.status === 400 && r.body?.code === 'provider_off', `${r.status} ${r.body?.message}`);
r = await call('GET', P(site._id, '/payments/settings'), null, T);
ok('settings: Stripe off, offered in Bangladesh with SSLCommerz and bKash, the webhook address to give Stripe', r.status === 200 && r.body.stripe.enabled === false && ['stripe', 'sslcommerz', 'bkash'].every(p => r.body.offered.includes(p)) && r.body.stripe.webhookUrl.endsWith(`/public/payments/stripe/${site.publicSlug}`), JSON.stringify(r.body));
r = await call('PUT', P(site._id, '/payments/settings'), { stripe: { enabled: true, mode: 'test' } }, T);
ok('Stripe can’t go on without a secret key', r.status === 400 && /secret key/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/payments/settings'), { stripe: { enabled: false, mode: 'test', secretKey: 'sk_live_abc123' } }, T);
ok('a live key in test mode is refused', r.status === 400 && /test secret key/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/payments/settings'), { stripe: { enabled: true, mode: 'test', secretKey: GOOD_KEY } }, T);
ok('…nor without the webhook signing secret', r.status === 400 && /signing secret/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/payments/settings'), { stripe: { enabled: true, mode: 'test', publishableKey: 'pk_test_abc', secretKey: GOOD_KEY, webhookSecret: HOOK }, successUrl: 'https://pia.example/thanks?ref={ref}', cancelUrl: 'https://pia.example/cart' }, T);
ok('saved: keys only as “set”, never sent back', r.status === 200 && r.body.stripe.enabled && r.body.stripe.secretKeySet && r.body.stripe.webhookSecretSet && !JSON.stringify(r.body).includes(GOOD_KEY) && !JSON.stringify(r.body).includes(HOOK), JSON.stringify(r.body).slice(0, 300));
r = await call('POST', P(site._id, '/payments/settings/check'), {}, T);
ok('the key works (Stripe asked)', r.status === 200 && r.body.ok, `${r.status} ${r.body?.message}`);
r = await call('GET', pub('/checkout/options'));
ok('the site may now offer card payments, in test mode', r.body.methods.length === 1 && r.body.methods[0].provider === 'stripe' && r.body.methods[0].mode === 'test', JSON.stringify(r.body));

/* ----------------------------------------------------------- a guest pays */
r = await call('POST', pub('/checkout'), { provider: 'stripe', lines: [{ product: mug, quantity: 1 }] });
ok('checkout needs an email', r.status === 400 && r.body?.code === 'email_required', `${r.status} ${r.body?.message}`);
r = await call('POST', pub('/checkout'), { provider: 'stripe', email: 'g@example.com', lines: [{ product: mug, quantity: 9 }] });
ok('a cart that changed (more than in stock) → 409 with the cart as it is', r.status === 409 && r.body?.code === 'cart_changed' && r.body.cart?.lines?.[0]?.problem === 'limited', `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
r = await call('POST', pub('/checkout'), {
	provider: 'stripe', email: 'Guest@Example.com', name: 'Gita Guest', address: { name: 'Gita Guest', line1: '5 Lake Road', city: 'Dhaka', postcode: '1212' },
	lines: [{ product: candle, variant: 'Small', quantity: 2, unitPrice: 0.01 }, { product: mug, quantity: 1, price: 0 }],
});
const one = r.body;
const s1 = sessions.get([...sessions.keys()].pop());
ok('checkout: the order at the server’s prices, a Stripe page to go to', r.status === 200 && one.amount === 62 && one.currency === 'BDT' && one.redirectUrl === s1?.url && one.order?.code?.startsWith('ORD'), `${r.status} ${JSON.stringify(r.body)}`);
ok('…Stripe was asked for 6200 (paisa) in bdt, with our reference and the thank-you page', s1?.amount_total === 6200 && s1.currency === 'bdt' && s1.client_reference_id === one.ref && s1.success_url === `https://pia.example/thanks?ref=${one.ref}` && s1.customer_email === 'guest@example.com', JSON.stringify(s1));
r = await call('GET', P(site._id, `/orders/${one.order._id}`), null, T);
const ord = r.body?.doc || r.body;
ok('the order in the panel: awaiting payment, items with SKU and prices, total, address', ord?.status === 'pending_payment' && ord.items?.length === 2 && ord.items.some(i => i.sku === 'CN-FIG' && i.variant === 'Small' && i.unitPrice === 20 && i.quantity === 2) && ord.total === 62 && ord.shippingAddress?.city === 'Dhaka' && ord.contactEmail === 'guest@example.com', JSON.stringify(ord));
r = await call('GET', pub(`/checkout/${one.ref}`));
ok('the thank-you page sees it waiting', r.status === 200 && r.body.status === 'pending' && r.body.amount === 62 && r.body.order.code === one.order.code, JSON.stringify(r.body));

/* ---------------------------------------------------- nobody else can pay it */
r = await hook(site.publicSlug, completed(s1.id), 't=1,v1=forged');
ok('a webhook with a forged signature → 400', r.status === 400, `${r.status} ${r.body?.message}`);
r = await hook(site.publicSlug, completed(s1.id));
r = await call('GET', P(site._id, `/orders/${one.order._id}`), null, T);
ok('a correctly signed webhook, but Stripe says unpaid → still awaiting payment', (r.body?.doc || r.body).status === 'pending_payment', (r.body?.doc || r.body).status);
r = await call('POST', pub('/auth/register'), { name: 'Fred', email: `fred${stamp}@example.com`, password: 'customer-pass-1' });
const F = `Bearer ${r.body.token}`;
r = await call('POST', pub('/orders'), { status: 'paid', paymentReference: 'pi_fake', contactEmail: 'fred@example.com', items: [{ name: 'Mug', quantity: 1, unitPrice: 0 }] }, F);
ok('a customer posting an order straight to the API can’t make it paid', r.status === 201 && r.body.status === 'pending_payment' && !r.body.paymentReference, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);

/* -------------------------------------------------------- the real thing */
s1.payment_status = 'paid';
s1.status = 'complete';
s1.payment_intent = 'pi_test_111';
r = await hook(site.publicSlug, completed(s1.id));
ok('Stripe confirms → the webhook marks it paid', r.status === 200 && r.body.paid === true, JSON.stringify(r.body));
r = await call('GET', P(site._id, `/orders/${one.order._id}`), null, T);
ok('…the order is Paid, with Stripe’s payment reference', (r.body?.doc || r.body).status === 'paid' && (r.body?.doc || r.body).paymentReference === 'pi_test_111', JSON.stringify(r.body?.doc || r.body).slice(0, 200));
r = await call('GET', pub(`/shop/products/${candle}`));
const smallAfter = r.body.variants?.find(v => v.name === 'Small')?.stock;
ok('…stock went down: the product’s and the variant’s', r.body.stock === 3 && smallAfter === 0, `${r.body.stock} ${smallAfter}`);
r = await hook(site.publicSlug, completed(s1.id));
r = await call('GET', pub(`/shop/products/${mug}`));
ok('the same webhook again (Stripe retries) changes nothing — stock lowered once', r.body.stock === 2, `${r.body.stock}`);
r = await call('GET', pub(`/checkout/${one.ref}`));
ok('the thank-you page now says paid', r.body.status === 'paid' && r.body.paidAt && r.body.lines.length === 2, JSON.stringify(r.body));

/* --------------------------------------------------- the wrong amount, expiry */
r = await call('POST', pub('/checkout'), { provider: 'stripe', email: 'h@example.com', lines: [{ product: mug, quantity: 1 }] });
const two = r.body;
const s2 = sessions.get([...sessions.keys()].pop());
Object.assign(s2, { payment_status: 'paid', status: 'complete', amount_total: 100, payment_intent: 'pi_test_222' });
r = await hook(site.publicSlug, completed(s2.id));
r = await call('GET', P(site._id, `/orders/${two.order._id}`), null, T);
ok('paid, but not the amount asked for → the order stays unpaid, the payment says why', (r.body?.doc || r.body).status === 'pending_payment', (r.body?.doc || r.body).status);
r = await call('POST', pub('/checkout'), { provider: 'stripe', email: 'i@example.com', lines: [{ product: mug, quantity: 1 }] });
const s3 = sessions.get([...sessions.keys()].pop());
s3.status = 'expired';
r = await hook(site.publicSlug, { id: 'evt_x', type: 'checkout.session.expired', data: { object: { id: s3.id } } });
ok('an abandoned Stripe page → the payment expires', r.status === 200 && r.body.status === 'expired', JSON.stringify(r.body));

/* ----------------------------------------- a signed-in customer's own cart */
r = await call('POST', pub('/auth/register'), { name: 'Sara', email: `sara${stamp}@example.com`, password: 'customer-pass-1' });
const S = `Bearer ${r.body.token}`;
await call('PUT', pub('/cart'), { lines: [{ product: candle, variant: 'Large', quantity: 1 }] }, S);
r = await call('POST', pub('/checkout'), { provider: 'stripe' }, S);
const three = r.body;
ok('signed in: their saved cart, their account’s email', r.status === 200 && three.amount === 28, `${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
const s4 = sessions.get([...sessions.keys()].pop());
Object.assign(s4, { payment_status: 'paid', status: 'complete', payment_intent: 'pi_test_444' });
await hook(site.publicSlug, completed(s4.id));
r = await call('GET', pub('/cart'), null, S);
ok('…paid, and their cart is empty again', r.body.lines.length === 0, JSON.stringify(r.body.lines));
r = await call('GET', pub('/orders'), null, S);
ok('…the order is in their own orders, paid', r.body.doc?.length === 1 && r.body.doc[0].status === 'paid', JSON.stringify(r.body.doc?.map(o => o.status)));

/* ---------------------------------------------------------------- panel */
r = await call('GET', P(site._id, '/payments'), null, T);
const st = r.body.doc?.map(p => p.status) || [];
ok('the payments list: paid, failed (wrong amount) with the reason, expired', st.filter(x => x === 'paid').length === 2 && st.includes('failed') && st.includes('expired') && r.body.doc.some(p => p.status === 'failed' && /expected/.test(p.error)), st.join());
r = await call('GET', P(site._id, '/payments'));
ok('needs a sign-in', r.status === 401, r.status);
r = await call('PUT', P(site._id, '/payments/settings'), { stripe: { enabled: false, mode: 'test' } }, T);
r = await call('GET', pub('/checkout/options'));
ok('Stripe off → nothing offered', r.body.methods.length === 0, JSON.stringify(r.body));

fake.close();
done();
