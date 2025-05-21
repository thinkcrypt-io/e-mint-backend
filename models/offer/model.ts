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
		category: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'Servicecategory',
			},
		],
		isFeatured: {
			type: Boolean,
			default: false,
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
	},
	{
		timestamps: true,
	}
);

const Offer = mongoose.model<any>('Offer', schema);
export default Offer;
