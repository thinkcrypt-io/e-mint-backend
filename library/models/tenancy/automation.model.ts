import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A project's automation (docs/automations): when a record of `route` is
 * created, changed or deleted — and meets `when` — run `actions` in order,
 * after the save, in the background. The engine is
 * library/functions/automations.function.ts. Scoped to the project.
 */
export const AUTOMATION_EVENTS = ['create', 'update', 'delete'] as const;
export const ACTION_TYPES = ['notify', 'email', 'webhook', 'update', 'create'] as const;

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 80 },
		description: { type: String, trim: true, maxlength: 300 },
		enabled: { type: Boolean, default: true },
		/** The page whose records start it. */
		route: { type: String, required: true, trim: true, lowercase: true },
		on: { type: [{ type: String, enum: AUTOMATION_EVENTS }], default: ['create'] },
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
schema.plugin(tenantScoped);

export default mongoose.model<any>('Automation', schema, 'automations');
