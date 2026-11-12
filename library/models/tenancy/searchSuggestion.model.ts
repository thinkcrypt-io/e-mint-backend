import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * Store search (docs/search SI16, SI22): a fix for the store's search waiting for the owner's yes — a synonym, a
 * redirect or a search rule. They come from what shoppers did (`source: learned`, SI-16: someone searched A, found
 * nothing they opened, and searched B within a minute and opened something) or from the owner's own AI over MCP
 * (`source: your-ai`, SI-18). Insights shows them with Accept (the record is made, marked as a suggestion) and Dismiss
 * (it never comes back for the same thing).
 */
const schema = new Schema<any>(
	{
		kind: { type: String, required: true, enum: ['synonym', 'redirect', 'rule'] },
		source: { type: String, required: true, enum: ['learned', 'your-ai'], default: 'learned' },
		/** What it's for, so the same suggestion isn't made twice ("synonym:frock>dress"). */
		key: { type: String, required: true },
		/** One line for the owner: "People who search “frock” then search “dress”". */
		title: { type: String, default: '' },
		why: { type: String, default: '' },
		/** The record to make on Accept (a Search synonym, redirect or rule, as its form holds it). */
		record: { type: Schema.Types.Mixed, default: {} },
		/** What it's based on (learned: visitors, searches). */
		evidence: { type: Schema.Types.Mixed, default: undefined },
		status: { type: String, enum: ['open', 'accepted', 'dismissed'], default: 'open' },
		/** The record made on Accept. */
		made: { type: Schema.Types.ObjectId, default: undefined },
		decidedAt: { type: Date, default: undefined },
		decidedBy: { type: Schema.Types.ObjectId, default: undefined },
	},
	{ timestamps: true }
);
schema.plugin(tenantScoped);
schema.index({ project: 1, key: 1 }, { unique: true });
schema.index({ project: 1, status: 1, updatedAt: -1 });

export default mongoose.model<any>('SearchSuggestion', schema, 'searchsuggestions');
