import crypto from 'crypto';
import CourierConnection from '../../models/tenancy/courierConnection.model.js';
import { fingerprint, open, seal } from '../../../lib/crypto/secret.js';
import { runUnscoped } from '../tenantScope.function.js';
import { TenancyError } from '../tenancy.function.js';
import { commerceView, offeredFor } from './settings.js';
import { storeOf } from './store.js';
import { adapterOf } from './couriers/index.js';
import { CourierError } from './couriers/http.js';
import { PATHAO_SANDBOX } from './couriers/pathao.js';
import type { Conn, CourierAdapter, OptionKind, Token } from './couriers/types.js';

/**
 * A store's courier accounts (docs/couriers CR3, CR4, CR18): each courier
 * turned on in Store settings → Delivery is connected with the store's own
 * merchant keys, tested, and given a webhook address. Keys are sealed and
 * never leave here — the panel learns only whether each is set. Runs in the
 * project's scope.
 */

const SECRETS = '+credentials +token +webhookSecret';
const DAY = 24 * 3600 * 1000;
const OPTIONS: OptionKind[] = ['stores', 'cities', 'zones', 'areas'];

const sealed = (v: string) => {
	try {
		return seal(v);
	} catch {
		throw new TenancyError(500, 'This server can’t store keys yet (SECRET_ENCRYPTION_KEY isn’t set) — tell MINT’s team.', 'secret_key_missing');
	}
};
const opened = (v?: string) => {
	if (!v) return '';
	try {
		return open(v);
	} catch {
		return '';
	}
};
const asObject = (m: any): Record<string, string> => (m instanceof Map ? Object.fromEntries(m) : m || {});

/** The webhook secret Mint makes: letters, digits, - and _ (what Steadfast's form takes). */
const newSecret = () => crypto.randomBytes(24).toString('base64url');

const adapterFor = (id: string): CourierAdapter => {
	const a = adapterOf(id);
	if (!a) throw new TenancyError(404, 'There’s no such courier');
	return a;
};

/** The couriers this store's country offers, and which Delivery turned on. */
const offered = async (project: any) => {
	const [o, view] = await Promise.all([offeredFor(project), commerceView(project)]);
	const d = view.answers?.delivery || { enabled: false, couriers: [] };
	return { ids: o.couriers.map((c: any) => c.id) as string[], on: new Set<string>(d.enabled ? d.couriers || [] : []) };
};

/** All of a connection's keys, opened: the secret ones from their seals, the others as kept. */
const keysOf = (adapter: CourierAdapter, doc: any): Record<string, string> => {
	const secret = asObject(doc?.credentials);
	const shown = asObject(doc?.public);
	return Object.fromEntries(adapter.credentials.map(f => [f.key, f.secret ? opened(secret[f.key]) : shown[f.key] || '']));
};

/** The keys a test passed with, as a hash (a key changed → untested). */
const hashOf = (mode: string, keys: Record<string, string>) => fingerprint(`${mode}|${Object.keys(keys).sort().map(k => `${k}=${keys[k]}`).join('|')}`);

/** What an adapter is handed: the keys opened, the token kept back on the connection when it changes. */
export const connOf = (adapter: CourierAdapter, doc: any): Conn => {
	const t = doc?.token;
	return {
		mode: adapter.sandbox ? doc?.mode || 'live' : 'live',
		credentials: keysOf(adapter, doc),
		settings: doc?.settings || {},
		token: t?.access ? { access: opened(t.access), refresh: opened(t.refresh), expiresAt: t.expiresAt } : null,
		saveToken: async (x: Token) => {
			if (!doc?._id) return;
			await CourierConnection.updateOne({ _id: doc._id }, { $set: { token: { access: sealed(x.access), refresh: x.refresh ? sealed(x.refresh) : '', expiresAt: x.expiresAt } } });
		},
	};
};

const load = (courier: string) => CourierConnection.findOne({ courier }).select(SECRETS).lean() as Promise<any>;

/** Where the courier sends its updates: the connection's own address (CR9); RedX sends no signature, so its secret rides in the address. */
const webhookOf = (adapter: CourierAdapter, doc: any, origin: string) => {
	if (!doc?._id) return null;
	const secret = opened(doc.webhookSecret);
	const url = `${origin}/public/couriers/${adapter.id}/${doc._id}${adapter.id === 'redx' ? `?token=${secret}` : ''}`;
	return {
		url,
		...(adapter.id !== 'redx' && { secret }),
		pasted: !!doc.webhookSecretPasted,
		lastAt: doc.lastWebhookAt || null,
		refusedCalls: doc.refusedCalls || 0,
		panel: adapter.links.webhook || null,
	};
};

/** Other projects connected to the same courier account (CR18) — counted, never named. */
const sharedWith = async (doc: any) => {
	if (!doc?.accountKey) return 0;
	return runUnscoped(() => CourierConnection.countDocuments({ courier: doc.courier, accountKey: doc.accountKey, _id: { $ne: doc._id }, 'test.ok': true }));
};

/** One courier as Store settings shows it: no secret key, only whether each is set. */
const viewOf = async (adapter: CourierAdapter, doc: any, on: boolean, origin: string, openParcels = 0) => {
	const keys = doc ? keysOf(adapter, doc) : {};
	const tested = !!doc?.test?.ok && doc.test.keysHash === hashOf(connOf(adapter, doc).mode, keys);
	const shared = doc ? await sharedWith(doc) : 0;
	const warnings: string[] = [];
	if (shared)
		warnings.push(
			`This ${adapter.name} account is also connected to another Mint store. ${adapter.name} sends its updates to one address, so only one of the two gets them straight away — the other gets them from the regular check.`
		);
	if (doc?.test?.ok && !tested) warnings.push('The keys changed since the last test — press Test.');
	// Parcels out and the courier quiet for two days: its webhook address is probably not set (CR12).
	const quietSince = doc?.lastWebhookAt || doc?.createdAt;
	if (openParcels && adapter.webhook && quietSince && Date.now() - new Date(quietSince).getTime() > 2 * DAY)
		warnings.push(`${adapter.name} hasn’t sent an update for 2 days while ${openParcels} parcel${openParcels === 1 ? ' is' : 's are'} out — check the webhook address in your ${adapter.name} panel. Mint checks them every 15 minutes meanwhile.`);
	return {
		id: adapter.id,
		name: adapter.name,
		on,
		ready: adapter.ready,
		sandbox: adapter.sandbox,
		links: adapter.links,
		fields: {
			credentials: adapter.credentials,
			settings: adapter.settings,
			...(adapter.id === 'pathao' && { sandboxKeys: { clientId: PATHAO_SANDBOX.clientId, username: PATHAO_SANDBOX.username } }),
		},
		ownWebhookSecret: !!adapter.ownWebhookSecret,
		connection: doc
			? {
					mode: connOf(adapter, doc).mode,
					keys: Object.fromEntries(adapter.credentials.map(f => [f.key, f.secret ? { set: !!keys[f.key] } : { set: !!keys[f.key], value: keys[f.key] }])),
					settings: doc.settings || {},
					tested,
					test: doc.test?.at ? { ok: !!doc.test.ok, message: doc.test.message, at: doc.test.at, rejected: !!doc.test.rejected } : null,
					webhook: webhookOf(adapter, doc, origin),
					sharedAccount: shared > 0,
					connectedBy: doc.connectedBy || '',
					updatedAt: doc.updatedAt,
				}
			: null,
		warnings,
	};
};

/** GET couriers — the couriers the store's country offers, each with its connection. */
export const listConnections = async (project: any, origin: string) => {
	const store = await storeOf();
	const { ids, on } = await offered(project);
	const docs: any[] = await CourierConnection.find({ courier: { $in: ids } }).select(SECRETS).lean();
	const D: any = store.installed.delivery ? store.M('delivery') : null;
	const out = async (id: string) =>
		D ? D.countDocuments({ courier: id, consignment: { $nin: [null, ''] }, status: { $nin: ['delivered', 'partly-delivered', 'returned', 'cancelled', 'lost', 'error', 'draft'] } }) : 0;
	return {
		couriers: await Promise.all(ids.map(async id => viewOf(adapterFor(id), docs.find(d => d.courier === id), on.has(id), origin, await out(id)))),
	};
};

/** Runs the courier's test with the connection's keys and keeps the result (and the hash of the keys it used). */
const runTest = async (adapter: CourierAdapter, doc: any) => {
	const conn = connOf(adapter, doc);
	const r = await adapter.test(conn);
	const set: any = {
		test: { ok: r.ok, message: r.message, at: new Date(), keysHash: r.ok ? hashOf(conn.mode, conn.credentials) : '', rejected: !!r.rejected },
	};
	if (r.ok && r.accountKey) set.accountKey = r.accountKey;
	// What the test learnt (Pathao's and RedX's stores) is kept as the day's list, and the default store picked.
	const stores = r.details?.stores;
	if (r.ok && Array.isArray(stores)) {
		set['cache.stores'] = { at: new Date(), choices: stores };
		const store = doc.settings?.store;
		const chosen = stores.find((s: any) => s.value === String(store)) || stores.find((s: any) => s.default) || stores[0];
		if (!store || !stores.some((s: any) => s.value === String(store))) set['settings.store'] = chosen?.value || '';
		// RedX's charge needs the pickup store's area.
		if (chosen?.details?.areaId) set['settings.pickupArea'] = String(chosen.details.areaId);
	}
	await CourierConnection.updateOne({ _id: doc._id }, { $set: set });
	return r;
};

const cleanSettings = (adapter: CourierAdapter, given: any, was: any) => {
	const out: any = { ...(was || {}) };
	for (const f of adapter.settings) {
		if (given?.[f.key] === undefined) {
			if (out[f.key] === undefined && f.default !== undefined) out[f.key] = f.default;
			continue;
		}
		const v = given[f.key];
		if (f.kind === 'number') {
			const n = Number(v);
			if (!Number.isFinite(n) || n < 0) throw new TenancyError(400, `${f.label}: a number, 0 or more`);
			out[f.key] = n;
		} else if (f.kind === 'select' && f.options && !f.options.some(o => o.value === String(v))) throw new TenancyError(400, `${f.label}: pick one of the choices`);
		else out[f.key] = String(v ?? '').trim().slice(0, f.key === 'names' ? 2000 : 200);
	}
	return out;
};

/**
 * PUT couriers/:id — { mode?, keys?: { name: value }, settings?, webhookSecret?, sandbox? } (CR3). Only couriers
 * Delivery turned on; a key left blank keeps the one stored. Saving keys runs the test.
 * `sandbox: true` (Pathao) fills Pathao's published test account.
 */
export const saveConnection = async (project: any, id: string, body: any, by: string, origin: string) => {
	await storeOf();
	const adapter = adapterFor(id);
	const { ids, on } = await offered(project);
	if (!ids.includes(id)) throw new TenancyError(400, `${adapter.name} isn’t offered in your store’s country`);
	if (!on.has(id)) throw new TenancyError(409, `Turn ${adapter.name} on under Delivery first`, 'courier_off');

	const was = await load(id);
	const mode = adapter.sandbox ? (body?.mode === 'test' || (body?.sandbox && adapter.id === 'pathao') ? 'test' : body?.mode === 'live' ? 'live' : was?.mode || 'live') : 'live';
	const given: Record<string, any> =
		body?.sandbox && adapter.id === 'pathao' ? { ...PATHAO_SANDBOX } : body?.keys && typeof body.keys === 'object' ? body.keys : {};

	const credentials = asObject(was?.credentials);
	const shown = asObject(was?.public);
	let keysChanged = false;
	for (const f of adapter.credentials) {
		const v = given[f.key];
		if (v === undefined || v === null || String(v).trim() === '') continue;
		const value = String(v).trim().slice(0, 500);
		if (f.secret) credentials[f.key] = sealed(value);
		else shown[f.key] = value;
		keysChanged = true;
	}

	const set: any = { mode, credentials, public: shown, settings: cleanSettings(adapter, body?.settings, was?.settings) };
	// A pickup store chosen from the courier's list: its area too (RedX's charge needs it).
	const picked = (was?.cache?.stores?.choices || []).find((c: any) => c.value === String(set.settings.store || ''));
	if (picked?.details?.areaId) set.settings.pickupArea = String(picked.details.areaId);
	if (keysChanged || mode !== (was?.mode || 'live')) set.token = null;
	if (!was?.webhookSecret) set.webhookSecret = sealed(newSecret());
	if (body?.webhookSecret !== undefined) {
		const w = String(body.webhookSecret || '').trim();
		if (!adapter.ownWebhookSecret) throw new TenancyError(400, `${adapter.name} uses the secret Mint makes — copy it from here`);
		if (w && !/^[A-Za-z0-9\-_.=]{16,200}$/.test(w)) throw new TenancyError(400, 'The webhook token: 16 or more letters, digits, - _ . or =');
		set.webhookSecret = sealed(w || newSecret());
		set.webhookSecretPasted = !!w;
	}
	if (!was) set.connectedBy = by;

	await CourierConnection.updateOne({ courier: id }, { $set: set, $setOnInsert: { courier: id } }, { upsert: true });
	const doc = await load(id);
	const keys = keysOf(adapter, doc);
	const complete = adapter.credentials.every(f => keys[f.key]);
	if (complete && (keysChanged || set.token === null || !doc.test?.at)) await runTest(adapter, doc);
	return viewOf(adapter, await load(id), true, origin);
};

/** POST couriers/:id/test — the test again with the keys kept. */
export const testConnection = async (project: any, id: string, origin: string) => {
	await storeOf();
	const adapter = adapterFor(id);
	const doc = await load(id);
	if (!doc) throw new TenancyError(404, `Connect ${adapter.name} first`);
	await runTest(adapter, doc);
	const { on } = await offered(project);
	return viewOf(adapter, await load(id), on.has(id), origin);
};

/** POST couriers/:id/webhook-secret — a new secret Mint makes (the old address stops working at once). */
export const renewWebhookSecret = async (project: any, id: string, origin: string) => {
	await storeOf();
	const adapter = adapterFor(id);
	const doc = await load(id);
	if (!doc) throw new TenancyError(404, `Connect ${adapter.name} first`);
	await CourierConnection.updateOne({ _id: doc._id }, { $set: { webhookSecret: sealed(newSecret()), webhookSecretPasted: false } });
	const { on } = await offered(project);
	return viewOf(adapter, await load(id), on.has(id), origin);
};

/** DELETE couriers/:id — forgets the keys; refused while parcels with it are on their way. */
export const disconnect = async (id: string) => {
	const store = await storeOf();
	const adapter = adapterFor(id);
	const Delivery: any = store.installed.delivery ? store.M('delivery') : null;
	const open = Delivery ? await Delivery.countDocuments({ courier: id, status: { $nin: ['delivered', 'partly-delivered', 'returned', 'cancelled', 'lost', 'error', 'draft'] } }) : 0;
	if (open)
		throw new TenancyError(409, `${open} deliver${open === 1 ? 'y is' : 'ies are'} still with ${adapter.name} — disconnect once ${open === 1 ? 'it’s' : 'they’re'} finished`, 'courier_in_use');
	const r = await CourierConnection.deleteOne({ courier: id });
	return { removed: r.deletedCount > 0 };
};

/** GET couriers/:id/options/:what?parent= — the courier's stores, cities, zones or areas, kept a day. */
export const optionsFor = async (id: string, what: string, parent?: string, fresh = false) => {
	await storeOf();
	const adapter = adapterFor(id);
	if (!OPTIONS.includes(what as OptionKind) || !adapter.options) throw new TenancyError(404, `${adapter.name} has no list of ${what}`);
	if ((what === 'zones' || what === 'areas') && adapter.id === 'pathao' && !/^\d+$/.test(String(parent || '')))
		throw new TenancyError(400, `Pick the ${what === 'zones' ? 'city' : 'zone'} first`);
	const doc = await load(id);
	if (!doc?.test?.ok) throw new TenancyError(409, `Connect and test ${adapter.name} first`, 'courier_not_connected');
	const key = `${what}${parent ? `:${String(parent).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}` : ''}`;
	const kept = doc.cache?.[key];
	if (!fresh && kept?.at && Date.now() - new Date(kept.at).getTime() < DAY) return { choices: kept.choices, cachedAt: kept.at };
	try {
		const choices = await adapter.options(connOf(adapter, doc), what as OptionKind, parent);
		const at = new Date();
		await CourierConnection.updateOne({ _id: doc._id }, { $set: { [`cache.${key}`]: { at, choices } } });
		return { choices, cachedAt: at };
	} catch (e: any) {
		if (e instanceof CourierError) throw new TenancyError(502, e.message, 'courier_error');
		throw e;
	}
};

/** A connection that can be used: on, keys tested as they are now. For the delivery engine (CR-05). */
export const usableConnection = async (project: any, id: string) => {
	const adapter = adapterFor(id);
	const { on } = await offered(project);
	const doc = await load(id);
	if (!on.has(id) || !doc?.test?.ok) return null;
	const conn = connOf(adapter, doc);
	if (doc.test.keysHash !== hashOf(conn.mode, conn.credentials)) return null;
	return { adapter, doc, conn };
};
