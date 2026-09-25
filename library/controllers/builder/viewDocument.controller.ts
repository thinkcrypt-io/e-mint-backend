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

type RelatedItem = {
	related: string;
	/** Their field that points at this record (Blog.author → this author)… */
	foreignField?: string;
	/** …or this record's field that points at them (Author.books → those books). */
	localField?: string;
	title?: string;
	description?: string;
	columns?: string[];
	display?: 'table' | 'cards';
};

const IMAGE_TYPES = ['image', 'image-text', 'imageKey'];
const IMAGE_NAME = /(^|[._-])(image|img|photo|avatar|logo|thumbnail|thumb|picture|banner|cover|icon)s?$/i;

/**
 * How a column's values should be drawn — an image, not its URL; a date, a
 * number, a linked record's name — from the route's settings, else the model.
 */
const kindOf = (model: mongoose.Model<any>, settings: Record<string, any>, key: string) => {
	const t = settings[key]?.schema?.viewType || settings[key]?.schema?.type;
	if (IMAGE_TYPES.includes(t)) return 'image';
	if (t === 'image-array') return 'images';
	if (t === 'file') return 'file';
	if (t === 'file-array') return 'files';
	if (t === 'editor' || t === 'basic-editor') return 'html';
	if (t === 'color') return 'color';
	const type: any = model.schema.path(key);
	const isArray = type?.instance === 'Array';
	const instance = isArray ? type?.caster?.instance : type?.instance;
	const ref = type?.options?.ref || type?.caster?.options?.ref;
	if (ref) return isArray ? 'refs' : 'ref';
	if (instance === 'String' && IMAGE_NAME.test(key)) return isArray ? 'images' : 'image';
	if (isArray) return 'tags';
	if (instance === 'Date') return 'date';
	if (instance === 'Number') return 'number';
	if (instance === 'Boolean') return 'boolean';
	return 'text';
};

const escapeRx = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The records a related list or view tab shows for record `id` — linked
 * either way (their `foreignField` is this record, or this record's
 * `localField` holds them) — filtered to the columns that may be shown, to
 * what the reader may see in that route (its view permission, its record
 * access), optionally searched, and populated so a reference column shows a
 * name rather than an id.
 */
const relatedPage = async (
	req: any,
	item: RelatedItem,
	id: string,
	canRead: (e: ResourceRouteEntry) => boolean,
	{
		limit,
		page = 1,
		rows: wantRows = true,
		search = '',
		parent,
	}: { limit: number; page?: number; rows?: boolean; search?: string; parent?: any }
) => {
	const entry = resources(req.app).get(item.related);
	if (!entry) return null;
	const Related = entry.source.Model;

	let link: any;
	if (item.foreignField) {
		if (!Related.schema.path(item.foreignField)) return null;
		link = { [item.foreignField]: id };
	} else if (item.localField) {
		if (!parent) return null;
		const raw = parent[item.localField];
		const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((x: any) => x?._id || x).filter(Boolean);
		link = { _id: { $in: ids } };
	} else return null;

	const relatedResolved = await resolveOther(entry);
	const settings = relatedResolved.settings || {};
	const columns: string[] = (item.columns || []).filter(readable(Related, settings));
	const allowed = canRead(entry);
	let rows: any[] = [];
	let total = 0;
	if (allowed) {
		const and: any[] = [link];
		if (isAccessRestricted(Related)) and.push(accessRule(req.user?._id));
		// Search: the route's own searchable text fields, plus the text columns shown.
		const term = String(search || '').trim().slice(0, 100);
		if (term) {
			const fields = [
				...new Set([
					...Object.keys(settings).filter(k => settings[k]?.search),
					...columns,
				]),
			].filter(k => readable(Related, settings)(k) && instanceOf(Related, k) === 'String' && !(Related.schema.path(k) as any)?.options?.ref);
			const rx = new RegExp(escapeRx(term), 'i');
			and.push(fields.length ? { $or: fields.map(k => ({ [k]: rx })) } : { _id: null });
		}
		const filter = and.length > 1 ? { $and: and } : link;
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
		description: item.description || '',
		display: item.display === 'cards' ? 'cards' : 'table',
		route: item.related,
		foreignField: item.foreignField,
		localField: item.localField,
		allowed,
		total,
		columns: columns.map(k => ({
			key: k,
			label: labelOf(settings, k),
			instance: instanceOf(Related, k),
			kind: kindOf(Related, settings, k),
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
						const t = await relatedPage(req, item, id, canRead, { limit: 1, rows: false, parent: doc });
						return (
							t && {
								index,
								title: t.title,
								description: t.description,
								display: t.display,
								route: t.route,
								allowed: t.allowed,
								total: t.total,
							}
						);
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
 * GET /<route>/get/view/:id/tab/:index?page=&limit=&search= — one page of a view tab's
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

			// The record must be readable by the caller; its link field is read when
			// the tab lists what the record itself holds.
			const parent = await Model.findOne({ ...(req.queryHelper || {}), _id: id })
				.select(item.localField ? `_id ${item.localField}` : '_id')
				.lean();
			if (!parent) return res.status(404).json({ message: 'Document not found' });

			const limit = Math.min(Math.max(Number(req.query.limit) || Number(item.pageSize) || 20, 1), MAX_TAB_PAGE);
			const page = Math.max(Number(req.query.page) || 1, 1);
			const tab = await relatedPage(req, item, id, await permissionsOf(req), {
				limit,
				page,
				parent,
				search: typeof req.query.search === 'string' ? req.query.search : '',
			});
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
