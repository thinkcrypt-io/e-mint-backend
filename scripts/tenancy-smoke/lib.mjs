// Shared helpers for the tenancy smoke scripts (see README.md). Local scratch server only.
export const ROOT = process.env.SMOKE_ROOT || 'http://localhost:5001';
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

/*
 * Project keys (docs/api-builder D14): the public API names a project by its key,
 * /public/api/<route>?apiKey=<key>. The scripts were written with
 * /public/api/<slug>/<route>; this rewrites those calls to the key form, the key
 * read from the scratch database (and made there first for a project from an
 * older run), so every call goes the way a real site's does. A slug no project
 * has is left as it is — the API then answers 401 api_key_missing.
 * project-keys.mjs tests the keys themselves.
 */
const SMOKE_MONGO = process.env.SMOKE_MONGO || process.env.MONGO_CONNECTION_URI || 'mongodb://127.0.0.1:27999/emint_tenancy_dev';
const keys = new Map();
export const projectKey = async slug => {
	if (keys.has(slug)) return keys.get(slug);
	if (!/127\.0\.0\.1|localhost/.test(SMOKE_MONGO)) throw new Error('SMOKE_MONGO must be a local scratch database');
	const { MongoClient } = await import('../../node_modules/mongodb/lib/index.js');
	const client = await new MongoClient(SMOKE_MONGO).connect();
	try {
		const projects = client.db().collection('tenantprojects');
		let p = await projects.findOne({ publicSlug: slug }, { projection: { apiKey: 1 } });
		if (p && !p.apiKey) {
			const crypto = await import('crypto');
			await projects.updateOne({ _id: p._id, apiKey: null }, { $set: { apiKey: `mint_pk_${crypto.randomBytes(16).toString('hex')}` } });
			p = await projects.findOne({ _id: p._id }, { projection: { apiKey: 1 } });
		}
		keys.set(slug, p?.apiKey || null);
		return p?.apiKey || null;
	} finally {
		await client.close();
	}
};
const PUBLIC_API = `${ROOT}/public/api/`;
const realFetch = globalThis.fetch;
/** fetch without the rewrite — for calling an old-style address on purpose. */
export const rawFetch = (input, init) => realFetch(input, init);
globalThis.fetch = async (input, init) => {
	const url = typeof input === 'string' ? input : input?.url;
	if (typeof url === 'string' && url.startsWith(PUBLIC_API) && !/[?&]apiKey=/.test(url)) {
		const after = url.slice(PUBLIC_API.length);
		const slug = decodeURIComponent(after.split(/[/?#]/)[0] || '');
		const key = slug && /^[a-z0-9-]+$/.test(slug) ? await projectKey(slug) : null;
		if (key) {
			let rest = after.slice(after.split(/[/?#]/)[0].length);
			if (!rest.startsWith('/')) rest = `/${rest}`;
			const [path, query = ''] = rest.split('?');
			return realFetch(`${ROOT}/public/api${path}?${query ? `${query}&` : ''}apiKey=${key}`, init);
		}
	}
	return realFetch(input, init);
};
