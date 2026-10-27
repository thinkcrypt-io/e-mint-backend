import mongoose from 'mongoose';
import CommerceSettings from '../../models/tenancy/commerceSettings.model.js';
import { compiledModel } from '../dynamicModels.function.js';
import { ModelKey, modelSpecs, ModelSpec } from './blueprint.js';
import { commerceView } from './settings.js';
import { storeOf } from './store.js';
import { codeTaken } from './catalogue.js';

/**
 * Plain record saves on a store's models (docs/ecommerce EC5): money and stock
 * move only through the store's own actions, so the project's generic record
 * API (tables, forms, bulk actions, imports) may not write the engine's
 * fields, nor make or remove records only the store makes (orders, payments,
 * returns…). The store's engine writes through the compiled models directly
 * and never comes this way.
 *
 * Mounted on the project router before its built models (project.router.ts).
 */

const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Reads that are POSTs (stats, exports, the linked-rules preview). */
const READ_POSTS = /^\/(get|export)\/|^\/linked\/preview$/;
const ID = /^[a-f0-9]{24}$/i;

const refuse = (res: any, message: string) => res.status(403).json({ message, code: 'commerce_field' });

/** Treats a missing value and a type's empty one alike (a form sends 0 / '' / [] for untouched fields). */
const blank = (v: any) => v === undefined || v === null || v === '' || v === 0 || v === false || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !Object.keys(v).length);
const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null) || (blank(a) && blank(b));
const plain = (v: any) => JSON.parse(JSON.stringify(v ?? null));

const labelOf = (spec: ModelSpec, key: string) => spec.step.fields.find((f: any) => f.key === key)?.label || key;

const ENGINE_ONLY_TEXT: Partial<Record<ModelKey, string>> = {
	order: 'Orders are made at the POS or on the Orders page, and cancelled there',
	payment: 'Payments and refunds are taken on an order',
	return: 'Returns are made from an order',
	stock: 'Stock changes through sales, returns, adjustments and transfers',
	movement: 'Stock movements are written by the store',
	shift: 'Shifts are opened and closed at the POS',
	credit: 'Store credit is given by a refund or on the customer’s page',
};

export const commerceGuard = async (req: any, res: any, next: any) => {
	try {
		if (req.project?.type !== 'ecommerce' || READS.has(req.method)) return next();
		const [, route, ...rest] = req.path.split('/');
		const sub = `/${rest.join('/')}`;
		if (!route || READ_POSTS.test(sub)) return next();
		const doc: any = await CommerceSettings.findOne({}, { status: 1, installed: 1 }).lean();
		if (doc?.status !== 'ready') return next();
		const key = (Object.keys(doc.installed || {}) as ModelKey[]).find(k => doc.installed[k]?.route === route);
		if (!key) return next();
		const view = await commerceView(req.project);
		const spec = modelSpecs(view.answers).find(s => s.key === key)!;
		const body = req.body && typeof req.body === 'object' ? req.body : {};

		// Records only the store makes: a form may change the fields people added, and nothing else.
		if (spec.engineOnly) {
			const edit = (req.method === 'PUT' || req.method === 'PATCH') && (ID.test(rest[0] || '') || (rest[0] === 'edit' && ID.test(rest[1] || '')));
			if (!edit) return refuse(res, `${ENGINE_ONLY_TEXT[key] || 'These records are made by the store'} — not from this page.`);
		}

		const id = ID.test(rest[0] || '') ? rest[0] : rest[0] === 'edit' && ID.test(rest[1] || '') ? rest[1] : null;
		const saving = (req.method === 'POST' && (sub === '/' || sub === '')) || ((req.method === 'PUT' || req.method === 'PATCH') && id);

		// Variants are made from a product's options while variations are on; off, each product has its own.
		if (key === 'variant' && req.method === 'POST' && (sub === '/' || sub === '') && !view.answers.products.variations)
			return res.status(403).json({ message: 'Variations are off — each product is sold as itself. Switch them on in Store settings.', code: 'commerce_field' });

		// SKUs and barcodes name one item each: the POS finds an item by them.
		if (saving && (key === 'product' || key === 'variant')) {
			const store = await storeOf();
			for (const field of ['sku', 'barcode'] as const) {
				if (body[field] === undefined) continue;
				const self = key === 'product' ? { product: id } : { variant: id };
				const who = await codeTaken(store, field, body[field], self);
				if (who) return res.status(409).json({ message: `${who} already has the ${field === 'sku' ? 'SKU' : 'barcode'} ${String(body[field]).trim()}`, code: 'code_taken' });
			}
		}

		// One record changed: the engine's fields must come back as they are.
		if ((req.method === 'PUT' || req.method === 'PATCH') && id) {
			const Model: any = compiledModel(doc.installed[key].name);
			const before: any = Model && mongoose.isValidObjectId(id) ? await Model.findById(id).lean() : null;
			const core = new Set<string>(spec.step.fields.map((f: any) => f.key));
			const touched = Object.keys(body).filter(k => (spec.engine.includes(k) || (spec.engineOnly && core.has(k))) && !same(plain(before?.[k]), plain(body[k])));
			if (touched.length) return refuse(res, `${touched.map(k => labelOf(spec, k)).join(', ')} ${touched.length === 1 ? 'is' : 'are'} kept by the store and can’t be changed here.`);
			return next();
		}

		// A new record: nothing in the engine's fields.
		if (req.method === 'POST' && (sub === '/' || sub === '')) {
			const given = spec.engine.filter(k => !blank(body[k]));
			if (given.length) return refuse(res, `${given.map(k => labelOf(spec, k)).join(', ')} ${given.length === 1 ? 'is' : 'are'} kept by the store — leave ${given.length === 1 ? 'it' : 'them'} out.`);
			return next();
		}

		// An import leaves the engine's columns out (importRows reads `importExclude`).
		if (/^\/bulk\/import$/.test(sub)) {
			req.importExclude = spec.engine;
			return next();
		}
		// Many records at once: duplicates, merges and edits across rows would copy or set the engine's fields.
		if (spec.engine.length && /^\/(bulk\/(duplicate|merge|status)|update\/many|copy\/)/.test(sub))
			return refuse(res, `This can’t be done to ${spec.step.title.toLowerCase()} in bulk — the store keeps some of their fields.`);
		return next();
	} catch (e) {
		next(e);
	}
};
