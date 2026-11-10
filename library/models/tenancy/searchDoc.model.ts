import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * Store search (docs/search SI2, SI4): one document per product a store's shoppers can find, in ONE collection for
 * every store (no collection per store: the Atlas collection cap). Built only by the indexer
 * (functions/commerce/search/indexer.ts) from the product, its variants, category tree, brand, collections, stock and
 * discount — never edited by hand.
 *
 * The flat arrays are what the engine looks candidates up by (each with its own index); `fields` keeps each part's
 * tokens for ranking (SI10: a name match outweighs a description match); `card` is what a result shows, so a search
 * never has to load the products again.
 */
const tokens = { _id: false, words: [String], stems: [String], phon: [String] };

const schema = new Schema<any>(
	{
		kind: { type: String, default: 'product' },
		product: { type: Schema.Types.ObjectId, required: true },
		status: { type: String, default: 'active' },
		/** Every word and stem of every part (description too). */
		terms: { type: [String], default: [] },
		/** Word prefixes, 1–15 letters, of the parts shown in suggestions (not the description): as-you-type. */
		prefixes: { type: [String], default: [] },
		/** Trigrams of those words (`_sh`, `shi`, …): typo candidates. */
		grams: { type: [String], default: [] },
		/** Banglish keys (SI7) of those words. */
		phon: { type: [String], default: [] },
		/** SKUs and barcodes of the product and its variants, without punctuation: straight hits. */
		codes: { type: [String], default: [] },
		fields: {
			_id: false,
			name: tokens,
			brand: tokens,
			category: tokens,
			collection: tokens,
			option: tokens,
			keyword: tokens,
			description: tokens,
			custom: tokens,
		},
		facets: {
			_id: false,
			/** Its category and every category above it. */
			categories: [Schema.Types.ObjectId],
			brand: Schema.Types.ObjectId,
			collections: [Schema.Types.ObjectId],
			/** The lowest price it sells for now (any active variant), discount taken off. */
			price: Number,
			onSale: Boolean,
			inStock: Boolean,
			/** "size=m", "colour=red": one string per option value, for filters. */
			opts: [String],
			/** The same option values as the store wrote them ("Size=M"), one per entry of `opts`, in its order. */
			labels: [String],
		},
		signals: {
			_id: false,
			views: { type: Number, default: 0 },
			wishes: { type: Number, default: 0 },
			/** Units sold in the last 30 days (filled nightly, docs/search SI-13). */
			sold30: { type: Number, default: 0 },
			createdAt: Date,
			/** The learned boost (docs/search SI-16); 1 = none. */
			learned: { type: Number, default: 1 },
		},
		card: { type: Schema.Types.Mixed, default: {} },
		/** The product's own updatedAt when this was built. */
		sourceAt: Date,
		builtAt: Date,
	},
	{ timestamps: false, minimize: false }
);
schema.plugin(tenantScoped);
schema.index({ project: 1, product: 1 }, { unique: true });
schema.index({ project: 1, terms: 1 });
schema.index({ project: 1, prefixes: 1 });
schema.index({ project: 1, grams: 1 });
schema.index({ project: 1, phon: 1 });
schema.index({ project: 1, codes: 1 });
schema.index({ project: 1, 'facets.categories': 1 });
schema.index({ project: 1, builtAt: 1 });

export default mongoose.model<any>('SearchDoc', schema, 'searchdocs');
