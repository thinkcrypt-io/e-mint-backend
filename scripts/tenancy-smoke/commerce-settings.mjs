// E-commerce EC-02 (docs/ecommerce): the `ecommerce` project type, its store settings and the sidebar's Store section.
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const PASS = 'tenant-pass-123';
let r = await call('POST', '/tenant/api/auth/register', { name: 'Sam Store', email: `sam${stamp}@example.com`, password: PASS, organization: `Shop ${stamp}`, country: 'BD' });
const sam = r.body?.token;
ok('owner signs up (Bangladesh)', !!sam, r.body?.message);
r = await call('POST', '/tenant/api/auth/register', { name: 'Uma US', email: `uma${stamp}@example.com`, password: PASS, organization: `US ${stamp}`, country: 'US' });
const uma = r.body?.token;

r = await call('POST', '/tenant/api/projects', { name: 'Corner shop', type: 'ecommerce' }, sam);
ok('an e-commerce project is made', r.status === 200 && r.body?.type === 'ecommerce', r.body?.message);
const shop = r.body?._id;
const P = `/tenant/api/p/${shop}`;
r = await call('POST', '/tenant/api/projects', { name: 'Notes', type: 'app' }, sam);
const app = r.body?._id;

r = await call('GET', `${P}/commerce/settings`, null, sam);
const v = r.body;
ok('settings start new, on the first step', r.status === 200 && v?.status === 'new' && v?.step === 'store', JSON.stringify({ s: v?.status, st: v?.step, m: v?.message }));
ok('currency from the country (BDT)', v?.answers?.store?.currency === 'BDT' && v?.offered?.currency === 'BDT', v?.answers?.store?.currency);
ok('BD tenders: cash, card, bank, bKash/Nagad/Rocket by reference — no generic wallet', ['cash', 'card', 'bank', 'wallet:bkash', 'wallet:nagad', 'wallet:rocket'].every(t => v?.offered?.tenders?.some(x => x.id === t)) && !v?.offered?.tenders?.some(x => x.id === 'wallet'), JSON.stringify(v?.offered?.tenders?.map(t => t.id)));
ok('BD gateways: Stripe, SSLCommerz, bKash', ['stripe', 'sslcommerz', 'bkash'].every(g => v?.offered?.gateways?.some(x => x.id === g)), JSON.stringify(v?.offered?.gateways));
ok('BD couriers: Steadfast, Pathao, RedX', ['steadfast', 'pathao', 'redx'].every(c => v?.offered?.couriers?.some(x => x.id === c)));
ok('defaults: one store outlet, variations on with Size and Colour', v?.answers?.outlets?.length === 1 && v.answers.outlets[0].kind === 'store' && v.answers.products.variations && v.answers.products.options.join() === 'Size,Colour');
ok('defaults need nothing more', Object.keys(v?.needs || {}).length === 0, JSON.stringify(v?.needs));

r = await call('PUT', `${P}/commerce/settings`, { answers: { store: { currency: 'bdt', orderPrefix: 'cs' } }, step: 'outlets' }, sam);
ok('a step saves on its own and moves the wizard on', r.status === 200 && r.body?.answers?.store?.currency === 'BDT' && r.body.answers.store.orderPrefix === 'CS' && r.body.step === 'outlets', r.body?.message);
r = await call('PUT', `${P}/commerce/settings`, { answers: { store: { currency: 'taka' } } }, sam);
ok('a bad currency is refused with a plain reason', r.status === 400 && r.body?.problems?.store?.[0]?.includes('currency'), r.body?.message);
r = await call('PUT', `${P}/commerce/settings`, { answers: { outlets: [] } }, sam);
ok('no outlets refused', r.status === 400 && /at least one outlet/i.test(r.body?.message));
r = await call('PUT', `${P}/commerce/settings`, { answers: { outlets: [{ name: 'Dhanmondi', code: 'DHK' }, { name: 'Mirpur', code: 'dhk' }] } }, sam);
ok('two outlets with one code refused', r.status === 400 && /same code/.test(r.body?.message), r.body?.message);
r = await call('PUT', `${P}/commerce/settings`, { answers: { outlets: [{ name: 'Depot', code: 'WH', kind: 'warehouse' }] } }, sam);
ok('only warehouses refused (the POS sells from stores)', r.status === 400 && /must be a store/.test(r.body?.message));
r = await call('PUT', `${P}/commerce/settings`, { answers: { outlets: [{ name: 'Dhanmondi', code: 'dhk-1', phone: '01700000000' }, { name: 'Depot', code: 'WH', kind: 'warehouse' }] } }, sam);
ok('a store and a warehouse saved', r.status === 200 && r.body?.answers?.outlets?.length === 2 && r.body.answers.outlets[0].code === 'DHK-1', r.body?.message);
r = await call('PUT', `${P}/commerce/settings`, { answers: { products: { variations: true, options: [] } } }, sam);
ok('variations with no option refused', r.status === 400 && r.body?.problems?.products);
r = await call('PUT', `${P}/commerce/settings`, { answers: { products: { variations: false, options: ['Size'] } } }, sam);
ok('variations off drops the options', r.status === 200 && r.body?.answers?.products?.options?.length === 0);
r = await call('PUT', `${P}/commerce/settings`, { answers: { payments: { tenders: ['cash', 'wallet:bkash', 'paypal'], custom: ['Gift voucher'], gateways: ['sslcommerz', 'square'] } } }, sam);
ok('tenders and gateways not offered are dropped', r.status === 200 && r.body?.answers?.payments?.tenders?.join() === 'cash,wallet:bkash' && r.body.answers.payments.gateways.join() === 'sslcommerz' && r.body.answers.payments.custom[0] === 'Gift voucher', JSON.stringify(r.body?.answers?.payments));
r = await call('PUT', `${P}/commerce/settings`, { answers: { payments: { tenders: [], custom: [] } } }, sam);
ok('no way to pay refused', r.status === 400);
r = await call('PUT', `${P}/commerce/settings`, { answers: { returns: { allowed: true, windowDays: -2 } } }, sam);
ok('a negative return window refused', r.status === 400 && r.body?.problems?.returns);
r = await call('PUT', `${P}/commerce/settings`, { answers: { returns: { storeCredit: false, refundMethods: ['cash', 'store-credit'] } } }, sam);
ok('store credit off drops it as a refund method', r.status === 200 && r.body?.answers?.returns?.refundMethods?.join() === 'cash');
r = await call('PUT', `${P}/commerce/settings`, { answers: { delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }, { name: '', amount: -1 }], couriers: ['steadfast'] } } }, sam);
ok('a shipping rate with no name or amount refused', r.status === 400 && r.body?.problems?.delivery?.length === 2, JSON.stringify(r.body?.problems));
r = await call('PUT', `${P}/commerce/settings`, { answers: { delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }, { name: 'Outside Dhaka', amount: 120 }], couriers: ['steadfast', 'fedex'] } } }, sam);
ok('delivery with rates and Steadfast saved; unknown courier dropped', r.status === 200 && r.body?.answers?.delivery?.couriers?.join() === 'steadfast' && r.body.answers.delivery.rates.length === 2);
r = await call('PUT', `${P}/commerce/settings`, { answers: { pos: { tax: { mode: 'added', rates: [] } } } }, sam);
ok('tax with no rate refused', r.status === 400 && /tax rate/.test(r.body?.message));
r = await call('PUT', `${P}/commerce/settings`, { answers: { pos: { tax: { mode: 'inclusive', rates: [{ name: 'VAT', rate: 15 }, { name: 'Reduced', rate: 5 }] }, receipt: { size: 'a4' } } } }, sam);
ok('VAT inclusive: the first rate becomes the default; receipt A4', r.status === 200 && r.body?.answers?.pos?.tax?.rates?.[0]?.default === true && r.body.answers.pos.receipt.size === 'a4' && r.body.answers.pos.receipt.footer, JSON.stringify(r.body?.answers?.pos));
r = await call('PUT', `${P}/commerce/settings`, { answers: { pos: { tax: { mode: 'added', rates: [{ name: 'A', rate: 5, default: true }, { name: 'B', rate: 7, default: true }] } } } }, sam);
ok('two default tax rates refused', r.status === 400);
r = await call('GET', `${P}/commerce/settings`, null, sam);
ok('everything kept', r.body?.answers?.store?.orderPrefix === 'CS' && r.body.answers.outlets.length === 2 && r.body.answers.pos.tax.mode === 'inclusive' && r.body.step === 'outlets');

r = await call('GET', `${P}/sidebar/admin/server`, null, sam);
const store = (r.body || []).find(i => i.title === 'Store' || i.name === 'Store');
const flat = JSON.stringify(r.body || []);
ok('sidebar: a Store section with Set up your store', r.status === 200 && flat.includes('/store/setup') && !flat.includes('/store/pos'), flat.slice(0, 300));

r = await call('GET', `/tenant/api/p/${app}/commerce/settings`, null, sam);
ok('an app project has no store (404)', r.status === 404);
r = await call('GET', `${P}/commerce/settings`, null, uma);
ok("another organization can't read it", r.status === 404);

r = await call('POST', '/tenant/api/projects', { name: 'US shop', type: 'ecommerce' }, uma);
r = await call('GET', `/tenant/api/p/${r.body?._id}/commerce/settings`, null, uma);
ok('US: USD, Stripe only, a generic wallet, only the manual courier', r.body?.answers?.store?.currency === 'USD' && r.body.offered.gateways.map(g => g.id).join() === 'stripe' && r.body.offered.tenders.some(t => t.id === 'wallet') && r.body.offered.couriers.map(c => c.id).join() === 'manual', JSON.stringify(r.body?.offered));

r = await call('POST', '/tenant/api/projects', { name: 'Payments', type: 'app' }, sam);
r = await call('POST', `/tenant/api/p/${app}/builder/models/preview`, { name: 'Payment', route: 'payments', title: 'Payments', fields: [{ key: 'amount', kind: 'number' }] }, sam);
ok('a model can no longer take the route /payments', r.status !== 200 || JSON.stringify(r.body).includes('payments'), JSON.stringify(r.body).slice(0, 200));

r = await call('DELETE', `/tenant/api/projects/${shop}`, null, sam);
ok('the store project deletes with its settings', r.status === 200, r.body?.message);
done();
