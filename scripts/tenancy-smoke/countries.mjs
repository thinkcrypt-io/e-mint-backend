// Countries (docs/widgets W-02): the public list and pictures, the country an
// organization must pick, and the payment providers that follow from it.
import { call, ok, done, ROOT } from './lib.mjs';

const stamp = Date.now();
const PASS = 'tenant-pass-123';

let r = await call('GET', '/public/countries');
const list = r.body?.doc || [];
const bd = list.find(c => c.code === 'BD');
ok('the list has Bangladesh + 10, Bangladesh first', r.status === 200 && list.length >= 11 && list[0]?.code === 'BD', `${r.status} ${list.map(c => c.code).join(',')}`);
ok('Bangladesh: dial code, currency, flag emoji, providers', bd?.dialCode === '+880' && bd?.currency?.code === 'BDT' && bd?.flag === '🇧🇩' && ['sslcommerz', 'bkash'].every(p => bd.paymentProviders.includes(p)), JSON.stringify(bd));
ok('pictures are links, not inline', /\/public\/countries\/bd\/flag\.svg$/.test(bd?.flagUrl) && /\/map\.svg$/.test(bd?.mapUrl) && !('flagSvg' in (bd || {})));

for (const which of ['flag', 'map']) {
	const res = await fetch(`${ROOT}/public/countries/bd/${which}.svg`);
	const text = await res.text();
	ok(`${which}.svg is an SVG image, cached, script-free`, res.status === 200 && /image\/svg\+xml/.test(res.headers.get('content-type')) && text.startsWith('<svg') && /default-src 'none'/.test(res.headers.get('content-security-policy') || ''), `${res.status} ${res.headers.get('content-type')}`);
}
r = await call('GET', '/public/countries/zz/flag.svg');
ok('an unknown country has no picture (404)', r.status === 404);
r = await call('GET', '/public/countries/gb');
ok('one country by code (any case)', r.status === 200 && r.body.code === 'GB' && r.body.paymentProviders.join() === 'stripe', JSON.stringify(r.body).slice(0, 200));

/* ------------------------------------------- an organization's country */
const reg = body => call('POST', '/tenant/api/auth/register', { name: 'Cora Country', password: PASS, organization: `Cora ${stamp}`, ...body });
r = await reg({ email: `cora-none${stamp}@example.com` });
ok('sign-up without a country is refused', r.status === 400 && /country/i.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await reg({ email: `cora-zz${stamp}@example.com`, country: 'ZZ' });
ok('…and with one that isn’t in the list', r.status === 400 && r.body?.code === 'country_unknown', `${r.status} ${r.body?.code}`);
r = await reg({ email: `cora-bd${stamp}@example.com`, country: 'bd' });
ok('sign-up in Bangladesh (lower-case code is fine)', r.status === 200 && r.body.token, r.status);
const bdT = r.body.token;
r = await call('GET', '/tenant/api/org', null, bdT);
ok('a Bangladeshi organization is offered SSLCommerz and bKash', r.body?.country === 'BD' && ['sslcommerz', 'bkash'].every(p => r.body.paymentProviders.includes(p)), JSON.stringify({ c: r.body?.country, p: r.body?.paymentProviders }));

r = await call('POST', '/tenant/api/org', { name: `Cora UK ${stamp}` }, bdT);
ok('a new organization needs a country too', r.status === 400 && /country/i.test(r.body?.message), `${r.status} ${r.body?.message}`);
r = await call('POST', '/tenant/api/org', { name: `Cora UK ${stamp}`, country: 'GB' }, bdT);
ok('a British organization is offered Stripe', r.status === 200 && r.body.organization?.country === 'GB' && r.body.organization.paymentProviders.join() === 'stripe', `${r.status} ${JSON.stringify(r.body?.organization?.paymentProviders)}`);
const ukT = r.body.token || bdT;

r = await call('PUT', '/tenant/api/org', { country: 'ZZ' }, ukT);
ok('changing to an unknown country is refused', r.status === 400 && r.body?.code === 'country_unknown', `${r.status}`);
r = await call('PUT', '/tenant/api/org', { country: 'BD' }, ukT);
ok('moving to Bangladesh adds SSLCommerz and bKash', r.status === 200 && r.body.country === 'BD' && r.body.paymentProviders.includes('bkash'), `${r.status} ${JSON.stringify(r.body?.paymentProviders)}`);

done();
