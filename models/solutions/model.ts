import mongoose, { Schema } from 'mongoose';

const schema = new Schema<any>(
	{
		coverImage: {
			type: String,
		},
		title: {
			type: String,
		},
		subtitle: {
			type: String,
		},

		description: {
			type: String,
		},
		icon: {
			type: String,
			required: true,
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
		status: {
			type: String,
			enum: ['draft', 'published', 'archived'],
			default: 'draft',
			required: true,
		},
		isFeatured: {
			type: Boolean,
			default: false,
		},

		toStaticPage: {
			type: Boolean,
			default: false,
		},
		staticPageUrl: {
			type: String,
			trin: true,
		},

		priority: {
			type: Number,
			default: 1,
			required: true,
		},
		businessNeedsTitle: {
			type: String,
			trim: true,
		},
		businessNeedsDescription: {
			type: String,
			trim: true,
		},
		whyDigitalTitle: {
			type: String,
			trim: true,
		},
		whyDigitalDescription: {
			type: String,
			trim: true,
		},
		offersTitle: {
			type: String,
			trim: true,
		},
		offersDescription: {
			type: String,
			trim: true,
		},
		offers: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'Offer',
			},
		],
		featureTitle: {
			type: String,
			trim: true,
		},
		featureDescription: {
			type: String,
			trim: true,
		},
		features: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'Feature',
			},
		],
		benifitTitle: {
			type: String,
			trim: true,
		},
		benifitDescription: {
			type: String,
			trim: true,
		},
		benifits: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'Feature',
			},
		],
		ctaTitle: {
			type: String,
			trim: true,
		},
		ctaDescription: {
			type: String,
			trim: true,
		},
		ctaButtonText: {
			type: String,
			trim: true,
		},
		ctaButtonLink: {
			type: String,
			trim: true,
		},
		metaImage: {
			type: String,
			trim: true,
		},
		metaTitle: {
			type: String,
			trim: true,
		},
		metaDescription: {
			type: String,
			trim: true,
		},
		metaSlug: {
			type: String,
			trim: true,
		},
	},
	{
		timestamps: true,
	}
);

const Solution = mongoose.model<any>('Solution', schema);
export default Solution;
