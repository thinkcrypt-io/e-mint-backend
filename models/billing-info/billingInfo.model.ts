import mongoose, { Schema, Types } from 'mongoose';
import { BillingInfoType } from './billingInfo.types';

const schema = new Schema<BillingInfoType>(
	{
		transactionId: {
			type: String,
			trim: true,
			required: [true, 'Transaction Id is required'],
		},
		transactionTime: {
			type: String,
			required: [true, 'Transaction Time is required'],
		},
		amount: {
			type: Number,
			required: [true, 'Transaction Amount is required'],
		},
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
		},
	},

	{
		timestamps: true,
	}
);

const BillingInfo = mongoose.model<any>('BillingInfo', schema);
// export { default as settings } from './category.settings.js';
export default BillingInfo;
