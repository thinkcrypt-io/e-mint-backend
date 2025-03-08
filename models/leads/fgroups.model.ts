import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		name: {
			type: String,
			required: true,
			trim: true,
		},
		description: {
			type: String,
			trim: true,
		},
		category: {
			type: String,
			trim: true,
			enum: [
				'businessToBusiness',
				'businessToCustomer',
				'startups',
				'developers',
				'investors',
				'ecommerce',
				'others',
			],
		},
		url: {
			type: String,
			trim: true,
			required: true,
		},
		members: {
			type: Number,
		},
		priority: {
			type: String,
			trim: true,
			enum: ['hot', 'high', 'medium', 'low', 'archived'],
		},
	},

	{ timestamps: true }
);

const FacebookGroups = mongoose.model<any>('FacebookGroups', schema);
export default FacebookGroups;
