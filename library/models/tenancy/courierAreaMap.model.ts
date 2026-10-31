import mongoose, { Schema } from 'mongoose';
import { tenantScoped } from '../../functions/tenantScope.function.js';

/**
 * A store's remembered area picks per courier (docs/couriers CR14, CR-10):
 * the order's area and city as typed ("Mirpur 10, Dhaka") → the courier's
 * city / zone / area ids and names someone chose for it. The next order from
 * there is filled in; bulk send uses only these.
 */
const schema = new Schema<any>(
	{
		courier: { type: String, required: true },
		key: { type: String, required: true },
		picks: {
			city: String,
			cityName: String,
			zone: String,
			zoneName: String,
			area: String,
			areaName: String,
		},
		uses: { type: Number, default: 1 },
		lastUsedAt: { type: Date, default: Date.now },
	},
	{ timestamps: true, minimize: false }
);

schema.plugin(tenantScoped);
schema.index({ organization: 1, project: 1, courier: 1, key: 1 }, { unique: true });

export default mongoose.model<any>('CourierAreaMap', schema, 'courierareamaps');
