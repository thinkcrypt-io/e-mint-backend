import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * One call to a project's public API (docs/templates T-09), for the "recent
 * calls" on an API project's dashboard: method, path, answer, time. No
 * bodies, no tokens, no addresses. Kept 7 days.
 */
const schema = new Schema<any>(
	{
		method: { type: String, required: true },
		/** As called, without the query string: `/orders/66f…`, `/auth/login`. */
		path: { type: String, maxlength: 300 },
		route: { type: String, maxlength: 60 },
		status: { type: Number },
		ms: { type: Number },
		/** A signed-in customer made it. */
		customer: { type: Boolean, default: false },
		createdAt: { type: Date, default: Date.now },
	},
	{ versionKey: false }
);

schema.plugin(tenantScoped);
schema.index({ project: 1, createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default mongoose.model<any>('ApiCall', schema, 'apicalls');
