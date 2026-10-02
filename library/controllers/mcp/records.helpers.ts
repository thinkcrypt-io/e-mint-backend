import mongoose from 'mongoose';
import { isSecretPath } from '../../functions/routeRegistry.function.js';

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

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const isObjectIdString = (v: any) => mongoose.isValidObjectId(v) && /^[a-f0-9]{24}$/i.test(String(v));

/** Linked records named by id, or by name / code / title (any case) → their ids. */
export const refIds = async (Ref: mongoose.Model<any>, values: any[]) => {
	const ids = values.filter(isObjectIdString).map(String);
	const names = values.filter(v => !ids.includes(String(v))).map(v => String(v).trim()).filter(Boolean);
	if (!names.length) return ids;
	const or = namingFields(Ref).flatMap(f => names.map(n => ({ [f]: new RegExp(`^${escapeRe(n)}$`, 'i') })));
	const found = or.length ? await Ref.find({ $or: or }, { _id: 1 }).limit(1000).lean() : [];
	return [...ids, ...found.map((d: any) => String(d._id))];
};
