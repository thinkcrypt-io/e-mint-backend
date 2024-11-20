import mongoose, { Schema } from 'mongoose';
import CouponType from './coupon.type.js';

const schema = new Schema<CouponType>(
	{
		name: {
			type: String,
			trim: true,
			required: true,
		},
		description: {
			type: String,
			trim: true,
		},
		code: {
			type: String,
			trim: true,
			required: true,
		},
		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: true,
		},
		isActive: {
			type: Boolean,
			default: true,
			required: true,
		},
		isFlat: {
			type: Boolean,
			required: true,
			default: true,
		},
		maxAmount: {
			type: Number,
			required: true,
			default: 0,
		},
		minOrderValue: {
			type: Number,
			required: true,
			default: 0,
		},
		validFrom: {
			type: Date,
			required: true,
			default: Date.now,
		},
		validTill: {
			type: Date,
			required: true,
		},
		maxUse: {
			type: Number,
			required: true,
			default: 999,
		},
		percentage: {
			type: Number,
			default: 0,
		},
		image: {
			type: String,
			trim: true,
		},
		addedBy: {
			type: Schema.Types.ObjectId,
			ref: 'User',
		},
		maxUsePerUser: {
			type: Number,
			default: 99,
		},
		user: {
			type: Schema.Types.ObjectId,
			ref: 'Customer',
		},
	},

	{
		timestamps: true,
	}
);

const Coupon = mongoose.model<CouponType>('Coupon', schema);

export default Coupon;
