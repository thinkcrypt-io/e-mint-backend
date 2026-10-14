import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * One call to a project's public API — its request log (docs/api-builder
 * AB-06; started as T-09's "recent calls" on an API project's dashboard).
 * What was asked (method, path, query with secrets masked), which endpoint
 * answered, who called (a signed-in customer, a server key, anyone), the
 * answer (status, the error's message and code), how long it took, and where
 * from (the calling site, the client). Never bodies, tokens or IP addresses.
 * Kept 7 days.
 */
const schema = new Schema<any>(
	{
		method: { type: String, required: true },
		/** As called, without the query string: `/orders/66f…`, `/auth/login`. */
		path: { type: String, maxlength: 300 },
		/** The query string, without the `?`; values of token/key/secret/password names masked. */
		query: { type: String, maxlength: 500 },
		route: { type: String, maxlength: 60 },
		/** The endpoint that answered (AB-01), and its name then; none for /auth, the cart, a 404… */
		endpoint: { type: Schema.Types.ObjectId },
		endpointName: { type: String, maxlength: 120 },
		status: { type: Number },
		ms: { type: Number },
		/** A signed-in customer made it. */
		customer: { type: Boolean, default: false },
		/** Who called: a signed-in customer, a server key, or anyone. */
		who: { type: String, enum: ['anyone', 'customer', 'key'], default: 'anyone' },
		customerId: { type: Schema.Types.ObjectId },
		customerEmail: { type: String, maxlength: 200 },
		keyId: { type: Schema.Types.ObjectId },
		keyName: { type: String, maxlength: 80 },
		/** A 4xx/5xx answer's message and code, as the caller got them. */
		error: { type: String, maxlength: 300 },
		code: { type: String, maxlength: 60 },
		/** The calling site (its Origin, else its Referer's), and the client: "Chrome on macOS", "curl/8.4.0". */
		origin: { type: String, maxlength: 200 },
		client: { type: String, maxlength: 80 },
		createdAt: { type: Date, default: Date.now },
	},
	{ versionKey: false }
);

schema.plugin(tenantScoped);
schema.index({ project: 1, createdAt: -1 });
schema.index({ project: 1, endpoint: 1, createdAt: -1 });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default mongoose.model<any>('ApiCall', schema, 'apicalls');
