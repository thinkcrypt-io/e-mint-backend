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
/** Pathao's parcels: consignment id → { merchant_order_id, order_status_slug, sent }. */
const paParcels = new Map();
let paNext = 270001;

/** Steadfast's parcels: consignment id → { invoice, status, tracking_code, cod_amount }. */
const sfParcels = new Map();
let sfNext = 9000001;
const sfBook = o => {
	const errors = {};
	if (!o.invoice) errors.invoice = ['The invoice field is required.'];
	if (!/^01\d{9}$/.test(o.recipient_phone || '')) errors.recipient_phone = ['The recipient phone must be 11 digits.'];
	if (!o.recipient_address) errors.recipient_address = ['The recipient address field is required.'];
	if ([...sfParcels.values()].some(p => p.invoice === o.invoice)) errors.invoice = ['The invoice has already been taken.'];
	if (Object.keys(errors).length) return { errors };
	const id = sfNext++;
	const p = { consignment_id: id, invoice: o.invoice, tracking_code: `SF${id}`, status: 'in_review', cod_amount: o.cod_amount, recipient_name: o.recipient_name, recipient_phone: o.recipient_phone, recipient_address: o.recipient_address, note: o.note, delivery_type: o.delivery_type };
	sfParcels.set(String(id), p);
	return { consignment: { ...p, tracking_link: `https://steadfast.com.bd/tl/${p.tracking_code}` } };
};

const steadfast = async (req, res, path, body) => {
	if (path === '/ping') return json(res, 200, { message: 'pong' });
	const ok = STEADFAST_KEYS[req.headers['api-key']] && STEADFAST_KEYS[req.headers['api-key']] === req.headers['secret-key'];
	if (!ok) return json(res, 401, { message: 'Unauthorized' });
	if (path === '/get_balance') return json(res, 200, { status: 200, current_balance: 1240 });
	if (path === '/create_order' && req.method === 'POST') {
		// An invoice with SLOW in it: booked, but the answer comes too late (Mint's 15 s limit).
		if (/SLOW/.test(`${body.invoice} ${body.note}`)) await new Promise(r => setTimeout(r, 16000));
		const r = sfBook(body);
		return r.errors ? json(res, 400, { status: 400, errors: r.errors }) : json(res, 200, { status: 200, message: 'Consignment has been created successfully.', consignment: r.consignment });
	}
	if (path === '/create_order/bulk-order/extended' && req.method === 'POST') {
		const data = (body.data || []).map(o => {
			const r = sfBook(o);
			return r.errors ? { invoice: o.invoice, status: 'error', error: Object.values(r.errors).flat() } : { ...r.consignment, status: 'success' };
		});
		return json(res, 200, { status: 200, data });
	}
	let m = path.match(/^\/status_by_cid\/(\d+)$/);
	if (m) return sfParcels.has(m[1]) ? json(res, 200, { status: 200, delivery_status: sfParcels.get(m[1]).status }) : json(res, 404, { status: 404, message: 'Consignment not found' });
	m = path.match(/^\/trackings_by_invoice\/(.+)$/);
	if (m) {
		const p = [...sfParcels.values()].find(x => x.invoice === decodeURIComponent(m[1]));
		return p ? json(res, 200, { status: 200, tracking: [{ consignment_id: p.consignment_id, tracking_code: p.tracking_code, tracking_type: 'created', text: 'Parcel created', created_at: new Date().toISOString() }] }) : json(res, 404, { status: 404, message: 'Not found' });
	}
	if (path === '/create_return_request' && req.method === 'POST') {
		const p = sfParcels.get(String(body.consignment_id));
		if (!p) return json(res, 404, { message: 'Consignment not found' });
		if (['delivered', 'partial_delivered', 'cancelled'].includes(p.status)) return json(res, 422, { message: 'Return request is not allowed for this consignment.' });
		p.returnRequested = body.reason || true;
		return json(res, 201, { status: 201, message: 'Return request created' });
	}
	json(res, 404, { message: 'Not found' });
};

const pathao = async (req, res, path, body) => {
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
	if (path === '/aladdin/api/v1/orders' && req.method === 'POST') {
		const errors = {};
		if (!body.store_id) errors.store_id = ['The store id field is required.'];
		if (!/^01\d{9}$/.test(body.recipient_phone || '')) errors.recipient_phone = ['The recipient phone format is invalid.'];
		if (String(body.recipient_address || '').length < 10) errors.recipient_address = ['The recipient address must be at least 10 characters.'];
		if (!(body.item_weight >= 0.5 && body.item_weight <= 10)) errors.item_weight = ['The item weight must be between 0.5 and 10.'];
		for (const k of ['recipient_city', 'recipient_zone', 'recipient_area']) if (k in body && !body[k]) errors[k] = [`The ${k} must not be empty.`];
		if (Object.keys(errors).length) return json(res, 422, { message: 'Please fix the given errors', type: 'error', code: 422, errors });
		const id = `DT${String(paNext++)}`;
		paParcels.set(id, { consignment_id: id, merchant_order_id: body.merchant_order_id, order_status: 'Pending', order_status_slug: 'Pending', sent: body });
		// SLOW in the instructions: booked, but the answer comes too late (Mint's 15 s limit).
		if (/SLOW/.test(body.special_instruction || '')) await new Promise(r => setTimeout(r, 16000));
		return json(res, 200, { message: 'Order Created Successfully', type: 'success', code: 200, data: { consignment_id: id, merchant_order_id: body.merchant_order_id, order_status: 'Pending', delivery_fee: 80 } });
	}
	if (path === '/aladdin/api/v1/orders/bulk' && req.method === 'POST') {
		for (const o of body.orders || []) {
			const id = `DT${String(paNext++)}`;
			paParcels.set(id, { consignment_id: id, merchant_order_id: o.merchant_order_id, order_status: 'Pending', order_status_slug: 'Pending', sent: o });
		}
		return json(res, 202, { message: 'Your bulk order creation request is accepted, please wait some time to complete order creation.', type: 'success', code: 202, data: true });
	}
	let pm = path.match(/^\/aladdin\/api\/v1\/orders\/(\w+)\/info$/);
	if (pm) return paParcels.has(pm[1]) ? json(res, 200, { type: 'success', code: 200, data: { ...paParcels.get(pm[1]), sent: undefined, updated_at: new Date().toISOString() } }) : json(res, 404, { message: 'Order not found' });
	if (path === '/aladdin/api/v1/merchant/price-plan' && req.method === 'POST') {
		if (!body.recipient_city || !body.recipient_zone) return json(res, 422, { message: 'Please fix the given errors', errors: { recipient_zone: ['The recipient zone field is required.'] } });
		return json(res, 200, { type: 'success', code: 200, data: { price: 80, discount: 0, promo_discount: 0, plan_id: 69, cod_enabled: 1, cod_percentage: 0.01, additional_charge: 0, final_price: body.item_weight > 1 ? 95 : 80 } });
	}
	if (path === '/aladdin/api/v1/city-list') return list([{ city_id: 1, city_name: 'Dhaka' }, { city_id: 2, city_name: 'Chattogram' }]);
	if (path === '/aladdin/api/v1/cities/1/zone-list') return list([{ zone_id: 10, zone_name: 'Gulshan' }, { zone_id: 11, zone_name: 'Mirpur' }]);
	if (path === '/aladdin/api/v1/zones/11/area-list') return list([{ area_id: 1101, area_name: 'Mirpur 10', home_delivery_available: true, pickup_available: true }]);
	json(res, 404, { message: 'Not found' });
};

/** RedX's parcels: tracking id → { merchant_invoice_id, status, sent, cancelRequested }. */
const rxParcels = new Map();
let rxNext = 26100001;
const redx = (req, res, path, body) => {
	if (req.headers['api-access-token'] !== 'Bearer rx-token') return json(res, 401, { message: 'Unauthorized' });
	if (path === '/parcel' && req.method === 'POST') {
		const errs = [];
		if (!body.delivery_area_id) errs.push({ message: 'delivery_area_id is required' });
		if (!/^01\d{9}$/.test(body.customer_phone || '')) errs.push({ message: 'customer_phone is invalid' });
		if (typeof body.cash_collection_amount !== 'string') errs.push({ message: 'cash_collection_amount must be a string' });
		if (errs.length) return json(res, 400, { message: 'Validation failed', validation_errors: errs });
		const id = `${rxNext++}A1B2C`;
		rxParcels.set(id, { tracking_id: id, merchant_invoice_id: body.merchant_invoice_id, status: 'pickup-pending', charge: 60, cash_collection_amount: body.cash_collection_amount, sent: body });
		return json(res, 200, { tracking_id: id });
	}
	let m = path.match(/^\/parcel\/info\/(\w+)$/);
	if (m) return rxParcels.has(m[1]) ? json(res, 200, { parcel: { ...rxParcels.get(m[1]), sent: undefined } }) : json(res, 404, { message: 'Parcel not found' });
	if (path === '/parcels' && req.method === 'PATCH') {
		const p = rxParcels.get(String(body.entity_id));
		if (!p) return json(res, 404, { success: false, message: 'Parcel not found' });
		if (['delivered', 'returned'].includes(p.status)) return json(res, 400, { success: false, message: 'Parcel can not be cancelled now' });
		p.cancelRequested = body.update_details?.reason || true;
		return json(res, 200, { success: true, message: 'Request Accepted' });
	}
	if (path.startsWith('/charge/charge_calculator')) {
		const q = new URL(`http://x${path}`).searchParams;
		if (!q.get('delivery_area_id') || !q.get('pickup_area_id')) return json(res, 400, { message: 'area ids are required' });
		return json(res, 200, { deliveryCharge: Number(q.get('weight')) > 1000 ? 80 : 60, codCharge: Math.round(Number(q.get('cash_collection_amount') || 0) * 0.01) });
	}
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
			let ctl = {};
			try {
				ctl = raw ? JSON.parse(raw) : {};
			} catch {}
			// Moves a parcel on, as the courier would: POST /__status { courier, consignment, status }.
			if (req.url === '/__status') {
				const p = ctl.courier === 'steadfast' ? sfParcels.get(String(ctl.consignment)) : ctl.courier === 'pathao' ? paParcels.get(String(ctl.consignment)) : ctl.courier === 'redx' ? rxParcels.get(String(ctl.consignment)) : null;
				if (!p) return json(res, 404, { message: 'No such parcel' });
				if (ctl.courier === 'pathao') p.order_status = p.order_status_slug = ctl.status;
				else p.status = ctl.status;
				return json(res, 200, p);
			}
			// A parcel as the courier keeps it: GET /__parcel/<courier>/<consignment>.
			const pm = req.url.match(/^\/__parcel\/(steadfast|pathao|redx)\/(\w+)$/);
			if (pm) {
				const m = pm[1] === 'steadfast' ? sfParcels : pm[1] === 'pathao' ? paParcels : rxParcels;
				return m.has(pm[2]) ? json(res, 200, m.get(pm[2])) : json(res, 404, {});
			}
			// Pathao's bulk ids, by our invoice: GET /__pathao/by-invoice/<invoice>.
			const bi = req.url.match(/^\/__pathao\/by-invoice\/(.+)$/);
			if (bi) {
				const p = [...paParcels.values()].find(x => x.merchant_order_id === decodeURIComponent(bi[1]));
				return p ? json(res, 200, p) : json(res, 404, {});
			}
			const m = req.url.match(/^\/(steadfast|pathao|redx)\/(test|live)(\/.*)$/);
			if (!m) return json(res, 404, { message: 'Not a courier' });
			const [, courier, mode, path] = m;
			calls.push({ courier, mode, method: req.method, path });
			let body = {};
			try {
				body = raw ? JSON.parse(raw) : {};
			} catch {}
			if (courier === 'steadfast') return steadfast(req, res, path, body);
			if (courier === 'pathao') return pathao(req, res, path, body);
			return redx(req, res, path, body);
		});
	})
	.listen(port, '127.0.0.1', () => console.log(`courier stub on :${port}`));
