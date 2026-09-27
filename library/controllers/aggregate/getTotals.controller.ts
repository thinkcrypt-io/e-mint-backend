import { Response } from 'express';
import mongoose from 'mongoose';

/**
 * POST /<route>/get/totals — sums, averages, lowest and highest of number
 * fields across the rows ticked in a table ("View total" on the selection bar).
 *
 * Body: `{ ids: string[], items: { field?: string, op: 'sum'|'avg'|'min'|'max'|'count' }[] }`.
 * Answers `{ records, results: [{ field, op, value }], fields }` — results in the
 * order asked, and `fields`: every number field that can be totalled, for the
 * Calculate picker.
 *
 * Runs under the same middleware as /get/stats — read permission and the
 * list's access rules in `req.queryHelper` — so an id the reader couldn't see
 * in the list is simply not counted. Only number fields the route lets you
 * filter or sort by can be totalled, which already leaves out excluded and
 * secret-named ones.
 */

const OPS = ['sum', 'avg', 'min', 'max', 'count'] as const;
type Op = (typeof OPS)[number];
const MAX_IDS = 5000;
const MAX_ITEMS = 20;

const fail = (res: Response, status: number, message: string) => res.status(status).json({ message });
const numberOf = (v: any) => (v === null || v === undefined ? null : Number(v.toString()));

const getTotals = (Model: mongoose.Model<any>) => {
	return async (req: any, res: Response): Promise<Response> => {
		try {
			const body = req.body || {};
			const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((id: any) => mongoose.isValidObjectId(id)) : [];
			if (!ids.length) return fail(res, 400, 'Select at least one row');
			if (ids.length > MAX_IDS) return fail(res, 400, `At most ${MAX_IDS.toLocaleString()} rows at a time`);

			const items: { field?: string; op: Op }[] = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];

			const built = req.resolvedRoute?.built;
			const allowed = new Set<string>([
				...(built?.FILTER_OPTIONS?.allowFilter || []),
				...(built?.FILTER_OPTIONS?.allowSort || []),
			]);
			const isNumber = (key: any) => {
				if (typeof key !== 'string' || !allowed.has(key)) return false;
				const p: any = Model.schema.path(key);
				return !!p && ['Number', 'Decimal128'].includes(p.instance);
			};

			for (const item of items) {
				if (!OPS.includes(item?.op)) return fail(res, 400, `“${item?.op}” isn’t a calculation — use sum, avg, min, max or count`);
				if (item.op !== 'count' && !isNumber(item.field))
					return fail(res, 400, `“${item.field || ''}” isn’t a number field of this route`);
				if (item.op === 'count' && item.field && !allowed.has(item.field))
					return fail(res, 400, `“${item.field}” isn’t a field of this route`);
			}

			// The list's query — access rules — cast the way find() would, narrowed to the selection.
			let base: any;
			try {
				base = Model.find(req.queryHelper || {}).cast(Model);
			} catch (e: any) {
				return fail(res, 400, `A filter doesn’t fit its field: ${e.message}`);
			}
			const match = {
				$and: [base, { _id: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) } }],
			};

			const group: Record<string, any> = { _id: null, records: { $sum: 1 } };
			items.forEach((item, i) => {
				group[`v${i}`] =
					item.op === 'count'
						? item.field
							? { $sum: { $cond: [{ $ifNull: [`$${item.field}`, false] }, 1, 0] } }
							: { $sum: 1 }
						: { [`$${item.op}`]: `$${item.field}` };
			});

			const [row] = await (Model as any).aggregate([{ $match: match }, { $group: group }]);

			return res.status(200).json({
				fields: [...allowed].filter(isNumber),
				records: row?.records || 0,
				results: items.map((item, i) => ({
					field: item.field || null,
					op: item.op,
					// A sum or count of nothing is 0; an average, lowest or highest of nothing has no value.
					value: numberOf(row?.[`v${i}`]) ?? (item.op === 'sum' || item.op === 'count' ? 0 : null),
				})),
			});
		} catch (e: any) {
			return fail(res, 500, e?.message || 'Could not calculate the totals');
		}
	};
};

export default getTotals;
