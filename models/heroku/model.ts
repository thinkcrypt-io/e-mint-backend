import mongoose, { Schema } from 'mongoose';
import Counter from '../counter/counter.model.js';
import { seal, isSealed, last4, fingerprint } from '../../lib/crypto/index.js';

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
		 * The Heroku API key, encrypted at rest by the pre-save hook below.
		 *
		 * `select: false` is load-bearing, not tidiness: every generic read in
		 * this codebase (getAllDocuments, getDocumentById, exportCsv) runs
		 * straight off the model, so a selectable field here would put a
		 * full-access Heroku token into a table response and a CSV export. The
		 * only code that gets it back is the token resolver, which asks for it
		 * explicitly.
		 */
		apiKey: {
			type: String,
			required: true,
			select: false,
		},
		/** Shown in place of the key, so a row is still identifiable. */
		keyLast4: {
			type: String,
			trim: true,
		},
		/** Lets "is this the same key?" be answered without decrypting: GCM
		 *  ciphertext differs on every write, so comparing apiKey never works. */
		keyFingerprint: {
			type: String,
			trim: true,
			index: true,
		},

		//Snapshot of GET /account, refreshed on save and on demand
		accountEmail: {
			type: String,
			trim: true,
			lowercase: true,
		},
		accountId: {
			type: String,
			trim: true,
		},
		accountName: {
			type: String,
			trim: true,
		},
		isVerified: {
			type: Boolean,
			default: false,
		},
		twoFactor: {
			type: Boolean,
			default: false,
		},
		defaultTeam: {
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
		appCount: {
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
 * touch the key still re-saves the document, and sealing an already-sealed
 * value would make it undecryptable.
 */
schema.pre<any>('save', function (next) {
	try {
		if (this.isModified('apiKey') && this.apiKey && !isSealed(this.apiKey)) {
			const plain = String(this.apiKey).trim();

			this.keyLast4 = last4(plain);
			this.keyFingerprint = fingerprint(plain);
			this.apiKey = seal(plain);
		}

		next();
	} catch (error: any) {
		next(error);
	}
});

schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew) {
			let counter = await Counter.findOne({ slug: 'heroku' });
			if (!counter) counter = new Counter({ sequenceValue: 0, slug: 'heroku' });

			counter.sequenceValue += 1;
			await counter.save();

			this.code = `HRK-` + counter.sequenceValue.toString().padStart(4, '0');
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

const HerokuAccount = mongoose.model<any>('HerokuAccount', schema);
export default HerokuAccount;
