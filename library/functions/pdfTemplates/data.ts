import mongoose from 'mongoose';
import { accessRule, isAccessRestricted } from '../recordAccess.function.js';
import {
	labelOf,
	permissionsOf,
	readable,
	refModelOf,
	resolveOther,
	resources,
	routeForModel,
} from '../../controllers/builder/viewDocument.controller.js';
import { Block, PdfTemplateData } from './schema.js';
import { tokenPaths } from './tokens.js';

/**
 * A record's data for a template (docs/pdf-templates D5): the record, the
 * records it references that the tokens reach (two steps at most), and the
 * template's declared lists — with the view page's rules. Only readable
 * fields cross into another collection (no `select: false`, nothing that
 * looks like a secret, nothing the route's settings exclude); a referenced
 * record the reader may not open comes back empty; a list is only filled for
 * someone who can read its page. The record itself is read with the route's
 * filter and access rules by the caller.
 */

const MAX_DEPTH = 2;

/* ------------------------------------------------------------- paths */

const textsOf = (b: any): string[] => {
	const out: string[] = [];
	if (typeof b.text === 'string') out.push(b.text);
	if (typeof b.src === 'string') out.push(b.src);
	for (const r of b.rows && Array.isArray(b.rows) ? b.rows : []) out.push(r?.label || '', r?.value || '');
	return out;
};

/** Every data path a template reads, with table cells written out in full (`invoice.items.price`). */
export const templatePaths = (t: Pick<PdfTemplateData, 'header' | 'body' | 'footer'>): string[] => {
	const out = new Set<string>();
	const add = (p: string) => out.add(p);
	const walk = (blocks: Block[]) => {
		for (const b of blocks || []) {
			for (const c of b.showIf || []) add(c.field);
			for (const text of textsOf(b)) tokenPaths(text).forEach(add);
			if (b.type === 'table') {
				const rows = String(b.rows || '').replace(/^\{\{\s*|\s*\}\}$/g, '').split('|')[0].trim();
				if (rows) add(rows);
				for (const c of b.columns || [])
					for (const p of [...tokenPaths(c.header || ''), ...tokenPaths(c.value || '')]) add(p.startsWith('item.') && rows ? `${rows}.${p.slice(5)}` : p);
			}
			if (b.type === 'columns') for (const c of b.columns || []) walk(c.blocks);
			if (b.type === 'box') walk(b.blocks);
		}
	};
	walk(t.header);
	walk(t.body);
	walk(t.footer);
	return [...out];
};

/* ---------------------------------------------------------- populate */

type Populate = { path: string; select: string; match?: any; populate?: Populate[] };

const SECRET = /pass(word)?|token|secret|api_?key|apikey|private|otp|salt|hash/i;

const settingsFor = async (req: any, model: mongoose.Model<any>) => {
	const entry = routeForModel(req.app, model.modelName);
	return entry ? (await resolveOther(entry)).settings || {} : {};
};

/** The fields of a model a template may print. */
const readablePaths = (model: mongoose.Model<any>, settings: Record<string, any>) =>
	Object.keys(model.schema.paths).filter(p => p !== '__v' && readable(model, settings)(p) && settings[p]?.schema?.type !== 'password');

/**
 * What to populate for these paths (relative to `model`): each reference the
 * paths go through, with only its readable fields, and the references after
 * it, up to two steps from the record.
 */
export const populateFor = async (req: any, model: mongoose.Model<any>, paths: string[], depth = 1): Promise<Populate[]> => {
	const byRef = new Map<string, { target: mongoose.Model<any>; rest: string[] }>();
	for (const path of paths) {
		const segs = path.split('.');
		for (let i = 1; i <= segs.length; i++) {
			const prefix = segs.slice(0, i).join('.');
			if (!model.schema.path(prefix)) continue;
			const target = refModelOf(model, prefix);
			if (!target) continue;
			const hit = byRef.get(prefix) || { target, rest: [] };
			if (i < segs.length) hit.rest.push(segs.slice(i).join('.'));
			byRef.set(prefix, hit);
			break;
		}
	}
	const out: Populate[] = [];
	for (const [path, { target, rest }] of byRef) {
		const settings = await settingsFor(req, target);
		const select = readablePaths(target, settings);
		if (!select.length) continue;
		out.push({
			path,
			select: select.join(' '),
			...(isAccessRestricted(target) && { match: accessRule(req.user?._id) }),
			...(depth < MAX_DEPTH && rest.length && { populate: await populateFor(req, target, rest, depth + 1) }),
		});
	}
	return out;
};

/** The record without what it may not show: secret-looking, `select: false`, excluded and password fields. */
export const cleanRecord = (doc: any, model: mongoose.Model<any>, settings: Record<string, any>) => {
	if (!doc || typeof doc !== 'object') return doc;
	const ok = readable(model, settings);
	for (const k of Object.keys(doc)) {
		if (k === '_id') continue;
		if (SECRET.test(k) || settings[k]?.schema?.type === 'password' || (model.schema.path(k) && !ok(k))) delete doc[k];
	}
	return doc;
};

/** Paths under one root, without it: `invoice.customer.name` → `customer.name`. */
export const under = (paths: string[], roots: string[]) =>
	paths
		.map(p => {
			const [root, ...rest] = p.split('.');
			return roots.includes(root) && rest.length ? rest.join('.') : null;
		})
		.filter(Boolean) as string[];

/* -------------------------------------------------------------- lists */

/** A template's declared lists for one record — empty for a page the reader can't read. */
export const loadLists = async (req: any, template: PdfTemplateData, recordIds: string[], paths: string[]) => {
	const out = new Map<string, Record<string, any[]>>();
	recordIds.forEach(id => out.set(id, {}));
	if (!template.lists?.length || !recordIds.length) return out;
	const canRead = await permissionsOf(req);
	for (const list of template.lists) {
		recordIds.forEach(id => (out.get(id)![list.name] = []));
		const entry = resources(req.app).get(list.route);
		if (!entry || !canRead(entry)) continue;
		const Model = entry.source.Model;
		if (!Model.schema.path(list.foreignField)) continue;
		const settings = (await resolveOther(entry)).settings || {};
		if (!readable(Model, settings)(list.foreignField)) continue;
		const and: any[] = [{ [list.foreignField]: { $in: recordIds.map(id => new mongoose.Types.ObjectId(id)) } }];
		if (isAccessRestricted(Model)) and.push(accessRule(req.user?._id));
		const populate = await populateFor(req, Model, under(paths, [list.name]));
		const rows = await Model.find({ $and: and })
			.select(readablePaths(Model, settings).join(' '))
			.populate(populate as any)
			.sort(list.sort || 'createdAt')
			.limit((list.limit || 500) * Math.max(1, recordIds.length))
			.lean();
		for (const row of rows as any[]) {
			const owner = row[list.foreignField];
			const ids = (Array.isArray(owner) ? owner : [owner]).map((v: any) => String(v?._id ?? v));
			for (const id of ids) {
				const bucket = out.get(id)?.[list.name];
				if (bucket && bucket.length < (list.limit || 500)) bucket.push(cleanRecord(row, Model, settings));
			}
		}
	}
	return out;
};

/* ------------------------------------------------------------- fields */

export type FieldNode = { path: string; label: string; type: string; list?: boolean; children?: FieldNode[] };

const kindOf = (model: mongoose.Model<any>, path: string, settings: Record<string, any>): string => {
	const t: any = model.schema.path(path);
	const s = settings[path]?.schema?.type;
	if (s === 'image' || s === 'images') return 'image';
	const inst = t?.instance === 'Array' ? t?.caster?.instance : t?.instance;
	if (refModelOf(model, path)) return 'reference';
	if (t?.instance === 'Array' && t?.schema) return 'list';
	if (inst === 'Number' || inst === 'Decimal128') return 'number';
	if (inst === 'Date') return 'date';
	if (inst === 'Boolean') return 'boolean';
	return 'text';
};

/** Top-level fields of a model as the field picker shows them, sections and section lists opened up. */
const fieldsOf = async (req: any, model: mongoose.Model<any>, prefix: string, depth: number): Promise<FieldNode[]> => {
	const settings = await settingsFor(req, model);
	const seen = new Set<string>();
	const out: FieldNode[] = [];
	for (const p of readablePaths(model, settings)) {
		if (p.startsWith('_') && p !== '_id') continue;
		if (['organization', 'project', 'access', 'privacy', 'archivedBy', 'archivedAt'].includes(p)) continue;
		const top = p.split('.')[0];
		const t: any = model.schema.path(p);
		// A section (nested object): its fields under it.
		if (p.includes('.') && !model.schema.path(top)) {
			if (seen.has(top)) continue;
			seen.add(top);
			const kids = readablePaths(model, settings).filter(k => k.startsWith(`${top}.`));
			out.push({
				path: `${prefix}${top}`,
				label: labelOf(settings, top),
				type: 'section',
				children: kids.map(k => ({ path: `${prefix}${k}`, label: labelOf(settings, k) || k.split('.').pop()!, type: kindOf(model, k, settings) })),
			});
			continue;
		}
		const type = kindOf(model, p, settings);
		const node: FieldNode = { path: `${prefix}${p}`, label: p === '_id' ? 'ID' : labelOf(settings, p), type };
		if (t?.instance === 'Array') node.list = true;
		if (type === 'list' && t?.schema) {
			node.children = Object.keys(t.schema.paths)
				.filter(k => k !== '_id' && !SECRET.test(k))
				.map(k => ({ path: `item.${k}`, label: k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase()), type: kindOf({ schema: t.schema } as any, k, {}) }));
		}
		if (type === 'reference' && depth < MAX_DEPTH) {
			const target = refModelOf(model, p);
			if (target) node.children = await fieldsOf(req, target, `${prefix}${p}.`, depth + 1);
		}
		out.push(node);
	}
	return out;
};

/** The pages whose records point at this one — what a template's `lists` can show. */
const backlinks = async (req: any, model: mongoose.Model<any>, canRead: (e: any) => boolean) => {
	const out: { route: string; title: string; foreignField: string; fieldLabel: string; fields: FieldNode[] }[] = [];
	for (const entry of resources(req.app).values()) {
		const M = entry.source.Model;
		if (!canRead(entry)) continue;
		for (const [path, type] of Object.entries<any>(M.schema.paths)) {
			const ref = type?.options?.ref || type?.caster?.options?.ref;
			if (ref !== model.modelName && !(typeof ref === 'string' && ref.endsWith(`_${model.modelName}`))) continue;
			const resolved = await resolveOther(entry);
			out.push({
				route: entry.route,
				title: resolved.frontendConfig?.route?.title || resolved.frontendConfig?.title || entry.route,
				foreignField: path,
				fieldLabel: labelOf(resolved.settings || {}, path),
				fields: await fieldsOf(req, M, 'item.', 2),
			});
		}
	}
	return out.slice(0, 30);
};

/** The field picker: the page's fields (references opened two steps) and the lists other pages can give. */
export const fieldTree = async (req: any, route: string) => {
	const entry = resources(req.app).get(route);
	if (!entry) return null;
	const Model = entry.source.Model;
	const resolved = await resolveOther(entry);
	const canRead = await permissionsOf(req);
	return {
		route,
		title: resolved.frontendConfig?.route?.title || resolved.frontendConfig?.title || route,
		model: Model.modelName,
		fields: await fieldsOf(req, Model, '', 1),
		lists: await backlinks(req, Model, canRead),
	};
};
