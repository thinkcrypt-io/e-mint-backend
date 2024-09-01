import mongoose, { Schema, Types } from 'mongoose';
// import { CouponType } from '../../lib/types/model.types';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			trim: true,
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
		// store: {
		// 	type: Types.ObjectId,
		// 	ref: 'Store',
		// },
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
			type: Types.ObjectId,
			ref: 'User',
		},
		maxUsePerUser: {
			type: Number,
			required: true,
			default: 1,
		},
		user: {
			type: Types.ObjectId,
			ref: 'User',
		},
	},

	{
		timestamps: true,
	}
);

const Coupon = mongoose.model<any>('Coupon', schema);
// export { default as settings } from './config.js';
// export { default as filters } from './filters.js';
export default Coupon;
