import mongoose, { Schema } from 'mongoose';

/**
 * Someone who asked for early access from the marketing website
 * (mint-webpage, "Join the waitlist"). Written by POST /public/waitlist —
 * one entry per email, a second sign-up updates it — and worked by the
 * super admin from the Waitlist table: invite them, mark them joined.
 */

export const WAITLIST_STATUSES = ['waiting', 'invited', 'joined', 'declined'] as const;
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
		/** Internal: never shown to the person. */
		note: { type: String, trim: true },
	},
	{ timestamps: true }
);

schema.index({ email: 1 }, { unique: true });
schema.index({ createdAt: 1 });

const Waitlist = mongoose.model<any>('Waitlist', schema, 'waitlist');
export default Waitlist;
