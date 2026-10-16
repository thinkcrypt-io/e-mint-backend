import RouteConfig from '../../models/builder/routeConfig.model.js';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import { displayFieldOf, syncDynamicModels } from '../../functions/dynamicModels.function.js';
import { collectResourceRoutes, dynamicMounts } from '../../functions/routeRegistry.function.js';
import { MIN_QUERY, cleanQuery, guessDisplayField, searchRoutes } from '../../functions/navSearch.function.js';

/**
 * GET /tenant/api/p/:project/search?q=   a project's pages with search on
 * GET /admin/api/search?q=               the super admin's
 *
 * The navbar search's records (docs/multi-tenancy WO-54): `{ q, groups }`,
 * each group a page — `{ route, title, hits: [{ _id, name, match? }], more }`.
 * Only pages whose published config turns search on are asked, and each one
 * answers through its own list rules (navSearch.function.ts).
 */

/** Routes whose published config has search on, in the current scope. */
const enabledRoutes = async (): Promise<Set<string>> => {
	const docs: any[] = await RouteConfig.find({ 'data.route.search.enabled': true }, { route: 1 }).lean();
	return new Set(docs.map(d => d.route));
};

const byTitle = (a: { title?: string; route: string }, b: { title?: string; route: string }) =>
	(a.title || a.route).localeCompare(b.title || b.route);

const answer = (res: any, q: string, groups: any[]) => res.status(200).json({ q, groups });

/** Inside a project (its scope is set by the project router): its built models. */
export const tenantNavSearch = async (req: any, res: any) => {
	try {
		const q = cleanQuery(req.query.q);
		if (q.length < MIN_QUERY) return answer(res, q, []);
		await syncDynamicModels({ app: req.app });
		const enabled = await enabledRoutes();
		if (!enabled.size) return answer(res, q, []);
		const defs: any[] = await ModelDefinition.find({ route: { $in: [...enabled] }, active: { $ne: false } }).lean();
		const routes = defs
			.map(def => ({ route: def.route, router: dynamicMounts.get(def.route), display: displayFieldOf(def), title: def.title }))
			.filter(r => r.router?.searchRecords)
			.sort(byTitle);
		return answer(res, q, await searchRoutes(req, q, routes));
	} catch (e: any) {
		console.error('navbar search:', e?.message);
		return res.status(500).json({ message: 'Something went wrong' });
	}
};

/** The super admin: code routes and built models alike. */
export const adminNavSearch = async (req: any, res: any) => {
	try {
		const q = cleanQuery(req.query.q);
		if (q.length < MIN_QUERY) return answer(res, q, []);
		await syncDynamicModels({ app: req.app });
		const enabled = await enabledRoutes();
		if (!enabled.size) return answer(res, q, []);
		const defs: any[] = await ModelDefinition.find({ route: { $in: [...enabled] } }).lean();
		const defOf = new Map(defs.map(d => [d.route, d]));
		const routes = collectResourceRoutes(req.app)
			.filter(e => enabled.has(e.route) && e.router?.searchRecords)
			.map(e => {
				const def = defOf.get(e.route);
				return {
					route: e.route,
					router: e.router,
					display: def ? displayFieldOf(def) : guessDisplayField(e.source.Model),
					title: def?.title || e.source.frontendConfig?.route?.title,
				};
			})
			.sort(byTitle);
		return answer(res, q, await searchRoutes(req, q, routes));
	} catch (e: any) {
		console.error('navbar search:', e?.message);
		return res.status(500).json({ message: 'Something went wrong' });
	}
};
