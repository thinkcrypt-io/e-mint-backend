// Couriers CR-20 (docs/couriers BUYER_CHECK.md §3a): buyer checks through RedX's and Pathao's merchant websites,
// with the store's own panel login — kept sealed and never shown back; a wrong password or an SMS-code account
// stops that courier with a plain message; the token reused, renewed once when the panel stops taking it; an
// offline panel drops out of the answer; Pathao's login falls back to the API connection's; a rating-only answer
// warns without made-up counts; removing the login leaves the API connection. Backend with COURIER_STUB_URL.
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

let r = await call('POST', '/tenant/api/auth/register', { name: 'Pia Panel', email: `pia${stamp}@example.com`, password: 'tenant-pass-123', organization: `Pc ${stamp}`, country: 'BD' });
const t = r.body?.token;
r = await call('POST', '/tenant/api/projects', { name: 'Panel shop', type: 'ecommerce' }, t);
const C = `/tenant/api/p/${r.body?._id}/commerce`;
// RedX isn't one the store sends with: a store can check with a courier it doesn't use for delivery.
await call('PUT', `${C}/settings`, { answers: { store: { currency: 'BDT', orderPrefix: `PC${String(stamp).slice(-4)}` }, outlets: [{ name: 'Gulshan', code: 'GUL' }], payments: { tenders: ['cash'] }, delivery: { enabled: true, rates: [{ name: 'Inside Dhaka', amount: 60 }], couriers: ['pathao', 'manual'] } } }, t);
await call('POST', `${C}/setup`, {}, t);
for (let i = 0; i < 240; i++) {
	await sleep(1000);
	if ((await call('GET', `${C}/settings`, null, t)).body?.status !== 'building') break;
}

r = await call('GET', `${C}/couriers`, null, t);
const card = r.body?.couriers?.find(c => c.id === 'redx');
ok('RedX card: Buyer checks off, its login fields and the unofficial note', card?.checks?.status === 'off' && card.checks.fields.map(f => f.key).join() === 'phone,password' && /not its API/.test(card.checks.note), JSON.stringify(card?.checks));
ok('Steadfast has its API check, no panel login', r.body?.couriers?.find(c => c.id === 'steadfast')?.checks === null, JSON.stringify(r.body?.couriers?.find(c => c.id === 'steadfast')?.checks));

// Sign-in: wrong password, an account that gets an SMS code, then the right one.
r = await call('PUT', `${C}/couriers/redx/checks`, { keys: { phone: '01711111111', password: 'wrong' } }, t);
ok('wrong password: stopped, "Sign in again" in plain words', r.status === 200 && r.body?.checks?.status === 'signin' && /refused the sign-in/.test(r.body.checks.message), JSON.stringify(r.body?.checks));
r = await call('PUT', `${C}/couriers/redx/checks`, { keys: { phone: '01722222222', password: 'rx-pass' } }, t);
ok('an account asked for an SMS code: Mint can’t use it, says so', r.body?.checks?.status === 'otp' && /asks for a code/.test(r.body.checks.message), JSON.stringify(r.body?.checks));
r = await call('PUT', `${C}/couriers/redx/checks`, { keys: { phone: '+880 1711-111111', password: 'rx-pass' } }, t);
ok('the right login: signed in, buyer checks on', r.body?.checks?.status === 'on' && r.body.checks.lastOkAt, JSON.stringify(r.body?.checks));
ok('the password is never shown back, the phone is', r.body?.checks?.keys?.password?.set === true && r.body.checks.keys.password.value === undefined && r.body.checks.keys.phone.value === '+880 1711-111111' && !JSON.stringify(r.body).includes('rx-pass'), JSON.stringify(r.body?.checks?.keys));
ok('the API connection is untouched (not tested, nothing to book with)', !r.body?.connection?.tested, JSON.stringify(r.body?.connection?.test));

// Pathao: the API connection's sign-in is reused when the panel fields are left blank.
await call('PUT', `${C}/couriers/pathao`, { keys: { clientId: 'pa-client', clientSecret: 'pa-secret', username: 'owner@example.com', password: 'pa-pass' } }, t);
r = await call('PUT', `${C}/couriers/pathao/checks`, { keys: {} }, t);
ok('Pathao: blank fields → the API connection’s email and password, signed in', r.body?.checks?.status === 'on' && r.body.checks.reusesConnection && r.body.connection?.tested, JSON.stringify(r.body && { c: r.body.checks, t: r.body.connection?.tested }));

// A check: RedX 9 of 10 + Pathao 5 of 5 → 14 of 15, Safe.
r = await call('GET', `${C}/buyer-check?phone=01711000000`, null, t);
const rx = r.body?.sources?.find(s => s.id === 'redx');
const pa = r.body?.sources?.find(s => s.id === 'pathao');
ok('RedX via its panel: 9 delivered, 1 not, its segment', rx?.ok && rx.via === 'panel' && rx.delivered === 9 && rx.refused === 1 && rx.rating === 'Regular', JSON.stringify(rx));
ok('Pathao via its panel: 5 of 5, its rating', pa?.ok && pa.delivered === 5 && pa.refused === 0 && pa.rating === 'good_customer', JSON.stringify(pa));
ok('combined: 14 of 15 → 93 %, Safe', r.body?.rate === 93 && r.body.level === 'safe' && r.body.parcels === 15, JSON.stringify(r.body && { rate: r.body.rate, l: r.body.level, p: r.body.parcels }));

// Pathao shows only a rating; RedX says High Return.
r = await call('GET', `${C}/buyer-check?phone=01800000000`, null, t);
const pa2 = r.body?.sources?.find(s => s.id === 'pathao');
ok('Pathao rating only: no made-up counts', pa2?.ok && pa2.delivered === null && pa2.refused === null && pa2.rating === 'fraud_customer', JSON.stringify(pa2));
ok('1 of 6 with RedX → Risky, both couriers’ labels warned about', r.body?.level === 'risky' && r.body.rate === 17 && r.body.warnings.some(w => /Pathao( Courier)? rates this buyer “fraud customer”/.test(w)) && r.body.warnings.some(w => /RedX rates this buyer “High Return”/.test(w)), JSON.stringify(r.body && { l: r.body.level, rate: r.body.rate, w: r.body.warnings }));

// The token is reused; when the panel stops taking it, one new sign-in.
const logins = await calls('redx', /auth\/login/);
await call('GET', `${C}/buyer-check?phone=01733000000`, null, t);
ok('token reused: no new sign-in for the next check', (await calls('redx', /auth\/login/)) === logins, `${await calls('redx', /auth\/login/)} vs ${logins}`);
await fetch(`${STUB}/__panel/expire`, { method: 'POST' });
r = await call('GET', `${C}/buyer-check?phone=01744000000`, null, t);
ok('token refused: signed in once more, the check still answered', (await calls('redx', /auth\/login/)) === logins + 1 && r.body?.sources?.find(s => s.id === 'redx')?.ok && r.body.sources.find(s => s.id === 'pathao')?.ok, `${await calls('redx', /auth\/login/)} vs ${logins + 1} ${JSON.stringify(r.body?.sources)}`);

// RedX's check offline: it drops out, Pathao still answers.
r = await call('GET', `${C}/buyer-check?phone=01900000000`, null, t);
const rx3 = r.body?.sources?.find(s => s.id === 'redx');
ok('RedX offline: drops out with a plain reason, the answer still comes', r.status === 200 && rx3 && !rx3.ok && /offline/.test(rx3.error) && r.body.sources.find(s => s.id === 'pathao')?.ok, JSON.stringify(r.body?.sources));
r = await call('GET', `${C}/couriers`, null, t);
ok('the card shows the last error and when it last worked', /offline/.test(r.body?.couriers?.find(c => c.id === 'redx')?.checks?.lastError?.message || '') && r.body.couriers.find(c => c.id === 'redx').checks.lastOkAt, JSON.stringify(r.body?.couriers?.find(c => c.id === 'redx')?.checks));

// A login that stops: its source says why, and isn't asked.
await call('PUT', `${C}/couriers/redx/checks`, { keys: { password: 'changed-on-redx' } }, t);
const before = await calls('redx', /customer-success-return-rate/);
r = await call('GET', `${C}/buyer-check?phone=01755000000`, null, t);
const rx4 = r.body?.sources?.find(s => s.id === 'redx');
ok('password changed on RedX: the source says sign in again, RedX not asked', rx4 && !rx4.ok && rx4.skipped && /refused the sign-in/.test(rx4.error) && (await calls('redx', /customer-success-return-rate/)) === before, JSON.stringify(rx4));

// Removing the login: RedX gone from the checks; Pathao's API connection stays when its login goes.
r = await call('DELETE', `${C}/couriers/redx/checks`, null, t);
ok('RedX login removed: off, nothing kept', r.body?.checks?.status === 'off' && !r.body.checks.keys.password.set && !r.body.checks.keys.phone.set, JSON.stringify(r.body?.checks));
r = await call('DELETE', `${C}/couriers/pathao/checks`, null, t);
ok('Pathao login removed, its API connection still tested', r.body?.checks?.status === 'off' && r.body.connection?.tested, JSON.stringify(r.body && { c: r.body.checks?.status, t: r.body.connection?.tested }));
r = await call('GET', `${C}/buyer-check?phone=01766000000&fresh=1`, null, t);
ok('no panel logins: no courier sources', r.status === 200 && r.body.sources.length === 0, JSON.stringify(r.body?.sources));
r = await call('PUT', `${C}/couriers/steadfast/checks`, { keys: {} }, t);
ok('Steadfast has no panel login to set', r.status === 400, `${r.status}`);

stub?.kill();
done();
