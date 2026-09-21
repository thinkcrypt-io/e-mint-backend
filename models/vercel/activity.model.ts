import mongoose, { Schema } from 'mongoose';

export const VERCEL_ACTIONS = [
	'project.create',
	'project.update',
	'project.delete',
	'env.update',
	'env.download',
	'deployment.create',
	'deployment.redeploy',
	'deployment.promote',
	'deployment.cancel',
	'deployment.delete',
	'domain.add',
	'domain.verify',
	'domain.remove',
	'account.token-rotate',
] as const;

export type VercelAction = (typeof VERCEL_ACTIONS)[number];

/**
 * One environment variable that changed.
 *
 * There is a `key`, a `target` and a `kind`, and deliberately **no value, on
 * either side**. Recording before/after values would turn this collection into
 * a second, permanent, unencrypted copy of every secret the team has ever
 * rotated — the exact thing the rest of this feature is built to avoid.
 *
 * `target` is not decoration and is required: unlike Heroku's flat config vars,
 * the same Vercel key exists separately for production, preview and
 * development. "Changed DATABASE_URL" is not a useful audit line when it could
 * mean the preview database or the live one.
 */
const changeSchema = new Schema(
	{
		key: { type: String, required: true, trim: true },
		/** production | preview | development. */
		target: { type: String, required: true, trim: true },
		/** Set only for a preview var pinned to one branch. */
		gitBranch: { type: String, trim: true, default: '' },
		kind: { type: String, enum: ['added', 'updated', 'removed'], required: true },
	},
	{ _id: false }
);

const schema = new Schema<any>(
	{
		account: {
			type: Schema.Types.ObjectId,
			ref: 'VercelAccount',
			required: true,
		},
		/** Snapshot, not a ref: the account may be deleted and the log should
		 *  still read. Same reasoning as the History model's userName. */
		accountLabel: { type: String, trim: true, default: '' },
		/** Empty on a personal account, which is the normal case. */
		teamId: { type: String, trim: true, default: '' },
		/** Vercel project name. Empty for account-level actions. */
		projectName: { type: String, trim: true, default: '' },
		/** Set for deployment actions so a promote can be traced to what moved. */
		deploymentId: { type: String, trim: true, default: '' },
		/**
		 * True when this project is a shop storefront deployed by
		 * controllers/hongo. Denormalised at write time rather than joined at
		 * read time: the Deployment row may be gone by the time anyone reads the
		 * audit log, and "this touched a live shop" is the one fact about a row
		 * that must survive.
		 */
		isStorefront: { type: Boolean, default: false },

		action: { type: String, enum: VERCEL_ACTIONS, required: true },
		/** The readable sentence, rendered once at write time. */
		summary: { type: String, required: true, trim: true },

		changes: { type: [changeSchema], default: [] },

		performedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		performedByName: { type: String, trim: true, default: 'Someone' },

		/**
		 * Vercel has no atomic multi-record env write, so a batch can land
		 * partially. `partial` is a real outcome and must not be flattened into
		 * either of the other two — reporting a half-applied change as success
		 * or as failure both mislead about what the environment now holds.
		 */
		status: { type: String, enum: ['success', 'partial', 'failed'], required: true },
		/** Vercel's message when status is not 'success'. */
		errorMessage: { type: String, trim: true, default: '' },
	},
	{ timestamps: true, versionKey: false }
);

// The two reads this collection gets: one account's feed, and one project's.
schema.index({ account: 1, createdAt: -1 });
schema.index({ account: 1, projectName: 1, createdAt: -1 });

const VercelActivity = mongoose.model<any>('VercelActivity', schema);
export default VercelActivity;
