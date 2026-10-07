import mongoose from 'mongoose';
import { accessRule, isAccessRestricted } from './recordAccess.function.js';
import { ownRecordsOf } from './projectIndexes.function.js';
import { conditionsQuery, permissionsOf, resolveOther, resources, TabCondition } from '../controllers/builder/viewDocument.controller.js';

/**
 * Fields worked out from linked records ("rollups"): a client's `duePayment`
 * is the sum of its bills' `amount` where the bill's `client` is that client
 * and its `status` is due. Defined on a settings field — not stored:
 *
 *   duePayment: { title: 'Due payment', type: 'number', schema: { type: 'rollup' },
 *     rollup: { from: 'bills', via: 'client', value: 'amount', op: 'sum',
 *               where: [{ field: 'status', op: 'is', value: 'due' }] } }
 *
 * Worked out whenever records are read (a list page, one record, its page),
 * one aggregate per rollup for the whole page of records — so it's always
 * current, nothing has to be kept in step when a bill changes, and it can't be
 * sorted or filtered on. It counts only what the reader may see: their view
 * permission on `from` (else empty) and its record access. Conditions are the
 * view tabs' (viewTabs[].where).
 */

export type Rollup = {
	/** The route the linked records live in. */
	from: string;
	/** Their field that points at this record. */
	via: string;
	/** The field added up — not needed to count. */
	value?: string;
	op: 'count' | 'sum' | 'avg' | 'min' | 'max';
	where?: TabCondition[];
	/** How `where` combines: all (default) or any. */
	match?: 'all' | 'any';
};

export const ROLLUP_OPS = ['count', 'sum', 'avg', 'min', 'max'] as const;

/** The route's rollup fields, from its settings. */
export const rollupsOf = (settings: Record<string, any> = {}): (Rollup & { key: string })[] =>
	Object.entries(settings || {})
		.filter(([, s]: any) => s?.rollup?.from && s.rollup.via && ROLLUP_OPS.includes(s.rollup.op))
		.map(([key, s]: any) => ({ key, ...s.rollup }));

const oid = (v: any) => {
	const id = v?._id ?? v;
	return mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null;
};

/** One rollup's value for each record: `{ <id>: value }`; null when the reader can't see `from`. */
const valuesOf = async (req: any, r: Rollup, ids: mongoose.Types.ObjectId[], canRead: any): Promise<Record<string, any> | null> => {
	const entry = resources(req.app).get(r.from);
	if (!entry || !canRead(entry)) return null;
	const Related = entry.source.Model;
	const viaPath: any = Related.schema.path(r.via);
	if (!viaPath) return null;
	if (r.op !== 'count' && (!r.value || !Related.schema.path(r.value))) return null;

	// Its published settings: conditions only on fields it may show.
	const resolved = await resolveOther(entry).catch(() => null);
	const and: any[] = [
		{ [r.via]: { $in: ids } },
		{ archivedAt: null },
		ownRecordsOf(Related),
		...conditionsQuery(Related, resolved?.settings || entry.source.settings || {}, r.where, r.match),
	];
	if (isAccessRestricted(Related)) and.push(accessRule(req.user?._id));

	const isList = viaPath.instance === 'Array';
	const acc: any = r.op === 'count' ? { $sum: 1 } : { [`$${r.op}`]: `$${r.value}` };
	const rows = await Related.aggregate([
		{ $match: { $and: and.filter(x => Object.keys(x).length) } },
		...(isList ? [{ $unwind: `$${r.via}` }, { $match: { [r.via]: { $in: ids } } }] : []),
		{ $group: { _id: `$${r.via}`, v: acc } },
	]);
	const out: Record<string, any> = {};
	for (const row of rows) out[String(row._id)] = row.v;
	return out;
};

/** The records in a response body, wherever its controller put them. */
const recordsIn = (body: any): { get: () => any[]; set: (docs: any[]) => any } | null => {
	if (Array.isArray(body)) return { get: () => body, set: docs => docs };
	if (Array.isArray(body?.doc)) return { get: () => body.doc, set: docs => ({ ...body, doc: docs }) };
	if (body?.doc?._id) return { get: () => [body.doc], set: docs => ({ ...body, doc: docs[0] }) };
	if (body?._id) return { get: () => [body], set: docs => docs[0] };
	return null;
};

/** A response body with each record's rollup fields filled in. */
export const withRollups = async (req: any, body: any, rollups: (Rollup & { key: string })[]) => {
	const at = recordsIn(body);
	if (!at || !rollups.length) return body;
	const docs = at.get().map((d: any) => (d && typeof d.toObject === 'function' ? d.toObject() : d));
	const ids = docs.map(d => oid(d)).filter(Boolean) as mongoose.Types.ObjectId[];
	if (!ids.length) return body;
	const canRead = await permissionsOf(req);
	for (const r of rollups) {
		const values = await valuesOf(req, r, ids, canRead).catch(() => null);
		for (const d of docs) {
			if (!d?._id) continue;
			const v = values?.[String(d._id)];
			d[r.key] = values === null ? null : v ?? (r.op === 'count' || r.op === 'sum' ? 0 : null);
		}
	}
	return at.set(docs);
};

/**
 * Express middleware: on a read, fills in the route's rollup fields on
 * whatever records the response carries (list, one record, its view page).
 */
export const rollupResponses = (req: any, res: any, next: any) => {
	if (req.method !== 'GET') return next();
	const rollups = rollupsOf(req.resolvedRoute?.settings);
	if (!rollups.length) return next();
	const json = res.json.bind(res);
	res.json = (body: any) => {
		if (res.statusCode >= 400) return json(body);
		withRollups(req, body, rollups)
			.then(out => json(out))
			.catch(() => json(body));
		return res;
	};
	next();
};
