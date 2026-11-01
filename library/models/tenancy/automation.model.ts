import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A project's automation (docs/automations): when a record of `route` is
 * created, changed or deleted — or a date of it is reached (`on: ['date']`,
 * docs/ecommerce/DISCOUNTS.md DS6) — and meets `when`, run `actions` in order,
 * in the background. The engine is
 * library/functions/automations.function.ts. Scoped to the project.
 */
export const AUTOMATION_EVENTS = ['create', 'update', 'delete', 'date'] as const;
export const DATE_UNITS = ['minutes', 'hours', 'days'] as const;
export const ACTION_TYPES = ['notify', 'email', 'webhook', 'update', 'updateLinked', 'create'] as const;

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 80 },
		description: { type: String, trim: true, maxlength: 300 },
		enabled: { type: Boolean, default: true },
		/** Installed by the platform (docs/ecommerce/TAX_AUTOMATIONS.md TX1): 'commerce' for a store's. Can be switched on and off, never edited or deleted by people. */
		system: { type: String, trim: true },
		/** A system automation's name for itself ('tax.category-to-products'), so an upgrade finds it. */
		key: { type: String, trim: true },
		/** The page whose records start it. */
		route: { type: String, required: true, trim: true, lowercase: true },
		on: { type: [{ type: String, enum: AUTOMATION_EVENTS }], default: ['create'] },
		/**
		 * `on: ['date']`: when the record's `field` (a date) is reached — or `amount` `unit` before / after it.
		 * Each record's next run is an AutomationDue job (automationDue.function.ts).
		 */
		date: {
			field: { type: String, trim: true },
			amount: { type: Number, default: 0 },
			unit: { type: String, enum: DATE_UNITS, default: 'days' },
			when: { type: String, enum: ['before', 'after'], default: 'after' },
		},
		/** What the date queue last saw (enabled, page, date): a different one makes the tick queue its records again. */
		dueSig: { type: String, select: false },
		/** On a change: only when one of these fields changed (none: any change). */
		changed: { type: [String], default: [] },
		/** {field, op, value} — the shared ConditionsEditor shape (fieldLocks.function.ts). */
		when: { type: [Schema.Types.Mixed], default: [] },
		match: { type: String, enum: ['all', 'any'], default: 'all' },
		/** Each { type, … } — checked by checkAutomation (automations.function.ts). */
		actions: { type: [Schema.Types.Mixed], default: [] },
		/** Signs its webhook calls (x-mint-signature). Never returned. */
		secret: { type: String, select: false },
		stats: {
			runs: { type: Number, default: 0 },
			failures: { type: Number, default: 0 },
			lastRunAt: Date,
			lastStatus: String,
			lastError: String,
		},
		createdBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
	},
	{ timestamps: true, versionKey: false }
);

schema.index({ route: 1, enabled: 1 });
schema.index({ key: 1 }, { sparse: true });
schema.plugin(tenantScoped);

export default mongoose.model<any>('Automation', schema, 'automations');
