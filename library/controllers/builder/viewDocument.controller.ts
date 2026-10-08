import { Response } from 'express';
import mongoose from 'mongoose';
import { accessRule, isAccessRestricted } from '../../functions/recordAccess.function.js';
import Role from '../../models/admin-role/model.js';
import constructConfig from '../../../lib/configurator/constructConfig.js';
import { collectResourceRoutes, getDynamicVersion, ResourceRouteEntry, scopedModel } from '../../functions/routeRegistry.function.js';
import { currentScope, scopeKey } from '../../functions/tenantScope.function.js';
import { grants } from '../../functions/tenantPermissions.function.js';
import { resolveRoute, ResolvedRoute } from '../../functions/resolveRoute.function.js';
import { Rules, hiddenFields, isEmpty, ruleMatches, valueAt } from '../../functions/formRules.function.js';
import { rollupsOf, withRollups } from '../../functions/rollups.function.js';

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

// Rebuilt when a model-builder route is added, changed or removed. Per scope:
// a tenant project's routes are its own (docs/multi-tenancy).
const registries = new Map<string, { version: number; map: Map<string, ResourceRouteEntry> }>();
export const resources = (app: any) => {
	const key = scopeKey();
	let registry = registries.get(key);
	if (registry?.version !== getDynamicVersion()) {
		registry = { version: getDynamicVersion(), map: new Map(collectResourceRoutes(app).map(e => [e.route, e])) };
		registries.set(key, registry);
	}
	return registry.map;
};

// Keyed by the Model too: a built model is recompiled when it changes.
const codeBuilt = new Map<string, { Model: any; built: any }>();
export const resolveOther = (entry: ResourceRouteEntry): Promise<ResolvedRoute> => {
	const key = `${scopeKey()}|${entry.route}`;
	let hit = codeBuilt.get(key);
	if (!hit || hit.Model !== entry.source.Model) {
		hit = {
			Model: entry.source.Model,
			built: constructConfig({ model: entry.source.Model, config: entry.source.settings, options: { role: 'admin' } }),
		};
		codeBuilt.set(key, hit);
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
	return typeof ref === 'string' ? scopedModel(ref) : null;
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
	/** View tabs only: the add button (on unless false) and its text. */
	allowAdd?: boolean;
	addLabel?: string;
	/**
	 * A tab reaching its records through a route in between (a client's
	 * documents, through its projects): `via` links that route to this record,
	 * either way round, and `foreignField` / `localField` above then link the
	 * tab's records to *it* (Document.project), not to this record.
	 */
	via?: { route: string; foreignField?: string; localField?: string };
	/** View tabs only: conditions every listed record must meet ("status is due"). */
	where?: TabCondition[];
	/** How `where` combines: every condition (default) or any one. */
	match?: 'all' | 'any';
};

export type TabCondition = { field: string; op: string; value?: any };

/** What a tab condition can say. `is` conditions also fill the add form. */
export const TAB_OPS = ['is', 'not', 'in', 'gt', 'gte', 'lt', 'lte', 'contains', 'empty', 'filled'] as const;

/** A condition's value as the field stores it: a number, a date, yes/no, an id. */
const castFor = (model: mongoose.Model<any>, path: string, v: any): any => {
	const type: any = model.schema.path(path);
	const instance = type?.instance === 'Array' ? type?.caster?.instance : type?.instance;
	if (Array.isArray(v)) return v.map(x => castFor(model, path, x));
	if (v === null || v === undefined || v === '') return v;
	if (instance === 'Number') return Number.isFinite(Number(v)) ? Number(v) : undefined;
	if (instance === 'Boolean') return v === true || v === 'true' || v === 'yes';
	if (instance === 'Date') {
		const d = new Date(v);
		return Number.isNaN(d.getTime()) ? undefined : d;
	}
	if (instance === 'ObjectId') return mongoose.isValidObjectId(v) ? new mongoose.Types.ObjectId(String(v)) : undefined;
	return String(v);
};

/**
 * A tab's conditions as a query — only on fields the tab may show (not secret,
 * not hidden); a condition on anything else, or with a value that doesn't fit
 * the field, is left out rather than failing the page.
 */
export const conditionsQuery = (
	model: mongoose.Model<any>,
	settings: Record<string, any>,
	where: TabCondition[] = [],
	match: 'all' | 'any' = 'all'
) => {
	const ok = readable(model, settings);
	const out: any[] = [];
	for (const c of where.slice(0, 10)) {
		if (!c?.field || !ok(c.field) || !model.schema.path(c.field)) continue;
		const f = c.field;
		// Empty means what it can for the field: no list items, no text, no value.
		const type: any = model.schema.path(f);
		const isList = type?.instance === 'Array';
		const isText = type?.instance === 'String';
		if (c.op === 'empty') {
			out.push({ $or: [{ [f]: null }, ...(isList ? [{ [f]: { $size: 0 } }] : isText ? [{ [f]: '' }] : [])] });
			continue;
		}
		if (c.op === 'filled') {
			out.push(isList ? { [`${f}.0`]: { $exists: true } } : { [f]: { $ne: null, ...(isText && { $nin: [''] }) } });
			continue;
		}
		const value = castFor(model, f, c.op === 'in' ? (Array.isArray(c.value) ? c.value : String(c.value ?? '').split(',').map(x => x.trim()).filter(Boolean)) : c.value);
		if (value === undefined || value === null || value === '') continue;
		if (c.op === 'is') out.push({ [f]: value });
		else if (c.op === 'not') out.push({ [f]: { $ne: value } });
		else if (c.op === 'in') out.push({ [f]: { $in: value } });
		else if (c.op === 'contains') out.push({ [f]: new RegExp(escapeRx(String(c.value)), 'i') });
		else if (['gt', 'gte', 'lt', 'lte'].includes(c.op)) out.push({ [f]: { [`$${c.op}`]: value } });
	}
	// Any one is enough: one $or over them (an unusable condition is left out either way).
	return match === 'any' && out.length > 1 ? [{ $or: out }] : out;
};

/** Most records a tab looks through on its way (the projects a client has). */
const MAX_VIA = 5000;

const idsOf = (raw: any): any[] => (Array.isArray(raw) ? raw : raw ? [raw] : []).map((x: any) => x?._id || x).filter(Boolean);

/**
 * The records in between for a `via` tab — the client's projects — through
 * that route's own read rules: its view permission and record access. Null
 * when the link is broken or the caller may not see them.
 */
const viaIds = async (
	req: any,
	via: NonNullable<RelatedItem['via']>,
	id: string,
	parent: any,
	canRead: (e: ResourceRouteEntry, verb?: 'view' | 'create') => boolean
): Promise<{ entry: ResourceRouteEntry; ids: any[] } | null> => {
	const entry = resources(req.app).get(via.route);
	if (!entry || !canRead(entry)) return null;
	const Mid = entry.source.Model;
	const and: any[] = [];
	if (via.foreignField) {
		if (!Mid.schema.path(via.foreignField)) return null;
		and.push({ [via.foreignField]: id });
	} else if (via.localField) {
		if (!parent) return null;
		and.push({ _id: { $in: idsOf(parent[via.localField]) } });
	} else return null;
	if (isAccessRestricted(Mid)) and.push(accessRule(req.user?._id));
	const ids = (await Mid.find(and.length > 1 ? { $and: and } : and[0]).select('_id').limit(MAX_VIA).lean()).map((d: any) => d._id);
	return { entry, ids };
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
	canRead: (e: ResourceRouteEntry, verb?: 'view' | 'create') => boolean,
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
	let viaAllowed = true;
	if (item.via?.route) {
		// Two steps: this record → the records in between → the tab's records.
		const mid = await viaIds(req, item.via, id, parent, canRead);
		if (!mid) {
			if (!resources(req.app).get(item.via.route)) return null;
			viaAllowed = false;
			link = { _id: null };
		} else if (item.foreignField) {
			if (!Related.schema.path(item.foreignField)) return null;
			link = { [item.foreignField]: { $in: mid.ids } };
		} else if (item.localField) {
			const held = await mid.entry.source.Model.find({ _id: { $in: mid.ids } })
				.select(item.localField)
				.lean();
			link = { _id: { $in: held.flatMap((d: any) => idsOf(d[item.localField as string])) } };
		} else return null;
	} else if (item.foreignField) {
		if (!Related.schema.path(item.foreignField)) return null;
		link = { [item.foreignField]: id };
	} else if (item.localField) {
		if (!parent) return null;
		link = { _id: { $in: idsOf(parent[item.localField]) } };
	} else return null;

	const relatedResolved = await resolveOther(entry);
	const settings = relatedResolved.settings || {};
	const columns: string[] = (item.columns || []).filter(readable(Related, settings));
	// A via tab also needs the route in between to be readable.
	const allowed = canRead(entry) && viaAllowed;
	let rows: any[] = [];
	let total = 0;
	if (allowed) {
		const and: any[] = [link, ...conditionsQuery(Related, settings, item.where, item.match)];
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
		...(item.via?.route && { via: item.via.route }),
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

/** Whether the caller may `verb` (view by default) in a route — the same names the route's own endpoints check. */
export const permissionsOf = async (req: any) => {
	// In a tenant project the caller is an organization member: their role's
	// permissions are on the request already (tenantProtect), checked the way
	// every project endpoint checks them. Looking them up as an admin Role found
	// nothing, so even the owner was told they couldn't see linked records.
	if (currentScope())
		return (entry: ResourceRouteEntry, verb: 'view' | 'create' = 'view') =>
			grants(req.permissions || [], [`${verb}-${entry.source.permission}`]);
	const role: any = await Role.findById(req.user?.role).select('permissions').lean();
	const permissions: string[] = role?.permissions || [];
	return (entry: ResourceRouteEntry, verb: 'view' | 'create' = 'view') =>
		permissions.includes('*') || permissions.includes(`${verb}-${entry.source.permission}`);
};

/**
 * A tab's add button: creates one of the tab's records already linked to this
 * one. Only when their field points here (`foreignField`) — the new record
 * carries the link itself. A `localField` tab would also have to edit this
 * record, so it has none. `allowed` is the caller's create permission on
 * that route; the button still shows without it, disabled.
 */
const addButtonOf = async (
	req: any,
	item: RelatedItem,
	can: (e: ResourceRouteEntry, verb?: 'view' | 'create') => boolean
) => {
	if (!item.foreignField || item.allowAdd === false) return null;
	const entry = resources(req.app).get(item.related);
	const path: any = entry?.source.Model.schema.path(item.foreignField);
	if (!entry || !path) return null;
	// Reached through another route: a new record would link to one of *those*
	// (which project?), not to this record — so the button shows, muted.
	if (item.via?.route) {
		const mid = resources(req.app).get(item.via.route);
		const midTitle = mid && (await resolveOther(mid)).frontendConfig?.route?.title;
		return {
			label: item.addLabel?.trim() || '',
			field: item.foreignField,
			many: path.instance === 'Array',
			allowed: false,
			nested: true,
			// Its name for the reason on hover ("…this record’s projects").
			via: String(midTitle || item.via.route).toLowerCase(),
		};
	}
	// A "Due bills" tab adds a bill that's already due: its `is` conditions fill the form.
	const defaults: Record<string, any> = {};
	// (Only when all must hold — with "any", no one value is implied.)
	(item.match === 'any' ? [] : item.where || []).forEach(c => {
		if (c?.op === 'is' && c.field && c.value !== undefined && c.value !== '' && entry.source.Model.schema.path(c.field))
			defaults[c.field] = castFor(entry.source.Model, c.field, c.value); // "false" → false, "100" → 100
	});
	return {
		label: item.addLabel?.trim() || '',
		field: item.foreignField,
		many: path.instance === 'Array',
		allowed: can(entry, 'create'),
		...(Object.keys(defaults).length && { defaults }),
	};
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
					...(section.copy && { copy: true }),
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

			// Shown only when needed: a section's `showIf`, a field's `viewRules`
			// (chained as the form's are), and a section's "hide fields with no
			// value". Fields from linked records are worked out first so rules can
			// read them. A section left with nothing to show is left out.
			const viewRules: Rules = resolved.frontendConfig?.viewRules || {};
			const conditional = Object.keys(viewRules).length || layout.some((s: any) => s?.showIf || s?.hideEmpty);
			let shownSections = sections;
			if (conditional) {
				const rollups = rollupsOf(resolved.settings);
				if (rollups.length) await withRollups(req, { doc }, rollups).catch(() => null);
				const hidden = new Set(hiddenFields(viewRules, doc));
				const read = (f: string) => (hidden.has(f) ? undefined : valueAt(doc, f));
				shownSections = sections
					.map((sec: any, i: number) => {
						const src = layout[i] || {};
						if (src.showIf && !ruleMatches(src.showIf, read)) return null;
						const items = sec.items.filter((it: any) => {
							const key = it.kind === 'field' || it.kind === 'ref' ? it.key : undefined;
							if (key && hidden.has(key)) return false;
							if (!src.hideEmpty) return true;
							if (key) return !isEmpty(valueAt(doc, key));
							if (it.kind === 'related') return !!it.total;
							return true;
						});
						return items.length || !sec.items.length ? { ...sec, items } : null;
					})
					.filter(Boolean);
			}

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

			return res.status(200).json({ doc, sections: shownSections, tabs });
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
				.select(['_id', item.via?.route ? item.via.localField : item.localField].filter(Boolean).join(' '))
				.lean();
			if (!parent) return res.status(404).json({ message: 'Document not found' });

			const limit = Math.min(Math.max(Number(req.query.limit) || Number(item.pageSize) || 20, 1), MAX_TAB_PAGE);
			const page = Math.max(Number(req.query.page) || 1, 1);
			const can = await permissionsOf(req);
			const tab = await relatedPage(req, item, id, can, {
				limit,
				page,
				parent,
				search: typeof req.query.search === 'string' ? req.query.search : '',
			});
			if (!tab) return res.status(404).json({ message: 'This tab’s link is no longer valid' });

			return res.status(200).json({
				...tab,
				add: await addButtonOf(req, item, can),
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
