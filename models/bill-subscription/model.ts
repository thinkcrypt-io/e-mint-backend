import mongoose, { Schema } from 'mongoose';
import { ACCESS_CONTROL } from '../../lib/index.js';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: [true, 'Name is required'],
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},
		plan: {
			type: String,
			trim: true,
		},
		currency: {
			type: String,
			enum: ['bdt', 'usd', 'eur', 'other'],
			required: [true, 'Currency is required'],
		},
		amount: {
			type: Number,
			required: [true, 'Amount is required'],
		},
		status: {
			type: String,
			enum: ['active', 'inactive', 'expired', 'cancelled'],
		},
		billingCycle: {
			type: String,
			enum: ['monthly', 'yearly', 'trial', 'custom'],
		},
		renewDate: Date,
		lastPaymentDate: Date,
		autoRenew: {
			type: Boolean,
			default: false,
		},
		accountLogin: {
			type: String,
		},
		...ACCESS_CONTROL.SCHEMA,
	},
	{
		timestamps: true,
	}
);

const BillSubscription = mongoose.model<any>('BillSubscription', schema);
export default BillSubscription;
