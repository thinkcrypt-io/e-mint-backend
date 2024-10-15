import mongoose, { Schema, Types } from 'mongoose';

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
		url: {
			type: String,
			trim: true,
			required: true,
		},
		folder: {
			type: String,
			trim: true,
			required: true,
			default: 'default',
		},
		key: {
			type: String,
			trim: true,
			required: true,
		},
		type: {
			type: String,
			trim: true,
			required: true,
		},
		bucket: {
			type: String,
			trim: true,
		},
		size: {
			type: Number,
			trim: true,
		},
	},

	{
		timestamps: true,
	}
);

const File = mongoose.model<any>('File', schema);
export default File;
