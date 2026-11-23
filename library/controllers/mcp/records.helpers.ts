import mongoose from 'mongoose';
import { isSecretPath } from '../../functions/routeRegistry.function.js';
import ModelDefinition from '../../models/builder/modelDefinition.model.js';
import { displayFieldOf } from '../../functions/dynamicModels.function.js';

/** Finding records by what people call them — shared by the MCP's record tools. */

const NAMING = ['name', 'title', 'label', 'code', 'email', 'slug'];

/** A model's naming fields: the usual ones and its unique text fields (an industry's code). */
export const namingFields = (Model: mongoose.Model<any>) => [
	...new Set([
		...NAMING.filter(f => Model.schema.path(f)),
		...Object.entries<any>(Model.schema.paths)
			.filter(([k, p]) => p?.instance === 'String' && p?.options?.unique && !k.includes('.') && !isSecretPath(k, p))
			.map(([k]) => k),
	]),
];

/**
 * The fields a linked model's records go by: its display field first (an employee's
 * Full name), then the usual ones. `refName` is the name a definition links to ('Employee').
 */
export const refNaming = async (refName: string, Ref: mongoose.Model<any>) => {
	const def: any = await ModelDefinition.findOne({ name: refName }, { displayField: 1, fields: 1 }).lean();
	const display = def ? displayFieldOf(def) : '';
	const own = display && display !== '_id' && Ref.schema.path(display) ? [display] : [];
	return [...new Set([...own, ...namingFields(Ref)])];
};

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isObjectIdString = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

/** Linked records named by id, or by name / code / title (any case) → their ids. */
export const refIds = async (Ref: mongoose.Model<any>, values: any[], fields: string[] = namingFields(Ref)) => {
	const ids = values.filter(isObjectIdString).map(String);
	const names = values.filter(v => !ids.includes(String(v))).map(v => String(v).trim()).filter(Boolean);
	if (!names.length) return ids;
	const or = fields.flatMap(f => names.map(n => ({ [f]: new RegExp(`^${escapeRe(n)}$`, 'i') })));
	const found = or.length ? await Ref.find({ $or: or }, { _id: 1 }).limit(1000).lean() : [];
	return [...ids, ...found.map((d: any) => String(d._id))];
};
