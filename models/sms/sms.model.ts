import mongoose, { Schema } from 'mongoose';
import { SMSType } from './index.js';

const schema = new Schema<SMSType>(
	{
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
		},
		message: {
			type: String,
			required: true,
		},
		count: {
			type: Number,
			required: true,
			default: 1,
		},
		sentBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
		},
		recipient: {
			type: String,
			required: true,
			trim: true,
		},
		status: {
			type: String,
			enum: ['pending', 'sent', 'failed', 'delivered'],
		},
		source: {
			type: String,
			enum: ['shop', 'inventory', 'order', 'customer', 'otp'],
		},
		isDeleted: {
			type: Boolean,
			default: false,
			required: true,
		},
		rate: {
			type: Number,
			required: true,
			default: 0.4,
		},
	},

	{
		timestamps: true,
		toJSON: { virtuals: true },
	}
);

const Shop = mongoose.model<SMSType>('Sms', schema);
export default Shop;
