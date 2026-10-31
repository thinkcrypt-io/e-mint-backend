import { fingerprint } from '../../../../lib/crypto/secret.js';
import { CourierAdapter, Conn, TestResult } from './types.js';
import { CourierError, baseUrl, courierFetch, courierWords } from './http.js';

/**
 * Steadfast (docs/couriers CONNECTING.md § Steadfast): API key + secret key on
 * every call, no token, no sandbox. A wrong key is a 401, and ten of those in
 * five minutes lock the key out for an hour — so a 401 is never retried.
 */

const LIVE = 'https://portal.packzy.com/api/v1';
const base = (conn: Conn) => baseUrl('steadfast', 'live', LIVE);
const headers = (conn: Conn) => ({ 'Api-Key': conn.credentials.apiKey || '', 'Secret-Key': conn.credentials.secretKey || '' });

const taka = (n: any) => `৳${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

const test = async (conn: Conn): Promise<TestResult> => {
	if (!conn.credentials.apiKey || !conn.credentials.secretKey) return { ok: false, message: 'Paste both the API key and the secret key from Steadfast’s API page.' };
	try {
		const ping = await courierFetch('Steadfast', `${base(conn)}/ping`);
		if (ping.status >= 500) return { ok: false, message: 'Steadfast isn’t answering right now — try again in a few minutes.' };
		const r = await courierFetch('Steadfast', `${base(conn)}/get_balance`, { headers: headers(conn) });
		if (r.status === 401 || r.status === 403)
			return { ok: false, rejected: true, message: 'Steadfast refused these keys. Copy the API key and secret key again from Steadfast’s API page — after ten wrong tries Steadfast blocks the key for an hour.' };
		if (r.status === 429) return { ok: false, message: 'Steadfast has blocked this key for a while after too many wrong tries — wait an hour, then test again.' };
		if (r.status !== 200 || r.body?.current_balance === undefined) return { ok: false, message: `Steadfast answered: ${courierWords(r.body) || `error ${r.status}`}` };
		return {
			ok: true,
			message: `Connected — balance ${taka(r.body.current_balance)}`,
			accountKey: fingerprint(`steadfast:${conn.credentials.apiKey}`),
			details: { balance: Number(r.body.current_balance) || 0 },
		};
	} catch (e: any) {
		if (e instanceof CourierError) return { ok: false, message: e.message };
		throw e;
	}
};

export const steadfast: CourierAdapter = {
	id: 'steadfast',
	name: 'Steadfast',
	countries: ['BD'],
	sandbox: false,
	ready: false,
	links: {
		signUp: 'https://steadfast.com.bd/register',
		keys: 'https://steadfast.com.bd/user/api',
		webhook: 'https://steadfast.com.bd/user/webhook/add',
	},
	credentials: [
		{ key: 'apiKey', label: 'API key', secret: true, helper: 'Steadfast → API → a key named “Mint”' },
		{ key: 'secretKey', label: 'Secret key', secret: true },
	],
	settings: [
		{
			key: 'deliveryType',
			label: 'Delivery',
			kind: 'select',
			options: [
				{ value: '0', label: 'To the customer’s door' },
				{ value: '1', label: 'Customer picks it up at a Steadfast point' },
			],
			default: '0',
		},
	],
	ownWebhookSecret: true,
	test,
};
