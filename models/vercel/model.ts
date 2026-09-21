import mongoose, { Schema } from 'mongoose';
import Counter from '../counter/counter.model.js';
import { seal, isSealed, last4, fingerprint } from '../../lib/crypto/index.js';

const teamSchema = new Schema(
	{
		teamId: { type: String, trim: true },
		slug: { type: String, trim: true },
		name: { type: String, trim: true },
	},
	{ _id: false }
);

const schema = new Schema<any>(
	{
		code: {
			type: String,
			unique: true,
			trim: true,
		},
		label: {
			type: String,
			required: true,
			trim: true,
			min: 2,
			max: 60,
		},

		/**
		 * The Vercel API token, encrypted at rest by the pre-save hook below.
		 *
		 * `select: false` is load-bearing, not tidiness: every generic read in
		 * this codebase (getAllDocuments, getDocumentById, exportCsv) runs
		 * straight off the model, so a selectable field here would put a
		 * full-access Vercel token into a table response and a CSV export. The
		 * only code that gets it back is the token resolver, which asks for it
		 * explicitly.
		 *
		 * Worse than the Heroku equivalent, in fact: a personal-account token
		 * cannot be scoped to a subset of projects, so this one value can delete
		 * every project on the account — including the storefronts that
		 * controllers/hongo deploys for real shops.
		 */
		apiToken: {
			type: String,
			required: true,
			select: false,
		},
		/** Shown in place of the token, so a row is still identifiable. */
		tokenLast4: {
			type: String,
			trim: true,
		},
		/** Lets "is this the same token?" be answered without decrypting: GCM
		 *  ciphertext differs on every write, so comparing apiToken never works. */
		tokenFingerprint: {
			type: String,
			trim: true,
			index: true,
		},

		//Snapshot of GET /v2/user, refreshed on save and on demand
		userId: {
			type: String,
			trim: true,
		},
		/** Vercel handle, e.g. `asifistiaque`. */
		username: {
			type: String,
			trim: true,
		},
		userEmail: {
			type: String,
			trim: true,
			lowercase: true,
		},
		/** Human name on the Vercel account, distinct from the handle above. */
		displayName: {
			type: String,
			trim: true,
		},
		/**
		 * Drives every "not available on this plan" notice in the console.
		 * `unknown` until a sync fills it — the installed SDK's user model
		 * carries no plan field, so what a real response holds is VWO-01 #1.
		 */
		plan: {
			type: String,
			enum: ['hobby', 'pro', 'enterprise', 'unknown'],
			default: 'unknown',
		},

		/** Empty on a personal account, which is the normal case here, not an error. */
		teams: {
			type: [teamSchema],
			default: [],
		},
		/** Unset on a personal account, and unset is valid — an absent teamId
		 *  scopes a Vercel call to the personal account, which is correct. */
		defaultTeamId: {
			type: String,
			trim: true,
		},

		status: {
			type: String,
			enum: ['active', 'invalid', 'unverified'],
			default: 'unverified',
		},
		lastSyncedAt: {
			type: Date,
		},
		lastError: {
			type: String,
			trim: true,
		},
		projectCount: {
			type: Number,
			default: 0,
		},

		client: {
			type: Schema.Types.ObjectId,
			ref: 'Client',
		},
		project: {
			type: Schema.Types.ObjectId,
			ref: 'Software',
		},
		note: {
			type: String,
			trim: true,
		},

		privacy: {
			type: String,
			enum: ['public', 'private', 'only-me'],
			default: 'private',
		},
		addedBy: {
			type: Schema.Types.ObjectId,
			ref: 'Admin',
		},
		access: [
			{
				type: Schema.Types.ObjectId,
				ref: 'Admin',
			},
		],
	},
	{ timestamps: true }
);

/**
 * Encrypt on the way in. Guarded by `isSealed` because an update that does not
 * touch the token still re-saves the document, and sealing an already-sealed
 * value would make it undecryptable.
 */
schema.pre<any>('save', function (next) {
	try {
		if (this.isModified('apiToken') && this.apiToken && !isSealed(this.apiToken)) {
			const plain = String(this.apiToken).trim();

			this.tokenLast4 = last4(plain);
			this.tokenFingerprint = fingerprint(plain);
			this.apiToken = seal(plain);
		}

		next();
	} catch (error: any) {
		next(error);
	}
});

schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'vercel' });
			if (!counter) counter = new Counter({ sequenceValue: 0, slug: 'vercel' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `VRC-` + counter.sequenceValue.toString().padStart(4, '0');
		}

		next();
	} catch (error: any) {
		// Deliberately unlike the `credentials` model, which swallows this and
		// calls next() bare: `code` is a unique path, so a swallowed Counter
		// failure saves a document with code undefined, and the *second* one then
		// dies on a duplicate-null index error far from the real cause.
		console.error(error);
		next(error);
	}
});

const VercelAccount = mongoose.model<any>('VercelAccount', schema);
export default VercelAccount;
