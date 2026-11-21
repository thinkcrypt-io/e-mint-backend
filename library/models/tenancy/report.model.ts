import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A saved report on one model's records (docs/panel-users RP-01): made by the
 * project's developers (Build), run by anyone who can view that model — in the
 * tenant panel and the panel app — and downloaded when `exportable`.
 *
 * Kinds (`type`):
 *   list      the records as rows, chosen columns, totals of number columns
 *   summary   one row per value of `groupBy` (a shed, a status): how many, and sums
 *   timeline  one row per day / week / month of `dateField`: how many, and sums
 *
 * `filters` narrow it always ({ field, op, value } in the list's field_op terms);
 * whoever runs it picks `from` / `to` on `dateField` (a default `range` first).
 * The engine is POST /<route>/get/report (getReport.controller.ts). Scoped to the project.
 */
export const REPORT_TYPES = ['list', 'summary', 'timeline'] as const;
export const REPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export const REPORT_RANGES = ['all', 'today', '7d', '30d', '90d', 'month', 'year'] as const;
export const REPORT_OPS = ['eq', 'ne', 'in', 'nin', 'gt', 'gte', 'lt', 'lte', 'exists'] as const;

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 80 },
		description: { type: String, trim: true, maxlength: 300 },
		/** Where it's listed in the reports page. */
		category: { type: String, trim: true, maxlength: 60 },
		route: { type: String, required: true, trim: true },
		type: { type: String, enum: REPORT_TYPES, default: 'list' },
		columns: [{ _id: false, key: String, label: String }],
		sort: { type: String, trim: true },
		totals: { type: [String], default: [] },
		groupBy: { type: String, trim: true },
		interval: { type: String, enum: ['day', 'week', 'month', 'year'], default: 'month' },
		sums: [{ _id: false, field: String, label: String }],
		filters: [{ _id: false, field: String, op: { type: String, enum: REPORT_OPS, default: 'eq' }, value: Schema.Types.Mixed }],
		dateField: { type: String, trim: true, default: 'createdAt' },
		range: { type: String, enum: REPORT_RANGES, default: 'all' },
		exportable: { type: Boolean, default: true },
		formats: { type: [String], enum: REPORT_FORMATS, default: ['csv', 'xlsx', 'pdf'] },
		order: { type: Number, default: 0 },
		createdBy: { type: Schema.Types.ObjectId },
		updatedBy: { type: Schema.Types.ObjectId },
	},
	{ timestamps: true, versionKey: false }
);

schema.index({ route: 1 });
schema.plugin(tenantScoped);

export default mongoose.model<any>('Report', schema, 'reports');
