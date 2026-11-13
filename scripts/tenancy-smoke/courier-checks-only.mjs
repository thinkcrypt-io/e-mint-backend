// Couriers CR-26 (docs/couriers BUYER_CHECK.md §3a): Paperfly and CarryBee for buyer checks only — offered in
// Delivery settings with a Buyer checks login and nothing else (no keys, no test, never turned on for parcels);
// Paperfly's merchant-app sign-in + smart check, CarryBee's NextAuth sign-in (csrf → cookie → session token and
// business) + customer lookup; both counted in the buyer check, a fraud count warned about, a number CarryBee
// never carried is 0 parcels, a refused token renewed once. Backend with COURIER_STUB_URL.
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
const calls = async (courier, re) => (await (await fetch(`${STUB}/__calls`)).json()).filter(c => c.courier === courier && c.mode === 'panel' && re.test(c.path)).length;

let r = await call('POST', '/tenant/api/auth/register', { name: 'Coco Check', email: `coco${stamp}@example.com`, password: 'tenant-pass-123', organization: `Co ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Checks shop', type: 'ecommerce' }, t);
const C = `/tenant/api/p/${r.body?._id}/commerce`;
// Paperfly asked for as a delivery courier: it can't carry parcels, so it's left out.
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `CO${String(stamp).slice(-4)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['manual', 'paperfly'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}
r = await call('GET', `${C}/settings`, null, t);
ok('Paperfly is never a delivery courier: not offered, not kept', !JSON.stringify(r.body?.offered?.couriers || []).includes('paperfly') && !(r.body?.answers?.delivery?.couriers || []).includes('paperfly'), JSON.stringify({ o: r.body?.offered?.couriers, d: r.body?.answers?.delivery?.couriers }));

r = await call('GET', `${C}/couriers`, null, t);
const pf = r.body?.couriers?.find(c => c.id === 'paperfly');
const cb = r.body?.couriers?.find(c => c.id === 'carrybee');
ok('Paperfly card: checks only, no keys, its login fields and note', pf?.checksOnly === true && pf.ready === false && pf.fields.credentials.length === 0 && pf.checks?.status === 'off' && pf.checks.fields.map(f => f.key).join() === 'username,password' && /buyer checks only/.test(pf.checks.note), JSON.stringify(pf));
ok('CarryBee card: checks only, phone + password', cb?.checksOnly === true && cb.checks?.fields.map(f => f.key).join() === 'phone,password' && !cb.connection, JSON.stringify(cb));
ok('the parcel couriers come first', r.body?.couriers?.findIndex(c => c.id === 'paperfly') > r.body?.couriers?.findIndex(c => c.id === 'redx'), r.body?.couriers?.map(c => c.id).join());

r = await call('PUT', `${C}/couriers/paperfly`, { keys: {} }, t);
ok('no API connection for Paperfly: refused in plain words', r.status === 400 && /can’t send parcels with Paperfly/.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', `${C}/couriers/carrybee/test`, {}, t);
ok('…nor a test for CarryBee', r.status === 400 && /buyer checks only/.test(r.body?.message), `${r.status} ${r.body?.message}`);

// Paperfly sign-in.
r = await call('PUT', `${C}/couriers/paperfly/checks`, { keys: { username: 'owner@example.com', password: 'wrong' } }, t);
ok('Paperfly wrong password: stopped, says so', r.body?.checks?.status === 'signin' && /Paperfly refused the sign-in/.test(r.body.checks.message), JSON.stringify(r.body?.checks));
r = await call('PUT', `${C}/couriers/paperfly/checks`, { keys: { password: 'pf-pass' } }, t);
ok('Paperfly right password (sign-in kept): buyer checks on, still no connection', r.body?.checks?.status === 'on' && !r.body.connection && !JSON.stringify(r.body).includes('pf-pass'), JSON.stringify(r.body && { c: r.body.checks, conn: r.body.connection }));

// CarryBee sign-in: three steps.
r = await call('PUT', `${C}/couriers/carrybee/checks`, { keys: { phone: '01744444444', password: 'nope' } }, t);
ok('CarryBee wrong password: stopped, says so', r.body?.checks?.status === 'signin' && /CarryBee refused the sign-in/.test(r.body.checks.message), JSON.stringify(r.body?.checks));
r = await call('PUT', `${C}/couriers/carrybee/checks`, { keys: { phone: '+880 1744-444444', password: 'cb-pass' } }, t);
ok('CarryBee right login: csrf, sign-in, session → buyer checks on', r.body?.checks?.status === 'on' && (await calls('carrybee', /auth\/session/)) >= 1, JSON.stringify(r.body?.checks));

// A good buyer: Paperfly 8 + 1 partly of 10, CarryBee 6 of 6 → 15 of 16.
r = await call('GET', `${C}/buyer-check?phone=01711000000`, null, t);
let p = r.body?.sources?.find(s => s.id === 'paperfly');
let c = r.body?.sources?.find(s => s.id === 'carrybee');
ok('Paperfly via its login: 9 taken (partly counts), 1 returned, its label', p?.ok && p.via === 'panel' && p.delivered === 9 && p.refused === 1 && p.rating === 'Good customer', JSON.stringify(p));
ok('CarryBee via its login: 6 of 6', c?.ok && c.via === 'panel' && c.delivered === 6 && c.refused === 0, JSON.stringify(c));
ok('combined 15 of 16 → 94 %, Safe', r.body?.rate === 94 && r.body.level === 'safe' && r.body.parcels === 16, JSON.stringify(r.body && { rate: r.body.rate, l: r.body.level, p: r.body.parcels }));

// A risky one, with a CarryBee fraud report.
r = await call('GET', `${C}/buyer-check?phone=01800000000`, null, t);
ok('1 of 5 + 1 of 4 → 22 %, Risky, CarryBee’s fraud report warned about', r.body?.level === 'risky' && r.body.rate === 22 && r.body.warnings.some(w => /1 fraud report/.test(w)), JSON.stringify(r.body && { l: r.body.level, rate: r.body.rate, w: r.body.warnings }));

// A number CarryBee never carried: 0 parcels, not an error.
r = await call('GET', `${C}/buyer-check?phone=01733000000`, null, t);
c = r.body?.sources?.find(s => s.id === 'carrybee');
ok('never sent with CarryBee: 0 parcels, New buyer', c?.ok && c.delivered === 0 && c.refused === 0 && r.body.level === 'new', JSON.stringify(c));

// Tokens refused: each signs in once more.
const pfLogins = await calls('paperfly', /login_using_password/);
const cbLogins = await calls('carrybee', /callback\/login/);
await fetch(`${STUB}/__panel/expire`, { method: 'POST' });
r = await call('GET', `${C}/buyer-check?phone=01744000000`, null, t);
ok('tokens refused: one new sign-in each, both still answer', (await calls('paperfly', /login_using_password/)) === pfLogins + 1 && (await calls('carrybee', /callback\/login/)) === cbLogins + 1 && r.body?.sources?.find(s => s.id === 'paperfly')?.ok && r.body.sources.find(s => s.id === 'carrybee')?.ok, JSON.stringify(r.body?.sources));

// Remove the login: the card goes back to off.
r = await call('DELETE', `${C}/couriers/carrybee/checks`, null, t);
ok('Remove login: CarryBee checks off', r.status === 200 && r.body?.checks?.status === 'off', JSON.stringify(r.body?.checks));
r = await call('GET', `${C}/buyer-check?phone=01799000000&fresh=1`, null, t);
ok('…and it’s no longer asked', !r.body?.sources?.some(s => s.id === 'carrybee') && r.body?.sources?.some(s => s.id === 'paperfly'), JSON.stringify(r.body?.sources?.map(s => s.id)));

stub?.kill();
done();
