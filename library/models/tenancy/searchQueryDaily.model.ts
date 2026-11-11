import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * Store search (docs/search SI17, SI-13): each store's searches added up by day and query, for Insights (SI-14).
 * Made from the raw events (`SearchEvent`, kept 90 days) by the rollup; kept 13 months. One row per store × day ×
 * normalised query, so "Shirts" and "shirt" are one row. The day is the store's own (its time zone), stored as the
 * 00:00 UTC that names it, like a date field.
 */
const schema = new Schema<any>(
	{
		day: { type: Date, required: true },
		/** The normalised query (stems in order). */
		nq: { type: String, required: true },
		/** How it was typed most often that day (cleaned: no emails, phones or card numbers). */
		q: { type: String, default: '' },
		/** Searches (first pages only: a second page is the same search). */
		searches: { type: Number, default: 0 },
		/** Different visitors who made it. */
		visitors: { type: Number, default: 0 },
		/** Searches that found nothing, even after loosening. */
		zero: { type: Number, default: 0 },
		/** Results opened, and added to the bag, from it. */
		clicks: { type: Number, default: 0 },
		carts: { type: Number, default: 0 },
		/** Orders with a line from it, and those lines' totals. */
		orders: { type: Number, default: 0 },
		revenue: { type: Number, default: 0 },
		/** When the rollup last wrote it (today's row is written again through the day). */
		at: { type: Date, default: () => new Date() },
	},
	{ timestamps: false }
);
schema.plugin(tenantScoped);
schema.index({ project: 1, day: 1, nq: 1 }, { unique: true });
schema.index({ project: 1, nq: 1, day: -1 });
// 13 months (README §8.6).
schema.index({ day: 1 }, { expireAfterSeconds: 400 * 24 * 60 * 60, name: 'ttl_13m' });

export default mongoose.model<any>('SearchQueryDaily', schema, 'searchquerydailies');
