import { Response } from 'express';
import mongoose from 'mongoose';
import ComponentDefinition from '../../models/builder/componentDefinition.model.js';
import { ModelDefinition } from '../../models/builder/_index.js';
import { syncDynamicModels } from '../../functions/dynamicModels.function.js';
import { recordProjectEvent } from '../../functions/recordHistory.function.js';
import { checkComponentFields, refreshComponentUsers, updateModelCore } from './models.controller.js';

/**
 * Build → Components (docs/cms D3, CMS-03): groups of fields made once and
 * used by any model — once, or as a repeatable list.
 *
 *   GET    /components            every component, with the models using it
 *   GET    /components/:id
 *   POST   /components            { category, name, title, description?, icon?, fields }
 *   PUT    /components/:id        the same; `category` and `name` (its uid) stay
 *   DELETE /components/:id        refused while a model uses it, naming them
 *   POST   /models/:id/make-component  { field, category, name, title } — a section made reusable
 *
 * Its fields are checked as a model's are (COMPONENT_KINDS); a change
 * recompiles every model using it and regenerates their forms.
 */

const PART = /^[a-z][a-z0-9-]{0,39}$/;
const isId = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

const fail = (res: Response, status: number, message: string, problems?: string[]) => res.status(status).json({ message, ...(problems && { problems }) });

/** The models using each component, by uid. */
const usage = async () => {
	const defs: any[] = await ModelDefinition.find({ 'fields.kind': { $in: ['component', 'blocks'] } }, { name: 1, title: 1, route: 1, fields: 1 }).lean();
	const by = new Map<string, { _id: string; title: string; route: string; field: string; repeatable: boolean; blocks?: boolean; component?: string }[]>();
	const add = (uid: string, entry: any) => {
		if (!by.has(uid)) by.set(uid, []);
		by.get(uid)!.push(entry);
	};
	for (const d of defs)
		for (const f of d.fields || []) {
			const where = { _id: String(d._id), title: d.title || d.name, route: d.route, field: f.label || f.key };
			if (f.kind === 'component' && f.component) add(f.component, { ...where, repeatable: !!f.repeatable });
			// A content blocks field that takes it (docs/cms D4).
			if (f.kind === 'blocks') for (const c of f.components || []) add(c, { ...where, repeatable: true, blocks: true });
		}
	// A component holding it (CMS-03b).
	const holders: any[] = await ComponentDefinition.find({ 'fields.kind': 'component' }, { uid: 1, title: 1, fields: 1 }).lean();
	for (const h of holders)
		for (const f of h.fields || [])
			if (f.kind === 'component' && f.component)
				add(f.component, { _id: String(h._id), title: h.title, route: '', field: f.label || f.key, repeatable: !!f.repeatable, component: h.uid });
	return by;
};

const view = (c: any, used: any[] = []) => ({
	_id: String(c._id),
	uid: c.uid,
	category: c.category,
	name: c.name,
	title: c.title,
	description: c.description || '',
	icon: c.icon || '',
	fields: c.fields || [],
	version: c.version || 1,
	usedBy: used,
	updatedAt: c.updatedAt,
});

const tidy = (v: any) =>
	String(v || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');

export const listComponents = async (_req: any, res: Response) => {
	try {
		const [docs, used] = await Promise.all([ComponentDefinition.find({}).sort({ category: 1, title: 1 }).lean(), usage()]);
		return res.json({ doc: docs.map((c: any) => view(c, used.get(c.uid))), total: docs.length });
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Something went wrong');
	}
};

export const getComponent = async (req: any, res: Response) => {
	try {
		if (!isId(req.params.id)) return fail(res, 404, 'Component not found');
		const c: any = await ComponentDefinition.findById(req.params.id).lean();
		if (!c) return fail(res, 404, 'Component not found');
		return res.json(view(c, (await usage()).get(c.uid)));
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Something went wrong');
	}
};

/** The parts every save checks: title, description, icon and fields. */
const common = async (req: any, uid?: string) => {
	const b = req.body || {};
	const problems: string[] = [];
	const title = String(b.title || '').trim().slice(0, 80);
	if (!title) problems.push('Give the component a title');
	const { fields, problems: fieldProblems } = await checkComponentFields(req, Array.isArray(b.fields) ? b.fields : [], uid);
	problems.push(...fieldProblems);
	return {
		problems,
		set: { title, description: String(b.description || '').trim().slice(0, 300), icon: String(b.icon || '').trim().slice(0, 40), fields },
	};
};

/**
 * Makes a component (no `id`) or changes one — for the panel and MCP alike.
 * Answers like a response: a status and a body (problems on 400).
 */
export const saveComponentCore = async (req: any, id: string | null, body: any): Promise<{ status: number; body: any }> => {
	const bad = (message: string, problems: string[]) => ({ status: 400, body: { message, problems } });
	req = { ...req, body };
	if (id) {
		if (!isId(id)) return { status: 404, body: { message: 'Component not found' } };
		const c: any = await ComponentDefinition.findById(id);
		if (!c) return { status: 404, body: { message: 'Component not found' } };
		const { problems, set } = await common(req, c.uid);
		if (problems.length) return bad('The component isn’t valid', problems);
		c.set({ ...set, version: (c.version || 1) + 1, updatedBy: req.user?._id });
		await c.save();
		await syncDynamicModels({ app: req.app, force: true });
		// Every model using it compiles again, and its forms follow.
		const users = await refreshComponentUsers(req, c.uid);
		recordProjectEvent({ req, action: 'update', model: 'Component', modelPath: 'components', document: c._id, name: c.title, text: `changed the component ${c.title}` });
		return { status: 200, body: { ...view(c.toObject(), (await usage()).get(c.uid)), refreshed: users } };
	}
	const category = tidy(body?.category) || 'shared';
	const name = tidy(body?.name || body?.title);
	const problems: string[] = [];
	if (!PART.test(category)) problems.push('The category is a short lowercase word, like “shared” or “content”');
	if (!PART.test(name)) problems.push('The name is lowercase letters, digits and dashes, starting with a letter');
	const { problems: more, set } = await common(req, `${category}.${name}`);
	problems.push(...more);
	if (problems.length) return bad('The component isn’t valid', problems);
	const uid = `${category}.${name}`;
	if (await ComponentDefinition.exists({ uid })) return bad(`There's already a component “${uid}” — pick another name`, [`There's already a component “${uid}”`]);
	const c: any = await ComponentDefinition.create({ uid, category, name, ...set, createdBy: req.user?._id, updatedBy: req.user?._id });
	await syncDynamicModels({ app: req.app, force: true });
	recordProjectEvent({ req, action: 'create', model: 'Component', modelPath: 'components', document: c._id, name: c.title, text: `made the component ${c.title}` });
	return { status: 201, body: view(c.toObject()) };
};

export const createComponent = async (req: any, res: Response) => {
	try {
		const out = await saveComponentCore(req, null, req.body || {});
		return res.status(out.status).json(out.body);
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Something went wrong');
	}
};

export const updateComponent = async (req: any, res: Response) => {
	try {
		const out = await saveComponentCore(req, req.params.id, req.body || {});
		return res.status(out.status).json(out.body);
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Something went wrong');
	}
};

/** Every component, with the models using it — for MCP. */
export const componentsWithUsage = async () => {
	const [docs, used] = await Promise.all([ComponentDefinition.find({}).sort({ category: 1, title: 1 }).lean(), usage()]);
	return docs.map((c: any) => view(c, used.get(c.uid)));
};

export const deleteComponent = async (req: any, res: Response) => {
	try {
		if (!isId(req.params.id)) return fail(res, 404, 'Component not found');
		const c: any = await ComponentDefinition.findById(req.params.id).lean();
		if (!c) return fail(res, 404, 'Component not found');
		const used = (await usage()).get(c.uid) || [];
		if (used.length)
			return fail(
				res,
				400,
				`${c.title} is used by ${used.map(u => `${u.title}${u.component ? ' (a component)' : ''} (${u.field})`).join(', ')} — take it off those fields first.`
			);
		await ComponentDefinition.deleteOne({ _id: c._id });
		await syncDynamicModels({ app: req.app, force: true });
		recordProjectEvent({ req, action: 'delete', model: 'Component', modelPath: 'components', document: c._id, name: c.title, text: `deleted the component ${c.title}` });
		return res.json({ message: 'Component deleted' });
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Something went wrong');
	}
};

/**
 * "Make reusable" (docs/cms D3, CMS-03b): a model's section or list of rows
 * becomes a component — made from its fields — and the field uses it, once or
 * as a list as it was. The records don't change: a component is stored just
 * as the section was. Other models can then use the same component.
 */
export const makeReusable = async (req: any, res: Response) => {
	try {
		if (!isId(req.params.id)) return fail(res, 404, 'Model not found');
		const def: any = await ModelDefinition.findById(req.params.id).lean();
		if (!def) return fail(res, 404, 'Model not found');
		const b = req.body || {};
		const f = (def.fields || []).find((x: any) => x.key === b.field);
		if (!f) return fail(res, 400, `${def.title} has no field “${b.field || ''}”`);
		if (f.kind !== 'section' && f.kind !== 'sectionlist') return fail(res, 400, `${f.label || f.key} isn’t a section or a list of rows`);
		const made = await saveComponentCore(req, null, {
			category: b.category || 'shared',
			name: b.name || b.title || f.label || f.key,
			title: String(b.title || f.label || f.key),
			description: b.description || '',
			icon: b.icon || '',
			fields: (f.fields || []).map(({ _id, ...x }: any) => x),
		});
		if (made.status !== 201) return res.status(made.status).json(made.body);
		const uid = made.body.uid;
		const field = {
			key: f.key,
			label: f.label,
			kind: 'component',
			component: uid,
			repeatable: f.kind === 'sectionlist',
			...(f.helper && { helper: f.helper }),
			...(f.showInTable !== undefined && { showInTable: f.showInTable }),
			...(f.kind === 'sectionlist' && f.addLabel && { addLabel: f.addLabel }),
		};
		const input = {
			title: def.title,
			description: def.description || '',
			displayField: def.displayField || '',
			kind: def.kind,
			draftAndPublish: def.draftAndPublish,
			code: def.code,
			access: def.access,
			fields: def.fields.map(({ _id, ...x }: any) => (x.key === f.key ? field : x)),
		};
		try {
			const { before, ...result } = await updateModelCore(req, def._id, input, { note: `Before making ${f.label || f.key} reusable` });
			recordProjectEvent({ req, action: 'update', model: 'Model', modelPath: 'model-builder', document: def._id, name: def.title, text: `made ${f.label || f.key} of ${def.title} the component ${made.body.title}` });
			return res.status(200).json({ component: made.body, model: (result as any).doc });
		} catch (e: any) {
			// The model kept its section: the component made for it goes again.
			await ComponentDefinition.deleteOne({ uid });
			await syncDynamicModels({ app: req.app, force: true });
			return fail(res, e?.status || 400, e?.message || 'The model couldn’t use the component', e?.problems);
		}
	} catch (e: any) {
		return fail(res, 500, e?.message || 'Something went wrong');
	}
};
