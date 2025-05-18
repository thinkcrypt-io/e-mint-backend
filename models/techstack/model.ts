import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		icon: {
			type: String,
			required: true,
			trim: true,
		},
		name: {
			type: String,
			required: true,
			trim: true,
		},
		shortDescription: {
			type: String,
			required: true,
			trim: true,
		},

		description: {
			type: String,
			trim: true,
		},
		priority: {
			type: Number,
			default: 1,
		},
		status: {
			type: String,
			enum: ['draft', 'published', 'archived'],
			default: 'draft',
		},
		featureList: [String],
		tags: [String],
		isFeatured: {
			type: Boolean,
			default: false,
		},
	},
	{
		timestamps: true,
	}
);

const Stack = mongoose.model<any>('Stack', schema);
export default Stack;
