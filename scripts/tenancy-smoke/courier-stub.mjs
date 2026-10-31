// A stand-in for the couriers' APIs (docs/couriers): Steadfast, Pathao and RedX on one local port, for the
// courier-*.mjs smokes. Start the backend with COURIER_STUB_URL=http://127.0.0.1:<port> and every courier call
// comes here as /<courier>/<mode>/<their path>. Grows with each adapter WO (booking, status, webhooks).
//
//   node courier-stub.mjs [port]          (default 4599)
//   GET /__calls                          what was called, in order ({ courier, mode, method, path })
//   POST /__reset                         forgets the calls
//
// Keys it takes: Steadfast sf-api / sf-secret (and sf-api-2); Pathao the sandbox account published by Pathao
// or pa-client / pa-secret / owner@example.com / pa-pass; RedX rx-token.
import http from 'http';

const port = Number(process.argv[2] || process.env.COURIER_STUB_PORT || 4599);
let calls = [];

const json = (res, status, body) => {
	res.writeHead(status, { 'content-type': 'application/json' });
	res.end(JSON.stringify(body));
};

const STEADFAST_KEYS = { 'sf-api': 'sf-secret', 'sf-api-2': 'sf-secret' };
const PATHAO = [
	{ client_id: '7N1aMJQbWm', client_secret: 'wRcaibZkUdSNz2EI9ZyuXLlNrnAv0TdPUPXMnD39', username: 'test@pathao.com', password: 'lovePathao' },
	{ client_id: 'pa-client', client_secret: 'pa-secret', username: 'owner@example.com', password: 'pa-pass' },
];
const tokens = new Set();

const steadfast = (req, res, path) => {
	if (path === '/ping') return json(res, 200, { message: 'pong' });
	const ok = STEADFAST_KEYS[req.headers['api-key']] && STEADFAST_KEYS[req.headers['api-key']] === req.headers['secret-key'];
	if (!ok) return json(res, 401, { message: 'Unauthorized' });
	if (path === '/get_balance') return json(res, 200, { status: 200, current_balance: 1240 });
	json(res, 404, { message: 'Not found' });
};

const pathao = (req, res, path, body) => {
	if (path === '/aladdin/api/v1/issue-token' && req.method === 'POST') {
		const good =
			body.grant_type === 'refresh_token'
				? tokens.has(`r:${body.refresh_token}`)
				: PATHAO.some(a => a.client_id === body.client_id && a.client_secret === body.client_secret && a.username === body.username && a.password === body.password);
		if (!good) return json(res, 401, { message: 'The user credentials were incorrect.' });
		const n = Math.random().toString(36).slice(2);
		tokens.add(`a:${n}`);
		tokens.add(`r:r${n}`);
		return json(res, 200, { token_type: 'Bearer', expires_in: 432000, access_token: n, refresh_token: `r${n}` });
	}
	const t = String(req.headers.authorization || '').replace(/^Bearer /, '');
	if (!tokens.has(`a:${t}`)) return json(res, 401, { message: 'Unauthenticated.' });
	const list = data => json(res, 200, { type: 'success', code: 200, data: { data } });
	if (path === '/aladdin/api/v1/stores')
		return list([
			{ store_id: 101, store_name: 'Gulshan shop', store_address: 'Road 11, Gulshan', is_active: 1, city_id: 1, zone_id: 10, is_default_store: false },
			{ store_id: 102, store_name: 'Warehouse', store_address: 'Tejgaon', is_active: 1, city_id: 1, zone_id: 11, is_default_store: true },
			{ store_id: 103, store_name: 'Closed', store_address: 'Old', is_active: 0, city_id: 1, zone_id: 11, is_default_store: false },
		]);
	if (path === '/aladdin/api/v1/city-list') return list([{ city_id: 1, city_name: 'Dhaka' }, { city_id: 2, city_name: 'Chattogram' }]);
	if (path === '/aladdin/api/v1/cities/1/zone-list') return list([{ zone_id: 10, zone_name: 'Gulshan' }, { zone_id: 11, zone_name: 'Mirpur' }]);
	if (path === '/aladdin/api/v1/zones/11/area-list') return list([{ area_id: 1101, area_name: 'Mirpur 10', home_delivery_available: true, pickup_available: true }]);
	json(res, 404, { message: 'Not found' });
};

const redx = (req, res, path) => {
	if (req.headers['api-access-token'] !== 'Bearer rx-token') return json(res, 401, { message: 'Unauthorized' });
	if (path === '/pickup/stores') return json(res, 200, { pickup_stores: [{ id: 7001, name: 'Banani pickup', address: 'Road 5', area_name: 'Banani', area_id: 3, phone: '8801700000000' }] });
	if (path.startsWith('/areas')) {
		const q = new URL(`http://x${path}`).searchParams;
		const all = [
			{ id: 1, name: 'Mirpur DOHS', post_code: 1216, division_name: 'Dhaka', zone_id: 1 },
			{ id: 2, name: 'Agrabad', post_code: 4100, division_name: 'Chattogram', zone_id: 2 },
		];
		const pc = q.get('post_code');
		const district = q.get('district_name');
		return json(res, 200, { areas: all.filter(a => (!pc || String(a.post_code) === pc) && (!district || a.division_name.toLowerCase() === district.toLowerCase())) });
	}
	json(res, 404, { message: 'Not found' });
};

http
	.createServer((req, res) => {
		let raw = '';
		req.on('data', c => (raw += c));
		req.on('end', () => {
			if (req.url === '/__calls') return json(res, 200, calls);
			if (req.url === '/__reset') {
				calls = [];
				return json(res, 200, { ok: true });
			}
			const m = req.url.match(/^\/(steadfast|pathao|redx)\/(test|live)(\/.*)$/);
			if (!m) return json(res, 404, { message: 'Not a courier' });
			const [, courier, mode, path] = m;
			calls.push({ courier, mode, method: req.method, path });
			let body = {};
			try {
				body = raw ? JSON.parse(raw) : {};
			} catch {}
			if (courier === 'steadfast') return steadfast(req, res, path);
			if (courier === 'pathao') return pathao(req, res, path, body);
			return redx(req, res, path);
		});
	})
	.listen(port, '127.0.0.1', () => console.log(`courier stub on :${port}`));
