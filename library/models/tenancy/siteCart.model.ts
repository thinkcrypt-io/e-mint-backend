import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A signed-in customer's cart on a project's site (docs/widgets W-05), when
 * the project keeps carts in MINT rather than in a model of its own (Site setup
 * → Widgets → Shop). One shared, scoped collection for every project (messaging
 * MD10, multi-tenancy WO-43) — never one per project. Only ids, variants and
 * quantities are kept: names and prices are always read from the catalogue
 * (functions/shop.function.ts). Carts nobody touches for 90 days go.
 */
const line = new Schema<any>(
	{
		product: { type: Schema.Types.ObjectId, required: true },
		variant: { type: String, trim: true, maxlength: 200, default: '' },
		quantity: { type: Number, min: 1, max: 999, required: true },
	},
	{ _id: false }
);

const schema = new Schema<any>(
	{
		customer: { type: Schema.Types.ObjectId, ref: 'ProjectCustomer', required: true },
		lines: { type: [line], default: [] },
	},
	{ timestamps: true }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1, customer: 1 }, { unique: true });
schema.index({ updatedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model<any>('SiteCart', schema, 'sitecarts');
