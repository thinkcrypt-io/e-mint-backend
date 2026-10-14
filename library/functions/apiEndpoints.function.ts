import ApiEndpoint, { ENDPOINT_ACTIONS, ENDPOINT_WHO, METHOD_OF } from '../models/tenancy/apiEndpoint.model.js';
import ServerKey, { SERVER_KEY_PREFIX, hashServerKey } from '../models/tenancy/serverKey.model.js';
import ModelDefinition from '../models/builder/modelDefinition.model.js';
import { syncDynamicModels } from './dynamicModels.function.js';
import { TenancyError } from './tenancy.function.js';
import { conditionQuery, fieldKeys, filterable, outKeys } from './publicRecords.function.js';
import { lockText, meets } from './fieldLocks.function.js';

/**
 * The API builder's engine (docs/api-builder): a project's public API as
 * endpoints. Paths, the standard endpoints and how they stay in step with
 * `ModelDefinition.publicApi` (D1, D9), matching a call to an endpoint, server
 * keys, and what an endpoint lets a call reach, write and see (D4–D7). Runs in
 * the project's scope. Used by routes-public/public.router.ts and the panel's
 * routes-tenant/apiBuilder.router.ts.
 */

export type Action = (typeof ENDPOINT_ACTIONS)[number];
export type Who = (typeof ENDPOINT_WHO)[number];
export type Cond = { field: string; op: string; value?: any };

export const ID_ACTIONS = new Set<string>(['get', 'update', 'delete']);
export const WRITE_ACTIONS = new Set<string>(['create', 'update']);
export const ACTION_LABEL: Record<string, string> = { list: 'List', get: 'Read one', create: 'Create', update: 'Update', delete: 'Delete' };

/** "Owner is the signed-in customer" — the old `ownerOnly`. */
export const OWNER: Cond = { field: '_customer', op: 'is', value: { ref: 'customer' } };
const isRef = (v: any): v is { ref: string } => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.ref === 'string';
export const isOwner = (c: any) => c?.field === '_customer' && c?.op === 'is' && isRef(c.value) && c.value.ref === 'customer';
const CUSTOMER_REFS = new Set(['customer', 'customer.email', 'customer.name', 'customer.phone']);
const OPS = new Set(['is', 'not', 'in', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'filled']);

/* --------------------------------------------------------------- paths */

/**
 * First segments the public router answers itself (routes-public/public.router.ts)
 * or keeps for later — a custom endpoint can't start with one (D3).
 */
export const RESERVED_SEGMENTS = new Set([
	'auth', 'track', 'widgets', 'shop', 'cart', 'site', 'pages', 'checkout', 'render', 'payments',
	'mint', 'api', 'public', 'admin', 'keys', 'endpoints', 'webhooks', 'customers',
]);

export const standardPath = (route: string, action: string) => (ID_ACTIONS.has(action) ? `/${route}/:id` : `/${route}`);

const bad = (on: string, message: string) => Object.assign(new TenancyError(400, message), { extra: { on } });

/** A path as stored: lowercase, leading slash, 1–4 parts, `/:id` last only when the action takes one. */
export const normalizePath = (raw: any, action: string): string => {
	let p = String(raw || '').trim().toLowerCase().replace(/\s+/g, '').replace(/\/+/g, '/').replace(/\/$/, '');
	if (!p.startsWith('/')) p = `/${p}`;
	const parts = p.split('/').slice(1).filter(Boolean);
	const hasId = parts[parts.length - 1] === ':id';
	const literal = hasId ? parts.slice(0, -1) : parts;
	if (!literal.length) throw bad('path', 'Give the endpoint a path, like /products/featured');
	if (literal.length > 4) throw bad('path', 'Use at most 4 parts, like /shop/products/featured');
	if (literal.includes(':id')) throw bad('path', ':id can only be the last part');
	for (const s of literal)
		if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(s)) throw bad('path', `“${s}”: use lowercase letters, numbers and dashes in each part`);
	if (ID_ACTIONS.has(action) && !hasId) throw bad('path', `${ACTION_LABEL[action]} works on one record — end the path with /:id`);
	if (!ID_ACTIONS.has(action) && hasId) throw bad('path', 'Only Read one, Update and Delete end with /:id');
	return `/${parts.join('/')}`;
};

/* ------------------------------------- publicApi ⇄ standard endpoints (D1) */

type Summary = { enabled: boolean; actions: string[]; auth: 'none' | 'customer' | 'key'; ownerOnly: boolean; readOnlyFields: string[] };
const sorted = (a: any[] = []) => [...new Set(a.map(String))].sort();
const summaryOf = (p: any): Summary => ({
	enabled: !!p?.enabled,
	actions: p?.enabled ? sorted(p.actions || []) : [],
	auth: p?.auth === 'customer' || p?.auth === 'key' ? p.auth : 'none',
	ownerOnly: !!p?.ownerOnly,
	readOnlyFields: sorted(p?.readOnlyFields || []),
});
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const WHO_OF_AUTH: Record<string, Who> = { none: 'anyone', customer: 'customer', key: 'key' };
const AUTH_OF_WHO: Record<string, Summary['auth']> = { anyone: 'none', customer: 'customer', key: 'key' };

const words = (def: any) => {
	const plural = def.title || def.name || def.route;
	const one = String(def.name || def.route).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
	return { plural, one };
};
export const standardName = (def: any, action: string) => {
	const { plural, one } = words(def);
	return { list: `List ${plural.toLowerCase()}`, get: `Read one ${one}`, create: `Create ${one}`, update: `Update ${one}`, delete: `Delete ${one}` }[action] || action;
};

/** A model's standard endpoint for one action, its rules from a `publicApi`-shaped summary. */
export const newStandard = (def: any, action: string, s: Pick<Summary, 'auth' | 'ownerOnly' | 'readOnlyFields'>) => ({
	name: standardName(def, action),
	note: action === 'list' ? def.publicApi?.note || '' : '',
	model: def.route,
	action,
	method: METHOD_OF[action],
	path: standardPath(def.route, action),
	standard: true,
	enabled: true,
	access: { who: WHO_OF_AUTH[s.auth] || 'anyone', when: s.ownerOnly ? [OWNER] : [], match: 'all' },
	fields: { out: null, write: null, readOnly: WRITE_ACTIONS.has(action) ? s.readOnlyFields : [] },
});

const isDup = (e: any) => e?.code === 11000;

/**
 * Brings a model's standard endpoints in line with a `publicApi` that was
 * changed elsewhere (the model builder, MCP, a template, the website kit, the
 * shop) — only what changed since they last matched (`sync`), so rules set on
 * an endpoint survive. The first time (no endpoints yet) it makes them (D9).
 */
const reconcile = async (def: any, mine: any[]) => {
	const now = summaryOf(def.publicApi);
	const synced = mine.find(e => e.sync)?.sync;
	const before = summaryOf(synced || null);
	if (same(now, before) && mine.every(e => e.sync && same(summaryOf(e.sync), now))) return;
	for (const action of ENDPOINT_ACTIONS) {
		const want = now.enabled && now.actions.includes(action);
		const had = before.enabled && before.actions.includes(action);
		const ep = mine.find(e => e.action === action);
		if (!ep) {
			if (want)
				await ApiEndpoint.create({ ...newStandard(def, action, now), sync: now }).catch(e => {
					if (!isDup(e)) throw e; // a custom endpoint already answers there
				});
			continue;
		}
		const set: any = { sync: now };
		if (want !== had) set.enabled = want;
		if (now.auth !== before.auth) set['access.who'] = WHO_OF_AUTH[now.auth];
		if (now.ownerOnly !== before.ownerOnly) {
			const others = (ep.access?.when || []).filter((c: any) => !isOwner(c));
			set['access.when'] = now.ownerOnly ? [OWNER, ...others] : others;
		}
		if (WRITE_ACTIONS.has(action) && !same(now.readOnlyFields, before.readOnlyFields)) set['fields.readOnly'] = now.readOnlyFields;
		await ApiEndpoint.updateOne({ _id: ep._id }, { $set: set });
	}
};

/** Every model's standard endpoints in step with its `publicApi` (D1, D9). Cheap when nothing changed. */
export const ensureEndpoints = async () => {
	const [defs, std]: any[] = await Promise.all([
		ModelDefinition.find({ active: { $ne: false } }, { route: 1, name: 1, title: 1, publicApi: 1 }).lean(),
		ApiEndpoint.find({ standard: true }).lean(),
	]);
	for (const def of defs) {
		const mine = std.filter((e: any) => e.model === def.route);
		if (!def.publicApi?.enabled && !mine.length) continue;
		await reconcile(def, mine);
	}
};

/**
 * After the panel changes a model's endpoints: its `publicApi` summary from
 * them, for everything that still reads it (the site builder, the shop,
 * templates, MCP, webhooks). Enabled when any endpoint of the model is on;
 * the actions of its standard endpoints; who and owner-only from its list
 * endpoint (or the first one on); read-only fields of its create/update.
 */
export const syncSummary = async (route: string) => {
	const def: any = await ModelDefinition.findOne({ route }, { publicApi: 1 }).lean();
	if (!def) return;
	const all: any[] = await ApiEndpoint.find({ model: route }).lean();
	const on = all.filter(e => e.standard && e.enabled);
	const lead = on.find(e => e.action === 'list') || on[0];
	const s: Summary = {
		enabled: all.some(e => e.enabled),
		actions: sorted(on.map(e => e.action)),
		auth: lead ? AUTH_OF_WHO[lead.access?.who] || 'none' : summaryOf(def.publicApi).auth,
		ownerOnly: lead ? (lead.access?.when || []).some(isOwner) : false,
		readOnlyFields: sorted(on.filter(e => WRITE_ACTIONS.has(e.action)).flatMap(e => e.fields?.readOnly || [])),
	};
	const next = { ...(def.publicApi || {}), ...s, actions: s.enabled ? s.actions : [] };
	const changed = !same(summaryOf(def.publicApi), summaryOf(next));
	const rebuild = !!def.publicApi?.enabled !== s.enabled;
	if (changed)
		await ModelDefinition.updateOne(
			{ _id: def._id },
			// The record model adds `_customer` while the API is on (dynamicModels) — a version bump rebuilds it…
			{ $set: { publicApi: next }, ...(rebuild && { $inc: { version: 1 } }) }
		);
	// …now, not at the next timed check, so the next call can already set an owner.
	if (rebuild) await syncDynamicModels({ force: true });
	await ApiEndpoint.updateMany({ model: route, standard: true }, { $set: { sync: summaryOf(next) } });
};

/* ------------------------------------------------------------ matching */

/** The endpoint answering `method path`, and the `:id` it carries. Custom before standard, literal parts before :id. */
export const matchEndpoint = (endpoints: any[], method: string, path: string) => {
	const segs = path.split('/').filter(Boolean);
	let best: any = null;
	let bestScore = -1;
	let bestId: string | undefined;
	for (const ep of endpoints) {
		if (ep.method !== method) continue;
		const parts = ep.path.split('/').filter(Boolean);
		if (parts.length !== segs.length) continue;
		let id: string | undefined;
		let literals = 0;
		let ok = true;
		parts.forEach((p: string, i: number) => {
			if (p === ':id') id = segs[i];
			else if (p === segs[i].toLowerCase()) literals++;
			else ok = false;
		});
		if (!ok) continue;
		const score = literals * 2 + (ep.standard ? 0 : 1);
		if (score > bestScore) (best = ep), (bestScore = score), (bestId = id);
	}
	return best ? { ep: best, id: bestId } : null;
};

/* ---------------------------------------------------------------- keys */

/** The project's server key on this call (Authorization: Bearer mint_sk_… or X-Api-Key), or null. */
export const serverKeyOf = async (req: any) => {
	const header = String(req.headers['x-api-key'] || '').trim() || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
	if (!header.startsWith(SERVER_KEY_PREFIX)) return null;
	const key: any = await ServerKey.findOne({ hash: hashServerKey(header), revokedAt: null }).lean();
	if (!key) return null;
	// Last used, at most once a minute.
	if (!key.lastUsedAt || Date.now() - new Date(key.lastUsedAt).getTime() > 60_000)
		ServerKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date() } }).catch(() => undefined);
	return key;
};

/** Whether this call carries a server key at all (a wrong one answers 401, not "sign in"). */
export const sendsServerKey = (req: any) =>
	!!req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim().startsWith(SERVER_KEY_PREFIX);

/* ------------------------------------------------- what a call may reach */

const MISSING = Symbol('missing');
/** A condition's value, with `{ref: 'customer…'}` read from the signed-in customer. */
const resolveValue = (v: any, customer: any) => {
	if (!isRef(v)) return v;
	if (!customer) return MISSING;
	const key = v.ref.split('.')[1];
	return key ? customer[key] ?? '' : String(customer._id);
};

const asQuery = (def: any, c: Cond, customer: any) => {
	const value = resolveValue(c.value, customer);
	if (value === MISSING) return { _id: null }; // nobody to compare with: nothing matches
	return conditionQuery(def, { ...c, value });
};

/**
 * The records an endpoint lets a call reach (D5, D7): never archived; on a
 * model with per-record access only the public ones; then the access
 * conditions and, for a list, its fixed filters.
 */
export const reachOf = (def: any, ep: any, customer: any) => {
	const base: any = { archivedAt: null, ...(def.access?.enabled && { privacy: 'public' }) };
	const and: any[] = [];
	const when: Cond[] = ep.access?.when || [];
	if (when.length) {
		const qs = when.map(c => asQuery(def, c, customer));
		and.push(ep.access?.match === 'any' ? { $or: qs } : { $and: qs });
	}
	if (ep.action === 'list') for (const f of ep.list?.filters || []) and.push(asQuery(def, f, customer));
	return and.length ? { ...base, $and: and } : base;
};

/**
 * A create's access conditions, on the new record (defaults applied): an owner
 * condition makes the customer its owner; the rest must hold, or 403 with the
 * rule in words.
 */
export const checkCreate = (ep: any, doc: any, customer: any) => {
	const when: Cond[] = ep.access?.when || [];
	if (!when.length) return;
	if (customer && when.some(isOwner)) doc._customer = customer._id;
	const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
	const resolved = when.map(c => {
		const value = resolveValue(c.value, customer);
		return { ...c, value: value === MISSING ? '\u0000' : value };
	});
	if (!meets(plain, resolved, ep.access?.match === 'any' ? 'any' : 'all'))
		throw new TenancyError(403, `This endpoint only creates records where ${lockText(when.filter(c => !isOwner(c)).map(c => (isRef(c.value) ? { ...c, value: c.value.ref.replace('customer.', 'the customer’s ').replace(/^customer$/, 'the customer') } : c)) as any, ep.access?.match) || 'its rules hold'}.`, 'rule_failed');
};

/** The keys that go out (always _id); `asked` narrows them further (?fields=). */
export const outOf = (def: any, ep: any) => {
	const all = outKeys(def);
	const out: string[] | null = ep.fields?.out;
	return out?.length ? [...new Set(['_id', ...out.filter(k => all.includes(k))])] : all;
};

/** The fields a create/update may write: the model's own (no formulas), the endpoint's list, minus read-only. */
export const writableOf = (def: any, ep: any) => {
	const readOnly = new Set<string>(ep.fields?.readOnly || []);
	const write: string[] | null = ep.fields?.write;
	return fieldKeys(def).filter((k: string) => !readOnly.has(k) && (!write?.length || write.includes(k)));
};

/* ---------------------------------------------------- checking an input */

/** The fields a condition can name on this model: its filterable fields, the owner and the id. */
export const ruleFields = (def: any) => [
	...filterable(def).map(f => ({ key: f.key, label: f.label || f.key, kind: f.kind })),
	{ key: '_customer', label: 'Owner (customer)', kind: 'owner' },
	{ key: '_id', label: 'Record id', kind: 'id' },
];

const checkConds = (def: any, conds: any, who: string, on: string): Cond[] => {
	if (conds === undefined) return [];
	if (!Array.isArray(conds) || conds.length > 20) throw bad(on, 'At most 20 conditions');
	return conds.map((c: any, i: number) => {
		const at = `${on}.${i}`;
		if (!c || typeof c.field !== 'string' || !c.field) throw bad(at, 'Pick a field');
		if (!OPS.has(c.op)) throw bad(at, 'Pick a test');
		const out: Cond = { field: c.field, op: c.op };
		if (c.op !== 'empty' && c.op !== 'filled') {
			if (isRef(c.value)) {
				if (!CUSTOMER_REFS.has(c.value.ref)) throw bad(at, 'Compare with a value or the signed-in customer');
				if (who !== 'customer') throw bad(at, 'Comparing with the signed-in customer needs “Signed-in customers” as who can call it');
				out.value = { ref: c.value.ref };
			} else {
				if (c.value === undefined || c.value === null || c.value === '' || (Array.isArray(c.value) && !c.value.length))
					throw bad(at, 'Give it a value to compare with');
				out.value = Array.isArray(c.value) ? c.value.slice(0, 100) : c.value;
			}
		}
		// The same reading the call will do — a value of the wrong kind is refused now, not at call time.
		try {
			conditionQuery(def, { ...out, value: isRef(out.value) ? '000000000000000000000000' : out.value });
		} catch (e: any) {
			if (!(isRef(out.value) && c.field !== '_customer' && c.field !== '_id')) throw bad(at, e?.message || 'That condition isn’t valid');
		}
		return out;
	});
};

const subset = (def: any, list: any, on: string, allowed: string[]): string[] | null => {
	if (list === null || list === undefined) return null;
	if (!Array.isArray(list)) throw bad(on, 'Pick fields from the list');
	const unknown = list.find((k: any) => !allowed.includes(k));
	if (unknown) throw bad(on, `“${unknown}” isn’t a field of ${def.title || def.name}`);
	return [...new Set(list.map(String))];
};

/**
 * An endpoint as the panel sends it, checked and cleaned (400 with `on` = the
 * input at fault). `current`: the stored endpoint when updating — a standard
 * endpoint keeps its model, action and path.
 */
export const checkEndpoint = async (input: any, current?: any) => {
	const route = current ? current.model : String(input.model || '').toLowerCase();
	const def: any = await ModelDefinition.findOne({ route, active: { $ne: false } }).lean();
	if (!def) throw bad('model', 'Pick a model');
	const action = current ? current.action : String(input.action || '');
	if (!(ENDPOINT_ACTIONS as readonly string[]).includes(action)) throw bad('action', 'Pick what it does');
	const path = current?.standard ? current.path : normalizePath(input.path ?? current?.path, action);
	if (!current?.standard && RESERVED_SEGMENTS.has(path.split('/')[1])) throw bad('path', `/${path.split('/')[1]} is kept for MINT’s own addresses — start the path with something else`);
	const name = String(input.name ?? current?.name ?? '').trim() || (current?.standard ? standardName(def, action) : `${ACTION_LABEL[action]} ${words(def).plural.toLowerCase()}`);
	if (name.length > 80) throw bad('name', 'At most 80 characters');
	const who = String(input.access?.who ?? current?.access?.who ?? 'anyone');
	if (!(ENDPOINT_WHO as readonly string[]).includes(who)) throw bad('access.who', 'Pick who can call it');
	const when = checkConds(def, input.access?.when ?? current?.access?.when, who, 'access.when');
	const all = def.fields.map((f: any) => f.key);
	const writable = fieldKeys(def);
	const fields = {
		out: subset(def, input.fields?.out ?? current?.fields?.out, 'fields.out', [...all, 'code', 'createdAt', 'updatedAt']),
		write: WRITE_ACTIONS.has(action) ? subset(def, input.fields?.write ?? current?.fields?.write, 'fields.write', writable) : null,
		readOnly: WRITE_ACTIONS.has(action) ? subset(def, input.fields?.readOnly ?? current?.fields?.readOnly ?? [], 'fields.readOnly', writable) || [] : [],
	};
	const l = input.list ?? current?.list ?? {};
	const maxLimit = Math.min(Math.max(parseInt(l.maxLimit, 10) || 100, 1), 100);
	const list = {
		filters: action === 'list' ? checkConds(def, l.filters, who, 'list.filters') : [],
		callerFilters: l.callerFilters !== false,
		sort: String(l.sort || '').slice(0, 120),
		limit: Math.min(Math.max(parseInt(l.limit, 10) || 20, 1), maxLimit),
		maxLimit,
	};
	return {
		def,
		doc: {
			name,
			note: String(input.note ?? current?.note ?? '').trim().slice(0, 300),
			model: route,
			action,
			method: METHOD_OF[action],
			path,
			standard: !!current?.standard,
			enabled: input.enabled ?? current?.enabled ?? true,
			access: { who, when, match: (input.access?.match ?? current?.access?.match) === 'any' ? 'any' : 'all' },
			fields,
			list,
		},
	};
};

/** "Another endpoint already answers GET /products/featured." — for a duplicate path. */
export const pathTaken = (doc: any) => bad('path', `Another endpoint already answers ${doc.method} ${doc.path}`);

/**
 * What the site builder's data may show of a model (docs/site-builder SB-09:
 * never more than the public API would): the reach and the fields of its
 * standard `list` or `get` endpoint, as anyone calling it would get them.
 */
export const siteReach = async (def: any, action: 'list' | 'get') => {
	const ep: any = await ApiEndpoint.findOne({ model: def.route, action, standard: true, enabled: true }).lean();
	if (!ep) return { query: reachOf(def, { action, access: { when: [] } }, null), keys: outKeys(def) };
	return { query: reachOf(def, ep, null), keys: outOf(def, ep) };
};
