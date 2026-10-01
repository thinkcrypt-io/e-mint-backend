import mongoose, { Schema } from 'mongoose';
import Counter from '../counter/counter.model.js';

/**
 * A support ticket: an admin asks the support team for help — a question, an
 * account or billing problem — and the two sides reply in a thread until it
 * is resolved. Opened from the admin's /support page (any signed-in admin);
 * the team works them from the Support Tickets table.
 *
 * Unlike Issues (bugs for the dev team to fix), a ticket is a conversation
 * with the person who asked, so it carries its replies.
 */

export const TICKET_STATUSES = ['open', 'in-progress', 'waiting', 'resolved', 'closed'] as const;
export const TICKET_CATEGORIES = ['question', 'account', 'billing', 'bug', 'feature', 'other'] as const;
export const TICKET_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

const replySchema = new Schema<any>(
	{
		author: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
		message: { type: String, required: true, trim: true },
		images: [String],
		/** Written by the support team, not by the person who opened the ticket. */
		staff: { type: Boolean, default: false },
	},
	{ timestamps: { createdAt: true, updatedAt: false } }
);

const schema = new Schema<any>(
	{
		code: { type: String, trim: true },
		/** The subject line. */
		name: { type: String, required: true, trim: true },
		/** The first message. */
		description: { type: String, required: true, trim: true },
		category: { type: String, enum: TICKET_CATEGORIES, default: 'question' },
		priority: { type: String, enum: TICKET_PRIORITIES, default: 'normal' },
		/**
		 * open: new or answered by the requester · in-progress: being worked on ·
		 * waiting: the team replied and waits on the requester · resolved · closed.
		 */
		status: { type: String, enum: TICKET_STATUSES, default: 'open' },
		images: [String],
		addedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
		assignedTo: { type: Schema.Types.ObjectId, ref: 'Admin' },
		/** Internal: never shown to the requester. */
		note: { type: String, trim: true },
		// Left out of list queries; the thread endpoint asks for it.
		replies: { type: [replySchema], default: [], select: false },
		replyCount: { type: Number, default: 0 },
		lastReplyAt: Date,
		lastReplyBy: { type: String, enum: ['staff', 'requester'] },
	},
	{ timestamps: true }
);

schema.index({ addedBy: 1, createdAt: -1 });

schema.pre<any>('save', async function (next) {
	try {
		if (this.isNew && !this.code) {
			const counter = await Counter.findOneAndUpdate(
				{ slug: 'support-ticket' },
				{ $inc: { sequenceValue: 1 } },
				{ upsert: true, new: true, setDefaultsOnInsert: true }
			);
			this.code = 'SUP-' + String(counter.sequenceValue).padStart(4, '0');
		}
		next();
	} catch (error: any) {
		console.log('support ticket code:', error?.message);
		next();
	}
});

const SupportTicket = mongoose.model<any>('SupportTicket', schema, 'supporttickets');
export default SupportTicket;
