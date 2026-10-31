import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A store's own account with one courier (docs/couriers CR3, CR18): the keys
 * the owner pasted, sealed (lib/crypto/secret.ts) and `select: false` — the
 * panel only learns whether each is set; the courier's settings (pickup
 * store, delivery type…); the webhook secret Mint made (or the courier's,
 * pasted); the last test. One per courier per project. Removed with the
 * project (projectLifecycle).
 */
const schema = new Schema<any>(
	{
		courier: { type: String, required: true, trim: true },
		mode: { type: String, enum: ['test', 'live'], default: 'live' },
		/** Secret keys by name, each sealed. */
		credentials: { type: Map, of: String, select: false, default: () => ({}) },
		/** Keys that aren't secret (Pathao's client id, sign-in email), shown back as typed. */
		public: { type: Map, of: String, default: () => ({}) },
		settings: { type: Schema.Types.Mixed, default: () => ({}) },
		/** A courier's login token (Pathao): access and refresh sealed. */
		token: {
			type: new Schema<any>({ access: String, refresh: String, expiresAt: Date }, { _id: false }),
			select: false,
		},
		webhookSecret: { type: String, select: false, default: '' },
		/** The webhook secret is one the owner pasted from the courier (Steadfast's Generate), not Mint's. */
		webhookSecretPasted: { type: Boolean, default: false },
		test: {
			ok: { type: Boolean, default: false },
			message: { type: String, default: '' },
			at: Date,
			/** Hash of the keys the test passed with: other keys make the connection untested. */
			keysHash: { type: String, default: '' },
			/** The courier refused the keys themselves (never retried). */
			rejected: { type: Boolean, default: false },
		},
		/** Names the courier account (a hash, never a key): the same account connected in two projects is flagged. */
		accountKey: { type: String, default: '', index: true },
		/** Lists from the courier (stores, cities, zones, areas) kept a day. */
		cache: { type: Schema.Types.Mixed, default: () => ({}) },
		lastWebhookAt: Date,
		/** Webhook calls refused for a wrong secret. */
		refusedCalls: { type: Number, default: 0 },
		connectedBy: { type: String, default: '' },
	},
	{ timestamps: true, minimize: false }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1, courier: 1 }, { unique: true });

export default mongoose.model<any>('CourierConnection', schema, 'courierconnections');
