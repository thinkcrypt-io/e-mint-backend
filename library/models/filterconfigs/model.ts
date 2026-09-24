import mongoose, { Schema } from 'mongoose';

export const FILTER_TYPES = ['text', 'select', 'multi-select', 'boolean', 'range', 'date'] as const;
export const FILTER_CATEGORIES = ['default', 'model', 'distinct'] as const;

/**
 * One filter chip, in the same shape a settings file declares under
 * `<field>.filter` — so `getFilters` can treat a stored filter and a settings
 * filter identically. The one difference is `model`: settings hold the
 * mongoose Model itself, which can't be stored, so it is kept here by its
 * `modelName` and resolved through `mongoose.models` at request time.
 *
 * `_id: false` because a filter has no identity outside its route's list —
 * its position in `filters` is its order, and that is all the UI reorders.
 */
const filterSchema = new Schema<any>(
	{
		// The schema path the filter narrows on ('shop', 'inventory.location').
		name: { type: String, required: true, trim: true },
		// The query-string key the chip writes ('shop_in'). Falls back to
		// `name` when empty, exactly as it does for settings filters.
		field: { type: String, trim: true },
		type: { type: String, enum: FILTER_TYPES, required: true },
		label: { type: String, trim: true },
		title: { type: String, trim: true },
		// Empty means every role sees it.
		roles: { type: [String], default: undefined },
		// Where select options come from: listed below, another model's
		// documents, or this model's distinct values of `key`.
		category: { type: String, enum: FILTER_CATEGORIES, default: 'default' },
		key: { type: String, trim: true },
		model: { type: String, trim: true },
		options: {
			type: [{ _id: false, value: Schema.Types.Mixed, label: String }],
			default: undefined,
		},
	},
	{ _id: false }
);

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true },
		// The table's API path, exactly as the admin passes it to
		// `${path}/get/filters` — 'products', 'adjustments/damages'.
		route: { type: String, required: true, trim: true, unique: true },
		// The base model's `modelName`, for display and for listing its fields.
		model: { type: String, trim: true },
		description: { type: String, default: '', trim: true },
		filters: { type: [filterSchema], default: [] },
		// Denormalised from `filters` so the list table can show which filters a
		// route has without a custom cell for an array of objects.
		filterLabels: { type: [String], default: [] },
	},
	{
		timestamps: true,
		versionKey: false,
	}
);

schema.pre('save', function (this: any, next) {
	this.filterLabels = (this.filters || []).map((f: any) => f.label || f.name);
	next();
});

export default mongoose.model<any>('FilterConfig', schema);
