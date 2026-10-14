import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * One endpoint of a project's public API (docs/api-builder): an action on one
 * model at a path, who may call it, the conditions on the records it reaches,
 * which fields go in and out, and — for a list — its fixed filters and page
 * sizes. Served by routes-public/public.router.ts through
 * library/functions/apiEndpoints.function.ts. Scoped to the project.
 *
 * A model's **standard** endpoints sit at its own address (/<route>,
 * /<route>/:id) and stay in step with `ModelDefinition.publicApi` (D1);
 * custom ones have their own path.
 */
export const ENDPOINT_ACTIONS = ['list', 'get', 'create', 'update', 'delete'] as const;
export const ENDPOINT_WHO = ['anyone', 'customer', 'key'] as const;
export const METHOD_OF: Record<string, string> = { list: 'GET', get: 'GET', create: 'POST', update: 'PUT', delete: 'DELETE' };

const schema = new Schema<any>(
	{
		name: { type: String, required: true, trim: true, maxlength: 80 },
		note: { type: String, trim: true, maxlength: 300, default: '' },
		/** The model's route. */
		model: { type: String, required: true, trim: true, lowercase: true },
		action: { type: String, enum: ENDPOINT_ACTIONS, required: true },
		method: { type: String, enum: ['GET', 'POST', 'PUT', 'DELETE'], required: true },
		/** Under the project's API: '/products', '/products/:id', '/products/featured'. */
		path: { type: String, required: true, trim: true, lowercase: true },
		standard: { type: Boolean, default: false },
		enabled: { type: Boolean, default: true },
		access: {
			who: { type: String, enum: ENDPOINT_WHO, default: 'anyone' },
			/** {field, op, value} — the shared ConditionsEditor shape; value may be {ref: 'customer' | 'customer.email' …}. */
			when: { type: [Schema.Types.Mixed], default: [] },
			match: { type: String, enum: ['all', 'any'], default: 'all' },
		},
		fields: {
			/** What goes out; null = every field. */
			out: { type: [String], default: null },
			/** What a create / update may write; null = every field. */
			write: { type: [String], default: null },
			/** Never written — the business sets them. */
			readOnly: { type: [String], default: [] },
		},
		list: {
			/** Always applied, on top of the access conditions. */
			filters: { type: [Schema.Types.Mixed], default: [] },
			/** Callers may add their own filters, search and sort. */
			callerFilters: { type: Boolean, default: true },
			sort: { type: String, trim: true, default: '' },
			limit: { type: Number, default: 20, min: 1, max: 100 },
			maxLimit: { type: Number, default: 100, min: 1, max: 100 },
		},
		/** A standard endpoint: the model's `publicApi` as last reconciled (apiEndpoints.function.ts). */
		sync: { type: Schema.Types.Mixed, default: null },
		stats: {
			calls: { type: Number, default: 0 },
			lastCalledAt: Date,
		},
		createdBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'TenantUser' },
	},
	{ timestamps: true, versionKey: false }
);

schema.index({ organization: 1, project: 1, method: 1, path: 1 }, { unique: true });
schema.index({ model: 1, standard: 1 });
schema.plugin(tenantScoped);

export default mongoose.model<any>('ApiEndpoint', schema, 'apiendpoints');
