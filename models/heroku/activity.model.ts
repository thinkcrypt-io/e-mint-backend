import mongoose, { Schema } from 'mongoose';

export const HEROKU_ACTIONS = [
	'config-vars.update',
	'app.restart',
	'dyno.restart',
	'app.redeploy',
	'app.rollback',
	'app.build',
	'app.scale',
	'app.maintenance',
	'app.rename',
	'app.destroy',
	'account.key-rotate',
	'config-vars.download',
	'github.branch',
	'github.deploy',
] as const;

export type HerokuAction = (typeof HEROKU_ACTIONS)[number];

/**
 * One config var that changed.
 *
 * There is a `key` and a `kind` and deliberately **no value, on either side**.
 * Recording before/after values would turn this collection into a second,
 * permanent, unencrypted copy of every secret the team has ever rotated —
 * which is the exact thing the rest of this feature is built to avoid. Knowing
 * that `DATABASE_URL` was updated at 14:02 by Asif is the entire audit
 * requirement; knowing what it was set to is a liability.
 */
const changeSchema = new Schema(
	{
		key: { type: String, required: true, trim: true },
		kind: { type: String, enum: ['added', 'updated', 'removed'], required: true },
	},
	{ _id: false }
);

const schema = new Schema<any>(
	{
		account: {
			type: Schema.Types.ObjectId,
			ref: 'HerokuAccount',
			required: true,
		},
		/** Snapshot, not a ref: the account may be deleted and the log should
		 *  still read. Same reasoning as the History model's userName. */
		accountLabel: { type: String, trim: true, default: '' },
		/** Heroku app name. Empty for account-level actions. */
		appName: { type: String, trim: true, default: '' },

		action: { type: String, enum: HEROKU_ACTIONS, required: true },
		/** The readable sentence, rendered once at write time. */
		summary: { type: String, required: true, trim: true },

		changes: { type: [changeSchema], default: [] },

		performedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		performedByName: { type: String, trim: true, default: 'Someone' },

		status: { type: String, enum: ['success', 'failed'], required: true },
		/** Heroku's message when status is 'failed'. */
		errorMessage: { type: String, trim: true, default: '' },
	},
	{ timestamps: true, versionKey: false }
);

// The two reads this collection gets: one account's feed, and one app's.
schema.index({ account: 1, createdAt: -1 });
schema.index({ account: 1, appName: 1, createdAt: -1 });

const HerokuActivity = mongoose.model<any>('HerokuActivity', schema);
export default HerokuActivity;
