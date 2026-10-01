// Shared helpers for the tenancy smoke scripts (see README.md). Local scratch server only.
export const ROOT = 'http://localhost:5001';
export const call = async (method, path, body, token) => {
	const r = await fetch(ROOT + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: token }) }, body: body && JSON.stringify(body) });
	let j; try { j = await r.json(); } catch { j = null; }
	return { status: r.status, body: j };
};
let fails = 0;
export const ok = (label, cond, extra = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra !== '' ? ' — ' + extra : ''}`); };
export const done = () => console.log(fails ? `\n${fails} FAILED` : '\nall passed');
export const claims = t => JSON.parse(Buffer.from(t.split(' ')[1].split('.')[1], 'base64url').toString());
import fs from 'fs';
// Hand-off between scripts (tokens, ids) — local only, git-ignored.
const STATE = new URL('./.state.json', import.meta.url);
export const save = o => fs.writeFileSync(STATE, JSON.stringify(o, null, 1));
export const load = () => JSON.parse(fs.readFileSync(STATE, 'utf8'));
