// E-commerce discounts (docs/ecommerce/DISCOUNTS.md EC-43…EC-45): the Discount model in every store, its six store
// automations (D1–D6); a percentage reaching products by name, category (and those under it) and collection — the
// biggest wins, never added up; switched off / on / deleted works the products out again; Price kept, Sale price and
// Price after tax from it (variants too); price edited during a sale; save checks (DS8: an ended one can't be switched
// on); the form's note; the end and start of its days on the date trigger; the till (sale price, the line's store
// discount, coupon from the sale price or the original price); the website's API; and an older store brought up to it
// by scripts/upgradeStores.js. Needs the server with AUTOMATION_TICK_MS=2000 and a local SMOKE_MONGO; the upgrade runs
// from SMOKE_BACKEND (a folder with dist/ and scripts/, default this backend).
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { call, ok, done } from './lib.mjs';
const stamp = Date.now();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uri = process.env.SMOKE_MONGO;
if (!uri || !/127\.0\.0\.1|localhost/.test(uri)) throw new Error('Set a local SMOKE_MONGO');
const { MongoClient, ObjectId } = await import('../../node_modules/mongodb/lib/index.js');
const mc = await new MongoClient(uri).connect();
const db = mc.db();

let r = await call('POST', '/tenant/api/auth/register', { name: 'Dina Discounts', email: `dina${stamp}@example.com`, password: 'tenant-pass-123', organization: `Disc ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Discount shop', type: 'ecommerce' }, t);
const shopId = r.body?._id;
const publicSlug = r.body?.publicSlug;
const P = `/tenant/api/p/${shopId}`;
const C = `${P}/commerce`;
r = await call('GET', `${C}/settings`, null, t);
ok('a BD store’s time zone is Asia/Dhaka', r.body?.answers?.store?.timeZone === 'Asia/Dhaka', r.body?.answers?.store?.timeZone);
r = await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: 'DS', timeZone: 'Mars/Olympus' } } }, t);
ok('a time zone that isn’t one refused', r.status === 400, `${r.status} ${r.body?.message}`);
r = await call(
	'PUT',
	`${C}/settings`,
	{ answers: { store: { currency: 'BDT', orderPrefix: 'DS' }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, pos: { coupons: true, tax: { mode: 'added', rates: [{ name: 'VAT', rate: 15, default: true }] } } } },
	t
);
ok('settings saved', r.status === 200, JSON.stringify(r.body?.problems || r.body?.message));
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 180; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('GET', `${C}/settings`, null, t);
let inst = r.body?.installed || {};
ok('store built with Discounts', r.body?.status === 'ready' && !!inst.discount && !!inst.product, `${r.body?.status} ${JSON.stringify(Object.keys(inst))}`);

r = await call('GET', `${P}/automations`, null, t);
const autos = (r.body?.doc || []).filter(a => /^discount\./.test(a.key || ''));
ok('D1–D6 installed as the store’s, on', autos.length === 6 && autos.every(a => a.system === 'commerce' && a.enabled), JSON.stringify(autos.map(a => [a.key, a.enabled])));
const D = k => autos.find(a => a.key === k);
ok('D5 ends at midnight after the day in Dhaka (1080 minutes after it)', D('discount.ends')?.date?.amount === 1080 && D('discount.ends')?.date?.unit === 'minutes', JSON.stringify(D('discount.ends')?.date));

const add = async (m, body) => {
	const x = await call('POST', `${P}/${inst[m].route}`, body, t);
	return x.body?.doc || x.body;
};
const get = async (m, id) => {
	const x = (await call('GET', `${P}/${inst[m].route}/${id}`, null, t)).body;
	return x?.doc || x;
};
const edit = (m, id, body) => call('PUT', `${P}/${inst[m].route}/${id}`, body, t);
const idOf = x => String(x?._id ?? x ?? '');
/** Waits for the store's automations to settle on a product's Discount %. */
const until = async (id, pct, tries = 25) => {
	let p;
	for (let i = 0; i < tries; i++) {
		p = await get('product', id);
		if ((Number(p?.discountPercent) || 0) === pct) return p;
		await sleep(400);
	}
	return p;
};

const footwear = await add('category', { name: 'Footwear' });
const shoes = await add('category', { name: 'Shoes', parent: footwear._id });
const sale = await add('collection', { name: 'Sale' });
const vat = (await call('GET', `${P}/${inst.taxRate.route}`, null, t)).body?.doc?.[0];
const shirt = await add('product', { name: 'Shirt', price: 100, collections: [sale._id], taxRate: vat?._id });
const boots = await add('product', { name: 'Boots', price: 200, category: footwear._id, taxRate: vat?._id });
const sneakers = await add('product', { name: 'Sneakers', price: 40, category: shoes._id, taxRate: vat?._id });
const hat = await add('product', { name: 'Hat', price: 50, taxRate: vat?._id });
await sleep(1500);
ok('products made, no discount: Sale price = Price, Price after tax from it', (await get('product', shirt._id)).salePrice === 100 && (await get('product', shirt._id)).priceAfterTax === 115, JSON.stringify(await get('product', shirt._id)).slice(0, 300));

// The form's note before saving (DS11).
r = await call('POST', `${C}/discount-preview`, { discount: { name: 'Eid', percent: 20, status: 'active', collections: [sale._id] } }, t);
ok('form note: “Saving gives 20% off to 1 product”', r.body?.gets === 1 && /Saving gives 20% off to 1 product/.test(r.body?.text), JSON.stringify(r.body));

// 20% on the Sale collection.
const eid = await add('discount', { name: 'Eid sale', percent: 20, collections: [sale._id] });
ok('discount saved', !!eid?._id, JSON.stringify(eid).slice(0, 200));
let p = await until(shirt._id, 20);
ok('the collection’s product: 20% off, Sale price 80, Price after tax 92 (VAT added)', p.discountPercent === 20 && p.salePrice === 80 && p.priceAfterTax === 92 && idOf(p.discount) === idOf(eid._id) && p.price === 100, JSON.stringify([p.price, p.discountPercent, p.salePrice, p.priceAfterTax, p.discount]));
r = await call('GET', `${P}/${inst.variant.route}?product=${shirt._id}`, null, t);
const sv = r.body?.doc?.[0];
ok('…its variant too', sv?.discountPercent === 20, JSON.stringify(sv).slice(0, 200));
ok('a product outside it untouched', (await get('product', hat._id)).discountPercent === 0 && (await get('product', hat._id)).salePrice === 50);

// 10% on Footwear (sub-categories on): Boots and Sneakers; the shirt — added to Footwear — keeps the bigger 20%.
await edit('product', shirt._id, { category: footwear._id });
const week = await add('discount', { name: 'Footwear week', percent: 10, categories: [footwear._id] });
p = await until(sneakers._id, 10);
ok('a product in a category under it: 10%', p.discountPercent === 10 && p.salePrice === 36, JSON.stringify([p.discountPercent, p.salePrice]));
ok('the category’s own product: 10%', (await until(boots._id, 10)).salePrice === 180);
ok('in both: the bigger one wins, never added up (20%, not 30%)', (await until(shirt._id, 20)).discountPercent === 20 && idOf((await get('product', shirt._id)).discount) === idOf(eid._id));
r = await call('POST', `${C}/discount-preview`, { id: week._id, discount: { percent: 10 } }, t);
ok('form note: 3 reached, 1 keeps a bigger one', r.body?.reach === 3 && r.body?.keepBigger === 1, JSON.stringify(r.body));

// Off → the shirt drops to 10%, not to full price; on → 20% again.
await edit('discount', eid._id, { status: 'inactive' });
p = await until(shirt._id, 10);
ok('switched off: drops to the smaller discount reaching it (10%)', p.discountPercent === 10 && idOf(p.discount) === idOf(week._id) && p.salePrice === 90, JSON.stringify([p.discountPercent, p.salePrice]));
await edit('discount', eid._id, { status: 'active' });
ok('switched on again: 20%', (await until(shirt._id, 20)).salePrice === 80);
ok('Products reached counted', (await get('discount', eid._id)).reached === 1 && (await get('discount', week._id)).reached === 2, JSON.stringify([(await get('discount', eid._id)).reached, (await get('discount', week._id)).reached]));

// Price edited during the sale: 100 → 120 → Sale price 96; the sale off → 120 (not 100, not 125).
await edit('product', shirt._id, { price: 120 });
await sleep(800);
ok('price changed during the sale: Sale price 96', (await get('product', shirt._id)).salePrice === 96);
await edit('discount', eid._id, { status: 'inactive' });
await edit('discount', week._id, { status: 'inactive' });
p = await until(shirt._id, 0);
ok('both off: back at exactly its price', p.salePrice === 120 && p.price === 120 && !p.discount, JSON.stringify([p.price, p.salePrice, p.discount]));
await edit('discount', week._id, { status: 'active' });
await until(boots._id, 10);

// Sub-categories off: Sneakers (in Shoes, under Footwear) back to 40.
await edit('discount', week._id, { subCategories: false });
ok('sub-categories off: the child category’s product back', (await until(sneakers._id, 0)).salePrice === 40);
ok('…the category’s own product keeps it', (await get('product', boots._id)).discountPercent === 10);

// A product moved into the collection (D3); deleted discount (D2).
await edit('discount', eid._id, { status: 'active' });
await edit('product', hat._id, { collections: [sale._id] });
ok('a product added to the collection gets 20% (D3)', (await until(hat._id, 20)).salePrice === 40);
await call('DELETE', `${P}/${inst.discount.route}/${week._id}`, null, t);
ok('a deleted discount: its products back (D2)', (await until(boots._id, 0)).salePrice === 200);
// A category put under another (D4).
const kids = await add('category', { name: 'Kids' });
const kidsDeal = await add('discount', { name: 'Kids deal', percent: 15, categories: [kids._id] });
await sleep(1000);
await edit('category', shoes._id, { parent: kids._id });
ok('a category moved under a discounted one: its products get it (D4)', (await until(sneakers._id, 15)).salePrice === 34);

// Save checks (DS2, DS8).
r = await call('POST', `${P}/${inst.discount.route}`, { name: 'Nothing', percent: 10 }, t);
ok('nothing picked refused', r.status === 400 && /Pick what it applies to/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', `${P}/${inst.discount.route}`, { name: 'Too much', percent: 120, products: [hat._id] }, t);
ok('more than 100% refused', r.status === 400, `${r.status} ${r.body?.message}`);
const day = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
r = await call('POST', `${P}/${inst.discount.route}`, { name: 'Backwards', percent: 5, products: [hat._id], startsAt: day(5), endsAt: day(2) }, t);
ok('ends before it starts refused', r.status === 400 && /ends before it starts/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', `${P}/${inst.discount.route}`, { name: 'Old', percent: 5, products: [hat._id], endsAt: day(-3) }, t);
ok('active with an end date passed refused', r.status === 400 && /ended on .* move the end date/.test(r.body?.message), `${r.status} ${r.body?.message}`);
const old = await add('discount', { name: 'Old', percent: 5, products: [hat._id], endsAt: day(-3), status: 'inactive' });
ok('…saved switched off is fine', !!old?._id);
r = await edit('discount', old._id, { status: 'active' });
ok('switching an ended one on refused (DS8)', r.status === 400 && /Old ended on/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await edit('discount', old._id, { status: 'active', endsAt: day(3) });
ok('…with its end date moved, it switches on', r.status === 200, `${r.status} ${r.body?.message}`);
r = await call('POST', `${P}/${inst.discount.route}/bulk/status`, { ids: [old._id], status: 'active' }, t);
ok('bulk changes refused (the store keeps some fields)', r.status === 403, `${r.status} ${r.body?.message}`);
r = await call('PUT', `${P}/${inst.product.route}/${hat._id}`, { discountPercent: 50 }, t);
ok('a product’s Discount % can’t be typed', r.status === 403, `${r.status} ${r.body?.message}`);

// A later start: nothing until its day.
const later = await add('discount', { name: 'Later', percent: 50, products: [boots._id], startsAt: day(4) });
await sleep(1500);
ok('saved active with a later start: reaches nothing yet', (await get('product', boots._id)).discountPercent === 0);
r = await call('POST', `${C}/discount-preview`, { id: later._id, discount: {} }, t);
ok('…its note says from when', /from \d+ \w+ \d{4}/.test(r.body?.text), r.body?.text);

// The till (DS10, DS15): Shirt 120 at 20% → 96; VAT 15% added on what's left.
const shirtVariant = (await call('GET', `${P}/${inst.variant.route}?product=${shirt._id}`, null, t)).body?.doc?.[0]?._id;
r = await call('POST', `${C}/quote`, { lines: [{ variant: shirtVariant, quantity: 2 }] }, t);
let l = r.body?.lines?.[0];
ok('quote: unit 96 (was 120), store discount Eid sale −20% = 48 on the line, VAT on 192', l?.unitPrice === 96 && l?.listPrice === 120 && l?.sale?.name === 'Eid sale' && l?.sale?.percent === 20 && l?.sale?.amount === 48 && r.body?.tax === 28.8 && r.body?.total === 220.8, JSON.stringify([l, r.body?.tax, r.body?.total, r.body?.problems]));
await add('coupon', { couponCode: 'TEN', type: 'percent', percentOff: 10, status: 'active' });
r = await call('POST', `${C}/quote`, { lines: [{ variant: shirtVariant, quantity: 1 }], couponCode: 'TEN' }, t);
ok('coupon 10% from the sale price (default): −9.6', r.body?.couponDiscount === 9.6, JSON.stringify([r.body?.couponDiscount, r.body?.problems]));
r = await call('PUT', `${C}/settings`, { answers: { pos: { couponBase: 'original' } } }, t);
ok('Store settings: Coupons apply to the original price', r.status === 200 && r.body?.answers?.pos?.couponBase === 'original', JSON.stringify(r.body?.problems || r.body?.message));
r = await call('POST', `${C}/quote`, { lines: [{ variant: shirtVariant, quantity: 1 }], couponCode: 'TEN' }, t);
ok('…then 10% of 120 = −12, still off the 96', r.body?.couponDiscount === 12 && r.body?.lines?.[0]?.net === 84, JSON.stringify([r.body?.couponDiscount, r.body?.lines?.[0]?.net]));
await call('PUT', `${C}/settings`, { answers: { pos: { couponBase: 'discounted' } } }, t);
r = await call('GET', `${C}/pos/setup`, null, t);
const outlet = r.body?.outlets?.[0]?._id;
const reg = r.body?.registers?.[0]?._id;
await call('POST', `${C}/stock/set`, { variant: shirtVariant, outlet, onHand: 10, reason: 'opening' }, t);
await call('POST', `${C}/shifts`, { register: reg, openingFloat: 0 }, t);
r = await call('POST', `${C}/sales`, { register: reg, lines: [{ variant: shirtVariant, quantity: 1 }], payments: [{ method: 'cash', amount: 110.4 }] }, t);
const orderId = r.body?.order?._id || r.body?._id;
const order = orderId ? await get('order', orderId) : null;
const item = order?.items?.[0];
ok('a sale keeps the store discount on its line', item?.unitPrice === 96 && item?.listPrice === 120 && item?.saleName === 'Eid sale' && item?.salePercent === 20 && item?.saleAmount === 24, `${r.status} ${JSON.stringify(item || r.body).slice(0, 300)}`);

// The website's API: Sale price, Discount % and the discount.
const models = (await call('GET', `${P}/builder/models`, null, t)).body;
const modelId = m => (models?.doc || models || []).find(x => x.route === inst[m].route)?._id || inst[m].id;
r = await call('PUT', `${P}/builder/models/${modelId('product')}/public-api`, { enabled: true, actions: ['list', 'get'], auth: 'none' }, t);
r = await call('GET', `/public/api/${publicSlug}/${inst.product.route}?name=Shirt`);
const pub = r.body?.doc?.[0];
ok('website: price, salePrice, discountPercent, the discount’s name and end', pub?.price === 120 && pub?.salePrice === 96 && pub?.discountPercent === 20 && pub?.discount?.name === 'Eid sale', `${r.status} ${JSON.stringify(pub).slice(0, 300)}`);

// The end and the start of its days, on the date trigger: moved to the next minute in the scratch database
// (the real ones are the end of today and the start of a later day in Dhaka).
const autosCol = db.collection('automations');
const nowMin = Math.floor((Date.now() - Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) / 60000);
const today = new Date().toISOString().slice(0, 10);
const ending = await add('discount', { name: 'Flash', percent: 30, products: [boots._id], endsAt: today });
ok('ends today (not over yet in Dhaka): saved and on', !!ending?._id && (await until(boots._id, 30)).salePrice === 140, JSON.stringify(ending).slice(0, 200));
await db.collection(inst.discount ? (await db.collection('modeldefinitions').findOne({ _id: new ObjectId(inst.discount.id) })).collectionName : '').updateOne({ _id: new ObjectId(later._id) }, { $set: { startsAt: new Date(`${today}T00:00:00Z`) } });
await autosCol.updateOne({ key: 'discount.ends', project: new ObjectId(shopId) }, { $set: { 'date.amount': nowMin + 1 } });
await autosCol.updateOne({ key: 'discount.starts', project: new ObjectId(shopId) }, { $set: { 'date.amount': nowMin + 1, 'date.when': 'after' } });
let ended;
for (let i = 0; i < 50; i++) {
	await sleep(2000);
	ended = await get('discount', ending._id);
	if (ended?.status === 'inactive' && (await get('product', boots._id)).discountPercent === 50) break;
}
ok('its end: switched itself off, Ended set (D5)', ended?.status === 'inactive' && !!ended?.endedAt, JSON.stringify([ended?.status, ended?.endedAt]));
ok('its start: the later one reaches its product (D6) — 50% beats nothing else now', (await get('product', boots._id)).discountPercent === 50 && (await get('product', boots._id)).salePrice === 100, JSON.stringify((await get('product', boots._id)).discountPercent));
r = await call('GET', `${P}/automations/${D('discount.ends')._id}/runs`, null, t);
ok('Runs: D5 by the date', (r.body?.doc || []).some(x => x.event === 'date' && x.status === 'success'), JSON.stringify((r.body?.doc || []).map(x => [x.event, x.status, x.error])));
r = await call('GET', `${P}/automations/${D('discount.starts')._id}/runs`, null, t);
ok('Runs: D6 by the date, working its products out', (r.body?.doc || []).some(x => x.event === 'date' && x.status === 'success' && /Worked out/.test(JSON.stringify(x.steps))), JSON.stringify((r.body?.doc || []).map(x => [x.event, x.status, x.error, x.steps?.[0]?.detail])));
r = await call('GET', `${P}/automations/${D('discount.saved')._id}/runs`, null, t);
ok('…then D1 put the prices back', (r.body?.doc || []).some(x => x.recordName === 'Flash' && x.event === 'update' && x.status === 'success' && /Worked out/.test(JSON.stringify(x.steps))), JSON.stringify((r.body?.doc || []).slice(0, 3).map(x => [x.recordName, x.event, x.steps?.[0]?.detail])));
r = await call('GET', `${P}/history?search=Shirt`, null, t);
ok('History on the product: “Store: discounts”', (r.body?.doc || []).some(h => h.userName === 'Store: discounts'), JSON.stringify((r.body?.doc || []).map(h => h.userName)).slice(0, 200));

// A store from before discounts: no Discounts model, Products and Variants without the fields, the old Price after tax.
const defs = db.collection('modeldefinitions');
const configs = db.collection('routeconfigs');
const project = new ObjectId(shopId);
const dd = await defs.findOne({ _id: new ObjectId(inst.discount.id) });
await db.collection('sidebaritems').deleteOne({ _id: dd.sidebarItem });
await configs.deleteMany({ route: dd.route, project });
await db.collection('routesettings').deleteMany({ route: dd.route, project });
await defs.deleteOne({ _id: dd._id });
await db.collection(dd.collectionName).deleteMany({ _model: dd.name });
await autosCol.deleteMany({ project, key: /^discount\./ });
await db.collection('commercesettings').updateOne({ project }, { $unset: { 'installed.discount': '', 'answers.store.timeZone': '' }, $pull: { doneOnce: 'sale-price' } });
const OLD = 'round(price * (1 + taxAdded / 100), 2)';
for (const key of ['product', 'variant']) {
	const d = await defs.findOne({ _id: new ObjectId(inst[key].id) });
	const gone = ['discount', 'discountPercent', 'salePrice'];
	await defs.updateOne(
		{ _id: d._id },
		{ $set: { fields: d.fields.filter(f => !gone.includes(f.key)).map(f => (f.key === 'priceAfterTax' ? { ...f, formula: OLD } : f)), systemFields: d.systemFields.filter(k => !gone.includes(k)), version: (d.version || 1) + 1 } }
	);
	const strip = rows => rows.map(x => (Array.isArray(x) ? x.filter(k => !gone.includes(k)) : x)).filter(x => x && !gone.includes(x) && (!Array.isArray(x) || x.length));
	const page = await configs.findOne({ route: d.route, project });
	await configs.updateOne({ _id: page._id }, { $set: { 'data.form': page.data.form.map(s => ({ ...s, fields: strip(s.fields) })) } });
	await db.collection(d.collectionName).updateMany({ _model: d.name }, { $unset: { discount: '', discountPercent: '', salePrice: '' } });
}
const prodCol = (await defs.findOne({ _id: new ObjectId(inst.product.id) })).collectionName;

const backend = process.env.SMOKE_BACKEND || fileURLToPath(new URL('../..', import.meta.url));
const run = (...args) => execFileSync('node', ['scripts/upgradeStores.js', ...args], { cwd: backend, env: { ...process.env, MONGO_CONNECTION_URI: uri }, encoding: 'utf8' });
const mine = out => {
	const lines = out.split('\n');
	const at = lines.findIndex(l => l.startsWith('Discount shop:'));
	if (at < 0) return lines.filter(l => /FAILED/.test(l)).join(' | ');
	const end = lines.findIndex((l, i) => i > at && !l.startsWith('  '));
	return lines.slice(at, end < 0 ? undefined : end).join(' | ');
};
let out = run();
ok('dry run: Discounts to build, Products to gain the fields, the time zone', /Discounts — built for this store/.test(mine(out)) && /Products — adds .*salePrice/.test(mine(out)) && /time zone/.test(mine(out)), mine(out));
ok('…and nothing written', !(await defs.findOne({ project, title: 'Discounts' })));
out = run('--apply');
ok('applied', /Discount shop:/.test(out) && !/FAILED/.test(out), mine(out));
const settings = await db.collection('commercesettings').findOne({ project });
const nd = settings.installed.discount;
ok('Discounts built and recorded; the time zone set from the country', !!nd?.id && settings.answers.store.timeZone === 'Asia/Dhaka', JSON.stringify([nd, settings.answers.store.timeZone]));
const pd = await defs.findOne({ _id: new ObjectId(inst.product.id) });
ok('Products: Discount, Discount %, Sale price; Price after tax reads Sale price', ['discount', 'discountPercent', 'salePrice'].every(k => pd.fields.some(f => f.key === k)) && pd.fields.find(f => f.key === 'priceAfterTax').formula.includes('salePrice'), JSON.stringify(pd.fields.find(f => f.key === 'priceAfterTax')));
const pc = await configs.findOne({ route: pd.route, project });
const pricing = pc.data.form.find(s => JSON.stringify(s.fields).includes('priceAfterTax'));
ok('…Sale price beside Price after tax on the form', JSON.stringify(pricing?.fields).includes('["salePrice","priceAfterTax"]'), JSON.stringify(pc.data.form.map(s => s.fields)));
const after = await db.collection(prodCol).find({ _model: pd.name }).toArray();
// Their discounts went with the old store, so each is back at its price: Price after tax as the old formula gave it.
const oldFormula = x => Math.round(x.price * (1 + (x.taxAdded || 0) / 100) * 100) / 100;
ok('the sale-price fill: Sale price = Price, Price after tax as before discounts', after.every(x => x.priceAfterTax === oldFormula(x) && x.salePrice === x.price), JSON.stringify(after.map(x => [x.name, x.price, x.salePrice, x.priceAfterTax, oldFormula(x)])));
ok('D1–D6 installed', (await autosCol.countDocuments({ project, key: /^discount\./ })) === 6);
const dc = await configs.findOne({ route: nd.route, project });
ok('the discount page gets its Products tab', (dc?.data?.viewTabs || []).some(x => x.foreignField === 'discount'), JSON.stringify(dc?.data?.viewTabs?.map(x => [x.title, x.foreignField])));
out = run('--apply');
ok('again: up to date', /Discount shop: up to date/.test(out), mine(out));
await sleep(11000);
inst = (await call('GET', `${C}/settings`, null, t)).body?.installed || inst;
const fresh = await add('discount', { name: 'After upgrade', percent: 25, products: [hat._id] });
ok('after the upgrade a discount works', !!fresh?._id && (await until(hat._id, 25)).salePrice === 37.5, JSON.stringify(fresh).slice(0, 200));

await mc.close();
r = await call('DELETE', `/tenant/api/projects/${shopId}?force=1`, null, t);
ok('project deleted', r.status === 200, r.body?.message);
done();
