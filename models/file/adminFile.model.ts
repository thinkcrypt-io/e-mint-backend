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

// Virtual for formatted file size
schema.virtual('fileSize').get(function () {
	if (!this.size) return '0 B';

	const bytes: any = this.size;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

	if (bytes === 0) return '0 B';

	const i = Math.floor(Math.log(bytes) / Math.log(1024));
	const size = bytes / Math.pow(1024, i);

	return Math.round(size * 100) / 100 + ' ' + sizes[i];
});

// Ensure virtual fields are serialized
schema.set('toJSON', { virtuals: true });
schema.set('toObject', { virtuals: true });

const AdminFile = mongoose.model<any>('AdminFile', schema);
export default AdminFile;
