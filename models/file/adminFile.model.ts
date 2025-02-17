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
		fileType: {
			type: String,
			trim: true,
			enum: ['image', 'document', 'video'],
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

const AdminFile = mongoose.model<any>('AdminFile', schema);
export default AdminFile;
