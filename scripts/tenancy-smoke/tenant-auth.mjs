// Tenant auth smoke test on the scratch server (:5001). Test accounts are made up (example.com).
const ROOT = process.env.SMOKE_ROOT || 'http://localhost:5001';
const call = async (method, path, body, token) => {
	const r = await fetch(ROOT + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: token }) }, body: body && JSON.stringify(body) });
	let j; try { j = await r.json(); } catch { j = null; }
	return { status: r.status, body: j };
};
let fails = 0;
const ok = (label, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra !== '' ? ' — ' + extra : ''}`); };
const stamp = Date.now();
const email = `owner${stamp}@example.com`;
const PASS = 'tenant-pass-123';

let r = await call('POST', '/tenant/api/auth/register', { name: 'Ada Owner', email, password: PASS, organization: 'Acme Studio', country: 'BD', onboarding: { businessName: 'Acme', industry: 'agency', teamSize: '2-10', heardFrom: 'search', goals: ['website', 'crm'] } });
ok('register → token', r.status === 200 && r.body?.token?.startsWith('Bearer '), `${r.status} ${r.body?.message || ''}`);
const t1 = r.body.token;
r = await call('POST', '/tenant/api/auth/register', { name: 'Dup', email, password: PASS, organization: 'X' , country: 'BD'});
ok('duplicate email refused', r.status === 400 && r.body?.code === 'email_taken', r.status);
r = await call('POST', '/tenant/api/auth/register', { name: 'Bad', email: `bad${stamp}@example.com`, password: PASS, organization: 'X', country: 'BD', onboarding: { industry: 'not-a-thing' } });
ok('invalid onboarding answer refused', r.status === 400, r.body?.message);
r = await call('GET', '/tenant/api/auth/self', null, t1);
ok('self has organization + owner role', r.status === 200 && r.body?.organization?.name === 'Acme Studio' && r.body?.role?.system === 'owner' && r.body.permissions.includes('*'), JSON.stringify({ org: r.body?.organization?.slug, role: r.body?.role?.name }));
ok('self keeps onboarding answers', r.body?.organization?.onboarding?.industry === 'agency' && r.body.organization.onboarding.goals?.length === 2);
ok('self has no secrets', !('password' in (r.body || {})) && !('twoFactorBackupCodes' in (r.body || {})));
// Cross-kind tokens
r = await call('GET', '/admin/api/auth/self', null, t1);
ok('tenant token refused by the admin API', r.status === 401, r.status);
const admin = await call('POST', '/admin/api/auth/login', { email: 'admin@example.com', password: 'tenancy-dev-pass-1' });
r = await call('GET', '/tenant/api/auth/self', null, admin.body.token);
ok('admin token refused by the tenant API', r.status === 401, r.status);
// Login
r = await call('POST', '/tenant/api/auth/login', { email, password: 'wrong-password' });
ok('wrong password refused', r.status === 400, r.status);
r = await call('POST', '/tenant/api/auth/login', { email, password: PASS });
ok('login → token', r.status === 200 && r.body?.token, r.status);
const t2 = r.body.token;
const claims = JSON.parse(Buffer.from(t2.split(' ')[1].split('.')[1], 'base64url').toString());
ok('token carries kind + org + sid', claims.kind === 'tenant' && !!claims.org && !!claims.sid, JSON.stringify({ kind: claims.kind, org: !!claims.org }));
// 2FA
r = await call('POST', '/tenant/api/auth/2fa/enable', { password: PASS }, t2);
ok('2FA enable', r.status === 200 && r.body?.backupCodes?.length === 10, r.status);
const codes = r.body.backupCodes;
r = await call('POST', '/tenant/api/auth/login', { email, password: PASS });
ok('login with 2FA → ticket', !!r.body?.twoFactor?.ticket);
const ticket = r.body.twoFactor.ticket;
r = await call('POST', '/admin/api/auth/2fa/login/verify', { ticket, method: 'backup', code: codes[0] });
ok('tenant ticket useless on the admin 2FA', r.status === 410, `${r.status} ${r.body?.code}`);
r = await call('POST', '/tenant/api/auth/2fa/login/verify', { ticket, method: 'backup', code: codes[0] });
ok('backup code → tenant token with org', r.status === 200 && JSON.parse(Buffer.from(r.body.token.split(' ')[1].split('.')[1], 'base64url').toString()).org === claims.org, r.status);
const t3 = r.body.token;
r = await call('POST', '/tenant/api/auth/2fa/disable', { password: PASS }, t3);
ok('2FA disable', r.status === 200 && r.body?.enabled === false, r.status);
// Sessions
r = await call('GET', '/tenant/api/auth/sessions', null, t3);
ok('sessions list (tenant)', r.status === 200 && r.body?.doc?.length >= 3, `${r.body?.doc?.length}`);
r = await call('DELETE', '/tenant/api/auth/sessions/others', null, t3);
ok('sign out other devices', r.status === 200 && r.body?.count >= 2, `${r.body?.count}`);
r = await call('GET', '/tenant/api/auth/self', null, t1);
ok('signed-out device refused', r.status === 401 && r.body?.code === 'SESSION_REVOKED', `${r.status} ${r.body?.code}`);
// Self updates & passwords
r = await call('PUT', '/tenant/api/auth/update/self', { name: 'Ada O.', password: 'sneaky' }, t3);
ok('update self (unknown fields dropped)', r.status === 200 && r.body?.name === 'Ada O.', r.status);
r = await call('PUT', '/tenant/api/auth/change-password', { oldPassword: 'nope', password: 'new-pass-456' }, t3);
ok('change password needs the current one', r.status === 400, r.status);
r = await call('PUT', '/tenant/api/auth/change-password', { oldPassword: PASS, password: 'new-pass-456' }, t3);
ok('change password', r.status === 200, r.status);
r = await call('POST', '/tenant/api/auth/login', { email, password: 'new-pass-456' });
ok('login with the new password', r.status === 200, r.status);
r = await call('POST', '/tenant/api/auth/forgot-password', { email: `nobody${stamp}@example.com` });
ok('forgot password: same answer for unknown email', r.status === 200, r.status);
r = await call('POST', '/tenant/api/auth/reset-password/not-a-token', { password: 'whatever-123' });
ok('bad reset token refused', r.status === 400 && r.body?.code === 'reset_expired', r.status);
r = await call('POST', '/tenant/api/auth/logout', null, t3);
ok('logout', r.status === 200, r.status);
r = await call('GET', '/tenant/api/auth/self', null, t3);
ok('logged-out token refused', r.status === 401, r.status);
console.log(fails ? `\n${fails} FAILED` : '\nall passed');
