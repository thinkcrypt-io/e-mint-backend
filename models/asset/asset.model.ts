import mongoose, { Schema } from 'mongoose';
import { AssetType } from './index.js';

const schema = new Schema<AssetType>(
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

		shop: {
			type: Schema.Types.ObjectId,
			ref: 'Shop',
			required: [true, 'Shop is required'],
		},

		price: {
			type: Number,
			default: 0,
			required: [true, 'Price is required'],
		},

		value: {
			type: Number,
			default: 0,
		},

		image: {
			type: String,
			trim: true,
		},

		forcedSellPrice: {
			type: Number,
			default: false,
		},

		qty: {
			type: Number,
			default: 0,
			required: true,
		},

		isDeleted: {
			type: Boolean,
			default: false,
		},

		note: {
			type: String,
			trim: true,
		},

		tags: {
			type: [String],
		},
	},
	{
		timestamps: true,
		toJSON: { virtuals: true },
	}
);

// Pre-save hook to calculate the value of the asset
schema.pre<any>('save', async function (next) {
	try {
		this.value = this.price * this.qty;
		next();
	} catch (error: any) {
		console.log(error);
		next();
	}
});

const Asset = mongoose.model<AssetType>('Asset', schema);

export default Asset;
