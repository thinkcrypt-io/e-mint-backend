import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
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
		status: {
			type: String,
			enum: ['planning', 'in-progress', 'completed', 'archived'],
			default: 'planning',
		},
		stack: {
			type: String,
			trim: true,
		},
	},
	{
		timestamps: true,
	}
);

const ModelAttribute = mongoose.model<any>('ModelAttribute', schema);

export default ModelAttribute;
