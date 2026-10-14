import mongoose, { Schema } from 'mongoose';
import { sendSignupLinks } from './waitlist.mail.js';

/**
 * Someone who asked for early access from the marketing website
 * (mint-webpage, "Join the waitlist"). Written by POST /public/waitlist —
 * one entry per email, a second sign-up updates it — and worked by the
 * super admin from the Waitlist table: approve them (which emails a sign-up
 * link — waitlist.mail.ts), mark them joined. Signing up in the app with the
 * same email marks the entry joined by itself.
 */

export const WAITLIST_STATUSES = ['waiting', 'approved', 'invited', 'joined', 'declined'] as const;
export const WAITLIST_TEAM_SIZES = ['just-me', '2-10', '11-50', '51-200', '200+'] as const;

const schema = new Schema<any>(
	{
		email: { type: String, required: true, trim: true, lowercase: true },
		name: { type: String, trim: true },
		company: { type: String, trim: true },
		role: { type: String, trim: true },
		teamSize: { type: String, enum: [...WAITLIST_TEAM_SIZES, ''] },
		/** What they want to build, in their words. */
		useCase: { type: String, trim: true },
		/** The website page the form was sent from (`/`, `/workflow`…). */
		source: { type: String, trim: true },
		status: { type: String, enum: WAITLIST_STATUSES, default: 'waiting' },
		invitedAt: Date,
		/** When the entry was last approved. */
		approvedAt: Date,
		/** When the sign-up link went out; empty = not mailed yet. */
		linkSentAt: Date,
		/** Internal: never shown to the person. */
		note: { type: String, trim: true },
	},
	{ timestamps: true }
);

schema.index({ email: 1 }, { unique: true });

/*
 * Approving mails the sign-up link — from a single edit (save) or a bulk
 * change (updateMany & co.), whichever the table used. Moving an entry onto
 * "approved" clears `linkSentAt`, so approving it again mails again.
 */
schema.pre('save', function (this: any) {
	if (this.isModified('status') && this.status === 'approved') {
		this.approvedAt = new Date();
		this.linkSentAt = undefined;
		this.$locals.sendLink = true;
	}
});
schema.post('save', function (this: any) {
	if (!this.$locals.sendLink) return;
	this.$locals.sendLink = false;
	sendSignupLinks(this.constructor, { _id: this._id }).catch((e: any) => console.log('waitlist signup link:', e?.message));
});

/** `skipSignupLinkHook`: the caller mails itself (sendSignupLink.controller.ts). */
const approves = (query: any) => {
	const update = query.getUpdate();
	return !query.getOptions()?.skipSignupLinkHook && !Array.isArray(update) && (update?.status ?? update?.$set?.status) === 'approved';
};

for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate'] as const) {
	schema.pre(op, async function (this: any) {
		if (!approves(this)) return;
		const ids = await this.model.find({ ...this.getFilter(), status: { $ne: 'approved' } }).distinct('_id');
		this._approving = ids;
	});
	schema.post(op, async function (this: any) {
		if (!approves(this)) return;
		const Model = this.model;
		const filter = this.getFilter();
		const ids = this._approving || [];
		(async () => {
			if (ids.length) await Model.updateMany({ _id: { $in: ids } }, { $set: { approvedAt: new Date() }, $unset: { linkSentAt: 1 } });
			await sendSignupLinks(Model, filter);
		})().catch((e: any) => console.log('waitlist signup link:', e?.message));
	});
}
schema.index({ createdAt: 1 });

const Waitlist = mongoose.model<any>('Waitlist', schema, 'waitlist');
export default Waitlist;
