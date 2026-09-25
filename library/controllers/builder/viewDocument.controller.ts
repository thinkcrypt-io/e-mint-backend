import { Response } from 'express';
import mongoose from 'mongoose';
import { accessRule, isAccessRestricted } from '../../functions/recordAccess.function.js';
import Role from '../../models/admin-role/model.js';
import constructConfig from '../../../lib/configurator/constructConfig.js';
import { collectResourceRoutes, getDynamicVersion, ResourceRouteEntry } from '../../functions/routeRegistry.function.js';
import { resolveRoute, ResolvedRoute } from '../../functions/resolveRoute.function.js';

/**
 * GET /<route>/get/view/:id — one record, laid out by the route's `view`
 * config: sections of its own fields, fields of the records it references,
 * and lists of records in other routes that reference it.
 *
 * Everything that crosses into another collection is filtered on the way
 * out, because the view config is data an admin can publish: a field is never
 * returned from a referenced or related record if its model marks it
 * `select: false`, its name looks like a secret, or that route's settings
 * hide it (`exclude`). A related list is only filled in for someone who could
 * read that route anyway.
 *
 * `viewTabs` (also in the config) are related lists shown as tabs after the
 * Overview — e.g. an author's blogs. This response carries each tab's title
 * and count; `getViewTab` pages through one.
 *
 * 404 when the route has neither, so the admin falls back to the layout it
 * had before.
 */

const SENSITIVE = /pass(word)?|token|secret|api_?key|apikey|private|otp|salt|hash/i;
const MAX_RELATED = 50;
const MAX_TAB_PAGE = 100;

// Rebuilt when a model-builder route is added, changed or removed.
let registry: { version: number; map: Map<string, ResourceRouteEntry> } | null = null;
const resources = (app: any) => {
	if (registry?.version !== getDynamicVersion())
		registry = { version: getDynamicVersion(), map: new Map(collectResourceRoutes(app).map(e => [e.route, e])) };
	return registry.map;
};

// Keyed by the Model too: a built model is recompiled when it changes.
const codeBuilt = new Map<string, { Model: any; built: any }>();
const resolveOther = (entry: ResourceRouteEntry): Promise<ResolvedRoute> => {
	let hit = codeBuilt.get(entry.route);
	if (!hit || hit.Model !== entry.source.Model) {
		hit = {
			Model: entry.source.Model,
			built: constructConfig({ model: entry.source.Model, config: entry.source.settings, options: { role: 'admin' } }),
		};
		codeBuilt.set(entry.route, hit);
	}
	return resolveRoute(entry.route, { ...entry.source, built: hit.built });
};

/** Model paths that may be shown: not select:false, not secret-looking. */
const readable = (model: mongoose.Model<any>, settings: Record<string, any> = {}) => (path: string) => {
	if (!path || path.startsWith('+') || path.startsWith('-') || SENSITIVE.test(path)) return false;
	if (settings[path]?.exclude) return false;
	const type: any = model.schema.path(path);
	if (type?.options?.select === false) return false;
	return true;
};

const instanceOf = (model: mongoose.Model<any>, path: string) => {
	const type: any = model.schema.path(path);
	return type?.caster?.instance && type.instance === 'Array' ? type.caster.instance : type?.instance || 'String';
};

const labelOf = (settings: Record<string, any>, key: string) =>
	settings[key]?.schema?.label || settings[key]?.title || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());

const refModelOf = (model: mongoose.Model<any>, path: string): mongoose.Model<any> | null => {
	const type: any = model.schema.path(path);
	const ref = type?.options?.ref || type?.caster?.options?.ref;
	return typeof ref === 'string' ? mongoose.models[ref] || null : null;
};

const routeForModel = (app: any, modelName: string) =>
	[...resources(app).values()].find(e => e.source.Model.modelName === modelName);

type RelatedItem = { related: string; foreignField: string; title?: string; columns?: string[] };

/**
 * Records of another route that point at record `id` through `foreignField`:
 * filtered to the columns that may be shown, to what the reader may see in
 * that route (its view permission, its record access), and populated so a
 * reference column shows a name rather than an id.
 */
const relatedPage = async (
	req: any,
	item: RelatedItem,
	id: string,
	canRead: (e: ResourceRouteEntry) => boolean,
	{ limit, page = 1, rows: wantRows = true }: { limit: number; page?: number; rows?: boolean }
) => {
	const entry = resources(req.app).get(item.related);
	if (!entry || !item.foreignField) return null;
	const Related = entry.source.Model;
	if (!Related.schema.path(item.foreignField)) return null;
	const relatedResolved = await resolveOther(entry);
	const columns: string[] = (item.columns || []).filter(readable(Related, relatedResolved.settings));
	const allowed = canRead(entry);
	let rows: any[] = [];
	let total = 0;
	if (allowed) {
		const filter: any = {
			[item.foreignField]: id,
			...(isAccessRestricted(Related) && accessRule(req.user?._id)),
		};
		const populate = (relatedResolved.built.QUERY_OPTIONS.populate || []).filter((p: any) =>
			columns.includes(typeof p === 'string' ? p : p?.path)
		);
		[rows, total] = await Promise.all([
			wantRows && columns.length
				? Related.find(filter)
						.select(columns.join(' '))
						.populate(populate)
						.sort('-createdAt')
						.skip((page - 1) * limit)
						.limit(limit)
						.lean()
				: Promise.resolve([]),
			Related.countDocuments(filter),
		]);
	}
	return {
		title: item.title || labelOf({}, item.related),
		route: item.related,
		foreignField: item.foreignField,
		allowed,
		total,
		columns: columns.map(k => ({
			key: k,
			label: labelOf(relatedResolved.settings, k),
			instance: instanceOf(Related, k),
		})),
		rows,
	};
};

const permissionsOf = async (req: any) => {
	const role: any = await Role.findById(req.user?.role).select('permissions').lean();
	const permissions: string[] = role?.permissions || [];
	return (entry: ResourceRouteEntry) =>
		permissions.includes('*') || permissions.includes(`view-${entry.source.permission}`);
};

const getViewDocument = ({ resolved, Model }: { resolved: ResolvedRoute; Model: mongoose.Model<any> }) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const view = resolved.frontendConfig?.view;
			const layout: any[] = Array.isArray(view) ? view : [];
			const tabItems: RelatedItem[] = Array.isArray(resolved.frontendConfig?.viewTabs)
				? resolved.frontendConfig.viewTabs
				: [];
			if (!layout.length && !tabItems.length)
				return res.status(404).json({ message: 'This route has no view config' });

			const { id } = req.params;
			if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' });

			const canRead = await permissionsOf(req);

			// Referenced records: populate each ref field with only the fields the
			// view asks for, after filtering them.
			const refPopulates: { path: string; select: string; match?: any }[] = [];
			const sections = [];

			for (const section of layout) {
				const items: any[] = [];
				for (const item of section.fields || []) {
					if (typeof item === 'string') {
						items.push({ kind: 'field', key: item });
						continue;
					}

					if (item?.field) {
						const target = refModelOf(Model, item.field);
						if (!target) continue;
						const targetRoute = routeForModel(req.app, target.modelName);
						const targetSettings = targetRoute ? (await resolveOther(targetRoute)).settings : {};
						const show: string[] = (item.show || []).filter(readable(target, targetSettings));
						if (!show.length) continue;
						// A linked record the reader may not see shows as empty, not as its fields.
						refPopulates.push({
							path: item.field,
							select: show.join(' '),
							...(isAccessRestricted(target) && { match: accessRule(req.user?._id) }),
						});
						items.push({
							kind: 'ref',
							key: item.field,
							label: item.label || labelOf(resolved.settings, item.field),
							route: targetRoute?.route,
							fields: show.map(k => ({
								key: `${item.field}.${k}`,
								label: labelOf(targetSettings, k),
								instance: instanceOf(target, k),
							})),
						});
						continue;
					}

					if (item?.related) {
						const limit = Math.min(Math.max(Number(item.limit) || 10, 1), MAX_RELATED);
						const related = await relatedPage(req, item, id, canRead, { limit });
						if (related) items.push({ kind: 'related', ...related });
					}
				}
				sections.push({
					title: section.title || '',
					description: section.description || '',
					columns: section.columns || 2,
					items,
				});
			}

			// The record itself: the route's own populates (as getById does),
			// plus the view's reference fields.
			const ownPopulate = (resolved.built.QUERY_OPTIONS.populate || []).filter(
				(p: any) => !refPopulates.some(r => r.path === (typeof p === 'string' ? p : p?.path))
			);
			// Through the route's own read rules (record access, when it has them) — not around them.
			const doc = await Model.findOne({ ...(req.queryHelper || {}), _id: id })
				.select(resolved.built.QUERY_OPTIONS.exclude || '')
				.populate([...ownPopulate, ...refPopulates])
				.lean();
			if (!doc) return res.status(404).json({ message: 'Document not found' });

			// Tabs: titles and counts only — each tab's rows load when it's opened.
			const tabs = (
				await Promise.all(
					tabItems.map(async (item, index) => {
						const t = await relatedPage(req, item, id, canRead, { limit: 1, rows: false });
						return t && { index, title: t.title, route: t.route, allowed: t.allowed, total: t.total };
					})
				)
			).filter(Boolean);

			return res.status(200).json({ doc, sections, tabs });
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

/**
 * GET /<route>/get/view/:id/tab/:index?page=&limit= — one page of a view tab's
 * related records. The record itself must be readable by the caller (the
 * route's record access applies), so a tab can't list what hangs off a record
 * they can't open.
 */
export const getViewTab = ({ resolved, Model }: { resolved: ResolvedRoute; Model: mongoose.Model<any> }) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const { id } = req.params;
			if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid id' });
			const item = (resolved.frontendConfig?.viewTabs || [])[Number(req.params.index)];
			if (!item) return res.status(404).json({ message: 'No such tab' });

			const exists = await Model.exists({ ...(req.queryHelper || {}), _id: id });
			if (!exists) return res.status(404).json({ message: 'Document not found' });

			const limit = Math.min(Math.max(Number(req.query.limit) || Number(item.pageSize) || 20, 1), MAX_TAB_PAGE);
			const page = Math.max(Number(req.query.page) || 1, 1);
			const tab = await relatedPage(req, item, id, await permissionsOf(req), { limit, page });
			if (!tab) return res.status(404).json({ message: 'This tab’s link is no longer valid' });

			return res.status(200).json({
				...tab,
				page,
				limit,
				totalPages: Math.max(1, Math.ceil(tab.total / limit)),
			});
		} catch (e: any) {
			console.error(e.message);
			return res.status(500).json({ message: e.message });
		}
	};
};

export default getViewDocument;
