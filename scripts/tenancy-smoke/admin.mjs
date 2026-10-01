// Admin auth smoke test against the scratch server (:5001). Dev test account from scripts/seedTenancyDev.js.
const B = 'http://localhost:5001/admin/api';
const PASS = 'tenancy-dev-pass-1';
const call = async (method, path, body, token) => {
	const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: token }) }, body: body && JSON.stringify(body) });
	let j; try { j = await r.json(); } catch { j = null; }
	return { status: r.status, body: j };
};
const ok = (label, cond, extra = '') => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);

let r = await call('POST', '/auth/login', { email: 'admin@example.com', password: PASS });
ok('login → token', r.status === 200 && r.body?.token?.startsWith('Bearer '), r.status);
const t1 = r.body.token;
r = await call('GET', '/auth/self', null, t1);
ok('self', r.status === 200 && r.body?.email === 'admin@example.com', r.status);
r = await call('GET', '/auth/sessions', null, t1);
ok('sessions list', r.status === 200 && r.body?.doc?.length >= 1, `${r.body?.doc?.length}`);
r = await call('POST', '/auth/2fa/enable', { password: PASS }, t1);
ok('2FA enable → backup codes', r.status === 200 && r.body?.backupCodes?.length === 10, r.status);
const codes = r.body.backupCodes;
r = await call('POST', '/auth/login', { email: 'admin@example.com', password: PASS });
ok('login with 2FA → ticket', r.status === 200 && !!r.body?.twoFactor?.ticket && r.body.twoFactor.methods.backup === true);
const ticket = r.body.twoFactor.ticket;
r = await call('POST', '/auth/2fa/login/verify', { ticket, method: 'backup', code: 'wrong-code' });
ok('wrong backup code refused', r.status === 400 && r.body?.code === 'wrong_code', r.status);
r = await call('POST', '/auth/2fa/login/verify', { ticket, method: 'backup', code: codes[0] });
ok('backup code → token', r.status === 200 && r.body?.token?.startsWith('Bearer '), r.status);
const t2 = r.body.token;
r = await call('GET', '/auth/2fa', null, t2);
ok('2FA status: 9 codes left', r.status === 200 && r.body?.backupCodes?.remaining === 9, JSON.stringify(r.body?.backupCodes));
r = await call('POST', '/auth/2fa/disable', { password: PASS }, t2);
ok('2FA disable', r.status === 200 && r.body?.enabled === false, r.status);
r = await call('DELETE', '/auth/sessions/current', null, t2);
ok('logout (revoke current)', r.status === 200, r.status);
r = await call('GET', '/auth/self', null, t2);
ok('revoked token refused', r.status === 401 && r.body?.code === 'SESSION_REVOKED', `${r.status} ${r.body?.code}`);
r = await call('GET', '/auth/self', null, t1);
ok('other session still valid', r.status === 200, r.status);
