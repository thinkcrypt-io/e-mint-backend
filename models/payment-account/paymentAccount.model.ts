import mongoose, { Schema } from 'mongoose';
import { PaymentAccountType as Type } from './index.js';

const schema = new Schema<Type>(
	{
		name: {
			type: String,
			required: [true, 'Name is required'],
			trim: true,
		},
		accountNumber: {
			type: String,
			required: [true, 'Account Number is required'],
			trim: true,
		},
		accountType: {
			type: String,
			trim: true,
		},
		balance: {
			type: Number,
			required: true,
			default: 0.0,
		},
		customAttributes: [
			{
				label: { type: String, trim: true },
				value: { type: String, trim: true },
			},
		],
		tags: [String],
		shop: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},
		isDeleted: {
			type: Boolean,
			default: false,
			required: true,
		},

		note: {
			type: String,
			trim: true,
		},
		bankName: {
			type: String,
			trim: true,
		},
		branchName: {
			type: String,
			trim: true,
		},
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
	}
);

const PaymentAccount = mongoose.model<Type>('PaymentAccount', schema);
export default PaymentAccount;
