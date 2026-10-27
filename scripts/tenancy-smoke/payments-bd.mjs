// Site widgets W-07b: SSLCommerz and bKash on the Payments screen, against the
// providers' real public sandboxes (needs the internet): SSLCommerz's demo store
// (testbox / qwerty) and bKash's tokenized-checkout sandbox merchant. Settings
// and their checks, checkout options by currency, real payment pages, and that
// nothing the browser brings back — a return post, an IPN, a paymentID — makes
// an order paid without the provider saying so to the server.
//
// Paying for real in the sandboxes needs a browser: `node payments-bd.mjs pay`
// leaves the two payment pages in .payments-bd.json for payments-bd-pay.mjs
// (headless Chrome), then `node payments-bd.mjs check` confirms both orders paid.
import fs from 'fs';
import { call, ok, done, ROOT } from './lib.mjs';

const SSL = { storeId: 'testbox', storePassword: 'qwerty' };
const BK = { username: 'sandboxTokenizedUser02', password: 'sandboxTokenizedUser02@12345', appKey: '4f6o0cjiki2rfm34kfdadl1eqq', appSecret: '2is7hdktrekvrbljjh44ll3d9l1dtjo4pasmjvs5vl5qr3fug4b' };
const STATE = new URL('./.payments-bd.json', import.meta.url);
const P = (pid, path = '') => `/tenant/api/p/${pid}${path}`;
const idOf = r => r.body?._id || r.body?.doc?._id;
const phase = process.argv[2] || 'all';

if (phase === 'check') {
	const st = JSON.parse(fs.readFileSync(STATE, 'utf8'));
	for (const [name, x] of Object.entries(st.paid)) {
		const r = await call('GET', `/public/api/${st.slug}/checkout/${x.ref}`);
		ok(`${name}: paid in the sandbox → the thank-you page says paid`, r.body?.status === 'paid', JSON.stringify(r.body));
		const o = await call('GET', P(st.pid, `/orders/${x.order}`), null, st.T);
		const doc = o.body?.doc || o.body;
		ok(`${name}: …the order is Paid with the provider’s reference`, doc?.status === 'paid' && !!doc.paymentReference && doc.paymentReference !== x.ref, `${doc?.status} ${doc?.paymentReference}`);
	}
	const list = await call('GET', P(st.pid, '/payments'), null, st.T);
	const paid = (list.body?.doc || []).filter(p => p.status === 'paid').map(p => p.provider).sort();
	ok('the payments list shows both, paid, with their provider', JSON.stringify(paid) === '["bkash","sslcommerz"]', JSON.stringify(paid));
	// SSLCommerz can't reach a local server's IPN address; send what it would, with the real val_id.
	if (st.paid.sslcommerz?.valId) {
		const r = await fetch(`${ROOT}/public/payments/sslcommerz/${st.slug}/ipn`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tran_id: st.paid.sslcommerz.ref, val_id: st.paid.sslcommerz.valId, status: 'VALID' }) });
		const j = await r.json();
		ok('SSLCommerz’s IPN after the return: already paid, nothing twice', j.paid === true && j.already === true, JSON.stringify(j));
	}
	const back = await fetch(`${ROOT}/public/payments/bkash/${st.slug}/return/${st.paid.bkash.ref}?paymentID=${st.paid.bkash.paymentID}&status=success`, { redirect: 'manual' });
	ok('bKash’s return opened again: still paid, sent to the thank-you page', back.status === 303 && back.headers.get('location')?.includes(st.paid.bkash.ref), `${back.status} ${back.headers.get('location')}`);
	done();
	process.exit(0);
}

/* ------------------------------------------------------------- the shop */
const stamp = Date.now();
let r = await call('POST', '/tenant/api/auth/register', { name: 'Bina Bd', email: `bina${stamp}@example.com`, password: 'tenant-pass-123', organization: `Bina ${stamp}`, country: 'BD' });
const T = r.body.token;
r = await call('POST', '/tenant/api/projects', { name: 'Bina shop', type: 'website' }, T);
const site = r.body;
const pub = path => `/public/api/${site.publicSlug}${path}`;
await call('POST', P(site._id, '/builder/models'), {
	name: 'Product', title: 'Products', displayField: 'name',
	fields: [
		{ key: 'name', label: 'Name', kind: 'text', required: true },
		{ key: 'price', label: 'Price', kind: 'number', required: true },
		{ key: 'stock', label: 'Stock', kind: 'number' },
		{ key: 'status', label: 'Status', kind: 'select', default: 'active', options: [{ value: 'draft', label: 'Draft' }, { value: 'active', label: 'Active' }] },
	],
}, T);
await call('POST', P(site._id, '/builder/models'), {
	name: 'Order', title: 'Orders', code: { enabled: true, prefix: 'ORD' },
	fields: [
		{ key: 'status', label: 'Status', kind: 'select', required: true, default: 'pending_payment', options: [{ value: 'pending_payment', label: 'Awaiting payment' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }] },
		{ key: 'items', label: 'Items', kind: 'sectionlist', fields: [{ key: 'name', label: 'Product', kind: 'text' }, { key: 'quantity', label: 'Qty', kind: 'number' }, { key: 'unitPrice', label: 'Unit price', kind: 'number' }] },
		{ key: 'total', label: 'Total', kind: 'number' },
		{ key: 'contactEmail', label: 'Email', kind: 'email', required: true },
		{ key: 'phone', label: 'Phone', kind: 'text' },
		{ key: 'paymentReference', label: 'Payment reference', kind: 'text' },
	],
}, T);
const tea = idOf(await call('POST', P(site._id, '/products'), { name: 'Sylhet tea', price: 120, stock: 50, status: 'active' }, T));
r = await call('GET', P(site._id, '/widgets/shop'), null, T);
const g = r.body.guess;
r = await call('PUT', P(site._id, '/widgets/shop'), { shop: g }, T);
ok('a Bangladeshi shop in BDT with orders', r.status === 200 && r.body.shop?.currency === 'BDT', `${r.status} ${r.body?.message} ${r.body?.shop?.currency}`);

/* ------------------------------------------------------- the settings */
r = await call('GET', P(site._id, '/payments/settings'), null, T);
ok('settings: SSLCommerz and bKash offered, both off, sandbox, the IPN address, the shop’s currency', r.status === 200 && r.body.offered.includes('sslcommerz') && r.body.offered.includes('bkash') && r.body.providers.sslcommerz.ready && r.body.providers.bkash.ready && r.body.sslcommerz.enabled === false && r.body.sslcommerz.mode === 'test' && r.body.bkash.enabled === false && r.body.sslcommerz.ipnUrl.endsWith(`/public/payments/sslcommerz/${site.publicSlug}/ipn`) && r.body.currency === 'BDT', JSON.stringify(r.body).slice(0, 400));
r = await call('PUT', P(site._id, '/payments/settings'), { sslcommerz: { enabled: true, mode: 'test', storeId: 'testbox' } }, T);
ok('SSLCommerz can’t go on without the store password', r.status === 400 && /store password/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/payments/settings'), { sslcommerz: { enabled: true, mode: 'test', storeId: 'bad id!' , storePassword: 'x' } }, T);
ok('…nor with a store id that isn’t one', r.status === 400 && /store id/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/payments/settings'), { bkash: { enabled: true, mode: 'test', username: BK.username, appKey: BK.appKey } }, T);
ok('bKash can’t go on without all four details — says which are missing', r.status === 400 && /password, app secret/.test(r.body?.message), `${r.status} ${r.body?.message}`);

r = await call('PUT', P(site._id, '/payments/settings'), { sslcommerz: { enabled: false, mode: 'test', ...SSL, storePassword: 'wrong-password' } }, T);
r = await call('POST', P(site._id, '/payments/settings/check'), { provider: 'sslcommerz' }, T);
ok('Check: SSLCommerz refuses a wrong store password (asked for real)', r.status === 400 && /refused/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/payments/settings'), { sslcommerz: { enabled: true, mode: 'test', ...SSL }, successUrl: 'https://bina.example/thanks?ref={ref}', cancelUrl: 'https://bina.example/cart' }, T);
ok('SSLCommerz saved: on, sandbox, the password only as “set”', r.status === 200 && r.body.sslcommerz.enabled && r.body.sslcommerz.storeId === 'testbox' && r.body.sslcommerz.storePasswordSet && !JSON.stringify(r.body).includes(SSL.storePassword), `${r.status} ${JSON.stringify(r.body?.sslcommerz)}`);
r = await call('POST', P(site._id, '/payments/settings/check'), { provider: 'sslcommerz' }, T);
ok('Check: the SSLCommerz sandbox accepts the demo store', r.status === 200 && r.body.ok && r.body.provider === 'sslcommerz', `${r.status} ${r.body?.message}`);

r = await call('PUT', P(site._id, '/payments/settings'), { bkash: { enabled: false, mode: 'test', ...BK, appSecret: 'wrongsecret123' } }, T);
r = await call('POST', P(site._id, '/payments/settings/check'), { provider: 'bkash' }, T);
ok('Check: bKash refuses a wrong app secret (asked for real)', r.status === 400 && /refused/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/payments/settings'), { bkash: { enabled: true, mode: 'test', ...BK } }, T);
ok('bKash saved: on, sandbox, password and secret only as “set”', r.status === 200 && r.body.bkash.enabled && r.body.bkash.passwordSet && r.body.bkash.appSecretSet && r.body.bkash.username === BK.username && !JSON.stringify(r.body).includes(BK.appSecret) && !JSON.stringify(r.body).includes(BK.password), `${r.status} ${JSON.stringify(r.body?.bkash)}`);
ok('…saving bKash left SSLCommerz as it was', r.body.sslcommerz.enabled && r.body.sslcommerz.storePasswordSet, JSON.stringify(r.body.sslcommerz));
r = await call('POST', P(site._id, '/payments/settings/check'), { provider: 'bkash' }, T);
ok('Check: the bKash sandbox grants a token', r.status === 200 && r.body.ok && r.body.provider === 'bkash', `${r.status} ${r.body?.message}`);
r = await call('PUT', P(site._id, '/payments/settings'), { bkash: { enabled: true, mode: 'live', username: BK.username, appKey: BK.appKey } }, T);
ok('switching bKash to live drops the sandbox password and secret (they don’t carry over)', r.status === 400 && /live password, app secret/.test(r.body?.message), `${r.status} ${r.body?.message}`);

r = await call('GET', pub('/checkout/options'));
ok('checkout offers SSLCommerz and bKash, in the sandbox', r.status === 200 && r.body.methods.map(m => m.provider).join() === 'sslcommerz,bkash' && r.body.methods.every(m => m.mode === 'test'), JSON.stringify(r.body));

/* --------------------------------------------- SSLCommerz: a real page */
const buyer = { email: 'Rina@Example.com', name: 'Rina Rahman', phone: '01711000000', address: { line1: '12 Road 5', city: 'Dhaka', country: 'Bangladesh' } };
r = await call('POST', pub('/checkout'), { provider: 'sslcommerz', ...buyer, lines: [{ product: tea, quantity: 2, unitPrice: 1 }] });
const s1 = r.body;
ok('SSLCommerz checkout: 240 BDT at the server’s price, a real SSLCommerz page', r.status === 200 && s1.amount === 240 && s1.currency === 'BDT' && /^https:\/\/sandbox\.sslcommerz\.com\//.test(s1.redirectUrl), `${r.status} ${JSON.stringify(r.body)}`);
r = await call('GET', pub(`/checkout/${s1.ref}`));
ok('…waiting', r.body?.status === 'pending' && r.body.provider === 'sslcommerz', JSON.stringify(r.body));
let res = await fetch(`${ROOT}/public/payments/sslcommerz/${site.publicSlug}/return/${s1.ref}/success`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tran_id: s1.ref, val_id: 'forged123456', status: 'VALID', amount: '240.00' }) });
ok('a forged “success” post (made-up val_id) → on to the thank-you page…', res.status === 303 && res.headers.get('location') === `https://bina.example/thanks?ref=${s1.ref}`, `${res.status} ${res.headers.get('location')}`);
r = await call('GET', pub(`/checkout/${s1.ref}`));
ok('…but SSLCommerz says it isn’t paid, so it isn’t', r.body?.status === 'pending', r.body?.status);
res = await fetch(`${ROOT}/public/payments/sslcommerz/${site.publicSlug}/ipn`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tran_id: s1.ref, val_id: 'forged123456', status: 'VALID' }) });
let j = await res.json();
ok('a forged IPN → received, not paid', res.status === 200 && j.received && j.status === 'pending', JSON.stringify(j));
res = await fetch(`${ROOT}/public/payments/sslcommerz/${site.publicSlug}/ipn`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tran_id: 'nosuchreference1', val_id: 'x', status: 'VALID' }) });
j = await res.json();
ok('an IPN for a reference nobody has → ignored', j.ignored === 'unknown transaction', JSON.stringify(j));

r = await call('POST', pub('/checkout'), { provider: 'sslcommerz', ...buyer, lines: [{ product: tea, quantity: 1 }] });
const s2 = r.body;
res = await fetch(`${ROOT}/public/payments/sslcommerz/${site.publicSlug}/return/${s2.ref}/cancel`, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tran_id: s2.ref, status: 'CANCELLED' }) });
ok('the buyer goes back from SSLCommerz → the cart page', res.status === 303 && res.headers.get('location') === 'https://bina.example/cart', `${res.status} ${res.headers.get('location')}`);
r = await call('GET', pub(`/checkout/${s2.ref}`));
ok('…and that payment is Cancelled', r.body?.status === 'cancelled', r.body?.status);
res = await fetch(`${ROOT}/public/payments/sslcommerz/${site.publicSlug}/return/nosuchreference1/success`, { method: 'POST', redirect: 'manual' });
ok('a return for an unknown reference → a plain 404, sent nowhere', res.status === 404, `${res.status}`);

/* ------------------------------------------------- bKash: a real page */
r = await call('POST', pub('/checkout'), { provider: 'bkash', ...buyer, lines: [{ product: tea, quantity: 1 }] });
const b1 = r.body;
ok('bKash checkout: 120 BDT, a real bKash sandbox page', r.status === 200 && b1.amount === 120 && /^https:\/\/[^/]*(bka\.sh|bkash\.com)\//.test(b1.redirectUrl), `${r.status} ${JSON.stringify(r.body)}`);
const pidOf = u => { try { return new URL(u).searchParams.get('paymentId') || new URL(u).searchParams.get('paymentID') || ''; } catch { return ''; } };
const paymentID = pidOf(b1.redirectUrl);
res = await fetch(`${ROOT}/public/payments/bkash/${site.publicSlug}/return/${b1.ref}?paymentID=TR0011forged&status=success`, { redirect: 'manual' });
r = await call('GET', pub(`/checkout/${b1.ref}`));
ok('a return with someone else’s paymentID → sent on, nothing changes', res.status === 303 && r.body?.status === 'pending', `${res.status} ${r.body?.status}`);
res = await fetch(`${ROOT}/public/payments/bkash/${site.publicSlug}/return/${b1.ref}?paymentID=${encodeURIComponent(paymentID)}&status=success`, { redirect: 'manual' });
r = await call('GET', pub(`/checkout/${b1.ref}`));
ok('“success” before the buyer approved in bKash → bKash won’t execute it, so not paid', res.status === 303 && r.body?.status !== 'paid', `${res.status} ${r.body?.status} (${paymentID})`);

r = await call('POST', pub('/checkout'), { provider: 'bkash', ...buyer, lines: [{ product: tea, quantity: 1 }] });
const b2 = r.body;
const pid2 = pidOf(b2.redirectUrl);
res = await fetch(`${ROOT}/public/payments/bkash/${site.publicSlug}/return/${b2.ref}?paymentID=${encodeURIComponent(pid2)}&status=cancel`, { redirect: 'manual' });
r = await call('GET', pub(`/checkout/${b2.ref}`));
ok('the buyer cancels in bKash → the cart page, payment Cancelled', res.status === 303 && res.headers.get('location') === 'https://bina.example/cart' && r.body?.status === 'cancelled', `${res.status} ${res.headers.get('location')} ${r.body?.status}`);

/* -------------------------------------------- currency and switching off */
await call('PUT', P(site._id, '/widgets/shop'), { shop: { ...g, currency: 'JPY' } }, T);
r = await call('GET', pub('/checkout/options'));
ok('prices in JPY → neither offered (bKash takes BDT; SSLCommerz not JPY)', r.body.methods.length === 0, JSON.stringify(r.body));
r = await call('POST', pub('/checkout'), { provider: 'bkash', ...buyer, lines: [{ product: tea, quantity: 1 }] });
ok('…and checkout refuses bKash', r.status === 400 && r.body?.code === 'provider_off', `${r.status} ${r.body?.message}`);
await call('PUT', P(site._id, '/widgets/shop'), { shop: { ...g, currency: 'USD' } }, T);
r = await call('GET', pub('/checkout/options'));
ok('prices in USD → SSLCommerz only', r.body.methods.map(m => m.provider).join() === 'sslcommerz', JSON.stringify(r.body));
await call('PUT', P(site._id, '/widgets/shop'), { shop: g }, T);

if (phase === 'pay') {
	// Fresh pages for the browser to pay.
	const one = (await call('POST', pub('/checkout'), { provider: 'sslcommerz', ...buyer, lines: [{ product: tea, quantity: 1 }] })).body;
	const two = (await call('POST', pub('/checkout'), { provider: 'bkash', ...buyer, lines: [{ product: tea, quantity: 1 }] })).body;
	fs.writeFileSync(STATE, JSON.stringify({ slug: site.publicSlug, pid: site._id, T, pay: { sslcommerz: one, bkash: two }, paid: {} }, null, 1));
	ok('two payment pages left for payments-bd-pay.mjs', !!one.redirectUrl && !!two.redirectUrl, `${one.redirectUrl} ${two.redirectUrl}`);
} else {
	await call('PUT', P(site._id, '/payments/settings'), { sslcommerz: { enabled: false, mode: 'test', storeId: 'testbox' }, bkash: { enabled: false, mode: 'test', username: BK.username, appKey: BK.appKey } }, T);
	r = await call('GET', pub('/checkout/options'));
	ok('both switched off → nothing offered', r.body.methods.length === 0, JSON.stringify(r.body));
	await call("DELETE", `/tenant/api/projects/${site._id}?force=1`, null, T);
}
done();
