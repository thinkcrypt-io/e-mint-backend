import mongoose from 'mongoose';

/**
 * Glue between what each admin route was built with in code — its settings
 * filters, its frontend config — and the documents that now override them
 * (RouteSettings, RouteConfig).
 *
 * Only the admin API is DB-driven. The seller, staff and user APIs mount the
 * same controllers under their own prefixes, often for the same resource names
 * ('/api/products'), and a table configured for the admin has no business
 * changing what a shop owner's POS shows.
 */
export const ADMIN_API_PREFIX = '/admin/api';

const FILTERS_SUFFIX = /\/get\/filters\/?$/;

/**
 * What `getFilters` attaches to the handler it returns, so the router walker
 * below can find each route's settings filters without a second registry that
 * would have to be kept in step with `admin.router.ts` by hand.
 */
export type FilterSource = {
	filters: any[];
	role?: string;
	baseModel: mongoose.Model<any>;
};

/**
 * The key a config document is stored under for this request: the path the
 * admin passed as `${path}/get/filters`, i.e.
 * everything between the API prefix and that suffix. `null` outside the admin
 * API.
 *
 * Built from `baseUrl` + the route's own pattern rather than `originalUrl`, so
 * custom endpoints like '/top-selling/get/filters' under '/products' key as
 * 'products/top-selling' — the same thing the walker derives from the stack.
 */
const routeKey = (req: any, suffix: RegExp): string | null => {
	const routePath = typeof req?.route?.path === 'string' ? req.route.path : '';
	const full = `${req?.baseUrl || ''}${routePath}`.replace(suffix, '');
	if (!full.startsWith(`${ADMIN_API_PREFIX}/`)) return null;
	return full.slice(ADMIN_API_PREFIX.length + 1) || null;
};

export const filterRouteKey = (req: any) => routeKey(req, FILTERS_SUFFIX);

/**
 * Express 4 keeps no mount path on a `router.use()` layer — only the regexp
 * path-to-regexp compiled from it. For a static mount that regexp is always
 * `^\/products\/?(?=\/|$)`, so the path is recoverable by stripping the
 * anchors and unescaping. Parameterised mounts can't be keyed statically and
 * are skipped.
 */
export const mountPath = (layer: any): string | null => {
	if (layer?.regexp?.fast_slash) return '';
	if (layer?.keys?.length) return null;
	const source: string | undefined = layer?.regexp?.source;
	if (!source) return null;
	const stripped = source.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '');
	return stripped.replace(/\\(.)/g, '$1');
};

/**
 * Routers for models built in the model builder, keyed by route. They aren't
 * in the app's router stack — one dispatcher serves them all, so a model can
 * be added or rebuilt without restarting — so the collectors below walk them
 * here as if each were mounted at `/admin/api/<route>`.
 *
 * `dynamicVersion` changes whenever the map does; callers that cache what the
 * collectors return key their cache on it.
 */
export const dynamicMounts = new Map<string, any>();
let dynamicVersion = 0;
export const getDynamicVersion = () => dynamicVersion;
export const setDynamicMount = (route: string, router: any | null) => {
	if (router) dynamicMounts.set(route, router);
	else dynamicMounts.delete(route);
	dynamicVersion++;
};

export type RouteEntry<T> = {
	route: string;
	source: T;
};
export type FilterRouteEntry = RouteEntry<FilterSource>;

/**
 * Every admin route with an endpoint matching `suffix` whose handler carries
 * `marker`, keyed exactly as `routeKey` keys a live request.
 *
 * Walks the app's own router stack instead of a hand-kept list, so a new
 * `router.use('/x', defineRoutes(...))` shows up here with nothing else to
 * register. A route whose controller was swapped via `replaceController`
 * carries no marker and is left out — it isn't built from code config, so
 * there is nothing to seed or override.
 */
const collectRoutes = <T>(app: any, suffix: RegExp, marker: string): RouteEntry<T>[] => {
	const found = new Map<string, RouteEntry<T>>();

	const walk = (stack: any[], prefix: string) => {
		for (const layer of stack || []) {
			if (layer.route) {
				const path = layer.route.path;
				if (typeof path !== 'string' || !suffix.test(path)) continue;

				const handler = (layer.route.stack || [])
					.map((l: any) => l.handle)
					.find((h: any) => h?.[marker]);
				if (!handler) continue;

				const full = `${prefix}${path}`.replace(suffix, '');
				if (!full.startsWith(`${ADMIN_API_PREFIX}/`)) continue;

				const route = full.slice(ADMIN_API_PREFIX.length + 1);
				// First registration wins, as it does for a live request.
				if (route && !found.has(route)) found.set(route, { route, source: handler[marker] });
				continue;
			}

			const child = layer.handle?.stack;
			if (!Array.isArray(child)) continue;

			const mount = mountPath(layer);
			if (mount === null) continue;
			walk(child, `${prefix}${mount}`);
		}
	};

	walk(app?._router?.stack, '');
	for (const [route, router] of dynamicMounts) walk(router.stack, `${ADMIN_API_PREFIX}/${route}`);

	return [...found.values()].sort((a, b) => a.route.localeCompare(b.route));
};

/** Routes whose `/get/filters` is a settings-backed `getFilters`. */
export const collectFilterRoutes = (app: any) =>
	collectRoutes<FilterSource>(app, FILTERS_SUFFIX, 'filterSource');

/**
 * What `defineRoutes` attaches to the router it returns: the code inputs the
 * route was built from. The resolver falls back to these when the route has
 * no published RouteSettings / RouteConfig, and the seed copies them into
 * the DB.
 */
export type ResourceSource = {
	Model: mongoose.Model<any>;
	settings: Record<string, any>;
	frontendConfig?: any;
	permission: string;
	route?: string;
};
export type ResourceRouteEntry = RouteEntry<ResourceSource>;

/**
 * Every admin route built by `defineRoutes`, keyed by its mount path — which
 * is what the admin requests. Unlike the other collectors this matches the
 * router itself, not one of its endpoints, so a route counts whether or not
 * it has a frontend config.
 */
export const collectResourceRoutes = (app: any): ResourceRouteEntry[] => {
	const found = new Map<string, ResourceRouteEntry>();

	const walk = (stack: any[], prefix: string) => {
		for (const layer of stack || []) {
			if (layer.route) continue;
			const child = layer.handle?.stack;
			if (!Array.isArray(child)) continue;

			const mount = mountPath(layer);
			if (mount === null) continue;
			const full = `${prefix}${mount}`;

			const source = layer.handle.routeSource;
			if (source && full.startsWith(`${ADMIN_API_PREFIX}/`)) {
				const route = full.slice(ADMIN_API_PREFIX.length + 1);
				if (route && !found.has(route)) found.set(route, { route, source });
			}
			walk(child, full);
		}
	};

	walk(app?._router?.stack, '');
	for (const [route, router] of dynamicMounts)
		if (!found.has(route)) found.set(route, { route, source: router.routeSource });

	return [...found.values()].sort((a, b) => a.route.localeCompare(b.route));
};

/**
 * A JSON-safe copy of a code value: a Mongoose Model becomes its modelName
 * (how filters reference models), and functions are dropped — nothing in
 * today's settings or configs holds one, and code can't be stored as data.
 */
const toData = (value: any): any => {
	if (value === null || value === undefined) return value;
	if (typeof value === 'function') return value.modelName ?? undefined;
	if (Array.isArray(value)) return value.map(toData).filter(v => v !== undefined);
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'object') {
		const out: any = {};
		for (const [k, v] of Object.entries(value)) {
			const d = toData(v);
			if (d !== undefined) out[k] = d;
		}
		return out;
	}
	return value;
};

/**
 * A settings file as RouteSettings data: its fields in order, as
 * `{ key, ...settings }`, with each field's `filter` taken out — filters
 * live in RouteConfig.
 */
export const settingsToData = (settings: Record<string, any> = {}) => ({
	fields: Object.entries(settings).map(([key, value]) => {
		const { filter, ...rest } = (value || {}) as any;
		return { key, ...toData(rest) };
	}),
});

/** RouteSettings data back into the settings-file shape the code expects. */
export const dataToSettings = (data: any): Record<string, any> => {
	const out: Record<string, any> = {};
	for (const { key, ...rest } of data?.fields || []) out[key] = rest;
	return out;
};

/** A route's code config file (and its settings filters) as RouteConfig data. */
export const configToData = (frontendConfig: any, filters: any[] = []) => ({
	...(frontendConfig ? toData(frontendConfig) : {}),
	filters: filters.map(serializeFilter),
});

/**
 * A settings filter as a `FilterConfig` filter: the mongoose Model reference
 * becomes its `modelName`, and everything else is carried over untouched so a
 * seeded route behaves exactly as it did before.
 */
export const serializeFilter = (filter: any) => {
	const { model, ...rest } = filter || {};
	const out: any = { ...rest };
	if (model) out.model = typeof model === 'string' ? model : model?.modelName;
	if (!out.category) out.category = 'default';
	return out;
};

/**
 * The model a stored filter reads its options from. A settings filter holds
 * the Model itself; a stored one holds its name. `null` means the name no
 * longer resolves — the caller should show no options rather than silently
 * querying the base model instead.
 */
export const resolveFilterModel = (
	model: any,
	baseModel: mongoose.Model<any>
): mongoose.Model<any> | null => {
	if (!model) return baseModel;
	if (typeof model !== 'string') return model;
	return mongoose.models[model] || null;
};

export type ModelField = {
	key: string;
	instance: string;
	ref?: string;
	enum?: any[];
	isArray?: boolean;
};

/**
 * The fields a filter can be built on: the base model's schema paths, plus
 * one level into arrays of subdocuments ('inventory.location'), which is as
 * deep as any existing filter goes.
 */
/**
 * Paths that hold secrets: named like one (password, token, secret, API key,
 * OTP, salt, hash…) or kept out of queries (`select: false`). The builder
 * never offers them — not as a column, a filter, a form input, nor as a
 * field to show from a linked record — and the view endpoint never returns them.
 */
export const SECRET_PATH = /pass(word)?|token|secret|api_?key|apikey|private|otp|salt|hash/i;
export const isSecretPath = (path: string, type?: any) =>
	SECRET_PATH.test(path) || type?.options?.select === false || type?.caster?.options?.select === false;

export const listModelFields = (model: mongoose.Model<any>): ModelField[] => {
	const fields: ModelField[] = [];

	const describe = (key: string, type: any): ModelField => {
		const caster = type?.caster;
		const ref = type?.options?.ref || caster?.options?.ref;
		const enumValues = type?.enumValues?.length ? type.enumValues : caster?.enumValues;
		return {
			key,
			instance: caster?.instance && type.instance === 'Array' ? caster.instance : type?.instance,
			...(typeof ref === 'string' && { ref }),
			...(enumValues?.length && { enum: enumValues }),
			...(type?.instance === 'Array' && { isArray: true }),
		};
	};

	model.schema.eachPath((path: string, type: any) => {
		if (path === '__v' || isSecretPath(path, type)) return;

		if (type?.schema && type.instance !== 'Embedded') {
			fields.push({ key: path, instance: 'Array', isArray: true });
			type.schema.eachPath((sub: string, subType: any) => {
				if (sub === '_id' || sub === '__v' || isSecretPath(sub, subType)) return;
				fields.push(describe(`${path}.${sub}`, subType));
			});
			return;
		}

		fields.push(describe(path, type));
	});

	return fields;
};
