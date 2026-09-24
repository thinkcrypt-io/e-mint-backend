import mongoose from 'mongoose';
import constructConfig from '../../lib/configurator/constructConfig.js';
import RouteSettings from '../models/builder/routeSettings.model.js';
import RouteConfig from '../models/builder/routeConfig.model.js';
import BuilderState from '../models/builder/builderState.model.js';
import { ADMIN_API_PREFIX, dataToSettings } from './routeRegistry.function.js';

/**
 * Which settings and config an admin route runs on right now: the published
 * RouteSettings / RouteConfig when there is one and the route's source is
 * 'db', otherwise the code files the route was built with. Drafts are never
 * read here.
 *
 * The source is chosen per route (`source` on the document) or, when that's
 * 'inherit', by the global switch in BuilderState. Either way the result has
 * exactly the shape the code files have — a DB copy is turned back into the
 * same settings object — so the admin can't tell which one it got.
 *
 * Lookups are cached per route for a few seconds, and dropped immediately on
 * publish in this process. Other processes (a second dyno) pick a publish up
 * when their entry expires — the TTL is the worst-case delay.
 */

const TTL_MS = 10_000;

export type Kind = 'settings' | 'config';
type Source = 'inherit' | 'db' | 'code';
type Published = { data: any; version: number; source: Source } | null;

const settingsCache = new Map<string, { at: number; value: Published }>();
const configCache = new Map<string, { at: number; value: Published }>();
// constructConfig builds Joi validators — worth keeping per published version.
const builtCache = new Map<string, any>();

const load = async (
	cache: Map<string, { at: number; value: Published }>,
	model: mongoose.Model<any>,
	key: string
): Promise<Published> => {
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
	const doc: any = await model.findOne({ route: key }, { data: 1, version: 1, source: 1 }).lean();
	const value = doc?.data ? { data: doc.data, version: doc.version || 0, source: doc.source || 'inherit' } : null;
	cache.set(key, { at: Date.now(), value });
	return value;
};

let globalCache: { at: number; value: { settings: 'db' | 'code'; config: 'db' | 'code' } } | null = null;

/** The global switch, cached like the route documents. Defaults to 'db'. */
export const getGlobalSources = async () => {
	if (globalCache && Date.now() - globalCache.at < TTL_MS) return globalCache.value;
	const doc: any = await BuilderState.findOne({ key: 'global' }).lean();
	const value = { settings: doc?.settings || 'db', config: doc?.config || 'db' };
	globalCache = { at: Date.now(), value };
	return value;
};

/** 'db' or 'code' — what a route's published copy of `kind` would be served from. */
export const effectiveSource = (
	source: Source | undefined,
	global: { settings: 'db' | 'code'; config: 'db' | 'code' },
	kind: Kind
): 'db' | 'code' => (source && source !== 'inherit' ? source : global[kind]);

/**
 * The published copy a route runs on, or null when it runs on code — either
 * because there's no published copy or because its source says code.
 */
const active = async (kind: Kind, key: string): Promise<Published> => {
	const [published, global] = await Promise.all([
		kind === 'settings' ? load(settingsCache, RouteSettings, key) : load(configCache, RouteConfig, key),
		getGlobalSources(),
	]);
	if (!published) return null;
	return effectiveSource(published.source, global, kind) === 'db' ? published : null;
};

export const getActiveSettings = (key: string) => active('settings', key);
export const getActiveConfig = (key: string) => active('config', key);

/** Forget cached lookups — for one route after it's published, or all. */
export const invalidateRoute = (key?: string) => {
	if (!key) {
		globalCache = null;
		settingsCache.clear();
		configCache.clear();
		builtCache.clear();
		return;
	}
	settingsCache.delete(key);
	configCache.delete(key);
	for (const k of builtCache.keys()) if (k.startsWith(`${key}@`)) builtCache.delete(k);
};

/** The route key for a request inside a defineRoutes router: its mount path. */
export const resourceRouteKey = (req: any): string | null => {
	const base: string = req?.baseUrl || '';
	if (!base.startsWith(`${ADMIN_API_PREFIX}/`)) return null;
	return base.slice(ADMIN_API_PREFIX.length + 1) || null;
};

export type CodeRoute = {
	Model: mongoose.Model<any>;
	settings: Record<string, any>;
	frontendConfig?: any;
	/** constructConfig over the code settings, built once at boot. */
	built: any;
};

export type ResolvedRoute = {
	key: string | null;
	/** The settings-file object the route runs on. */
	settings: Record<string, any>;
	/** The config-file object, or null when neither DB nor code has one. */
	frontendConfig: any | null;
	/** constructConfig over `settings`: validators, edits, query options… */
	built: any;
	sources: { settings: 'db' | 'code'; config: 'db' | 'code' | 'none' };
};

export const resolveRoute = async (key: string | null, code: CodeRoute): Promise<ResolvedRoute> => {
	const codeResolved: ResolvedRoute = {
		key,
		settings: code.settings,
		frontendConfig: code.frontendConfig || null,
		built: code.built,
		sources: { settings: 'code', config: code.frontendConfig ? 'code' : 'none' },
	};
	if (!key) return codeResolved;

	const [settings, config] = await Promise.all([getActiveSettings(key), getActiveConfig(key)]);

	let resolved = codeResolved;

	if (settings) {
		const cacheKey = `${key}@${settings.version}`;
		let entry = builtCache.get(cacheKey);
		// A model built in the model builder is recompiled when it changes, so
		// the same published version can meet a new Model: rebuild for it.
		if (!entry || entry.model !== code.Model) {
			const settingsObj = dataToSettings(settings.data);
			entry = {
				model: code.Model,
				settings: settingsObj,
				built: constructConfig({
					model: code.Model,
					config: settingsObj,
					options: { role: 'admin' },
				}),
			};
			builtCache.set(cacheKey, entry);
		}
		resolved = { ...resolved, settings: entry.settings, built: entry.built };
		resolved.sources = { ...resolved.sources, settings: 'db' };
	}

	// A RouteConfig that holds only filters (seeded for a route without a
	// config file) doesn't make the route a generic page.
	const { filters, ...configRest } = config?.data || {};
	if (config && Object.keys(configRest).length) {
		resolved = { ...resolved, frontendConfig: configRest };
		resolved.sources = { ...resolved.sources, config: 'db' };
	}

	return resolved;
};
