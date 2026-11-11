import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * Store search (docs/search SI17, SI-12): what shoppers did with a store's search, for Insights and learning. One
 * collection for every store (keyed by project), kept 90 days; the nightly rollup (SI-13) keeps the daily totals.
 *
 *   search    a search the storefront ran: the query (cleaned: no emails, phones or card numbers), its words, how many
 *             results, the page's product ids, the filters, the time taken
 *   suggest   a pick from the suggestions as the shopper typed
 *   click     a result opened (product, position)
 *   cart      a result added to the bag
 *   order     an order line from search (SI18): the product, quantity and the line's total as `revenue`
 *
 * Every event carries the visitor id of the site's analytics (WO-56) and the search id it belongs to. No IP.
 */
const schema = new Schema<any>(
	{
		type: { type: String, required: true, enum: ['search', 'suggest', 'click', 'cart', 'order'] },
		searchId: { type: String, default: null },
		visitor: { type: String, default: null },
		session: { type: String, default: null },
		/** The query as typed, cleaned (≤ 100 characters). */
		q: { type: String, default: '' },
		/** Its normalised form (stems in order): one row per query in the rollups, whatever the spelling. */
		nq: { type: String, default: '' },
		/** The words the engine searched for, after understanding and any loosening. */
		words: { type: [String], default: undefined },
		results: { type: Number, default: undefined },
		/** The product ids on the page, in order. */
		top: { type: [Schema.Types.ObjectId], default: undefined },
		page: { type: Number, default: undefined },
		limit: { type: Number, default: undefined },
		filters: { type: Schema.Types.Mixed, default: undefined },
		/** SI12: how the engine loosened a search that had no exact results ('typos', 'fewer words', 'some words', 'fallback'). */
		showing: { type: String, default: undefined },
		ms: { type: Number, default: undefined },
		product: { type: Schema.Types.ObjectId, default: undefined },
		position: { type: Number, default: undefined },
		order: { type: Schema.Types.ObjectId, default: undefined },
		quantity: { type: Number, default: undefined },
		revenue: { type: Number, default: undefined },
		at: { type: Date, default: () => new Date() },
	},
	{ timestamps: false, minimize: true }
);
schema.plugin(tenantScoped);
schema.index({ project: 1, searchId: 1, type: 1 });
schema.index({ project: 1, type: 1, at: -1 });
schema.index({ project: 1, visitor: 1, type: 1, at: -1 });
schema.index({ at: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60, name: 'ttl_90d' });

export default mongoose.model<any>('SearchEvent', schema, 'searchevents');
